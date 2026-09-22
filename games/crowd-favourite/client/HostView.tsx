import type { ReactNode } from "react";

import type { GameHostProps } from "../../../engine/client";
import { Button, Eyebrow, stagger } from "../../../src/components/ui";
import type { CrowdFavouriteView } from "../shared";
import { RoundResults } from "./RoundResults";
import { Scoreboard } from "./Scoreboard";

/**
 * Crowd Favourite on the shared screen.
 *
 * The room code, the countdown and the connection badge are the platform's
 * chrome, rendered around this. What this owns is the prompt, whatever the
 * current phase puts on the wall, and the host's controls.
 *
 * During voting the big screen shows the answers but never who wrote them or
 * who voted for what. It is the one screen everybody can see, so it is the
 * easiest place to spoil an anonymous vote.
 */
export function HostView(props: GameHostProps<CrowdFavouriteView>) {
  const { view } = props;
  const final = view.phase === "final";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="text-center">
        <Eyebrow tracking="wider">
          {final ? "Final scores" : `Round ${view.round} of ${view.totalRounds}`}
        </Eyebrow>
        {/* The prompt is the question being answered, so it goes once the game is over. */}
        {final ? null : (
          <h1 className="mt-3 text-4xl font-black text-balance sm:text-5xl">
            {view.prompt}
          </h1>
        )}
      </div>

      {/*
        The prompt above is allowed the full width — it is one line of very
        large type and `text-balance` wants the room. The board is not: a
        result row stretched across a 1440px television put "+200" and the
        answer that earned it at opposite ends of the screen, with a metre
        of empty navy between them. Capped, the two belong to each other
        again.
      */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        <Board {...props} />
      </div>
    </div>
  );
}

/** One job per phase, split out so each case reads on its own. */
function Board({ view, players, send, onEndGame }: GameHostProps<CrowdFavouriteView>) {
  switch (view.phase) {
    case "writing":
      return (
        <>
          <p className="flex flex-1 items-center justify-center text-6xl font-black tabular-nums">
            {view.submitted.length}
            <span className="ml-3 text-2xl font-bold text-muted">
              / {players.length} in
            </span>
          </p>
          <Controls
            onSkip={() => send({ t: "skip" })}
            skipLabel="Stop writing"
            onEndGame={onEndGame}
          />
        </>
      );

    case "voting":
      return (
        <>
          <ul className="flex flex-1 flex-col justify-center gap-3">
            {view.candidates.map((candidate, index) => (
              <li
                key={candidate.id}
                // The same cascade the phones are running, so the wall and
                // the ballot in everyone's hand fill in together.
                style={stagger(index)}
                className="animate-rise rounded-2xl border-2 border-ink-line bg-ink-soft px-5 py-4 text-2xl font-black text-balance"
              >
                {candidate.text}
              </li>
            ))}
          </ul>
          {/* How many have voted, never what for. */}
          <Eyebrow className="text-center" tracking="wider">
            {view.voted.length} of {players.length} voted
          </Eyebrow>
          <Controls
            onSkip={() => send({ t: "skip" })}
            skipLabel="Close the vote"
            onEndGame={onEndGame}
          />
        </>
      );

    case "scores":
      return (
        <>
          <RoundResults view={view} />
          <Scoreboard standings={view.standings} />
          <Controls
            primary={
              <Button onClick={() => send({ t: "next" })}>
                {view.lastRound ? "Final scores" : "Next round"}
              </Button>
            }
            onEndGame={onEndGame}
          />
        </>
      );

    case "final":
      return (
        <>
          <div className="flex flex-1 flex-col justify-center">
            <Scoreboard standings={view.standings} size="lg" />
          </div>
          <Controls onEndGame={onEndGame} endLabel="Back to lobby" />
        </>
      );
  }
}

function Controls({
  primary,
  onSkip,
  skipLabel,
  onEndGame,
  endLabel = "End game",
}: {
  primary?: ReactNode;
  onSkip?: () => void;
  skipLabel?: string;
  onEndGame: () => void;
  endLabel?: string;
}) {
  return (
    <div className="flex justify-center gap-4">
      {primary}
      {onSkip === undefined ? null : (
        <Button variant="ghost" onClick={onSkip}>
          {skipLabel}
        </Button>
      )}
      <Button variant="ghost" onClick={onEndGame}>
        {endLabel}
      </Button>
    </div>
  );
}
