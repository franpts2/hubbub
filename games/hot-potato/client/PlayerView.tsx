import type { ReactNode } from "react";

import type { GamePlayerProps } from "../../../engine/client";
import { Button, Countdown, Eyebrow } from "../../../src/components/ui";
import { isYourTurn, type HotPotatoView, type VotingView } from "../shared";
import { AnswerForm } from "./AnswerForm";
import { SaidList } from "./SaidList";
import { Standings } from "./Standings";

/**
 * Hot Potato on a phone. One job per phase — nobody reads UI at a party.
 *
 * The phone is busier here than in the other two games, because this is the
 * only one where a player has something to do while it is *not* their turn:
 * watching for an answer worth challenging. That button is the whole reason
 * the challenge mechanic is playable, so it gets the screen to itself.
 */
export function PlayerView({
  view,
  you,
  deadline,
  send,
}: GamePlayerProps<HotPotatoView>) {
  const out = !view.alive.some((entry) => entry.playerId === you.id);

  switch (view.phase) {
    case "answering":
      if (isYourTurn(view, you.id)) {
        return (
          <AnswerForm
            category={view.category}
            deadline={deadline}
            onAnswer={(text) => send({ t: "answer", text })}
          />
        );
      }
      return (
        <Watching deadline={deadline}>
          <p className="text-center text-2xl font-black text-balance">
            {view.activeName === null ? "Waiting" : `${view.activeName} is up`}
          </p>
          {out ? (
            <Eyebrow className="text-center" tracking="wider" tone="punch">
              You're out this round
            </Eyebrow>
          ) : null}
          <SaidList said={view.said} compact />
        </Watching>
      );

    case "reviewing":
      return (
        <Watching deadline={deadline}>
          <div className="text-center">
            <Eyebrow tracking="wider">{view.pending.name} said</Eyebrow>
            <p className="mt-2 text-3xl font-black text-balance">{view.pending.text}</p>
          </div>
          {view.canChallenge ? (
            <>
              <Button
                variant="ghost"
                onClick={() => send({ t: "challenge" })}
                className="w-full py-6 text-2xl"
              >
                Challenge it
              </Button>
              {/* The stake, stated plainly. It is the only thing stopping this
                  button being pressed on every single turn. */}
              <Eyebrow className="text-center" tracking="wider">
                If the table disagrees, you're out
              </Eyebrow>
            </>
          ) : null}
        </Watching>
      );

    case "voting":
      return <Judge view={view} youId={you.id} deadline={deadline} send={send} />;

    case "round_over":
      return (
        <div className="flex flex-1 flex-col justify-center gap-6">
          <Eyebrow className="text-center" size="md" tracking="wider">
            {view.winner?.playerId === you.id ? "You survived" : "Look up at the screen"}
          </Eyebrow>
          <Standings standings={view.standings} />
        </div>
      );

    case "final":
      return (
        <div className="flex flex-1 flex-col justify-center gap-6">
          <Eyebrow className="text-center" size="md" tracking="wider">
            That's the lot
          </Eyebrow>
          <Standings standings={view.standings} size="lg" />
        </div>
      );
  }
}

/** The two-button verdict, or a note saying why you do not get one. */
function Judge({
  view,
  youId,
  deadline,
  send,
}: {
  view: VotingView;
  youId: string;
  deadline: number | null;
  send: (command: unknown) => void;
}) {
  const yours = view.pending.playerId === youId;
  const mine = view.challenger.playerId === youId;

  return (
    <Watching deadline={deadline}>
      <div className="text-center">
        <Eyebrow tracking="wider" tone="punch">
          {view.challenger.name} challenged {view.pending.name}
        </Eyebrow>
        <p className="mt-2 text-3xl font-black text-balance">{view.pending.text}</p>
      </div>

      {view.canVote ? (
        <div className="flex flex-col gap-3">
          <p className="text-center text-lg font-bold text-muted">Does it count?</p>
          <div className="flex gap-3">
            <Verdict
              chosen={view.yourVote === true}
              onClick={() => send({ t: "vote", ok: true })}
            >
              It counts
            </Verdict>
            <Verdict
              chosen={view.yourVote === false}
              onClick={() => send({ t: "vote", ok: false })}
            >
              No chance
            </Verdict>
          </div>
        </div>
      ) : (
        <Eyebrow className="text-center" tracking="wider">
          {yours
            ? "They're deciding on yours"
            : mine
              ? "You called it — the others decide"
              : "The players still in are deciding"}
        </Eyebrow>
      )}
    </Watching>
  );
}

function Verdict({
  chosen,
  onClick,
  children,
}: {
  chosen: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={chosen}
      className={`flex-1 rounded-2xl border-2 px-4 py-6 text-xl font-black transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.98] ${
        chosen ? "border-zap bg-zap text-ink" : "border-ink-line bg-ink-soft text-cream"
      }`}
    >
      {children}
    </button>
  );
}

function Watching({
  deadline,
  children,
}: {
  deadline: number | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-5">
      <Countdown deadline={deadline} size="sm" className="self-center" />
      {children}
    </div>
  );
}
