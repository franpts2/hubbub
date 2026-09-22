import type { GameClient } from "../../../engine/client";
import { MIN_PLAYERS, type CrowdFavouriteView } from "../shared";
import { HostView } from "./HostView";
import { PlayerView } from "./PlayerView";

export const crowdFavouriteClient: GameClient<CrowdFavouriteView> = {
  id: "crowd-favourite",
  name: "Crowd Favourite",
  tagline: "Write an answer, then vote for the best one that isn't yours.",
  minPlayers: MIN_PLAYERS,
  HostView,
  PlayerView,
};
