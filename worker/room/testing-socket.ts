/**
 * Test-only: driving a room the way a phone does, over a real WebSocket.
 *
 * The node suite tests the room's *decisions* by calling them with plain
 * objects. This one exists for everything underneath that — the upgrade, the
 * attachment, the fan-out, hibernation — which can only be observed by holding
 * a socket open and watching what arrives on it.
 *
 * Every read is bounded by a timeout. A test that hangs waiting for a message
 * that will never come tells you nothing; one that fails in a second and names
 * what it wanted tells you where to look.
 */

import { SELF } from "cloudflare:test";

import type { GameId } from "../../engine/ids";
import type { ServerMessage } from "../../shared/protocol";

/** Any absolute origin will do; the Worker only ever reads the path and query. */
const ORIGIN = "https://hubbub.test";

const DEFAULT_TIMEOUT_MS = 2_000;

/**
 * How long to let a fan-out finish before reading it.
 *
 * Everything here is in-process under miniflare, so a broadcast lands almost
 * immediately; this only has to be longer than "almost".
 */
const SETTLE_MS = 100;

export interface CreatedRoom {
  code: string;
  hostToken: string;
}

/** Creates a room through the public API, as the home screen does. */
export async function createRoom(gameId?: GameId): Promise<CreatedRoom> {
  const response = await SELF.fetch(`${ORIGIN}/api/rooms`, {
    method: "POST",
    body: JSON.stringify(gameId === undefined ? {} : { gameId }),
  });
  if (!response.ok) {
    throw new Error(`could not create a room: HTTP ${response.status}`);
  }
  return (await response.json()) as CreatedRoom;
}

export interface Closed {
  code: number;
  reason: string;
}

export interface RoomClient {
  readonly socket: WebSocket;
  /** The next message, parsed. Rejects if none arrives in time. */
  next(timeoutMs?: number): Promise<ServerMessage>;
  /** The next message, asserted to be of type `t`. */
  expect<T extends ServerMessage["t"]>(
    t: T,
    timeoutMs?: number,
  ): Promise<Extract<ServerMessage, { t: T }>>;
  /**
   * Completes a join: reads the welcome, then discards the snapshot behind it.
   *
   * A successful upgrade sends `welcome` and *then* broadcasts to the whole
   * room — including the socket that just arrived — so arriving is always two
   * frames carrying the same state. Tests that care about that say so
   * explicitly; everything else starts from here.
   */
  welcomed(timeoutMs?: number): Promise<Extract<ServerMessage, { t: "welcome" }>>;
  /** The next frame, unparsed — for the heartbeat, which is not JSON. */
  raw(timeoutMs?: number): Promise<string>;
  /**
   * Everything that arrives in the next `ms`, drained.
   *
   * A single action can fan out more than one snapshot, and how many is not
   * something a test should have to predict. Waiting for the dust to settle
   * and asserting on the result is both more readable and less brittle than
   * counting frames.
   */
  settled(ms?: number): Promise<ServerMessage[]>;
  /** The last snapshot to arrive in the next `ms`. Throws if none does. */
  state(ms?: number): Promise<Extract<ServerMessage, { t: "state" }>>;
  /** Asserts nothing arrives within `ms`. For proving a broadcast did *not* happen. */
  silent(ms?: number): Promise<void>;
  /** Resolves when the server closes this socket. */
  readonly closed: Promise<Closed>;
  send(message: unknown): void;
  sendRaw(frame: string): void;
  close(): void;
}

/**
 * Opens a socket to a room.
 *
 * Returns a client even when the server refuses the connection: a refusal is
 * delivered *through* the socket (see `refuseUpgrade`), so the test needs the
 * same handle to read the error and the close code off it.
 */
export async function connect(
  code: string,
  params: Record<string, string>,
): Promise<RoomClient> {
  const url = new URL(`${ORIGIN}/api/rooms/${code}/ws`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await SELF.fetch(url, { headers: { Upgrade: "websocket" } });
  const socket = response.webSocket;
  if (socket === null) {
    throw new Error(`expected a WebSocket upgrade, got HTTP ${response.status}`);
  }
  socket.accept();
  return track(socket);
}

/** Connects as a player, with a client-minted id like the real app uses. */
export function connectPlayer(
  code: string,
  name: string,
  playerId: string = crypto.randomUUID(),
): Promise<RoomClient> {
  return connect(code, { role: "player", name, playerId });
}

export function connectHost(code: string, hostToken: string): Promise<RoomClient> {
  return connect(code, { role: "host", hostToken });
}

function track(socket: WebSocket): RoomClient {
  const inbox: string[] = [];
  const waiting: ((frame: string) => void)[] = [];

  socket.addEventListener("message", (event) => {
    const frame = String(event.data);
    const resolve = waiting.shift();
    if (resolve === undefined) inbox.push(frame);
    else resolve(frame);
  });

  let settleClose: (closed: Closed) => void = () => {};
  const closed = new Promise<Closed>((resolve) => {
    settleClose = resolve;
  });
  socket.addEventListener("close", (event) => {
    settleClose({ code: event.code, reason: event.reason });
  });

  function raw(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    const buffered = inbox.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const waiter = (frame: string) => {
        // A frame that arrives after we gave up belongs to whoever reads next,
        // so put it back rather than dropping it.
        if (settled) inbox.unshift(frame);
        else {
          settled = true;
          resolve(frame);
        }
      };
      waiting.push(waiter);

      setTimeout(() => {
        if (settled) return;
        settled = true;
        const index = waiting.indexOf(waiter);
        if (index !== -1) waiting.splice(index, 1);
        reject(new Error(`timed out after ${timeoutMs}ms waiting for a message`));
      }, timeoutMs);
    });
  }

  async function next(timeoutMs?: number): Promise<ServerMessage> {
    return JSON.parse(await raw(timeoutMs)) as ServerMessage;
  }

  async function expectNext<T extends ServerMessage["t"]>(
    t: T,
    timeoutMs?: number,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const message = await next(timeoutMs);
    if (message.t !== t) {
      throw new Error(`expected a "${t}" message, got "${message.t}"`);
    }
    return message as Extract<ServerMessage, { t: T }>;
  }

  async function settled(ms = SETTLE_MS): Promise<ServerMessage[]> {
    await scheduler.wait(ms);
    return inbox.splice(0).map((frame) => JSON.parse(frame) as ServerMessage);
  }

  return {
    socket,
    next,
    raw,
    closed,
    settled,
    expect: expectNext,

    async welcomed(timeoutMs) {
      const welcome = await expectNext("welcome", timeoutMs);
      await expectNext("state", timeoutMs);
      return welcome;
    },

    async state(ms) {
      const snapshots = (await settled(ms)).filter((message) => message.t === "state");
      const last = snapshots.at(-1);
      if (last === undefined) throw new Error("expected a snapshot, none arrived");
      return last;
    },

    async silent(ms = SETTLE_MS) {
      await scheduler.wait(ms);
      if (inbox.length > 0) {
        throw new Error(`expected silence, got ${inbox.length} message(s)`);
      }
    },

    send(message) {
      socket.send(JSON.stringify(message));
    },

    sendRaw(frame) {
      socket.send(frame);
    },

    close() {
      socket.close(1000, "test over");
    },
  };
}
