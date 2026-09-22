/**
 * Every game the browser can render. See `server.ts` for why these are split.
 */

import type { AnyGameClient } from "../engine/client";
import type { GameId } from "../engine/ids";
import { wordWallClient } from "./word-wall/client";

const CLIENT_GAMES: Record<GameId, AnyGameClient> = {
  "word-wall": wordWallClient,
};

export function clientGame(id: GameId): AnyGameClient {
  return CLIENT_GAMES[id];
}
