/**
 * The wire contract shared by the Worker, the Durable Object and the browser.
 *
 * Rule of thumb: the server always sends a *full* state snapshot rather than
 * diffs. A room holds at most a dozen short strings, so a snapshot is a couple
 * of kilobytes. This removes an entire category of "my client drifted out of
 * sync" bugs, which matters a lot when players are on flaky phone connections
 * and reconnect mid-game.
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const MAX_PLAYERS = 12;
export const MAX_NAME_LENGTH = 12;
export const MAX_ANSWER_LENGTH = 80;

/** How long a round lasts before the server force-ends it. */
export const ROUND_SECONDS = 60;

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

export type Phase = "lobby" | "prompt" | "results";

export type Role = "host" | "player";

export interface PublicPlayer {
  id: string;
  name: string;
  /** False while their phone is reconnecting. They keep their seat. */
  connected: boolean;
  submitted: boolean;
}

export interface Answer {
  playerId: string;
  name: string;
  text: string;
  at: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  prompt: string | null;
  /**
   * Withheld from players during the `prompt` phase so a phone can't be used
   * to read everyone else's answer before writing its own.
   */
  answers: Answer[];
  /** Epoch ms when the current round ends, or null outside a round. */
  deadline: number | null;
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
  | { t: "start" } // host: lobby/results -> prompt
  | { t: "submit"; text: string } // player: send a word to the wall
  | { t: "skip" } // host: end the round early
  | { t: "reset" }; // host: back to the lobby

export type ErrorCode =
  | "room_not_found"
  | "room_full"
  | "name_taken"
  | "bad_name"
  | "not_host"
  | "wrong_phase"
  | "bad_message"
  | "room_closed";

/** Errors after which reconnecting is pointless — the client should give up. */
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

// ---------------------------------------------------------------------------
// Validation — used on both sides so the UI can pre-validate what the server
// will enforce anyway. Never trust the client copy.
// ---------------------------------------------------------------------------

/** Strips control characters and collapses runs of whitespace. */
function clean(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = clean(input).slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

export function normalizeAnswer(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = clean(input).slice(0, MAX_ANSWER_LENGTH);
  return text.length > 0 ? text : null;
}

export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const char of code) {
    if (!CODE_ALPHABET.includes(char)) return null;
  }
  return code;
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const message = parsed as { t?: unknown; text?: unknown };
  switch (message.t) {
    case "start":
      return { t: "start" };
    case "skip":
      return { t: "skip" };
    case "reset":
      return { t: "reset" };
    case "submit":
      return typeof message.text === "string"
        ? { t: "submit", text: message.text }
        : null;
    default:
      return null;
  }
}
