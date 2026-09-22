/**
 * The vocabulary for "a live connection to one room".
 *
 * These types live here rather than next to `useRoomSocket` so presentational
 * components (`ConnectionBadge`, the loading and notice screens) can describe
 * a connection without importing a hook. The UI depends on the shape of the
 * connection, not on the machinery that maintains it.
 */

import type {
  ClientMessage,
  ErrorCode,
  Identity,
  Role,
  RoomState,
} from "../../shared/protocol";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface ConnectionError {
  code: ErrorCode;
  message: string;
}

/** Everything needed to open a socket. `null` anywhere means "stay closed". */
export interface ConnectOptions {
  code: string;
  role: Role;
  name?: string;
  playerId?: string | null;
  hostToken?: string | null;
}

export interface RoomConnection {
  status: ConnectionStatus;
  state: RoomState | null;
  you: Identity | null;
  error: ConnectionError | null;
  send: (message: ClientMessage) => void;
}

/**
 * The error a screen should give up and display, or null while there is still
 * hope of reconnecting.
 *
 * `useRoomSocket` retries anything retryable, so a closed socket that also
 * carries an error is the one situation where waiting is pointless. Both the
 * host screen and the phone need exactly this test, so it lives here.
 */
export function fatalError(connection: RoomConnection): ConnectionError | null {
  return connection.status === "closed" ? connection.error : null;
}
