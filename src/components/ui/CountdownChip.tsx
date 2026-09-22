/**
 * The round timer, shown on the big screen and on every phone.
 *
 * Both used to be written out separately, which is how they ended up with
 * different urgency colours and only one of them announcing itself to a
 * screen reader. One component means the threshold and the label are defined
 * once and cannot drift again.
 */

/** Below this, the timer turns hot pink to create some panic. */
const URGENT_SECONDS = 10;

export type CountdownSize = "sm" | "lg";

const SIZE: Record<CountdownSize, string> = {
  sm: "rounded-xl px-3 py-1 text-2xl",
  lg: "min-w-20 rounded-2xl px-4 py-2 text-center text-4xl",
};

export function CountdownChip({
  seconds,
  size = "lg",
}: {
  seconds: number;
  size?: CountdownSize;
}) {
  const urgent = seconds <= URGENT_SECONDS;
  return (
    <div
      className={`font-black tabular-nums ${SIZE[size]} ${
        urgent ? "bg-punch text-cream" : "bg-ink-soft text-cream"
      }`}
      aria-label={`${seconds} seconds remaining`}
    >
      {seconds}
    </div>
  );
}
