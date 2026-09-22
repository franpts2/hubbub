/**
 * Routing a client message to whoever owns it.
 *
 * Only two commands belong to the platform — take the room into a game, and
 * bring it back out. Everything else is the active game's business and is
 * forwarded without inspection, which is the seam that lets a game define its
 * own vocabulary without touching this file.
 *
 * Returns a description of the result rather than saving or broadcasting:
 * persistence, alarms and fan-out are one policy that belongs to the Durable
 * Object, and keeping them there means every mutation is committed once.
 */

import type { AnyGame } from "../../engine/server";
import type { ClientMessage, ErrorCode } from "../../shared/protocol";
import type { Attachment } from "./sockets";
import { gameContext, returnToLobby, type IsConnected, type StoredRoom } from "./state";

export type CommandOutcome =
  /** The room changed and must be persisted and broadcast. */
  | { kind: "applied" }
  /** Legal but a no-op — usually a stale message from a client mid-transition. */
  | { kind: "ignored" }
  /** Refused; tell this client why. */
  | { kind: "rejected"; code: ErrorCode; message: string };

const APPLIED: CommandOutcome = { kind: "applied" };
const IGNORED: CommandOutcome = { kind: "ignored" };

const NOT_HOST: CommandOutcome = {
  kind: "rejected",
  code: "not_host",
  message: "Only the host screen can do that.",
};

export function applyCommand(
  room: StoredRoom,
  game: AnyGame,
  actor: Attachment,
  message: ClientMessage,
  isConnected: IsConnected,
): CommandOutcome {
  switch (message.t) {
    case "start_game": {
      if (actor.role !== "host") return NOT_HOST;
      if (room.status === "playing") {
        return {
          kind: "rejected",
          code: "wrong_phase",
          message: "A game is already running.",
        };
      }
      // The game decides how many people it needs; the room only counts them.
      // Enforced here as well as in the lobby UI, because a disabled button is
      // not a rule.
      if (room.players.length < game.minPlayers) {
        return {
          kind: "rejected",
          code: "wrong_phase",
          message: `${game.name} needs at least ${game.minPlayers} players.`,
        };
      }
      room.status = "playing";
      room.game = game.create(gameContext(room, isConnected));
      return APPLIED;
    }

    case "end_game": {
      if (actor.role !== "host") return NOT_HOST;
      if (room.status === "lobby") return IGNORED;
      returnToLobby(room, isConnected);
      return APPLIED;
    }

    case "game":
      return forwardToGame(room, game, actor, message.c, isConnected);
  }
}

function forwardToGame(
  room: StoredRoom,
  game: AnyGame,
  actor: Attachment,
  payload: unknown,
  isConnected: IsConnected,
): CommandOutcome {
  if (room.status !== "playing") {
    return {
      kind: "rejected",
      code: "wrong_phase",
      message: "There is no game running right now.",
    };
  }

  const command = game.parseCommand(payload);
  if (command === null) {
    return {
      kind: "rejected",
      code: "bad_message",
      message: "The server could not understand that message.",
    };
  }

  const outcome = game.apply(
    room.game,
    command,
    { playerId: actor.playerId, role: actor.role },
    gameContext(room, isConnected),
  );

  switch (outcome.kind) {
    case "changed":
      return APPLIED;
    case "ignored":
      return IGNORED;
    case "rejected":
      return { kind: "rejected", code: "game_rejected", message: outcome.message };
  }
}

/**
 * Lets the active game react to someone joining, dropping or coming back.
 *
 * Presence is the platform's to know and the game's to care about — a game
 * waiting on an answer needs to stop waiting when that phone leaves the party.
 */
export function notifySeatsChanged(
  room: StoredRoom,
  game: AnyGame,
  isConnected: IsConnected,
): boolean {
  if (room.status !== "playing") return false;
  if (game.onSeatsChanged === undefined) return false;
  return (
    game.onSeatsChanged(room.game, gameContext(room, isConnected)).kind === "changed"
  );
}

/** Runs the active game's timer. Returns whether anything changed. */
export function notifyDeadline(
  room: StoredRoom,
  game: AnyGame,
  isConnected: IsConnected,
): boolean {
  if (room.status !== "playing") return false;
  return game.onDeadline(room.game, gameContext(room, isConnected)).kind === "changed";
}
