/**
 * Talking to sockets: tagging them, remembering who is on the other end, and
 * writing to them without caring whether they are still there.
 *
 * Every send in this app is best-effort. A socket can die between a
 * `readyState` check and the write that follows it, and there is nothing
 * useful to do about it — the close handler cleans up either way — so the
 * failure is swallowed here rather than at a dozen call sites.
 */

import {
  CLOSE_REFUSED,
  type ErrorCode,
  type Role,
  type ServerMessage,
} from "../../shared/protocol";

/**
 * Per-connection data. Survives hibernation because we stash it on the socket
 * itself with `serializeAttachment` — instance fields do not survive.
 */
export interface Attachment {
  playerId: string;
  role: Role;
}

/** Tags let us ask the runtime for one player's sockets without deserialising. */
export const playerTag = (playerId: string) => `id:${playerId}`;
export const roleTag = (role: Role) => `role:${role}`;

export function attach(ws: WebSocket, attachment: Attachment): void {
  ws.serializeAttachment(attachment);
}

export function attachmentOf(ws: WebSocket): Attachment | null {
  return (ws.deserializeAttachment() as Attachment | null) ?? null;
}

export function sendRaw(ws: WebSocket, payload: string): void {
  try {
    ws.send(payload);
  } catch {
    // Socket died; the close handler will clean up.
  }
}

export function send(ws: WebSocket, message: ServerMessage): void {
  sendRaw(ws, JSON.stringify(message));
}

/**
 * Complains about a message on an otherwise healthy socket.
 *
 * Never fatal, and that is not a judgement about the individual code: the
 * connection is fine, so giving up on it cannot be the right response to a
 * command the server did not like. Every genuinely unrecoverable case reaches
 * the client another way — `refuseUpgrade` for a rejected handshake, and the
 * room's own teardown for a closed room — and both say so explicitly.
 */
export function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { t: "error", code, message, fatal: false });
}

export function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already gone; nothing to do.
  }
}

/**
 * Refuses a connection *through* the WebSocket rather than by failing the
 * handshake.
 *
 * Returning an HTTP 403 here would be more natural, but browsers report a
 * failed upgrade as an opaque error with no status and no body, so the player
 * would just see "connection failed" instead of "that name is taken". By
 * completing the upgrade we get one guaranteed message plus a close reason.
 */
export function refuseUpgrade(code: ErrorCode, message: string): Response {
  const { 0: client, 1: server } = new WebSocketPair();
  // Plain accept, not acceptWebSocket: this socket is closed immediately, so
  // there is nothing to hibernate.
  server.accept();
  send(server, { t: "error", code, message, fatal: true });
  server.close(CLOSE_REFUSED, code);
  return new Response(null, { status: 101, webSocket: client });
}
