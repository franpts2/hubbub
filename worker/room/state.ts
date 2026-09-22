/**
 * The room as data, plus every legal transformation of it.
 *
 * Nothing in here touches storage, sockets or the Durable Object. That is the
 * point: the rules of the game are the part most worth being able to read (and
 * eventually test) without standing up a runtime, so effects are pushed out to
 * the caller and anything about who is actually online arrives as an
 * `IsConnected` function.
 */

import { ROUND_SECONDS, type Answer, type Phase } from "../../shared/protocol";
import { pickPrompt } from "../prompts";

/**
 * Whether a player is holding a live socket right now. Implemented by
 * `presence.ts`, which derives it from the Durable Object's socket set.
 */
export type IsConnected = (playerId: string) => boolean;

/**
 * Note what is *not* here: whether the player is currently connected.
 *
 * Connectivity describes a live socket, so storing it durably lets it outlive
 * the thing it describes. A stored flag is only ever corrected by a close
 * event, and a close event can go missing — the object can be restarted by a
 * deploy, moved, or (in dev) swapped out by HMR. When that happens the flag
 * stays `true` forever with no path back to the truth, which leaves a ghost
 * occupying a seat, holding a name, and blocking the round from ending early.
 *
 * So it is derived from the live socket set instead. See `presence.ts`.
 */
export interface StoredPlayer {
  id: string;
  name: string;
  joinedAt: number;
}

export interface StoredRoom {
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

export function createRoom(code: string, hostToken: string): StoredRoom {
  return {
    code,
    hostToken,
    phase: "lobby",
    prompt: null,
    deadline: null,
    players: [],
    answers: [],
    lastActivity: Date.now(),
  };
}

/** Pushes back the idle timeout. Called for anything a human did. */
export function touch(room: StoredRoom): void {
  room.lastActivity = Date.now();
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function findPlayer(room: StoredRoom, playerId: string): StoredPlayer | undefined {
  return room.players.find((player) => player.id === playerId);
}

/** Case-insensitive, because "Sam" and "sam" are the same person at a party. */
export function isNameTaken(room: StoredRoom, name: string, exceptId?: string): boolean {
  const target = name.toLowerCase();
  return room.players.some(
    (player) => player.id !== exceptId && player.name.toLowerCase() === target,
  );
}

export function addPlayer(room: StoredRoom, id: string, name: string): StoredPlayer {
  const player: StoredPlayer = { id, name, joinedAt: Date.now() };
  room.players.push(player);
  return player;
}

export function removePlayer(room: StoredRoom, playerId: string): void {
  room.players = room.players.filter((player) => player.id !== playerId);
}

/**
 * Forgets lobby players who no longer hold a socket.
 *
 * Disconnects are normally handled by `webSocketClose`, but that event is not
 * guaranteed to arrive. Re-checking on join means a missed close heals itself
 * the next time anyone shows up, instead of leaving a ghost that holds a name
 * forever. Only safe in the lobby: mid-game a seat is worth keeping.
 */
export function pruneLobbyGhosts(room: StoredRoom, isConnected: IsConnected): void {
  if (room.phase !== "lobby") return;
  room.players = room.players.filter((player) => isConnected(player.id));
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export function startRound(room: StoredRoom): void {
  room.phase = "prompt";
  room.prompt = pickPrompt(room.prompt);
  // Clearing answers also resets every player's `submitted` flag, which is
  // derived rather than stored.
  room.answers = [];
  room.deadline = Date.now() + ROUND_SECONDS * 1000;
}

export function endRound(room: StoredRoom): void {
  room.phase = "results";
  room.deadline = null;
}

export function resetToLobby(room: StoredRoom, isConnected: IsConnected): void {
  room.phase = "lobby";
  room.prompt = null;
  room.answers = [];
  room.deadline = null;
  // Drop players who wandered off, so the next round starts clean.
  room.players = room.players.filter((player) => isConnected(player.id));
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/** Re-submitting overwrites: players change their mind constantly. */
export function upsertAnswer(room: StoredRoom, player: StoredPlayer, text: string): void {
  const answer: Answer = {
    playerId: player.id,
    name: player.name,
    text,
    at: Date.now(),
  };
  const index = room.answers.findIndex((entry) => entry.playerId === player.id);
  if (index === -1) room.answers.push(answer);
  else room.answers[index] = answer;
}

export function hasAnswered(room: StoredRoom, playerId: string): boolean {
  return room.answers.some((answer) => answer.playerId === playerId);
}

/**
 * True once everyone still in the room has sent something, which lets the
 * round end early instead of making people watch a timer tick down.
 *
 * Only players who are actually here can be waited on — a ghost would
 * otherwise stall the round until the full timer expired.
 */
export function everyoneAnswered(room: StoredRoom, isConnected: IsConnected): boolean {
  const active = room.players.filter((player) => isConnected(player.id));
  if (active.length === 0) return false;
  return active.every((player) => hasAnswered(room, player.id));
}
