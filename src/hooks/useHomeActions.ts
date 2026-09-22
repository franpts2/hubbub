import { useCallback, useState } from "react";

import type { GameId } from "../../engine/ids";
import { CODE_LENGTH } from "../../shared/protocol";
import { normalizeCode } from "../../shared/validation";
import { createRoom, roomExists } from "../lib/api";
import type { Navigate } from "../lib/routes";
import { saveHostToken } from "../lib/session";

type HomeAction = "host" | "join";

export interface HomeActions {
  /** Which action is in flight, if any. Only one may run at a time. */
  pending: HomeAction | null;
  error: string | null;
  hostRoom: (gameId: GameId) => Promise<void>;
  joinRoom: (rawCode: string) => Promise<void>;
}

/**
 * The two things the home screen can do, kept out of the markup.
 *
 * Both actions are network calls with persistence and navigation attached, so
 * pulling them into a hook leaves the home screen as pure layout and makes the
 * "one at a time, show the failure" policy explicit in one place.
 */
export function useHomeActions(navigate: Navigate): HomeActions {
  const [pending, setPending] = useState<HomeAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hostRoom = useCallback(
    async (gameId: GameId) => {
      setError(null);
      setPending("host");
      try {
        const room = await createRoom(gameId);
        saveHostToken(room.code, room.hostToken);
        // Deliberately stays pending: we are navigating away, and re-enabling
        // the button first would invite a second room being created.
        navigate({ name: "host", code: room.code });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
        setPending(null);
      }
    },
    [navigate],
  );

  const joinRoom = useCallback(
    async (rawCode: string) => {
      setError(null);

      const code = normalizeCode(rawCode);
      if (code === null) {
        setError(`Room codes are ${CODE_LENGTH} letters and numbers.`);
        return;
      }

      setPending("join");
      // Check before navigating so a typo gives a clear message here rather
      // than a dead-end on the next screen.
      if (await roomExists(code)) {
        navigate({ name: "join", code });
      } else {
        setError(`No room called ${code}. Check the screen and try again.`);
        setPending(null);
      }
    },
    [navigate],
  );

  return { pending, error, hostRoom, joinRoom };
}
