/** Checks on the two secrets a client can present: its player id and the host token. */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Client-supplied ids are stored, so bound their shape rather than accepting
 * arbitrary strings into the room's persisted state.
 */
export function normalizePlayerId(input: string | null): string | null {
  if (input === null) return null;
  return UUID_PATTERN.test(input) ? input.toLowerCase() : null;
}

/** Constant-time comparison, to avoid leaking the host token byte by byte. */
export function equalsSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
