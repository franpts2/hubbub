import { describe, expect, it } from "vitest";

import {
  addPlayer,
  createRoom,
  findPlayer,
  gameContext,
  isNameTaken,
  pruneLobbyGhosts,
  removePlayer,
  returnToLobby,
  touch,
} from "./state";
import { room } from "./testing";

describe("createRoom", () => {
  it("starts in the lobby with no game and no timer", () => {
    const stored = createRoom("WXYZ", "token", "word-wall");
    expect(stored).toMatchObject({
      code: "WXYZ",
      hostToken: "token",
      gameId: "word-wall",
      status: "lobby",
      players: [],
      game: null,
      deadline: null,
    });
    expect(stored.lastActivity).toBeGreaterThan(0);
  });
});

describe("the roster the game sees", () => {
  it("maps seats with presence derived from live sockets", () => {
    const { stored, isConnected } = room("ana", "bo!");
    const ctx = gameContext(stored, isConnected);

    expect(ctx.seats).toEqual([
      { id: "ana", name: "ANA", connected: true },
      { id: "bo", name: "BO", connected: false },
    ]);
    expect(ctx.now).toBeGreaterThan(0);
  });

  /** Rebuilt each call, so a game cannot cache a roster across a hibernation. */
  it("reflects the room as it stands, not as it was", () => {
    const { stored, isConnected } = room("ana");
    const before = gameContext(stored, isConnected);
    addPlayer(stored, "bo", "Bo");
    const after = gameContext(stored, isConnected);

    expect(before.seats).toHaveLength(1);
    expect(after.seats).toHaveLength(2);
  });

  it("gives an empty roster for an empty room", () => {
    const { stored, isConnected } = room();
    expect(gameContext(stored, isConnected).seats).toEqual([]);
  });
});

describe("players", () => {
  it("finds a player by id, and reports nothing for a stranger", () => {
    const { stored } = room("ana");
    expect(findPlayer(stored, "ana")?.name).toBe("ANA");
    expect(findPlayer(stored, "nobody")).toBeUndefined();
  });

  it("removes only the player asked for", () => {
    const { stored } = room("ana", "bo");
    removePlayer(stored, "ana");
    expect(stored.players.map((p) => p.id)).toEqual(["bo"]);
  });

  it("is a no-op when removing someone who is not there", () => {
    const { stored } = room("ana");
    removePlayer(stored, "nobody");
    expect(stored.players).toHaveLength(1);
  });

  it("compares names case-insensitively, since Sam and sam are one person", () => {
    const { stored } = room();
    addPlayer(stored, "id-1", "Sam");

    expect(isNameTaken(stored, "Sam")).toBe(true);
    expect(isNameTaken(stored, "sam")).toBe(true);
    expect(isNameTaken(stored, "SAM")).toBe(true);
    expect(isNameTaken(stored, "Samuel")).toBe(false);
  });

  it("lets a player keep their own name when excluded", () => {
    const { stored } = room();
    addPlayer(stored, "id-1", "Sam");
    expect(isNameTaken(stored, "Sam", "id-1")).toBe(false);
    expect(isNameTaken(stored, "Sam", "id-2")).toBe(true);
  });
});

describe("touch", () => {
  it("pushes the idle deadline forward", () => {
    const { stored } = room();
    stored.lastActivity = 0;
    touch(stored);
    expect(stored.lastActivity).toBeGreaterThan(0);
  });
});

describe("pruneLobbyGhosts", () => {
  it("drops lobby players with no live socket", () => {
    const { stored, isConnected } = room("ana", "bo!", "cy!");
    pruneLobbyGhosts(stored, isConnected);
    expect(stored.players.map((p) => p.id)).toEqual(["ana"]);
  });

  /** Mid-game a seat is worth keeping so a phone can come back to it. */
  it("never runs while a game is in progress", () => {
    const { stored, isConnected } = room("ana", "bo!");
    stored.status = "playing";
    pruneLobbyGhosts(stored, isConnected);
    expect(stored.players).toHaveLength(2);
  });
});

describe("returnToLobby", () => {
  it("clears the game, its timer and anyone who wandered off", () => {
    const { stored, isConnected } = room("ana", "bo!");
    stored.status = "playing";
    stored.game = { anything: true };
    stored.deadline = 123;

    returnToLobby(stored, isConnected);

    expect(stored.status).toBe("lobby");
    expect(stored.game).toBeNull();
    expect(stored.deadline).toBeNull();
    expect(stored.players.map((p) => p.id)).toEqual(["ana"]);
  });

  it("keeps the room's identity intact", () => {
    const { stored, isConnected } = room("ana");
    stored.status = "playing";
    returnToLobby(stored, isConnected);

    expect(stored.code).toBe("ABCD");
    expect(stored.hostToken).toBe("secret-host-token");
    expect(stored.gameId).toBe("word-wall");
  });
});
