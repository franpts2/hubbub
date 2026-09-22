import { DurableObject } from "cloudflare:workers";

import {
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  type Role,
  type ServerMessage,
} from "../../shared/protocol";
import { parseClientMessage } from "../../shared/validation";
import { generateToken } from "../codes";
import { idleExpired, nextAlarmAt, roundExpired } from "./alarms";
import { applyCommand } from "./commands";
import { resolveIdentity } from "./join";
import { closeSuperseded, connectionChecker, isConnected } from "./presence";
import { projectState } from "./projection";
import {
  attach,
  attachmentOf,
  closeQuietly,
  playerTag,
  refuseUpgrade,
  roleTag,
  send,
  sendError,
  sendRaw,
} from "./sockets";
import { clearRoom, loadRoom, saveRoom } from "./storage";
import {
  createRoom,
  endRound,
  everyoneAnswered,
  findPlayer,
  removePlayer,
  touch,
  type IsConnected,
  type StoredRoom,
} from "./state";

/**
 * One instance of this class exists per room code, globally. Every connected
 * phone and the big screen hold a WebSocket to this one object.
 *
 * What lives here is only what genuinely needs the runtime: the socket
 * lifecycle, persistence, the alarm, and fan-out. The rules of the game are in
 * `state.ts`, who may do what is in `join.ts` and `commands.ts`, and what each
 * role is allowed to see is in `projection.ts`.
 */
export class Room extends DurableObject<Env> {
  private room: StoredRoom | null = null;
  private readonly isConnected: IsConnected;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.isConnected = connectionChecker(ctx);

    // Hibernation wipes memory and re-runs this constructor, so reload from
    // storage before handling anything.
    ctx.blockConcurrencyWhile(async () => {
      this.room = await loadRoom(ctx.storage);
    });

    // Heartbeats are answered by the runtime itself. This keeps proxies from
    // killing idle sockets without waking the object (and without billing us).
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG),
    );
  }

  // -------------------------------------------------------------------------
  // RPC, called by the Worker
  // -------------------------------------------------------------------------

  /**
   * Claims this code. Returns `ok: false` if the room already exists, which is
   * how the Worker detects a code collision.
   *
   * This also makes typo'd codes safe: `getByName` always resolves to *some*
   * object, so without an explicit "was this ever created" flag, joining with
   * a wrong code would silently drop you into an empty room.
   */
  async tryCreate(code: string): Promise<{ ok: boolean; hostToken?: string }> {
    if (this.room !== null) return { ok: false };

    const hostToken = generateToken();
    this.room = createRoom(code, hostToken);
    await this.persist();
    return { ok: true, hostToken };
  }

  async exists(): Promise<boolean> {
    return this.room !== null;
  }

  // -------------------------------------------------------------------------
  // WebSocket lifecycle
  // -------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/ws")) {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    return this.handleUpgrade(url);
  }

  private async handleUpgrade(url: URL): Promise<Response> {
    const room = this.room;
    if (room === null) {
      return refuseUpgrade("room_not_found", "That room code does not exist.");
    }

    const outcome = resolveIdentity(room, url.searchParams, this.isConnected);
    if (!outcome.ok) {
      return refuseUpgrade(outcome.code, outcome.message);
    }

    const { identity } = outcome;
    const { 0: client, 1: server } = new WebSocketPair();

    // acceptWebSocket (not server.accept) is what enables hibernation: the
    // room can drop out of memory while every phone stays connected.
    this.ctx.acceptWebSocket(server, [roleTag(identity.role), playerTag(identity.id)]);
    attach(server, { playerId: identity.id, role: identity.role });

    closeSuperseded(this.ctx, identity.id, server);

    touch(room);
    await this.persist();

    send(server, {
      t: "welcome",
      you: identity,
      state: projectState(room, identity.role, this.isConnected),
    });
    this.broadcast();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    if (room === null) return;
    if (typeof raw !== "string") return;
    if (raw === HEARTBEAT_PING) return; // Normally handled by the auto-responder.

    const actor = attachmentOf(ws);
    if (actor === null) return;

    const message = parseClientMessage(raw);
    if (message === null) {
      sendError(ws, "bad_message", "The server could not understand that message.");
      return;
    }

    touch(room);

    const outcome = applyCommand(room, actor, message, this.isConnected);
    switch (outcome.kind) {
      case "applied":
        await this.commit();
        return;
      case "rejected":
        sendError(ws, outcome.code, outcome.message);
        return;
      case "ignored":
        return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const room = this.room;
    if (room === null) return;

    const actor = attachmentOf(ws);
    if (actor === null || actor.role !== "player") return;

    const player = findPlayer(room, actor.playerId);
    if (player === undefined) return;

    // A refresh or a second tab means the close we are handling may belong to
    // a socket that has already been replaced. Asking whether any live socket
    // remains answers that directly, and unlike a stored flag it stays right
    // no matter what order the events arrive in.
    if (isConnected(this.ctx, player.id, ws)) return;

    if (room.phase === "lobby") {
      // Nothing to preserve before the game starts — free the name and slot.
      removePlayer(room, player.id);
    }
    // Mid-game we keep the seat and the answer so they can come back. There is
    // no flag to flip either way, since `connected` is derived.

    touch(room);

    // Their departure may have been the last one the round was waiting on.
    if (room.phase === "prompt" && everyoneAnswered(room, this.isConnected)) {
      endRound(room);
    }

    await this.commit();
  }

  // -------------------------------------------------------------------------
  // Alarms: round deadline and idle cleanup share the single alarm slot
  // -------------------------------------------------------------------------

  async alarm(): Promise<void> {
    const room = this.room;
    if (room === null) return;
    const now = Date.now();

    if (roundExpired(room, now)) {
      endRound(room);
      await this.commit();
    }

    if (idleExpired(room, now)) {
      await this.destroy();
      return;
    }

    await this.scheduleAlarm();
  }

  /** Tears the room down and releases its code for reuse. */
  private async destroy(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      send(socket, {
        t: "error",
        code: "room_closed",
        message: "This room was closed after being idle.",
        fatal: true,
      });
      closeQuietly(socket, 1000, "Room closed");
    }
    this.room = null;
    await clearRoom(this.ctx.storage);
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  /** Write the room down and make sure an alarm is pending for its next deadline. */
  private async persist(): Promise<void> {
    const room = this.room;
    if (room === null) return;
    await saveRoom(this.ctx.storage, room);
    await this.scheduleAlarm();
  }

  /** Persist, then tell everyone. The end of every successful mutation. */
  private async commit(): Promise<void> {
    await this.persist();
    this.broadcast();
  }

  private async scheduleAlarm(): Promise<void> {
    if (this.room === null) return;
    await this.ctx.storage.setAlarm(nextAlarmAt(this.room));
  }

  private broadcast(): void {
    const room = this.room;
    if (room === null) return;

    // Serialised once per role rather than once per socket: the host and the
    // players see different answers, but everyone sharing a role sees the same
    // snapshot.
    const payloads: Record<Role, string> = {
      host: this.stateMessage(room, "host"),
      player: this.stateMessage(room, "player"),
    };

    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const actor = attachmentOf(socket);
      if (actor === null) continue;
      sendRaw(socket, payloads[actor.role]);
    }
  }

  private stateMessage(room: StoredRoom, role: Role): string {
    return JSON.stringify({
      t: "state",
      state: projectState(room, role, this.isConnected),
    } satisfies ServerMessage);
  }
}
