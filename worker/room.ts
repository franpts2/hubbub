import { DurableObject } from "cloudflare:workers";

import {
  CLOSE_REFUSED,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  MAX_PLAYERS,
  ROOM_IDLE_MS,
  ROUND_SECONDS,
  type Answer,
  type ClientMessage,
  type ErrorCode,
  type Identity,
  type Phase,
  type PublicPlayer,
  type Role,
  type RoomState,
  type ServerMessage,
  FATAL_ERRORS,
  normalizeAnswer,
  normalizeName,
  parseClientMessage,
} from "../shared/protocol";
import { generateToken } from "./codes";
import { pickPrompt } from "./prompts";

const STATE_KEY = "room";

interface StoredPlayer {
  id: string;
  name: string;
  connected: boolean;
  joinedAt: number;
  /**
   * Bumped every time this player opens a new socket. Lets us tell a stale
   * connection's close event apart from the current one — see
   * `handleDisconnect`.
   */
  seq: number;
}

interface StoredRoom {
  code: string;
  /** Proves a client is the screen that created the room, not a player. */
  hostToken: string;
  phase: Phase;
  prompt: string | null;
  deadline: number | null;
  players: StoredPlayer[];
  answers: Answer[];
  lastActivity: number;
}

/**
 * Per-connection data. Survives hibernation because we stash it on the socket
 * itself with `serializeAttachment` — instance fields do not survive.
 */
interface Attachment {
  playerId: string;
  role: Role;
  /** Which connection attempt this socket belongs to. Unused for the host. */
  seq: number;
}

const tagForPlayer = (playerId: string) => `id:${playerId}`;

/**
 * One instance of this class exists per room code, globally. It owns the whole
 * game: the player list, the current phase, and the answers. Every connected
 * phone and the big screen hold a WebSocket to this one object.
 */
export class Room extends DurableObject<Env> {
  private room: StoredRoom | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Hibernation wipes memory and re-runs this constructor, so reload from
    // storage before handling anything.
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<StoredRoom>(STATE_KEY)) ?? null;
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
    this.room = {
      code,
      hostToken,
      phase: "lobby",
      prompt: null,
      deadline: null,
      players: [],
      answers: [],
      lastActivity: Date.now(),
    };
    await this.save();
    await this.scheduleAlarm();
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
    if (this.room === null) {
      return refuse("room_not_found", "That room code does not exist.");
    }

    const role: Role = url.searchParams.get("role") === "host" ? "host" : "player";
    let identity: Identity;
    let seq = 0;

    if (role === "host") {
      const token = url.searchParams.get("hostToken");
      // Without this check, anyone who can read the code off the TV could
      // connect as the host and drive the game.
      if (!token || !safeEqual(token, this.room.hostToken)) {
        return refuse("not_host", "You are not the host of this room.");
      }
      identity = { id: "host", role: "host", name: null };
    } else {
      // Clients mint their own id and keep it in localStorage, so a reconnect
      // is recognisable even if it happens before the first reply lands.
      const requestedId = normalizeId(url.searchParams.get("playerId"));
      const name = normalizeName(url.searchParams.get("name"));
      if (name === null) {
        return refuse("bad_name", "Pick a name with at least one character.");
      }

      const existing = requestedId
        ? this.room.players.find((player) => player.id === requestedId)
        : undefined;

      const nameTaken = this.room.players.some(
        (player) =>
          player.id !== existing?.id &&
          player.name.toLowerCase() === name.toLowerCase(),
      );
      if (nameTaken) {
        return refuse("name_taken", `"${name}" is already taken in this room.`);
      }

      if (existing) {
        // A returning phone reclaims its seat, keeping its submission.
        existing.name = name;
        existing.connected = true;
        existing.seq += 1;
        seq = existing.seq;
        identity = { id: existing.id, role: "player", name };
      } else {
        if (this.room.players.length >= MAX_PLAYERS) {
          return refuse("room_full", `This room is full (${MAX_PLAYERS} players).`);
        }
        const player: StoredPlayer = {
          // Honour the client's id so its very next reconnect matches. It is
          // no more trusted than the server-generated one was: either way the
          // value only ever reaches the one client that owns it.
          id: requestedId ?? crypto.randomUUID(),
          name,
          connected: true,
          joinedAt: Date.now(),
          seq: 1,
        };
        this.room.players.push(player);
        seq = player.seq;
        identity = { id: player.id, role: "player", name };
      }
    }

    const { 0: client, 1: server } = new WebSocketPair();

    // acceptWebSocket (not server.accept) is what enables hibernation: the
    // room can drop out of memory while every phone stays connected.
    this.ctx.acceptWebSocket(server, [`role:${role}`, tagForPlayer(identity.id)]);
    server.serializeAttachment({ playerId: identity.id, role, seq } satisfies Attachment);

    // Best-effort tidy-up of a superseded socket (refresh, second tab, or
    // React StrictMode double-mounting in dev). This is intentionally not
    // load-bearing: the runtime can take a while to actually flush the close
    // frame, so `seq` — not this call — is what keeps bookkeeping correct.
    for (const socket of this.ctx.getWebSockets(tagForPlayer(identity.id))) {
      if (socket !== server) {
        try {
          socket.close(1000, "Replaced by a newer connection");
        } catch {
          // Already gone; nothing to do.
        }
      }
    }

    this.touch();
    await this.save();

    this.send(server, { t: "welcome", you: identity, state: this.stateFor(role) });
    this.broadcast();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (this.room === null) return;
    if (typeof raw !== "string") return;
    if (raw === HEARTBEAT_PING) return; // Normally handled by the auto-responder.

    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;

    const message = parseClientMessage(raw);
    if (message === null) {
      this.fail(ws, "bad_message", "The server could not understand that message.");
      return;
    }

    this.touch();
    await this.dispatch(ws, attachment, message);
  }

  private async dispatch(
    ws: WebSocket,
    attachment: Attachment,
    message: ClientMessage,
  ): Promise<void> {
    const room = this.room;
    if (room === null) return;

    const requireHost = () => {
      if (attachment.role !== "host") {
        this.fail(ws, "not_host", "Only the host screen can do that.");
        return false;
      }
      return true;
    };

    switch (message.t) {
      case "start": {
        if (!requireHost()) return;
        if (room.phase === "prompt") {
          this.fail(ws, "wrong_phase", "A round is already running.");
          return;
        }
        room.phase = "prompt";
        room.prompt = pickPrompt(room.prompt);
        // Clearing answers also resets every player's `submitted` flag, which
        // is derived rather than stored.
        room.answers = [];
        room.deadline = Date.now() + ROUND_SECONDS * 1000;
        await this.save();
        await this.scheduleAlarm();
        this.broadcast();
        return;
      }

      case "skip": {
        if (!requireHost()) return;
        if (room.phase !== "prompt") return;
        await this.endRound();
        return;
      }

      case "reset": {
        if (!requireHost()) return;
        room.phase = "lobby";
        room.prompt = null;
        room.answers = [];
        room.deadline = null;
        // Drop players who wandered off, so the next round starts clean.
        room.players = room.players.filter((player) => player.connected);
        await this.save();
        await this.scheduleAlarm();
        this.broadcast();
        return;
      }

      case "submit": {
        if (attachment.role !== "player") return;
        if (room.phase !== "prompt") {
          this.fail(ws, "wrong_phase", "There is no round running right now.");
          return;
        }
        const player = room.players.find((entry) => entry.id === attachment.playerId);
        if (!player) return;

        const text = normalizeAnswer(message.text);
        if (text === null) {
          this.fail(ws, "bad_message", "Write something first.");
          return;
        }

        // Re-submitting overwrites: players change their mind constantly.
        const answer: Answer = {
          playerId: player.id,
          name: player.name,
          text,
          at: Date.now(),
        };
        const index = room.answers.findIndex((a) => a.playerId === player.id);
        if (index === -1) room.answers.push(answer);
        else room.answers[index] = answer;

        await this.save();
        this.broadcast();

        // End early once everyone still connected has answered, so nobody
        // sits watching a timer tick down for no reason.
        if (this.everyoneAnswered()) await this.endRound();
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    if (this.room === null) return;
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment || attachment.role !== "player") return;

    const player = this.room.players.find((entry) => entry.id === attachment.playerId);
    if (!player) return;

    // Ignore close events from superseded sockets. Without this, a refresh
    // (old socket closes *after* the new one opens) would mark a perfectly
    // connected player as gone, or worse, delete them from the lobby.
    if (attachment.seq !== player.seq) return;

    if (this.room.phase === "lobby") {
      // Nothing to preserve before the game starts — free the name and slot.
      this.room.players = this.room.players.filter((entry) => entry.id !== player.id);
    } else {
      // Mid-game: keep the seat and their answer so they can come back.
      player.connected = false;
    }

    this.touch();
    await this.save();
    this.broadcast();

    if (this.room.phase === "prompt" && this.everyoneAnswered()) {
      await this.endRound();
    }
  }

  // -------------------------------------------------------------------------
  // Alarms: round deadline and idle cleanup share the single alarm slot
  // -------------------------------------------------------------------------

  async alarm(): Promise<void> {
    if (this.room === null) return;
    const now = Date.now();

    if (this.room.phase === "prompt" && this.room.deadline !== null) {
      if (now >= this.room.deadline - 250) {
        await this.endRound();
      }
    }

    if (this.room !== null && now - this.room.lastActivity >= ROOM_IDLE_MS) {
      await this.destroy();
      return;
    }

    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    if (this.room === null) return;
    const candidates: number[] = [this.room.lastActivity + ROOM_IDLE_MS];
    if (this.room.phase === "prompt" && this.room.deadline !== null) {
      candidates.push(this.room.deadline);
    }
    await this.ctx.storage.setAlarm(Math.min(...candidates));
  }

  private async endRound(): Promise<void> {
    if (this.room === null || this.room.phase !== "prompt") return;
    this.room.phase = "results";
    this.room.deadline = null;
    await this.save();
    await this.scheduleAlarm();
    this.broadcast();
  }

  /** Tears the room down and releases its code for reuse. */
  private async destroy(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        this.send(socket, {
          t: "error",
          code: "room_closed",
          message: "This room was closed after being idle.",
          fatal: true,
        });
        socket.close(1000, "Room closed");
      } catch {
        // Socket already gone.
      }
    }
    this.room = null;
    await this.ctx.storage.deleteAll();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private everyoneAnswered(): boolean {
    if (this.room === null) return false;
    const active = this.room.players.filter((player) => player.connected);
    if (active.length === 0) return false;
    return active.every((player) =>
      this.room!.answers.some((answer) => answer.playerId === player.id),
    );
  }

  private stateFor(role: Role): RoomState {
    const room = this.room!;
    const players: PublicPlayer[] = room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      submitted: room.answers.some((answer) => answer.playerId === player.id),
    }));

    // Players must not see the wall until the round is over.
    const answers =
      role === "host" || room.phase === "results" ? room.answers : [];

    return {
      code: room.code,
      phase: room.phase,
      players,
      prompt: room.prompt,
      answers,
      deadline: room.deadline,
    };
  }

  private broadcast(): void {
    if (this.room === null) return;
    const payloads: Record<Role, string> = {
      host: JSON.stringify({ t: "state", state: this.stateFor("host") }),
      player: JSON.stringify({ t: "state", state: this.stateFor("player") }),
    };

    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (!attachment) continue;
      try {
        socket.send(payloads[attachment.role]);
      } catch {
        // Socket died between the readyState check and the send.
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket died; the close handler will clean up.
    }
  }

  private fail(ws: WebSocket, code: ErrorCode, message: string): void {
    this.send(ws, { t: "error", code, message, fatal: FATAL_ERRORS.has(code) });
  }

  private touch(): void {
    if (this.room !== null) this.room.lastActivity = Date.now();
  }

  private async save(): Promise<void> {
    if (this.room === null) return;
    await this.ctx.storage.put(STATE_KEY, this.room);
  }
}

/**
 * Refuses a connection *through* the WebSocket rather than by failing the
 * handshake.
 *
 * Returning an HTTP 403 here would be more natural, but browsers report a
 * failed upgrade as an opaque error with no status and no body, so the player
 * would just see "connection failed" instead of "that name is taken". By
 * completing the upgrade we get one guaranteed message plus a close reason.
 */
function refuse(code: ErrorCode, message: string): Response {
  const { 0: client, 1: server } = new WebSocketPair();
  // Plain accept, not acceptWebSocket: this socket is closed immediately, so
  // there is nothing to hibernate.
  server.accept();
  const payload: ServerMessage = { t: "error", code, message, fatal: true };
  server.send(JSON.stringify(payload));
  server.close(CLOSE_REFUSED, code);
  return new Response(null, { status: 101, webSocket: client });
}

/**
 * Client-supplied ids are stored, so bound their shape rather than accepting
 * arbitrary strings into the room's persisted state.
 */
function normalizeId(input: string | null): string | null {
  if (input === null) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
    ? input.toLowerCase()
    : null;
}

/** Constant-time comparison, to avoid leaking the host token byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
