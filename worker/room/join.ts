/**
 * Deciding who a connecting client is, before any socket is accepted.
 *
 * Kept separate from the Durable Object because this is the security boundary
 * of the whole app: it is the one place that decides whether you are the host,
 * whether you may use a name, and whether you get a seat. Everything it needs
 * arrives as arguments, and it returns a decision rather than performing one.
 */

import {
  MAX_PLAYERS,
  type ErrorCode,
  type Identity,
  type Role,
} from "../../shared/protocol";
import { normalizeName } from "../../shared/validation";
import { equalsSecret, normalizePlayerId } from "./credentials";
import {
  addPlayer,
  findPlayer,
  isNameTaken,
  pruneLobbyGhosts,
  type IsConnected,
  type StoredRoom,
} from "./state";

export type JoinOutcome =
  { ok: true; identity: Identity } | { ok: false; code: ErrorCode; message: string };

/**
 * Resolves the identity behind a WebSocket upgrade.
 *
 * Mutates `room` on success — a new player takes a seat, a returning one
 * reclaims theirs — so the caller must persist afterwards.
 */
export function resolveIdentity(
  room: StoredRoom,
  params: URLSearchParams,
  isConnected: IsConnected,
): JoinOutcome {
  const role: Role = params.get("role") === "host" ? "host" : "player";
  return role === "host"
    ? resolveHost(room, params)
    : resolvePlayer(room, params, isConnected);
}

function resolveHost(room: StoredRoom, params: URLSearchParams): JoinOutcome {
  const token = params.get("hostToken");
  // Without this check, anyone who can read the code off the TV could connect
  // as the host and drive the game.
  if (!token || !equalsSecret(token, room.hostToken)) {
    return {
      ok: false,
      code: "not_host",
      message: "You are not the host of this room.",
    };
  }
  return { ok: true, identity: { id: "host", role: "host", name: null } };
}

function resolvePlayer(
  room: StoredRoom,
  params: URLSearchParams,
  isConnected: IsConnected,
): JoinOutcome {
  // Clients mint their own id and keep it in localStorage, so a reconnect is
  // recognisable even if it happens before the first reply lands.
  const requestedId = normalizePlayerId(params.get("playerId"));
  const name = normalizeName(params.get("name"));
  if (name === null) {
    return {
      ok: false,
      code: "bad_name",
      message: "Pick a name with at least one character.",
    };
  }

  // Drop anyone who left the lobby without us hearing about it, so a ghost
  // cannot keep holding a name or a slot.
  pruneLobbyGhosts(room, isConnected);

  const existing = requestedId === null ? undefined : findPlayer(room, requestedId);

  if (isNameTaken(room, name, existing?.id)) {
    return {
      ok: false,
      code: "name_taken",
      message: `"${name}" is already taken in this room.`,
    };
  }

  if (existing !== undefined) {
    // A returning phone reclaims its seat, keeping its submission.
    existing.name = name;
    return { ok: true, identity: { id: existing.id, role: "player", name } };
  }

  if (room.players.length >= MAX_PLAYERS) {
    return {
      ok: false,
      code: "room_full",
      message: `This room is full (${MAX_PLAYERS} players).`,
    };
  }

  // Honour the client's id so its very next reconnect matches. It is no more
  // trusted than a server-generated one would be: either way the value only
  // ever reaches the one client that owns it.
  const player = addPlayer(room, requestedId ?? crypto.randomUUID(), name);
  return { ok: true, identity: { id: player.id, role: "player", name } };
}
