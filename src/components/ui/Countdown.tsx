import { useCountdown } from "../../hooks/useCountdown";

/**
 * The round timer, shown on the big screen and on every phone.
 *
 * Takes the deadline rather than a second count, so the ticking and the
 * "no round is running" case live here once instead of being rebuilt by
 * every screen that shows a clock. Six call sites used to open with the same
 * two lines; now they pass the timestamp they were already given.
 *
 * Where it goes is deliberately still the caller's decision, and that is not
 * an oversight. The host screen has a persistent header to hang it in. A
 * phone has no such bar — each phase fills the screen — so every game places
 * it next to whatever it is actually asking for: beside the prompt, beside
 * the ballot label, or centred on its own while you watch someone else's
 * turn. Hoisting it into the phone shell would buy consistency the layouts
 * do not want.
 */

/** Below this, the timer turns hot pink to create some panic. */
const URGENT_SECONDS = 10;

export type CountdownSize = "sm" | "lg";

const SIZE: Record<CountdownSize, string> = {
  sm: "rounded-xl px-3 py-1 text-2xl",
  lg: "min-w-20 rounded-2xl px-4 py-2 text-center text-4xl",
};

export function Countdown({
  deadline,
  size = "lg",
  className = "",
}: {
  deadline: number | null;
  size?: CountdownSize;
  /** For placement only — `self-center` and the like. */
  className?: string;
}) {
  const seconds = useCountdown(deadline);
  if (seconds === null) return null;

  const urgent = seconds <= URGENT_SECONDS;
  return (
    <div
      className={`font-black tabular-nums ${SIZE[size]} ${
        urgent ? "bg-punch text-cream" : "bg-ink-soft text-cream"
      } ${className}`}
      aria-label={`${seconds} seconds remaining`}
    >
      {seconds}
    </div>
  );
}
