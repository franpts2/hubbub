import type { GameClient } from "../../../engine/client";
import { MIN_PLAYERS, type WordWallView } from "../shared";
import { HostView } from "./HostView";
import { PlayerView } from "./PlayerView";

export const wordWallClient: GameClient<WordWallView> = {
  id: "word-wall",
  name: "Word Wall",
  tagline: "Everyone answers the same prompt, all at once.",
  minPlayers: MIN_PLAYERS,
  HostView,
  PlayerView,
};
