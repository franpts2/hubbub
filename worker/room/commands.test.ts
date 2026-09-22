import { describe, expect, it } from "vitest";

import type { Attachment } from "./sockets";
import { applyCommand, notifyDeadline, notifySeatsChanged } from "./commands";
import { fakeGame, playing, room, type FakeState } from "./testing";

const HOST: Attachment = { playerId: "host", role: "host" };
const player = (id: string): Attachment => ({ playerId: id, role: "player" });

describe("start_game", () => {
  it("moves the room into play and asks the game for its initial state", () => {
    const { stored, isConnected } = room("ana", "bo");
    const { game, calls } = fakeGame();

    const outcome = applyCommand(stored, game, HOST, { t: "start_game" }, isConnected);

    expect(outcome).toEqual({ kind: "applied" });
    expect(stored.status).toBe("playing");
    expect(calls.create).toBe(1);
    expect(stored.game).toMatchObject({ step: "counting", count: 0 });
  });

  it("hands the game the live roster so it knows who it is waiting on", () => {
    const { stored, isConnected } = room("ana", "bo!", "cy");
    const { game, calls } = fakeGame();

    applyCommand(stored, game, HOST, { t: "start_game" }, isConnected);
    expect(calls.seatsSeen[0]).toBe(3);
  });

  it("refuses a player", () => {
    const { stored, isConnected } = room("ana");
    const { game, calls } = fakeGame();

    const outcome = applyCommand(
      stored,
      game,
      player("ana"),
      { t: "start_game" },
      isConnected,
    );

    expect(outcome).toEqual({
      kind: "rejected",
      code: "not_host",
      message: "Only the host screen can do that.",
    });
    expect(stored.status).toBe("lobby");
    expect(calls.create).toBe(0);
  });

  it("refuses to restart a game that is already running", () => {
    const { stored, isConnected } = room("ana");
    const { game, calls } = fakeGame();
    playing(stored, game, isConnected);
    const before = stored.game;

    const outcome = applyCommand(stored, game, HOST, { t: "start_game" }, isConnected);

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") expect(outcome.code).toBe("wrong_phase");
    // Crucially, the in-progress game was not discarded.
    expect(stored.game).toBe(before);
    expect(calls.create).toBe(1);
  });
});

describe("end_game", () => {
  it("returns to the lobby and discards the game's state", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    const outcome = applyCommand(stored, game, HOST, { t: "end_game" }, isConnected);

    expect(outcome).toEqual({ kind: "applied" });
    expect(stored.status).toBe("lobby");
    expect(stored.game).toBeNull();
    expect(stored.deadline).toBeNull();
  });

  it("drops players who wandered off, so the next game starts clean", () => {
    const { stored, isConnected } = room("ana", "bo!");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    applyCommand(stored, game, HOST, { t: "end_game" }, isConnected);
    expect(stored.players.map((p) => p.id)).toEqual(["ana"]);
  });

  it("refuses a player", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    const outcome = applyCommand(
      stored,
      game,
      player("ana"),
      { t: "end_game" },
      isConnected,
    );
    expect(outcome.kind).toBe("rejected");
    expect(stored.status).toBe("playing");
  });

  it("is a harmless no-op when already in the lobby", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();

    expect(applyCommand(stored, game, HOST, { t: "end_game" }, isConnected)).toEqual({
      kind: "ignored",
    });
  });
});

describe("forwarding a game command", () => {
  it("passes the payload to the game and applies the result", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    const outcome = applyCommand(
      stored,
      game,
      player("ana"),
      { t: "game", c: { t: "bump" } },
      isConnected,
    );

    expect(outcome).toEqual({ kind: "applied" });
    expect((stored.game as FakeState).count).toBe(1);
  });

  it("reports the game's own refusal as game_rejected, never as fatal", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);
    applyCommand(stored, game, HOST, { t: "game", c: { t: "finish" } }, isConnected);

    const outcome = applyCommand(
      stored,
      game,
      player("ana"),
      { t: "game", c: { t: "bump" } },
      isConnected,
    );

    expect(outcome).toEqual({
      kind: "rejected",
      code: "game_rejected",
      message: "Already finished.",
    });
  });

  it("maps a payload the game cannot parse to bad_message", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    for (const c of [null, 42, "bump", {}, { t: "nope" }, []]) {
      const outcome = applyCommand(
        stored,
        game,
        player("ana"),
        { t: "game", c },
        isConnected,
      );
      expect(outcome.kind, `should reject ${JSON.stringify(c)}`).toBe("rejected");
      if (outcome.kind === "rejected") expect(outcome.code).toBe("bad_message");
    }
  });

  it("refuses game commands while in the lobby, without consulting the game", () => {
    const { stored, isConnected } = room("ana");
    const { game, calls } = fakeGame();

    const outcome = applyCommand(
      stored,
      game,
      player("ana"),
      { t: "game", c: { t: "bump" } },
      isConnected,
    );

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") expect(outcome.code).toBe("wrong_phase");
    expect(calls.seatsSeen).toEqual([]);
  });

  it("tells the game who sent the command", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    // The fake ignores bumps from the host and counts them from players.
    applyCommand(stored, game, HOST, { t: "game", c: { t: "bump" } }, isConnected);
    expect((stored.game as FakeState).count).toBe(0);

    applyCommand(
      stored,
      game,
      player("ana"),
      { t: "game", c: { t: "bump" } },
      isConnected,
    );
    expect((stored.game as FakeState).count).toBe(1);
  });

  it("passes a game's host-authority refusal straight through", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    const outcome = applyCommand(
      stored,
      game,
      player("ana"),
      { t: "game", c: { t: "finish" } },
      isConnected,
    );

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.message).toBe("Only the host screen can do that.");
    }
    expect((stored.game as FakeState).step).toBe("counting");
  });
});

describe("notifying the game of presence changes", () => {
  it("does nothing in the lobby, where there is no game to notify", () => {
    const { stored, isConnected } = room("ana");
    const { game, calls } = fakeGame();

    expect(notifySeatsChanged(stored, game, isConnected)).toBe(false);
    expect(calls.onSeatsChanged).toBe(0);
  });

  it("reports whether the game reacted, so the caller can skip a broadcast", () => {
    const { stored, isConnected } = room("ana");
    const { game, calls } = fakeGame();
    playing(stored, game, isConnected);

    // Someone is still connected, so the fake has no reason to act.
    expect(notifySeatsChanged(stored, game, isConnected)).toBe(false);
    expect(calls.onSeatsChanged).toBe(1);

    // Everyone has dropped: now it finishes.
    const empty = room("ana!");
    empty.stored.status = "playing";
    empty.stored.game = stored.game;
    expect(notifySeatsChanged(empty.stored, game, empty.isConnected)).toBe(true);
    expect((empty.stored.game as FakeState).step).toBe("done");
  });

  it("is safe for a game that does not implement the hook", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    const withoutHook = { ...game, onSeatsChanged: undefined };
    expect(notifySeatsChanged(stored, withoutHook, isConnected)).toBe(false);
  });
});

describe("notifying the game of its deadline", () => {
  it("does nothing in the lobby", () => {
    const { stored, isConnected } = room("ana");
    const { game, calls } = fakeGame();

    expect(notifyDeadline(stored, game, isConnected)).toBe(false);
    expect(calls.onDeadline).toBe(0);
  });

  it("reports that the game acted", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    expect(notifyDeadline(stored, game, isConnected)).toBe(true);
    expect((stored.game as FakeState).step).toBe("done");
  });

  it("reports that a second firing changed nothing", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    notifyDeadline(stored, game, isConnected);
    expect(notifyDeadline(stored, game, isConnected)).toBe(false);
  });
});
