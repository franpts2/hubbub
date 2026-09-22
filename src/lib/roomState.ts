/**
 * Questions the UI asks of a room snapshot.
 *
 * `submitted` is server-owned, and both screens read it: the host counts it to
 * show progress, the phone checks its own to confirm an answer landed. Keeping
 * those reads here stops the two screens from disagreeing about what "answered"
 * means.
 */

import type { PublicPlayer } from "../../shared/protocol";

export function countSubmitted(players: readonly PublicPlayer[]): number {
  return players.filter((player) => player.submitted).length;
}

/**
 * Whether *our* answer is recorded on the server.
 *
 * Deliberately not tracked as local state: the server is the source of truth,
 * so a submission lost to a dropped socket does not look like a success.
 */
export function hasSubmitted(
  players: readonly PublicPlayer[],
  playerId: string | null,
): boolean {
  if (playerId === null) return false;
  return players.some((player) => player.id === playerId && player.submitted);
}
