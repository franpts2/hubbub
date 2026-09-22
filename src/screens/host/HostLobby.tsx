import type { PublicPlayer } from "../../../shared/protocol";
import { Button, Eyebrow } from "../../components/ui";
import { JoinCallout } from "./JoinCallout";
import { PlayerRoster } from "./PlayerRoster";

export function HostLobby({
  code,
  gameName,
  minPlayers,
  players,
  onStart,
}: {
  code: string;
  gameName: string;
  /** The game's own floor, so the button explains itself. */
  minPlayers: number;
  players: PublicPlayer[];
  onStart: () => void;
}) {
  const missing = minPlayers - players.length;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 lg:flex-row lg:items-start lg:gap-16">
      <JoinCallout code={code} />

      <div className="w-full max-w-md">
        {/* Named so the room says what it is before anyone commits to playing. */}
        <Eyebrow className="mb-3" tone="punch">
          Playing {gameName}
        </Eyebrow>
        <PlayerRoster players={players} />
        {/*
          The server refuses to start under the game's minimum too — this only
          explains the refusal. Saying how many more are needed beats a dead
          button nobody can account for.
        */}
        <Button onClick={onStart} disabled={missing > 0} className="mt-8 w-full text-2xl">
          {missing > 0 ? `Need ${missing} more` : "Start the game"}
        </Button>
      </div>
    </div>
  );
}
