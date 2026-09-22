/**
 * Every game the browser can render. See `server.ts` for why these are split.
 */

import type { AnyGameClient } from "../engine/client";
import type { GameId } from "../engine/ids";
import { crowdFavouriteClient } from "./crowd-favourite/client";
import { hotPotatoClient } from "./hot-potato/client";
import { wordWallClient } from "./word-wall/client";

const CLIENT_GAMES: Record<GameId, AnyGameClient> = {
  "word-wall": wordWallClient,
  "crowd-favourite": crowdFavouriteClient,
  "hot-potato": hotPotatoClient,
};

export function clientGame(id: GameId): AnyGameClient {
  return CLIENT_GAMES[id];
}

/**
 * Every game, for the picker on the home screen.
 *
 * Derived from the same record rather than written out again, so a game cannot
 * be registered and then forgotten by the menu.
 */
export function clientGames(): AnyGameClient[] {
  return Object.values(CLIENT_GAMES);
}
