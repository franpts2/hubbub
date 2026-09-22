/**
 * Enforcement of the wire contract in `protocol.ts`.
 *
 * Both sides import this so the UI can pre-validate exactly what the server
 * will enforce anyway. Never trust the client copy: the server re-normalises
 * everything it receives.
 */

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  MAX_ANSWER_LENGTH,
  MAX_NAME_LENGTH,
  type ClientMessage,
} from "./protocol";

/** Strips control characters and collapses runs of whitespace. */
function clean(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cleans free text and rejects it if nothing survives. */
function normalizeText(input: unknown, maxLength: number): string | null {
  if (typeof input !== "string") return null;
  const text = clean(input).slice(0, maxLength);
  return text.length > 0 ? text : null;
}

export function normalizeName(input: unknown): string | null {
  return normalizeText(input, MAX_NAME_LENGTH);
}

export function normalizeAnswer(input: unknown): string | null {
  return normalizeText(input, MAX_ANSWER_LENGTH);
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

export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const message = parsed as { t?: unknown; text?: unknown };
  switch (message.t) {
    case "start":
      return { t: "start" };
    case "skip":
      return { t: "skip" };
    case "reset":
      return { t: "reset" };
    case "submit":
      return typeof message.text === "string"
        ? { t: "submit", text: message.text }
        : null;
    default:
      return null;
  }
}
