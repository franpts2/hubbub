import { describe, expect, it } from "vitest";

import { projectState } from "./projection";
import { fakeGame, playing, room, type FakeView } from "./testing";

describe("the platform half of a snapshot", () => {
  it("reports the room without any game knowledge", () => {
    const { stored, isConnected } = room("ana", "bo");
    const { game } = fakeGame();
    const state = projectState(stored, game, "host", isConnected);

    expect(state).toMatchObject({
      code: "ABCD",
      gameId: "word-wall",
      status: "lobby",
      deadline: null,
      game: null,
    });
  });

  it("never puts the host token on the wire", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    for (const role of ["host", "player"] as const) {
      const wire = JSON.stringify(projectState(stored, game, role, isConnected));
      expect(wire).not.toContain("secret-host-token");
    }
  });

  it("exposes only id, name and connected for each player", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    // Something extra on the stored player must not reach the wire.
    (stored.players[0] as unknown as Record<string, unknown>).privateNote = "leak me";

    const state = projectState(stored, game, "player", isConnected);
    expect(Object.keys(state.players[0]).sort()).toEqual(["connected", "id", "name"]);
    expect(JSON.stringify(state)).not.toContain("leak me");
  });

  it("derives connectivity from live sockets, not from stored data", () => {
    const { stored, isConnected } = room("ana", "bo!");
    const { game } = fakeGame();
    const state = projectState(stored, game, "host", isConnected);

    expect(state.players).toEqual([
      { id: "ana", name: "ANA", connected: true },
      { id: "bo", name: "BO", connected: false },
    ]);
  });

  it("passes through the cached deadline so the client can count down", () => {
    const { stored, isConnected } = room("ana");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    const state = projectState(stored, game, "player", isConnected);
    expect(state.deadline).toBe(stored.deadline);
    expect(typeof state.deadline).toBe("number");
  });
});

describe("delegating the game half", () => {
  it("does not call the game at all while in the lobby", () => {
    const { stored, isConnected } = room("ana");
    const { game, calls } = fakeGame();

    const state = projectState(stored, game, "host", isConnected);
    expect(state.game).toBeNull();
    expect(calls.view).toEqual([]);
  });

  it("asks the game for a view per role, and forwards it untouched", () => {
    const { stored, isConnected } = room("ana");
    const { game, calls } = fakeGame();
    playing(stored, game, isConnected);

    const hostView = projectState(stored, game, "host", isConnected).game as FakeView;
    const playerView = projectState(stored, game, "player", isConnected).game as FakeView;

    expect(calls.view).toEqual(["host", "player"]);
    expect(hostView).toEqual({ step: "counting", count: 0, secret: "host-only" });
    expect(playerView).toEqual({ step: "counting", count: 0, secret: null });
  });

  /**
   * The rule that actually matters. Word Wall uses it to keep answers from
   * phones mid-round, but it is enforced here, for any game: whatever the
   * game's `view` withholds is withheld on the wire, because the platform
   * serialises one payload per role and never merges them.
   */
  it("keeps a game's host-only data out of the player snapshot", () => {
    const { stored, isConnected } = room("ana", "bo");
    const { game } = fakeGame();
    playing(stored, game, isConnected);

    const playerWire = JSON.stringify(projectState(stored, game, "player", isConnected));
    expect(playerWire).not.toContain("host-only");

    const hostWire = JSON.stringify(projectState(stored, game, "host", isConnected));
    expect(hostWire).toContain("host-only");
  });

  it("gives the game the live roster, not the stored one", () => {
    const { stored, isConnected } = room("ana", "bo!");
    const { game, calls } = fakeGame();
    playing(stored, game, isConnected);
    calls.seatsSeen.length = 0;

    projectState(stored, game, "host", isConnected);
    // The game's `view` receives a context built from the current roster.
    expect(calls.view).toEqual(["host"]);
  });
});
