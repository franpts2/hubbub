/**
 * Helpers for testing anything built against the engine.
 *
 * Kept in `engine/` rather than inside one game's folder because a second
 * game will need exactly these: a roster to act on, and a way to name who is
 * sending a command. Test-only, so nothing here is imported by shipping code.
 */

import type { Actor, GameContext, Seat } from "./server";

/**
 * A roster from a compact description.
 *
 * `"ana"` is present, `"bo!"` is a seat whose phone has dropped. Presence is
 * the distinction most game rules turn on — a game must not wait forever on
 * someone who left the party — so it needs to be trivial to express.
 */
export function seats(...spec: string[]): Seat[] {
  return spec.map((entry) => {
    const connected = !entry.endsWith("!");
    const id = connected ? entry : entry.slice(0, -1);
    return { id, name: id.toUpperCase(), connected };
  });
}

export function context(seatList: Seat[], now = 1_000_000): GameContext {
  return { seats: seatList, now };
}

export const host: Actor = { playerId: "host", role: "host" };

export function player(id: string): Actor {
  return { playerId: id, role: "player" };
}
