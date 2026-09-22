/**
 * Every URL the client builds, in one place.
 *
 * The join URL in particular is used three ways — printed on the big screen,
 * encoded into the QR code, and navigated to — so it must be derived once
 * rather than assembled at each call site.
 */

import type { ConnectOptions } from "./connection";
import { routeToPath } from "./routes";

/** The address a player opens to join a room. */
export function joinUrl(code: string): string {
  return `${location.origin}${routeToPath({ name: "join", code })}`;
}

/** Drops the scheme — one less thing to read off a TV from across the room. */
export function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** The room's WebSocket endpoint, with identity passed as query parameters. */
export function roomSocketUrl(options: ConnectOptions): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${location.host}/api/rooms/${options.code}/ws`);
  url.searchParams.set("role", options.role);
  if (options.name) url.searchParams.set("name", options.name);
  if (options.playerId) url.searchParams.set("playerId", options.playerId);
  if (options.hostToken) url.searchParams.set("hostToken", options.hostToken);
  return url.toString();
}
