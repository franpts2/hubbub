/**
 * Word Wall's own contract: its limits, its view, its commands.
 *
 * This is the game's equivalent of `shared/protocol.ts` — imported by its
 * server definition and its React components, so the two cannot drift. None of
 * it is visible to the platform, which forwards the view and the commands
 * without looking inside.
 */

import { normalizeText } from "../../shared/validation";

export const MAX_ANSWER_LENGTH = 80;

/** How long a round lasts before the server force-ends it. */
export const ROUND_SECONDS = 60;

export interface Answer {
  playerId: string;
  name: string;
  text: string;
  at: number;
}

export type WordWallPhase = "prompt" | "results";

export interface WordWallView {
  phase: WordWallPhase;
  prompt: string;
  /** Ids of players whose answer is in, so both screens can show progress. */
  submitted: string[];
  /**
   * Withheld from players during the `prompt` phase so a phone can't be used
   * to read everyone else's answer before writing its own.
   */
  answers: Answer[];
}

export type WordWallCommand =
  /** player: send a word to the wall (re-sending overwrites) */
  | { t: "submit"; text: string }
  /** host: end the round early */
  | { t: "skip" }
  /** host: from results, start another round */
  | { t: "next" };

export function normalizeAnswer(input: unknown): string | null {
  return normalizeText(input, MAX_ANSWER_LENGTH);
}

export function parseWordWallCommand(raw: unknown): WordWallCommand | null {
  if (typeof raw !== "object" || raw === null) return null;
  const command = raw as { t?: unknown; text?: unknown };
  switch (command.t) {
    case "skip":
      return { t: "skip" };
    case "next":
      return { t: "next" };
    case "submit":
      return typeof command.text === "string"
        ? { t: "submit", text: command.text }
        : null;
    default:
      return null;
  }
}

/** Shared by both screens so "answered" means one thing. */
export function hasSubmitted(view: WordWallView, playerId: string | null): boolean {
  return playerId !== null && view.submitted.includes(playerId);
}
