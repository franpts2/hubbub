/**
 * Every game the server can run.
 *
 * Deliberately separate from `client.ts`: a single registry exporting both
 * halves would drag prompt lists and round logic into the browser bundle, and
 * worse, would make it possible to import server code from a component by
 * accident. Two files, two dependency graphs.
 *
 * Adding a game is one line here plus one line in `client.ts`.
 */

import type { GameId } from "../engine/ids";
import type { AnyGame } from "../engine/server";
import { crowdFavourite } from "./crowd-favourite/server";
import { hotPotato } from "./hot-potato/server";
import { wordWall } from "./word-wall/server";

const SERVER_GAMES: Record<GameId, AnyGame> = {
  "word-wall": wordWall,
  "crowd-favourite": crowdFavourite,
  "hot-potato": hotPotato,
};

export function serverGame(id: GameId): AnyGame {
  return SERVER_GAMES[id];
}
