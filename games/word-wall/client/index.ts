import type { GameClient } from "../../../engine/client";
import type { WordWallView } from "../shared";
import { HostView } from "./HostView";
import { PlayerView } from "./PlayerView";

export const wordWallClient: GameClient<WordWallView> = {
  id: "word-wall",
  name: "Word Wall",
  HostView,
  PlayerView,
};
