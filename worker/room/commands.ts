/**
 * What a connected client is allowed to do, and what it does to the room.
 *
 * Returns a description of the result instead of saving or broadcasting.
 * Persistence, alarms and fan-out are one policy that belongs to the Durable
 * Object; whether a command is legal is a rule of the game. Separating them
 * also means every command is applied and then committed exactly once, rather
 * than each branch remembering to save for itself.
 */

import type { ClientMessage, ErrorCode } from "../../shared/protocol";
import { normalizeAnswer } from "../../shared/validation";
import type { Attachment } from "./sockets";
import {
  endRound,
  everyoneAnswered,
  findPlayer,
  resetToLobby,
  startRound,
  upsertAnswer,
  type IsConnected,
  type StoredRoom,
} from "./state";

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
  actor: Attachment,
  message: ClientMessage,
  isConnected: IsConnected,
): CommandOutcome {
  switch (message.t) {
    case "start":
      if (actor.role !== "host") return NOT_HOST;
      if (room.phase === "prompt") {
        return {
          kind: "rejected",
          code: "wrong_phase",
          message: "A round is already running.",
        };
      }
      startRound(room);
      return APPLIED;

    case "skip":
      if (actor.role !== "host") return NOT_HOST;
      if (room.phase !== "prompt") return IGNORED;
      endRound(room);
      return APPLIED;

    case "reset":
      if (actor.role !== "host") return NOT_HOST;
      resetToLobby(room, isConnected);
      return APPLIED;

    case "submit":
      return submit(room, actor, message.text, isConnected);
  }
}

function submit(
  room: StoredRoom,
  actor: Attachment,
  raw: string,
  isConnected: IsConnected,
): CommandOutcome {
  if (actor.role !== "player") return IGNORED;

  if (room.phase !== "prompt") {
    return {
      kind: "rejected",
      code: "wrong_phase",
      message: "There is no round running right now.",
    };
  }

  const player = findPlayer(room, actor.playerId);
  if (player === undefined) return IGNORED;

  const text = normalizeAnswer(raw);
  if (text === null) {
    return { kind: "rejected", code: "bad_message", message: "Write something first." };
  }

  upsertAnswer(room, player, text);

  // End early once everyone still connected has answered, so nobody sits
  // watching a timer tick down for no reason.
  if (everyoneAnswered(room, isConnected)) endRound(room);

  return APPLIED;
}
