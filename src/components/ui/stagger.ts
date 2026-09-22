import type { CSSProperties } from "react";

/** Gap between neighbours. Long enough to read as a cascade, short enough
 *  that the list is not still assembling itself when someone looks up. */
const STEP_MS = 40;

/**
 * After this many items the delay stops growing. A ten-player scoreboard
 * would otherwise take four hundred milliseconds to finish arriving, and the
 * tail of it lands after the eye has already moved on.
 */
const MAX_STEPS = 6;

/**
 * Deals an entrance animation out across a list.
 *
 * Only for lists that appear all at once — a ballot, a scoreboard, a round's
 * results. Lists that fill up one item at a time must not use this: a
 * stagger there would delay a card that has only just arrived, which is
 * precisely the moment it should be instant. That is why the answer wall and
 * the player roster pop each item on arrival instead.
 */
export function stagger(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, MAX_STEPS) * STEP_MS}ms` };
}
