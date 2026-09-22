import { Countdown, eyebrowClass, stagger } from "../../../src/components/ui";
import type { VotingView } from "../shared";

/**
 * The vote, on a phone.
 *
 * Your own answer is shown but cannot be picked. Hiding it would be worse:
 * a player who could not see their own entry would not know whether it made
 * it in, and the list would silently differ between phones. The server rejects
 * a vote for it regardless — `aria-disabled` is a courtesy, not the rule.
 *
 * The options are dealt out on arrival. Everyone reaches this screen at the
 * same instant, and a ballot that lands as one solid block invites a thumb
 * before the eye has read any of it.
 */
export function Ballot({
  view,
  deadline,
  onVote,
}: {
  view: VotingView;
  deadline: number | null;
  onVote: (candidateId: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className={eyebrowClass({ tracking: "widest" })}>
          {view.yourVote === null ? "Pick your favourite" : "Change your mind?"}
        </p>
        <Countdown deadline={deadline} size="sm" />
      </div>

      <ul className="flex flex-1 flex-col gap-3">
        {view.candidates.map((candidate, index) => {
          const mine = candidate.id === view.yourCandidateId;
          const chosen = candidate.id === view.yourVote;

          return (
            <li key={candidate.id} style={stagger(index)} className="animate-rise">
              <button
                type="button"
                disabled={mine}
                onClick={() => onVote(candidate.id)}
                aria-pressed={chosen}
                className={`w-full rounded-2xl border-2 px-4 py-4 text-left text-lg font-bold transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.98] disabled:active:scale-100 ${
                  mine
                    ? "cursor-not-allowed border-ink-line bg-ink text-muted"
                    : chosen
                      ? "border-zap bg-zap text-ink"
                      : "border-ink-line bg-ink-soft text-cream"
                }`}
              >
                {candidate.text}
                {mine ? (
                  <span className={eyebrowClass({ size: "xxs" }, "mt-1 block")}>
                    Yours
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
