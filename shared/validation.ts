/**
 * Enforcement of the platform contract in `protocol.ts`.
 *
 * Both sides import this so the UI can pre-validate exactly what the server
 * will enforce anyway. Never trust the client copy: the server re-normalises
 * everything it receives.
 *
 * Game-specific validation is not here — it belongs to the game, next to the
 * commands it validates. `normalizeText` is exported for games to build on so
 * that every string entering a room is sanitised the same way.
 */

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  MAX_NAME_LENGTH,
  type ClientMessage,
} from "./protocol";

/** Strips control characters and collapses runs of whitespace. */
function clean(input: string): string {
  return input
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cleans free text and rejects it if nothing survives. */
export function normalizeText(input: unknown, maxLength: number): string | null {
  if (typeof input !== "string") return null;
  const text = clean(input).slice(0, maxLength);
  return text.length > 0 ? text : null;
}

export function normalizeName(input: unknown): string | null {
  return normalizeText(input, MAX_NAME_LENGTH);
}

export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const char of code) {
    if (!CODE_ALPHABET.includes(char)) return null;
  }
  return code;
}

/**
 * Parses the platform envelope only.
 *
 * A `game` message's payload is left as `unknown` and handed to the active
 * game's own parser, which is the whole point: the platform cannot validate
 * commands it does not define.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const message = parsed as { t?: unknown; c?: unknown };
  switch (message.t) {
    case "start_game":
      return { t: "start_game" };
    case "end_game":
      return { t: "end_game" };
    case "game":
      return "c" in message ? { t: "game", c: message.c } : null;
    default:
      return null;
  }
}
