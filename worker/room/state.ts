/**
 * The room as data, plus every legal transformation of it.
 *
 * Scope check: seats, names, presence and the lobby/playing status. The active
 * game's state rides along as an opaque `game` field that only the game itself
 * ever reads. Nothing in here touches storage, sockets or the Durable Object,
 * so the room's own rules stay readable without standing up a runtime.
 */

import type { GameId } from "../../engine/ids";
import type { GameContext, Seat } from "../../engine/server";
import type { RoomStatus } from "../../shared/protocol";

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
  /** Which game this room runs. Fixed at creation. */
  gameId: GameId;
  status: RoomStatus;
  players: StoredPlayer[];
  /**
   * The active game's state, or null in the lobby.
   *
   * Opaque by design. The platform persists it, hands it back to the game, and
   * never inspects it — which is exactly why a new game needs no changes here.
   */
  game: unknown;
  /** Mirrors the active game's `deadline`, cached so the alarm can be set. */
  deadline: number | null;
  lastActivity: number;
}

export function createRoom(code: string, hostToken: string, gameId: GameId): StoredRoom {
  return {
    code,
    hostToken,
    gameId,
    status: "lobby",
    players: [],
    game: null,
    deadline: null,
    lastActivity: Date.now(),
  };
}

/** Pushes back the idle timeout. Called for anything a human did. */
export function touch(room: StoredRoom): void {
  room.lastActivity = Date.now();
}

/** The roster as the active game sees it, rebuilt fresh on every use. */
export function gameContext(room: StoredRoom, isConnected: IsConnected): GameContext {
  const seats: Seat[] = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    connected: isConnected(player.id),
  }));
  return { seats, now: Date.now() };
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
  if (room.status !== "lobby") return;
  room.players = room.players.filter((player) => isConnected(player.id));
}

// ---------------------------------------------------------------------------
// Lobby / playing
// ---------------------------------------------------------------------------

export function returnToLobby(room: StoredRoom, isConnected: IsConnected): void {
  room.status = "lobby";
  room.game = null;
  room.deadline = null;
  // Drop players who wandered off, so the next game starts clean.
  room.players = room.players.filter((player) => isConnected(player.id));
}
