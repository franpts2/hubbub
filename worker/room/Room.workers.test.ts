/**
 * The Durable Object, on the real runtime.
 *
 * Everything here is deliberately *not* what the node suite covers. That suite
 * proves the room's decisions are right by calling them with plain objects;
 * this one proves the machinery under those decisions actually works —
 * upgrades, attachments, fan-out, the heartbeat auto-responder, the single
 * alarm slot, and surviving hibernation.
 *
 * The rule of thumb for what belongs here: if a hand-written fake of
 * `DurableObjectState` could have answered the question, the test belongs in
 * the node suite instead, where it runs in a millisecond.
 */

import {
  env,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  CLOSE_REFUSED,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  ROOM_IDLE_MS,
} from "../../shared/protocol";
import type { StoredRoom } from "./state";
import { connect, connectHost, connectPlayer, createRoom } from "./testing-socket";

const ORIGIN = "https://hubbub.test";

/**
 * Rewrites the persisted room, then throws the instance away so it has to read
 * the change back.
 *
 * Going through storage rather than the instance's private field is what makes
 * this a test of the reload path: the eviction is not incidental setup, it is
 * how the edit becomes visible at all. It also lets a test reach a 30-minute
 * idle timeout without waiting 30 minutes.
 */
async function rewriteRoom(
  code: string,
  edit: (room: StoredRoom) => void,
): Promise<void> {
  const stub = env.ROOM.getByName(code);
  await runInDurableObject(stub, async (_instance, state) => {
    const room = await state.storage.get<StoredRoom>("room");
    if (room === undefined) throw new Error(`room ${code} is not in storage`);
    edit(room);
    await state.storage.put("room", room);
  });
  await evictDurableObject(stub);
}

/**
 * The hard-coded codes below are unique to this file on purpose: the Workers
 * suite shares one storage instance, so a room made here is visible to every
 * other file. Everything that does not need a specific code mints a random
 * one through `createRoom`.
 */
describe("claiming a code", () => {
  it("hands the first caller the room and a host token", async () => {
    const stub = env.ROOM.getByName("AAAA");

    const result = await stub.tryCreate("AAAA", "word-wall");

    expect(result.ok).toBe(true);
    expect(result.hostToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(await stub.exists()).toBe(true);
  });

  it("refuses a second claim, which is how the Worker detects a collision", async () => {
    const stub = env.ROOM.getByName("AAAB");
    await stub.tryCreate("AAAB", "word-wall");

    const second = await stub.tryCreate("AAAB", "word-wall");

    expect(second.ok).toBe(false);
    expect(second.hostToken).toBeUndefined();
  });

  /**
   * `getByName` resolves to *some* object for any string, so without the
   * explicit existence flag a typo'd code would drop you into an empty room
   * instead of telling you the code is wrong.
   */
  it("reports a code nobody claimed as non-existent", async () => {
    expect(await env.ROOM.getByName("ZZZZ").exists()).toBe(false);
  });
});

describe("the room's HTTP surface", () => {
  it("404s a path that is not a socket upgrade", async () => {
    const { code } = await createRoom();

    const response = await env.ROOM.getByName(code).fetch(`${ORIGIN}/api/rooms/${code}`);

    expect(response.status).toBe(404);
  });

  it("426s a /ws request that forgot the upgrade header", async () => {
    const { code } = await createRoom();

    const response = await env.ROOM.getByName(code).fetch(
      `${ORIGIN}/api/rooms/${code}/ws`,
    );

    expect(response.status).toBe(426);
  });
});

/**
 * A refusal completes the upgrade and then closes, rather than failing the
 * handshake, because browsers report a failed handshake as an opaque 1006 with
 * no body. These tests are the proof that the readable reason actually arrives.
 */
describe("refusing a connection", () => {
  it("tells an unknown room code so, then closes with the reason", async () => {
    const client = await connectPlayer("QQQQ", "Sam");

    const message = await client.expect("error");
    expect(message.code).toBe("room_not_found");
    expect(message.fatal).toBe(true);

    const closed = await client.closed;
    expect(closed.code).toBe(CLOSE_REFUSED);
    expect(closed.reason).toBe("room_not_found");
  });

  it("refuses a host with the wrong token", async () => {
    const { code } = await createRoom();

    const client = await connectHost(code, crypto.randomUUID());

    const message = await client.expect("error");
    expect(message.code).toBe("not_host");
    expect(message.fatal).toBe(true);
    expect((await client.closed).code).toBe(CLOSE_REFUSED);
  });

  it("refuses a host with no token at all", async () => {
    const { code } = await createRoom();

    const client = await connect(code, { role: "host" });

    expect((await client.expect("error")).code).toBe("not_host");
  });

  it("refuses a player whose name is empty once trimmed", async () => {
    const { code } = await createRoom();

    const client = await connectPlayer(code, "   ");

    expect((await client.expect("error")).code).toBe("bad_name");
  });

  it("refuses a second player claiming a name already in the room", async () => {
    const { code } = await createRoom();
    await connectPlayer(code, "Sam");

    const rival = await connectPlayer(code, "sam");

    const message = await rival.expect("error");
    expect(message.code).toBe("name_taken");
    expect(message.fatal).toBe(true);
  });
});

describe("joining", () => {
  it("welcomes a player with their identity and the room", async () => {
    const { code } = await createRoom();

    const client = await connectPlayer(code, "Sam");

    const welcome = await client.expect("welcome");
    expect(welcome.you).toMatchObject({ role: "player", name: "Sam" });
    expect(welcome.state.code).toBe(code);
    expect(welcome.state.status).toBe("lobby");
    expect(welcome.state.players).toMatchObject([{ name: "Sam", connected: true }]);
  });

  it("welcomes the host without a seat", async () => {
    const { code, hostToken } = await createRoom();

    const host = await connectHost(code, hostToken);

    const welcome = await host.expect("welcome");
    expect(welcome.you).toEqual({ id: "host", role: "host", name: null });
    expect(welcome.state.players).toEqual([]);
  });

  it("honours the id the client minted, so its next reconnect matches", async () => {
    const { code } = await createRoom();
    const playerId = crypto.randomUUID();

    const client = await connectPlayer(code, "Sam", playerId);

    expect((await client.expect("welcome")).you.id).toBe(playerId);
  });

  it("never puts the host token on the wire", async () => {
    const { code, hostToken } = await createRoom();

    const host = await connectHost(code, hostToken);

    const frames = await host.settled();
    expect(frames.length).toBeGreaterThan(0);
    expect(JSON.stringify(frames)).not.toContain(hostToken);
  });

  /**
   * Pinned because everything else in this file relies on it, and because it
   * is the one place the platform sends the same state twice: `welcome`
   * carries a snapshot, and the broadcast that announces the arrival reaches
   * the arriver too.
   */
  it("sends an arriving socket its snapshot twice: welcome, then the broadcast", async () => {
    const { code } = await createRoom();

    const client = await connectPlayer(code, "Sam");

    const [welcome, broadcast, ...rest] = await client.settled();
    expect(welcome.t).toBe("welcome");
    expect(broadcast.t).toBe("state");
    expect(rest).toEqual([]);
    expect(welcome.t === "welcome" && broadcast.t === "state").toBe(true);
    if (welcome.t === "welcome" && broadcast.t === "state") {
      expect(broadcast.state).toEqual(welcome.state);
    }
  });
});

describe("fan-out", () => {
  it("tells everyone already in the room when someone joins", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();

    await connectPlayer(code, "Sam");

    expect((await host.state()).state.players).toMatchObject([{ name: "Sam" }]);
  });

  /**
   * The snapshot is built per connection, not per role, and this is the path
   * that proves it: two sockets, one moment, two different payloads. Word Wall
   * withholds answers from phones until the round ends, so with the round
   * still open the host sees Sam's answer and Sam does not.
   */
  it("builds a snapshot per viewer, withholding what a viewer may not see", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    // A second player, so Sam answering does not end the round on its own.
    const ada = await connectPlayer(code, "Ada");
    await ada.welcomed();
    await host.settled();

    host.send({ t: "start_game" });
    await host.settled();
    await sam.settled();

    sam.send({ t: "game", c: { t: "submit", text: "pomegranate" } });

    const hostView = (await host.state()).state.game as { answers: unknown[] };
    const samView = (await sam.state()).state.game as { answers: unknown[] };
    expect(hostView.answers).toMatchObject([{ name: "Sam", text: "pomegranate" }]);
    expect(samView.answers).toEqual([]);

    ada.close();
  });
});

/**
 * The heartbeat is answered by the runtime's auto-responder, so the object is
 * never woken and never billed for it. That is configured in the constructor
 * and is invisible to every other kind of test.
 */
describe("the heartbeat", () => {
  it("answers a ping with a pong", async () => {
    const { code } = await createRoom();
    const client = await connectPlayer(code, "Sam");
    await client.welcomed();

    client.sendRaw(HEARTBEAT_PING);

    expect(await client.raw()).toBe(HEARTBEAT_PONG);
  });

  it("does not mistake a ping for a command", async () => {
    const { code } = await createRoom();
    const client = await connectPlayer(code, "Sam");
    await client.welcomed();

    client.sendRaw(HEARTBEAT_PING);
    expect(await client.raw()).toBe(HEARTBEAT_PONG);

    // No error about an unparseable message, and no snapshot: a heartbeat is
    // not activity anyone needs to hear about.
    await client.silent();
  });
});

describe("commands", () => {
  it("complains about a frame it cannot parse, without dropping the socket", async () => {
    const { code } = await createRoom();
    const client = await connectPlayer(code, "Sam");
    await client.welcomed();

    client.sendRaw("this is not json");

    const error = await client.expect("error");
    expect(error.code).toBe("bad_message");
    expect(error.fatal).toBe(false);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("refuses a player trying to start the game", async () => {
    const { code } = await createRoom();
    const client = await connectPlayer(code, "Sam");
    await client.welcomed();

    client.send({ t: "start_game" });

    const error = await client.expect("error");
    expect(error.code).toBe("not_host");
    expect(error.fatal).toBe(false);
  });

  it("tells only the client that asked when a command is refused", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    await host.settled();

    sam.send({ t: "start_game" });
    await sam.expect("error");

    await host.silent();
  });

  it("lets the host start the game and tells the room", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    await host.settled();

    host.send({ t: "start_game" });

    expect((await host.state()).state.status).toBe("playing");
    expect((await sam.state()).state.status).toBe("playing");
  });

  /**
   * A command that changes nothing is neither an error nor news. Ending a
   * game that is not running is the honest case: a host screen can send it
   * while a `returnToLobby` is still in flight.
   */
  it("says nothing at all when a command is a legal no-op", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    await host.settled();

    host.send({ t: "end_game" });

    await host.silent();
    await sam.silent();
  });
});

/**
 * The reason this file exists.
 *
 * An idle room drops out of memory while every phone stays connected, and the
 * constructor runs again on the way back. Two things have to survive that: the
 * room, which is reloaded from storage, and each socket's idea of who is
 * holding it, which is stashed on the socket itself because instance fields do
 * not come back. No fake of `DurableObjectState` would have told us whether
 * that actually works.
 */
describe("hibernation", () => {
  it("keeps serving a socket that was open before the room dropped out of memory", async () => {
    const { code } = await createRoom();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();

    await evictDurableObject(env.ROOM.getByName(code));

    // The socket never noticed.
    expect(sam.socket.readyState).toBe(WebSocket.OPEN);
    sam.sendRaw("this is not json");
    expect((await sam.expect("error")).code).toBe("bad_message");
  });

  it("still knows who is on a socket it has forgotten in memory", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    const ada = await connectPlayer(code, "Ada");
    await ada.welcomed();
    host.send({ t: "start_game" });
    await host.settled();

    await evictDurableObject(env.ROOM.getByName(code));

    // Nothing on the wire says who this is; the answer has to come from the
    // attachment the runtime handed back.
    sam.send({ t: "game", c: { t: "submit", text: "pomegranate" } });

    const answers = (await host.state()).state.game as { answers: { name: string }[] };
    expect(answers.answers).toMatchObject([{ name: "Sam", text: "pomegranate" }]);
  });

  it("reloads the room rather than starting a fresh one", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    host.send({ t: "start_game" });
    await host.settled();

    await evictDurableObject(env.ROOM.getByName(code));

    // A room rebuilt from nothing would be back in the lobby with no players.
    const ada = await connectPlayer(code, "Ada");
    const welcome = await ada.welcomed();
    expect(welcome.state.status).toBe("playing");
    expect(welcome.state.players.map((player) => player.name).sort()).toEqual([
      "Ada",
      "Sam",
    ]);
  });
});

describe("leaving", () => {
  it("frees a name the moment someone leaves the lobby", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    await host.settled();

    sam.close();

    expect((await host.state()).state.players).toEqual([]);

    // And the name is genuinely available again, to a different person.
    const impostor = await connectPlayer(code, "Sam");
    expect((await impostor.welcomed()).you.name).toBe("Sam");
  });

  /**
   * Mid-game the seat is worth more than the name: whoever put an answer in
   * should get it back when their phone reconnects.
   */
  it("keeps a seat when a phone drops mid-game, marked as away", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    const ada = await connectPlayer(code, "Ada");
    await ada.welcomed();
    host.send({ t: "start_game" });
    await host.settled();

    ada.close();

    const players = (await host.state()).state.players;
    expect(players).toHaveLength(2);
    expect(players.find((player) => player.name === "Ada")?.connected).toBe(false);
  });

  /**
   * A refresh or a second tab means the close we handle may belong to a socket
   * that has already been replaced. Connectivity is therefore asked of the
   * live socket set rather than a stored flag, which is what keeps this right
   * no matter what order the events arrive in.
   */
  it("does not evict a player whose close event belongs to a superseded socket", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const playerId = crypto.randomUUID();
    const first = await connectPlayer(code, "Sam", playerId);
    await first.welcomed();
    await host.settled();

    // Reconnecting with the same id supersedes the first socket, and the
    // server closes it — the close we must not act on.
    const second = await connectPlayer(code, "Sam", playerId);
    await second.welcomed();
    await first.closed;

    const players = (await host.state()).state.players;
    expect(players).toMatchObject([{ id: playerId, name: "Sam", connected: true }]);
  });
});

describe("the alarm", () => {
  it("ends a round whose time is up, and tells the room", async () => {
    const { code, hostToken } = await createRoom();
    const host = await connectHost(code, hostToken);
    await host.welcomed();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();
    const ada = await connectPlayer(code, "Ada");
    await ada.welcomed();
    host.send({ t: "start_game" });
    await host.settled();
    await sam.settled();

    await rewriteRoom(code, (room) => {
      room.deadline = Date.now() - 1;
    });
    expect(await runDurableObjectAlarm(env.ROOM.getByName(code))).toBe(true);

    // Word Wall shows everyone the answers once the round is over, so the
    // phone that could see nothing a moment ago can now see the wall.
    const view = (await sam.state()).state.game as { phase: string };
    expect(view.phase).toBe("results");
    ada.close();
  });

  it("destroys a room nobody has touched, and frees its code", async () => {
    const { code } = await createRoom();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();

    await rewriteRoom(code, (room) => {
      room.lastActivity = Date.now() - ROOM_IDLE_MS - 1;
    });
    expect(await runDurableObjectAlarm(env.ROOM.getByName(code))).toBe(true);

    const goodbye = await sam.expect("error");
    expect(goodbye.code).toBe("room_closed");
    expect(goodbye.fatal).toBe(true);
    expect((await sam.closed).code).toBe(1000);

    expect(await env.ROOM.getByName(code).exists()).toBe(false);
  });

  /**
   * A timer firing is not by itself news. This is the one path that can wake
   * every phone in the room without a human having touched anything, so it
   * only broadcasts when the game actually did something — here the deadline
   * is stale, left over from a game that has already ended.
   */
  it("wakes for a deadline the game no longer owns without telling anyone", async () => {
    const { code } = await createRoom();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();

    await rewriteRoom(code, (room) => {
      room.deadline = Date.now() - 1;
      room.status = "lobby";
    });
    expect(await runDurableObjectAlarm(env.ROOM.getByName(code))).toBe(true);

    await sam.silent();
    expect(await env.ROOM.getByName(code).exists()).toBe(true);
  });

  it("leaves a room alone while people are still using it", async () => {
    const { code } = await createRoom();
    const sam = await connectPlayer(code, "Sam");
    await sam.welcomed();

    // The alarm is set for the idle timeout, so firing it early is exactly the
    // spurious wake-up the room has to shrug off.
    await runDurableObjectAlarm(env.ROOM.getByName(code));

    await sam.silent();
    expect(await env.ROOM.getByName(code).exists()).toBe(true);
  });
});
