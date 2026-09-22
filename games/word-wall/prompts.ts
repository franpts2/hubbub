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

export function pickPrompt(previous: string | null): string {
  if (PROMPTS.length === 0) return "Say something.";
  // Avoid repeating the prompt that was just used.
  const pool = PROMPTS.filter((prompt) => prompt !== previous);
  const options = pool.length > 0 ? pool : PROMPTS;
  return options[Math.floor(Math.random() * options.length)];
}
