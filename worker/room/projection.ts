/**
 * Builds the snapshot one particular viewer receives.
 *
 * The platform's half is uninteresting — who is here, what the room is doing.
 * The part with teeth is delegated: what a viewer may see of the game is the
 * game's rule, enforced in its own `view`. Hidden information never leaves the
 * server for a client that should not have it, because withholding it in the
 * UI would be no protection at all when anyone can read socket frames.
 *
 * One snapshot per viewer, not per role. Two players are not interchangeable:
 * a game may owe each of them something private, such as which entry in an
 * anonymous list is their own.
 */

import type { AnyGame, Viewer } from "../../engine/server";
import type { PublicPlayer, RoomState } from "../../shared/protocol";
import { gameContext, type IsConnected, type StoredRoom } from "./state";

export function projectState(
  room: StoredRoom,
  game: AnyGame,
  viewer: Viewer,
  isConnected: IsConnected,
): RoomState {
  const players: PublicPlayer[] = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    connected: isConnected(player.id),
  }));

  return {
    code: room.code,
    gameId: room.gameId,
    status: room.status,
    players,
    deadline: room.deadline,
    game:
      room.status === "playing"
        ? game.view(room.game, viewer, gameContext(room, isConnected))
        : null,
  };
}
