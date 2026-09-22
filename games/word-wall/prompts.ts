/**
 * Prompts for the "Word Wall" minigame. Deliberately open-ended: the fun is
 * just seeing everyone's phrases land on the big screen at once.
 */
export const PROMPTS: readonly string[] = [
  "Describe this group in one word.",
  "Name a terrible superpower.",
  "What is the worst possible pizza topping?",
  "Invent a holiday nobody would celebrate.",
  "A band name for the person to your left.",
  "The most boring crime imaginable.",
  "What smells like regret?",
  "Rename the Moon.",
  "Worst thing to hear from your pilot.",
  "A rejected flavour of ice cream.",
  "Something you should never say at a funeral.",
  "The least threatening villain name.",
  "A new word for 'awkward'.",
  "What is definitely in the back of the fridge?",
  "Worst name for a boat.",
];

/**
 * A prompt that is not the one just used.
 *
 * `pool` is a parameter only so the degenerate cases — a list with a single
 * entry, or none at all — can be exercised without rewriting the real list.
 * Production always uses the default.
 */
export function pickPrompt(
  previous: string | null,
  pool: readonly string[] = PROMPTS,
): string {
  if (pool.length === 0) return "Say something.";
  const fresh = pool.filter((prompt) => prompt !== previous);
  // With a one-prompt list there is nothing else to pick, so repeat rather
  // than return nothing.
  const options = fresh.length > 0 ? fresh : pool;
  return options[Math.floor(Math.random() * options.length)];
}
