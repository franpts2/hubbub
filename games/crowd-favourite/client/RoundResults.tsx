import { Eyebrow, eyebrowClass } from "../../../src/components/ui";
import type { ScoresView } from "../shared";

/** The reveal: who wrote what, and what it earned. */
export function RoundResults({ view }: { view: ScoresView }) {
  if (view.results.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center text-center text-xl font-bold text-muted">
        Nobody wrote anything that round.
      </p>
    );
  }

  return (
    <ul className="flex flex-1 flex-col justify-center gap-3">
      {view.results.map((result) => {
        const won = result.id === view.winnerId;

        return (
          <li
            key={result.id}
            className={`flex items-center justify-between gap-5 rounded-2xl border-2 px-5 py-4 ${
              won ? "border-zap bg-zap/15" : "border-ink-line bg-ink-soft"
            }`}
          >
            <div className="min-w-0">
              <p className="text-2xl font-black text-balance">{result.text}</p>
              <p className={eyebrowClass({ size: "xs" }, "mt-1")}>{result.name}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-3xl font-black tabular-nums">
                {result.points > 0 ? `+${result.points}` : "—"}
              </p>
              <Eyebrow size="xxs">
                {result.votes === 1 ? "1 vote" : `${result.votes} votes`}
              </Eyebrow>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
