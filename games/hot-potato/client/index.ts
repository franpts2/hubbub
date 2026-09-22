import type { GameClient } from "../../../engine/client";
import { MIN_PLAYERS, type HotPotatoView } from "../shared";
import { HostView } from "./HostView";
import { PlayerView } from "./PlayerView";

export const hotPotatoClient: GameClient<HotPotatoView> = {
  id: "hot-potato",
  name: "Hot Potato",
  tagline: "Name one, pass it on. Repeat yourself or stall and you're out.",
  minPlayers: MIN_PLAYERS,
  HostView,
  PlayerView,
};
