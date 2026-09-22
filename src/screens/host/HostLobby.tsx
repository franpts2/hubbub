import type { PublicPlayer } from "../../../shared/protocol";
import { Button } from "../../components/ui";
import { JoinCallout } from "./JoinCallout";
import { PlayerRoster } from "./PlayerRoster";

export function HostLobby({
  code,
  players,
  onStart,
}: {
  code: string;
  players: PublicPlayer[];
  onStart: () => void;
}) {
  const empty = players.length === 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 lg:flex-row lg:items-start lg:gap-16">
      <JoinCallout code={code} />

      <div className="w-full max-w-md">
        <PlayerRoster players={players} />
        <Button onClick={onStart} disabled={empty} className="mt-8 w-full text-2xl">
          {empty ? "Need a player" : "Start the round"}
        </Button>
      </div>
    </div>
  );
}
