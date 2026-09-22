import type { ReactNode } from "react";

import type { GameHostProps } from "../../../engine/client";
import { Button, Eyebrow, PlayerBlob } from "../../../src/components/ui";
import type { HotPotatoView } from "../shared";
import { SaidList } from "./SaidList";
import { Standings } from "./Standings";
import { TurnCircle } from "./TurnCircle";

/**
 * Hot Potato on the shared screen.
 *
 * The room code, the countdown and the connection badge are the platform's
 * chrome, rendered around this. What this owns is the category, whose turn it
 * is, and the argument when there is one.
 *
 * Unlike the other two games there is nothing secret to protect here — every
 * answer is said out loud to the room. The one exception is a live challenge,
 * where the running tally stays off the wall so the last judge to vote cannot
 * simply follow the others.
 */
export function HostView(props: GameHostProps<HotPotatoView>) {
  const { view } = props;
  const over = view.phase === "final";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="text-center">
        <Eyebrow tracking="wider">
          {over ? "Final scores" : `Round ${view.round} of ${view.totalRounds}`}
        </Eyebrow>
        {over ? null : (
          <h1 className="mt-3 text-4xl font-black text-balance sm:text-5xl">
            {view.category}
          </h1>
        )}
      </div>

      {/*
        Same cap as Crowd Favourite's board, for the same reason: the
        standings and the list of what has been said are rows, and a row
        drawn the full width of a television separates a name from its
        score by the whole screen.
      */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        <Board {...props} />
      </div>
    </div>
  );
}

/** One job per phase, split out so each case reads on its own. */
function Board({ view, send, onEndGame }: GameHostProps<HotPotatoView>) {
  switch (view.phase) {
    case "answering":
      return (
        <>
          <div className="flex flex-1 flex-col justify-center gap-8">
            <TurnCircle
              alive={view.alive}
              activePlayerId={view.activePlayerId}
              lastOut={view.lastOut}
            />
            <p className="text-center text-5xl font-black text-balance">
              {view.activeName === null ? "Waiting" : `${view.activeName}'s turn`}
            </p>
            <SaidList said={view.said} compact />
          </div>
          <Controls
            onSkip={() => send({ t: "skip" })}
            skipLabel="Time's up"
            onEndGame={onEndGame}
          />
        </>
      );

    case "reviewing":
      return (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            {/*
              The whole room is deciding whether to challenge one specific
              person, so that person gets a face rather than a name in 12px.
            */}
            <div className="flex items-center gap-3">
              <PlayerBlob seed={view.pending.playerId} size="lg" />
              <Eyebrow tracking="wider">{view.pending.name} said</Eyebrow>
            </div>
            <p className="text-6xl font-black text-balance">{view.pending.text}</p>
            <Eyebrow tracking="wider" tone="punch">
              Challenge it now, or it counts
            </Eyebrow>
          </div>
          <Controls
            onSkip={() => send({ t: "skip" })}
            skipLabel="Let it stand"
            onEndGame={onEndGame}
          />
        </>
      );

    case "voting":
      return (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <Eyebrow tracking="wider" tone="punch">
              {view.challenger.name} challenged {view.pending.name}
            </Eyebrow>
            <p className="text-6xl font-black text-balance">{view.pending.text}</p>
            <p className="text-2xl font-bold text-muted text-balance">
              Does it count? Everyone else decides.
            </p>
            {/* How many have voted, never which way, while the vote is open. */}
            <Eyebrow tracking="wider">{view.voted.length} voted</Eyebrow>
          </div>
          <Controls
            onSkip={() => send({ t: "skip" })}
            skipLabel="Close the vote"
            onEndGame={onEndGame}
          />
        </>
      );

    case "round_over":
      return (
        <>
          <div className="flex flex-1 flex-col justify-center gap-6">
            <p className="text-center text-5xl font-black text-balance">
              {view.winner === null
                ? "Nobody survived that one"
                : `${view.winner.name} is last standing`}
            </p>
            <SaidList said={view.said} compact />
            <Standings standings={view.standings} />
          </div>
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
            <Standings standings={view.standings} size="lg" />
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
