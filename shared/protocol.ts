/**
 * The *platform* wire contract, shared by the Worker, the Durable Object and
 * the browser.
 *
 * Scope is deliberate: this file knows about rooms, codes, seats, roles and
 * connections, and nothing whatsoever about any particular game. Anything a
 * game invents — its phases, its own messages, its own limits — lives with
 * that game under `games/<id>/`, so adding a game cannot change this file and
 * a change here cannot quietly alter a game's rules.
 *
 * Rule of thumb: the server always sends a *full* state snapshot rather than
 * diffs. A room holds at most a dozen short strings, so a snapshot is a couple
 * of kilobytes. This removes an entire category of "my client drifted out of
 * sync" bugs, which matters a lot when players are on flaky phone connections
 * and reconnect mid-game.
 */

import type { GameId } from "../engine/ids";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const MAX_PLAYERS = 12;
export const MAX_NAME_LENGTH = 12;

/** Rooms self-destruct after this much inactivity, freeing up their code. */
export const ROOM_IDLE_MS = 30 * 60 * 1000;

export const CODE_LENGTH = 4;

/**
 * No I, O, 0 or 1. People read these letters off a TV from across the room and
 * misread them constantly.
 */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Role = "host" | "player";

/** The only phase distinction the platform makes. Games phase themselves. */
export type RoomStatus = "lobby" | "playing";

export interface PublicPlayer {
  id: string;
  name: string;
  /** False while their phone is reconnecting. They keep their seat. */
  connected: boolean;
}

export interface RoomState {
  code: string;
  /** Which game this room runs. Fixed when the room is created. */
  gameId: GameId;
  status: RoomStatus;
  players: PublicPlayer[];
  /**
   * Epoch ms for the active game's timer, or null. The game decides when this
   * is; the platform owns the alarm behind it and renders the countdown.
   */
  deadline: number | null;
  /**
   * The active game's view for this role, or null in the lobby.
   *
   * Opaque on purpose: produced by the game's server-side `view`, consumed by
   * the game's own components, and merely forwarded by everything in between.
   * That is what stops game shapes leaking into the platform.
   */
  game: unknown;
}

export interface Identity {
  id: string;
  role: Role;
  name: string | null;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type ClientMessage =
  /** host: lobby -> playing */
  | { t: "start_game" }
  /** host: playing -> lobby, discarding the game's state */
  | { t: "end_game" }
  /** anything the active game defined; `c` is passed to its `parseCommand` */
  | { t: "game"; c: unknown };

export type ErrorCode =
  | "room_not_found"
  | "room_full"
  | "name_taken"
  | "bad_name"
  | "not_host"
  | "wrong_phase"
  | "bad_message"
  | "room_closed"
  /** The active game refused a command. Never fatal. */
  | "game_rejected";

/**
 * The codes that can only mean "this connection will never be accepted".
 *
 * Used by the client to read a refused handshake, which arrives as a close
 * code plus one of these as the reason. An error on a socket that is already
 * open is never fatal — it is a complaint about a message, not the connection.
 */
export const FATAL_ERRORS: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "room_not_found",
  "room_full",
  "name_taken",
  "bad_name",
  "not_host",
  "room_closed",
]);

export type ServerMessage =
  | { t: "welcome"; you: Identity; state: RoomState }
  | { t: "state"; state: RoomState }
  | { t: "error"; code: ErrorCode; message: string; fatal: boolean };

/**
 * Sent as a bare string (not JSON) so it can be handled by the Durable
 * Object's auto-responder, which replies without waking the object up.
 */
export const HEARTBEAT_PING = "ping";
export const HEARTBEAT_PONG = "pong";

/**
 * Close code used when the server refuses a connection outright.
 *
 * Browsers do not expose the body or status of a failed WebSocket upgrade — a
 * rejected handshake surfaces as an opaque 1006. So instead of replying with
 * an HTTP error, the server completes the upgrade, sends a proper error
 * message, and closes with this code plus the `ErrorCode` as the reason. That
 * makes "name taken" show up as readable text instead of "connection failed".
 */
export const CLOSE_REFUSED = 4001;
