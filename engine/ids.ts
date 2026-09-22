/**
 * The set of games that exist, shared by the server, the browser and the wire.
 *
 * Kept apart from the engine contracts because both the server registry and
 * the client registry need it, and neither should have to import the other's
 * half of the engine to name a game.
 */

export const GAME_IDS = ["word-wall"] as const;

export type GameId = (typeof GAME_IDS)[number];

export const DEFAULT_GAME_ID: GameId = "word-wall";

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}
