import type { GameId } from "../../engine/ids";

export interface CreatedRoom {
  code: string;
  hostToken: string;
}

/**
 * A room is bound to one game for its whole life, so the choice is made here
 * and never again. The server validates the id and falls back to the default
 * if it is missing or unknown.
 */
export async function createRoom(gameId: GameId): Promise<CreatedRoom> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId }),
  });
  if (!response.ok) {
    throw new Error("Could not create a room. Try again in a moment.");
  }
  return (await response.json()) as CreatedRoom;
}

/** Pre-flight check so the join form can show a clear error before connecting. */
export async function roomExists(code: string): Promise<boolean> {
  const response = await fetch(`/api/rooms/${code}`);
  if (response.ok) {
    const body = (await response.json()) as { exists: boolean };
    return body.exists;
  }
  return false;
}
