/**
 * Who is actually in the room, derived from live sockets rather than stored.
 *
 * `getWebSockets` also returns hibernated sockets, so this stays correct while
 * the room is asleep. If the object is ever restarted and loses its sockets,
 * everyone simply reads as disconnected until they reconnect — which is
 * exactly right, and is what a stored flag could never do.
 */

import type { IsConnected } from "./state";
import { closeQuietly, playerTag } from "./sockets";

/**
 * Ground truth for whether a player is here: do they hold an open socket?
 *
 * `exclude` skips one socket, which matters while handling its close event:
 * the runtime may still be reporting it as open.
 */
export function isConnected(
  ctx: DurableObjectState,
  playerId: string,
  exclude?: WebSocket,
): boolean {
  return ctx
    .getWebSockets(playerTag(playerId))
    .some((socket) => socket !== exclude && socket.readyState === WebSocket.OPEN);
}

/** Binds `isConnected` to this room so game logic can take it as a plain predicate. */
export function connectionChecker(ctx: DurableObjectState): IsConnected {
  return (playerId) => isConnected(ctx, playerId);
}

/**
 * Best-effort tidy-up of a superseded socket (refresh, second tab, or React
 * StrictMode double-mounting in dev).
 *
 * Intentionally not load-bearing: the runtime can take a while to actually
 * flush the close frame, and connectivity is derived from live sockets anyway.
 */
export function closeSuperseded(
  ctx: DurableObjectState,
  playerId: string,
  keep: WebSocket,
): void {
  for (const socket of ctx.getWebSockets(playerTag(playerId))) {
    if (socket !== keep) {
      closeQuietly(socket, 1000, "Replaced by a newer connection");
    }
  }
}
