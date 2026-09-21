/**
 * Small wrappers around web storage, used to survive the single most common
 * event in a party game: someone refreshes, their phone reloads the tab from
 * memory pressure, or their socket blips. Keeping identity here means they
 * slide back into their existing seat instead of showing up as a duplicate.
 */

const hostKey = (code: string) => `hubbub:host:${code}`;
const playerIdKey = (code: string) => `hubbub:pid:${code}`;
const nameKey = (code: string) => `hubbub:name:${code}`;
const LAST_NAME_KEY = "hubbub:lastName";

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    // Private browsing modes can throw on access.
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked; the app still works, just without resume.
  }
}

/**
 * `crypto.randomUUID` is only available in secure contexts, and testing on a
 * phone usually means plain http on a LAN address. `getRandomValues` has no
 * such restriction, so build the UUID by hand.
 */
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A stable id for this device in this room, minted *before* the first
 * connection.
 *
 * Letting the server assign ids instead looks tidier but has a bootstrap
 * race: on a first connection the client has no id to present, so the server
 * cannot tell "the same person reconnecting" from "a different person who
 * picked the same name". Anyone who refreshed before their first message
 * round-tripped would be locked out by their own name. Minting client-side
 * removes the race entirely.
 */
export function playerIdFor(code: string): string {
  const existing = read<string>(localStorage, playerIdKey(code));
  if (typeof existing === "string" && existing.length > 0) return existing;
  const fresh = randomId();
  write(localStorage, playerIdKey(code), fresh);
  return fresh;
}

export function saveHostToken(code: string, token: string): void {
  // sessionStorage, not localStorage: hosting should not leak into a new tab.
  write(sessionStorage, hostKey(code), token);
}

export function loadHostToken(code: string): string | null {
  return read<string>(sessionStorage, hostKey(code));
}

export function saveName(code: string, name: string): void {
  write(localStorage, nameKey(code), name);
  write(localStorage, LAST_NAME_KEY, name);
}

export function loadName(code: string): string | null {
  return read<string>(localStorage, nameKey(code));
}

/** Remembers the last name used anywhere, so repeat players do not retype it. */
export function loadLastName(): string {
  return read<string>(localStorage, LAST_NAME_KEY) ?? "";
}
