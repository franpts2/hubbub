/**
 * Prompts for "Crowd Favourite".
 *
 * Tuned differently from Word Wall's: these have to be *competable*. A prompt
 * that invites a single obvious answer makes for a dull vote, so each one asks
 * for something invented rather than recalled.
 */
export const PROMPTS: readonly string[] = [
  "The worst possible motivational poster.",
  "A terrible name for a nightclub.",
  "The least useful superpower you could be given.",
  "An awful slogan for a dentist.",
  "The worst gift to give a new neighbour.",
  "A rejected name for a colour of paint.",
  "The most unconvincing excuse for being late.",
  "A terrible piece of advice that sounds wise.",
  "The worst thing to write in a wedding card.",
  "An unappealing name for a new cereal.",
  "The worst possible theme for a wedding.",
  "A bad name for a racehorse.",
  "The least reassuring thing a doctor could say.",
  "An awful title for a self-help book.",
  "The worst way to answer the phone at work.",
  "A terrible name for a pub quiz team.",
  "The worst possible ringtone.",
  "An unwelcome surprise in a sandwich.",
  "The worst catchphrase for a game show host.",
  "A bad name for a cruise ship.",
];

/**
 * A prompt that has not been used yet this game.
 *
 * Takes the used list rather than just the previous prompt, because a game
 * runs several rounds and seeing the same prompt twice in one sitting is far
 * more noticeable than seeing it in the next game.
 *
 * `pool` is a parameter only so the degenerate cases can be tested without
 * rewriting the real list. Production always uses the default.
 */
export function pickPrompt(
  used: readonly string[],
  pool: readonly string[] = PROMPTS,
): string {
  if (pool.length === 0) return "Say something.";
  const fresh = pool.filter((prompt) => !used.includes(prompt));
  // Once the list is exhausted, repeating beats returning nothing.
  const options = fresh.length > 0 ? fresh : pool;
  return options[Math.floor(Math.random() * options.length)];
}
