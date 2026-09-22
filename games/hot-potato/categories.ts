/**
 * Categories for "Hot Potato".
 *
 * Tuned differently again from the other two games. These have to be *deep*:
 * a category with six obvious members is over before the circle comes round
 * twice, and one with thousands is never under pressure. Each of these has
 * enough easy answers to get started and runs thin after a dozen or so, which
 * is where the timer starts to bite.
 *
 * They also have to be arguable at the edges. The challenge mechanic only
 * earns its place if reasonable people can disagree about whether something
 * counts, so vague boundaries are a feature here rather than a flaw.
 */
export const CATEGORIES: readonly string[] = [
  "Things you find in a fridge",
  "Countries in Europe",
  "Things that are cold",
  "Reasons to be late",
  "Things in a hospital",
  "Board games",
  "Things you can fold",
  "Jobs that involve a uniform",
  "Things found at a wedding",
  "Breakfast foods",
  "Things with wheels",
  "Words that mean happy",
  "Things in a toolbox",
  "Animals that swim",
  "Things you queue for",
  "Famous bridges, real or fictional",
  "Things that come in pairs",
  "Rooms in a house",
  "Things you plug in",
  "Sports played with a ball",
  "Things that melt",
  "Places you would not take a toddler",
];

/**
 * A category that has not been used yet this game.
 *
 * Takes the used list rather than just the previous category, because a game
 * runs several rounds and repeating one inside a single sitting is far more
 * noticeable than repeating it in the next game.
 *
 * `pool` is a parameter only so the degenerate cases can be tested without
 * rewriting the real list. Production always uses the default.
 */
export function pickCategory(
  used: readonly string[],
  pool: readonly string[] = CATEGORIES,
): string {
  if (pool.length === 0) return "Things";
  const fresh = pool.filter((category) => !used.includes(category));
  // Once the list is exhausted, repeating beats returning nothing.
  const options = fresh.length > 0 ? fresh : pool;
  return options[Math.floor(Math.random() * options.length)];
}
