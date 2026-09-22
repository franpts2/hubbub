import { Eyebrow, eyebrowClass } from "../../../src/components/ui";
import type { Out, Player } from "../shared";

const WENT_OUT: Record<Out["reason"], string> = {
  timeout: "ran out of time",
  challenged: "was challenged, and lost",
  bad_challenge: "challenged, and was wrong",
  left: "dropped out",
};

/**
 * Who is still in, in turn order, with the current player marked.
 *
 * The order is the point: this is the first game where the next person to act
 * is knowable in advance, and seeing yourself two places away is most of the
 * tension. Eliminated players leave a gap rather than being re-packed, so the
 * shape of the circle stays recognisable as it shrinks.
 */
export function TurnCircle({
  alive,
  activePlayerId,
  lastOut,
}: {
  alive: Player[];
  activePlayerId?: string | null;
  lastOut: Out | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {alive.map((entry) => {
          const active = entry.playerId === activePlayerId;
          return (
            <li
              key={entry.playerId}
              /*
                The handover is the whole tension of this game, so the
                highlight is the one transition in the app allowed to be
                slower than a press: 220ms is long enough to see the turn
                physically move to the next person round the circle.
              */
              className={`rounded-full border-2 px-4 py-2 text-lg font-black transition-[background-color,border-color,color] duration-[220ms] ease-out ${
                active
                  ? "border-zap bg-zap text-ink"
                  : "border-ink-line bg-ink-soft text-cream"
              }`}
            >
              {entry.name}
            </li>
          );
        })}
      </ul>

      {lastOut === null ? null : (
        <Eyebrow tracking="wider" tone="punch">
          {lastOut.name} {WENT_OUT[lastOut.reason]}
        </Eyebrow>
      )}

      {alive.length === 0 ? (
        <p className={eyebrowClass({ tracking: "wider" })}>Nobody left</p>
      ) : null}
    </div>
  );
}
