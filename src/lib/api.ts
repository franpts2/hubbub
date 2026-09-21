export interface CreatedRoom {
  code: string;
  hostToken: string;
}

export async function createRoom(): Promise<CreatedRoom> {
  const response = await fetch("/api/rooms", { method: "POST" });
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
