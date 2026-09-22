import { describe, expect, it } from "vitest";

import { MAX_NAME_LENGTH, MAX_PLAYERS } from "../../shared/protocol";
import { resolveIdentity } from "./join";
import { room } from "./testing";

const HOST_TOKEN = "secret-host-token";

function params(input: Record<string, string>): URLSearchParams {
  return new URLSearchParams(input);
}

const uuid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`.slice(-36);

describe("host identity", () => {
  it("admits the screen holding the room's token", () => {
    const { stored, isConnected } = room();
    const outcome = resolveIdentity(
      stored,
      params({ role: "host", hostToken: HOST_TOKEN }),
      isConnected,
    );

    expect(outcome).toEqual({
      ok: true,
      identity: { id: "host", role: "host", name: null },
    });
  });

  /** Otherwise anyone who can read the code off a TV could drive the game. */
  it("refuses a wrong, missing or empty token", () => {
    const { stored, isConnected } = room();
    const attempts: Record<string, string>[] = [
      { role: "host" },
      { role: "host", hostToken: "" },
      { role: "host", hostToken: "forged" },
      { role: "host", hostToken: HOST_TOKEN + "x" },
      { role: "host", hostToken: HOST_TOKEN.toUpperCase() },
    ];
    for (const attempt of attempts) {
      const outcome = resolveIdentity(stored, params(attempt), isConnected);
      expect(outcome.ok, `should refuse ${JSON.stringify(attempt)}`).toBe(false);
      if (!outcome.ok) expect(outcome.code).toBe("not_host");
    }
  });

  it("does not take a seat for the host", () => {
    const { stored, isConnected } = room();
    resolveIdentity(stored, params({ role: "host", hostToken: HOST_TOKEN }), isConnected);
    expect(stored.players).toEqual([]);
  });

  it("treats anything but role=host as a player", () => {
    const { stored, isConnected } = room();
    // A would-be host who omits the role cannot sneak in on the token alone.
    const outcome = resolveIdentity(
      stored,
      params({ hostToken: HOST_TOKEN, name: "Sneaky" }),
      isConnected,
    );
    expect(outcome.ok && outcome.identity.role).toBe("player");
  });
});

describe("player names", () => {
  it("admits a new player and seats them", () => {
    const { stored, isConnected } = room();
    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "Ana", playerId: uuid(1) }),
      isConnected,
    );

    expect(outcome.ok).toBe(true);
    expect(stored.players).toHaveLength(1);
    expect(stored.players[0]).toMatchObject({ id: uuid(1), name: "Ana" });
  });

  it("rejects a name that normalises to nothing", () => {
    const { stored, isConnected } = room();
    for (const name of ["", "   ", "\n", "\u0000"]) {
      const outcome = resolveIdentity(
        stored,
        params({ role: "player", name, playerId: uuid(1) }),
        isConnected,
      );
      expect(outcome.ok, `should reject ${JSON.stringify(name)}`).toBe(false);
      if (!outcome.ok) expect(outcome.code).toBe("bad_name");
    }
    expect(stored.players).toEqual([]);
  });

  it("rejects a missing name outright", () => {
    const { stored, isConnected } = room();
    const outcome = resolveIdentity(stored, params({ role: "player" }), isConnected);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("bad_name");
  });

  it("trims and truncates to the platform limit", () => {
    const { stored, isConnected } = room();
    resolveIdentity(
      stored,
      params({ role: "player", name: "  a".repeat(40), playerId: uuid(1) }),
      isConnected,
    );
    expect(stored.players[0].name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
  });

  it("refuses a name already in the room, case-insensitively", () => {
    const { stored, isConnected } = room("ana");
    stored.players[0].name = "Ana";

    for (const name of ["Ana", "ana", "ANA", " aNa "]) {
      const outcome = resolveIdentity(
        stored,
        params({ role: "player", name, playerId: uuid(9) }),
        isConnected,
      );
      expect(outcome.ok, `should refuse ${JSON.stringify(name)}`).toBe(false);
      if (!outcome.ok) expect(outcome.code).toBe("name_taken");
    }
    expect(stored.players).toHaveLength(1);
  });

  it("lets a returning player keep their own name", () => {
    const { stored, isConnected } = room();
    stored.players.push({ id: uuid(1), name: "Ana", joinedAt: 0 });
    stored.status = "playing";

    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "Ana", playerId: uuid(1) }),
      isConnected,
    );
    expect(outcome.ok).toBe(true);
    expect(stored.players).toHaveLength(1);
  });
});

describe("reclaiming a seat", () => {
  it("returns the same seat for a known player id", () => {
    const { stored, isConnected } = room();
    stored.players.push({ id: uuid(1), name: "Ana", joinedAt: 0 });
    stored.status = "playing";

    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "Ana v2", playerId: uuid(1) }),
      isConnected,
    );

    expect(outcome.ok && outcome.identity.id).toBe(uuid(1));
    expect(stored.players).toHaveLength(1);
    // A rename on reconnect is honoured.
    expect(stored.players[0].name).toBe("Ana v2");
  });

  it("ignores a client id that is not a uuid, minting one instead", () => {
    const { stored, isConnected } = room();
    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "Ana", playerId: "../../etc/passwd" }),
      isConnected,
    );

    expect(outcome.ok).toBe(true);
    expect(stored.players[0].id).not.toBe("../../etc/passwd");
    expect(stored.players[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not let a mid-game seat be stolen by reusing its id under a taken name", () => {
    const { stored, isConnected } = room();
    stored.players.push({ id: uuid(1), name: "Ana", joinedAt: 0 });
    stored.players.push({ id: uuid(2), name: "Bo", joinedAt: 0 });
    stored.status = "playing";

    // Claiming Ana's id but Bo's name must not work.
    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "Bo", playerId: uuid(1) }),
      isConnected,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("name_taken");
    expect(stored.players[0].name).toBe("Ana");
  });
});

describe("capacity", () => {
  /**
   * Seats are only ever created with a uuid — either one the client presented
   * that passed `normalizePlayerId`, or `crypto.randomUUID()` — so a full room
   * has to be built out of uuids for reconnection to be exercised honestly.
   */
  function fullRoom() {
    const built = room();
    for (let i = 0; i < MAX_PLAYERS; i++) {
      built.stored.players.push({ id: uuid(i), name: `P${i}`, joinedAt: 0 });
    }
    built.stored.status = "playing"; // so ghost pruning does not clear the room
    return built;
  }

  it(`refuses the ${MAX_PLAYERS + 1}th player`, () => {
    const { stored, isConnected } = fullRoom();

    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "Extra", playerId: uuid(99) }),
      isConnected,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("room_full");
    expect(stored.players).toHaveLength(MAX_PLAYERS);
  });

  it("still lets an existing player back in when the room is full", () => {
    const { stored, isConnected } = fullRoom();

    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "P0", playerId: uuid(0) }),
      isConnected,
    );
    expect(outcome.ok && outcome.identity.id).toBe(uuid(0));
    expect(stored.players).toHaveLength(MAX_PLAYERS);
  });

  it("does not count the host against the player limit", () => {
    const { stored, isConnected } = fullRoom();
    const outcome = resolveIdentity(
      stored,
      params({ role: "host", hostToken: HOST_TOKEN }),
      isConnected,
    );
    expect(outcome.ok).toBe(true);
  });
});

describe("ghost pruning on join", () => {
  /**
   * A close event can go missing (a deploy, a moved object, HMR in dev). If a
   * disconnected lobby player kept their seat, their name would be held
   * forever with no path back to the truth.
   */
  it("frees a disconnected lobby player's name when someone joins", () => {
    const { stored, isConnected } = room("ana!");
    stored.players[0].name = "Ana";

    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "Ana", playerId: uuid(5) }),
      isConnected,
    );

    expect(outcome.ok).toBe(true);
    expect(stored.players).toHaveLength(1);
    expect(stored.players[0].id).toBe(uuid(5));
  });

  it("never prunes mid-game, because a seat is worth keeping", () => {
    const { stored, isConnected } = room("ana!");
    stored.players[0].name = "Ana";
    stored.status = "playing";

    const outcome = resolveIdentity(
      stored,
      params({ role: "player", name: "Ana", playerId: uuid(5) }),
      isConnected,
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("name_taken");
    expect(stored.players).toHaveLength(1);
  });
});
