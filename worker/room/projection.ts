/**
 * Builds the snapshot a particular role receives.
 *
 * The platform's half is uninteresting — who is here, what the room is doing.
 * The part with teeth is delegated: whether a role may see the game's hidden
 * information is the game's rule, enforced in its own `view`. Answers never
 * leave the server for a client that should not have them, because hiding
 * them in the UI would not be enough when anyone can read socket frames.
 */

import type { AnyGame } from "../../engine/server";
import type { PublicPlayer, Role, RoomState } from "../../shared/protocol";
import { gameContext, type IsConnected, type StoredRoom } from "./state";

export function projectState(
  room: StoredRoom,
  game: AnyGame,
  role: Role,
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
        ? game.view(room.game, role, gameContext(room, isConnected))
        : null,
  };
}
