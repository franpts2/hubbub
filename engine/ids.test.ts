import { describe, expect, it } from "vitest";

import { DEFAULT_GAME_ID, GAME_IDS, isGameId } from "./ids";

describe("game ids", () => {
  it("has a default that is actually a known game", () => {
    expect(GAME_IDS).toContain(DEFAULT_GAME_ID);
  });

  it("holds no duplicates", () => {
    expect(new Set(GAME_IDS).size).toBe(GAME_IDS.length);
  });
});

/**
 * This guards the public `POST /api/rooms` body, so it is the boundary that
 * decides whether an untrusted string becomes a room's permanent game id.
 */
describe("isGameId", () => {
  it("accepts every id that exists", () => {
    for (const id of GAME_IDS) {
      expect(isGameId(id)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    for (const value of ["", "wordwall", "word-wall ", "WORD-WALL", "../word-wall"]) {
      expect(isGameId(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("rejects non-strings, including things that could reach it from JSON", () => {
    for (const value of [null, undefined, 0, 1, {}, [], ["word-wall"], true]) {
      expect(isGameId(value), JSON.stringify(value)).toBe(false);
    }
  });

  /** Array.prototype pollution would be a way to smuggle an id through. */
  it("does not accept inherited properties as ids", () => {
    expect(isGameId("includes")).toBe(false);
    expect(isGameId("length")).toBe(false);
    expect(isGameId("constructor")).toBe(false);
  });
});
