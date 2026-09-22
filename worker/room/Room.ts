import { DurableObject } from "cloudflare:workers";

import { DEFAULT_GAME_ID, type GameId } from "../../engine/ids";
import type { AnyGame, Viewer } from "../../engine/server";
import { serverGame } from "../../games/server";
import {
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  type ServerMessage,
} from "../../shared/protocol";
import { parseClientMessage } from "../../shared/validation";
import { generateToken } from "../codes";
import { deadlinePassed, idleExpired, nextAlarmAt } from "./alarms";
import { applyCommand, notifyDeadline, notifySeatsChanged } from "./commands";
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
 * It owns the room, not the game. Sockets, seats, presence, persistence, the
 * alarm slot and fan-out live here; what happens after the host presses start
 * belongs to whichever game the room was created with, reached through
 * `engine/server`. The only game-shaped thing it holds is an opaque blob it
 * persists and hands back.
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

  /** The game this room runs, looked up rather than stored. */
  private get game(): AnyGame {
    return serverGame(this.room?.gameId ?? DEFAULT_GAME_ID);
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
  async tryCreate(
    code: string,
    gameId: GameId,
  ): Promise<{ ok: boolean; hostToken?: string }> {
    if (this.room !== null) return { ok: false };

    const hostToken = generateToken();
    this.room = createRoom(code, hostToken, gameId);
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
    const viewer: Viewer = { playerId: identity.id, role: identity.role };
    const { 0: client, 1: server } = new WebSocketPair();

    // acceptWebSocket (not server.accept) is what enables hibernation: the
    // room can drop out of memory while every phone stays connected.
    this.ctx.acceptWebSocket(server, [roleTag(identity.role), playerTag(identity.id)]);
    attach(server, viewer);

    closeSuperseded(this.ctx, identity.id, server);

    touch(room);
    // A new arrival can complete the set the game was waiting on.
    notifySeatsChanged(room, this.game, this.isConnected);
    await this.persist();

    send(server, {
      t: "welcome",
      you: identity,
      state: projectState(room, this.game, viewer, this.isConnected),
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

    const outcome = applyCommand(room, this.game, actor, message, this.isConnected);
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

    if (room.status === "lobby") {
      // Nothing to preserve before the game starts — free the name and slot.
      removePlayer(room, player.id);
    }
    // Mid-game we keep the seat so they can come back, and let the game decide
    // whether their absence changes anything.

    touch(room);
    notifySeatsChanged(room, this.game, this.isConnected);

    await this.commit();
  }

  // -------------------------------------------------------------------------
  // Alarms: the game's deadline and idle cleanup share the single slot
  // -------------------------------------------------------------------------

  async alarm(): Promise<void> {
    const room = this.room;
    if (room === null) return;
    const now = Date.now();

    if (deadlinePassed(room, now)) {
      // Only broadcast if the game actually did something. A timer firing is
      // not by itself news, and this is the one path that can wake every phone
      // in the room without a human having touched anything.
      if (notifyDeadline(room, this.game, this.isConnected)) await this.commit();
      else await this.persist();
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

  /**
   * Re-reads the active game's timer.
   *
   * The game only has to keep its own state right; asking it after every
   * change is what keeps the cached deadline, and therefore the alarm, honest.
   */
  private syncDeadline(): void {
    const room = this.room;
    if (room === null) return;
    room.deadline = room.status === "playing" ? this.game.deadline(room.game) : null;
  }

  /** Write the room down and make sure an alarm is pending for its next deadline. */
  private async persist(): Promise<void> {
    const room = this.room;
    if (room === null) return;
    this.syncDeadline();
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
    await this.ctx.storage.setAlarm(nextAlarmAt(this.room, Date.now()));
  }

  /**
   * Sends every open socket its own snapshot.
   *
   * Built per connection rather than per role. Sharing one payload between
   * everyone on a phone was cheaper, but it cannot express a game that owes
   * each player something private — such as which entry in an anonymous list
   * of answers is their own. A room is capped at `MAX_PLAYERS`, so this is at
   * most a few kilobytes serialised a dozen times, which is a small price for
   * being able to keep a secret per person.
   *
   * Two sockets for the same player (a refresh mid-flight, a second tab) each
   * get a snapshot; they are identical, because the viewer is the same.
   */
  private broadcast(): void {
    const room = this.room;
    if (room === null) return;

    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const viewer = attachmentOf(socket);
      if (viewer === null) continue;
      sendRaw(socket, this.stateMessage(room, viewer));
    }
  }

  private stateMessage(room: StoredRoom, viewer: Viewer): string {
    return JSON.stringify({
      t: "state",
      state: projectState(room, this.game, viewer, this.isConnected),
    } satisfies ServerMessage);
  }
}
