import { CODE_ALPHABET, CODE_LENGTH } from "../shared/protocol";

/**
 * Generates a room code using the CSPRNG.
 *
 * `Math.random()` would be a bad idea here: room codes are the only thing
 * stopping a stranger from walking into your game, so they should not be
 * predictable from previously issued codes.
 */
export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const byte of bytes) {
    // 256 % 32 === 0, so the modulo is unbiased for this alphabet size.
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

export function generateToken(): string {
  return crypto.randomUUID();
}
