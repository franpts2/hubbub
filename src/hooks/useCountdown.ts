import { useEffect, useReducer } from "react";

function secondsUntil(deadline: number | null): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * Seconds left until `deadline`, or null when no round is running.
 *
 * The countdown is display-only. The server owns the real deadline and ends
 * the round itself, so a phone with a skewed clock or a throttled background
 * tab cannot change when the round actually stops.
 *
 * The number is derived during render rather than kept in state. Holding it
 * meant an effect had to write the new value every time the deadline changed,
 * which both cost a second render and left one frame showing the old round's
 * clock. Here the interval only schedules the next render; the value is
 * always computed from the deadline currently being rendered.
 */
export function useCountdown(deadline: number | null): number | null {
  const [, tick] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline]);

  return secondsUntil(deadline);
}
