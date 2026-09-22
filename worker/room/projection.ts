/**
 * Turns the stored room into the snapshot a particular role is allowed to see.
 *
 * The one rule with teeth: players must not receive the answers while the
 * round is running. Hiding them in the UI would not be enough — anyone could
 * open dev tools and read the socket frames — so they never leave the server.
 */

import type { PublicPlayer, Role, RoomState } from "../../shared/protocol";
import { hasAnswered, type IsConnected, type StoredRoom } from "./state";

export function projectState(
  room: StoredRoom,
  role: Role,
  isConnected: IsConnected,
): RoomState {
  const players: PublicPlayer[] = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    connected: isConnected(player.id),
    submitted: hasAnswered(room, player.id),
  }));

  const answers = role === "host" || room.phase === "results" ? room.answers : [];

  return {
    code: room.code,
    phase: room.phase,
    players,
    prompt: room.prompt,
    answers,
    deadline: room.deadline,
  };
}
