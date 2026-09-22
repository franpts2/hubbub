import type { ReactNode } from "react";

import type { GamePlayerProps } from "../../../engine/client";
import { Eyebrow } from "../../../src/components/ui";
import type { CrowdFavouriteView } from "../shared";
import { Ballot } from "./Ballot";
import { Scoreboard } from "./Scoreboard";
import { WriteForm } from "./WriteForm";

/**
 * Crowd Favourite on a phone. One job per phase — nobody reads UI at a party.
 *
 * Scores and the final standings are deliberately thin here: the big screen is
 * doing the reveal, and a phone competing with it just splits attention.
 */
export function PlayerView({
  view,
  you,
  deadline,
  send,
}: GamePlayerProps<CrowdFavouriteView>) {
  switch (view.phase) {
    case "writing":
      return (
        <WriteForm
          view={view}
          youId={you.id}
          deadline={deadline}
          onSubmit={(text) => send({ t: "submit", text })}
        />
      );

    case "voting":
      // Nothing to vote on when your answer is the only one there.
      if (view.candidates.length <= 1) {
        return <Waiting>Not enough answers to vote on.</Waiting>;
      }
      return (
        <Ballot
          view={view}
          deadline={deadline}
          onVote={(candidateId) => send({ t: "vote", candidateId })}
        />
      );

    case "scores":
      return (
        <div className="flex flex-1 flex-col justify-center gap-6">
          <Eyebrow className="text-center" size="md" tracking="wider">
            Look up at the screen
          </Eyebrow>
          <Scoreboard standings={view.standings} />
        </div>
      );

    case "final":
      return (
        <div className="flex flex-1 flex-col justify-center gap-6">
          <Eyebrow className="text-center" size="md" tracking="wider">
            That's the lot
          </Eyebrow>
          <Scoreboard standings={view.standings} size="lg" />
        </div>
      );
  }
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center text-center text-xl font-bold text-muted">
      {children}
    </p>
  );
}
