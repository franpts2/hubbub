/**
 * The only code that knows how a room is persisted.
 *
 * The whole room is a single value under one key. It is a couple of kilobytes
 * at most, and every mutation touches several fields at once, so splitting it
 * across keys would buy nothing and cost atomicity.
 */

import type { StoredRoom } from "./state";

const STATE_KEY = "room";

export async function loadRoom(
  storage: DurableObjectStorage,
): Promise<StoredRoom | null> {
  return (await storage.get<StoredRoom>(STATE_KEY)) ?? null;
}

export async function saveRoom(
  storage: DurableObjectStorage,
  room: StoredRoom,
): Promise<void> {
  await storage.put(STATE_KEY, room);
}

/** Releases the room's code for reuse. */
export async function clearRoom(storage: DurableObjectStorage): Promise<void> {
  await storage.deleteAll();
}
