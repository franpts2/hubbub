import type { PublicPlayer } from "../../../shared/protocol";
import { Button, Eyebrow } from "../../components/ui";
import { JoinCallout } from "./JoinCallout";
import { PlayerRoster } from "./PlayerRoster";

export function HostLobby({
  code,
  gameName,
  players,
  onStart,
}: {
  code: string;
  gameName: string;
  players: PublicPlayer[];
  onStart: () => void;
}) {
  const empty = players.length === 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 lg:flex-row lg:items-start lg:gap-16">
      <JoinCallout code={code} />

      <div className="w-full max-w-md">
        {/* Named so the room says what it is before anyone commits to playing. */}
        <Eyebrow className="mb-3" tone="punch">
          Playing {gameName}
        </Eyebrow>
        <PlayerRoster players={players} />
        <Button onClick={onStart} disabled={empty} className="mt-8 w-full text-2xl">
          {empty ? "Need a player" : "Start the game"}
        </Button>
      </div>
    </div>
  );
}
