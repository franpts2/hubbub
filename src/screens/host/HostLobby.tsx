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
    /*
      There used to be an `lg:items-start` here. Side by side the cross axis
      is the vertical one, so pinning it to the start hung both columns from
      the top of a television and left the bottom half of the screen empty —
      which is what the room is looking at for the entire time people are
      joining. Letting the base `items-center` apply at every width instead
      means the tall column fills the screen and the short one sits against
      the middle of it.
    */
    <div className="flex flex-1 flex-col items-center justify-center gap-10 lg:flex-row lg:gap-16">
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
