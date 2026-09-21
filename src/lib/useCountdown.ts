import { useEffect, useState } from "react";

/**
 * Seconds left until `deadline`, or null when no round is running.
 *
 * The countdown is display-only. The server owns the real deadline and ends
 * the round itself, so a phone with a skewed clock or a throttled background
 * tab cannot change when the round actually stops.
 */
export function useCountdown(deadline: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => compute(deadline));

  useEffect(() => {
    if (deadline === null) {
      setRemaining(null);
      return;
    }
    setRemaining(compute(deadline));
    const timer = setInterval(() => setRemaining(compute(deadline)), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  return remaining;
}

function compute(deadline: number | null): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}
