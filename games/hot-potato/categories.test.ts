import { describe, expect, it } from "vitest";

import { CATEGORIES, pickCategory } from "./categories";

describe("the category list", () => {
  it("has no duplicates, so a game cannot repeat itself by accident", () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });

  it("holds enough categories for several rounds without reuse", () => {
    expect(CATEGORIES.length).toBeGreaterThan(10);
  });
});

describe("pickCategory", () => {
  it("returns a category from the pool", () => {
    expect(CATEGORIES).toContain(pickCategory([]));
  });

  /**
   * Repeating a category inside one sitting is far more noticeable than
   * seeing it again in the next game, so the used list is what is avoided.
   */
  it("never returns a category already used this game", () => {
    const used = [...CATEGORIES.slice(0, CATEGORIES.length - 1)];
    // Only one left unused; it must be the one chosen, every time.
    for (let attempt = 0; attempt < 30; attempt++) {
      expect(pickCategory(used)).toBe(CATEGORIES[CATEGORIES.length - 1]);
    }
  });

  it("repeats rather than failing once every category has been used", () => {
    const pool = ["only one"];
    expect(pickCategory(pool, pool)).toBe("only one");
  });

  it("falls back to something playable if the pool is empty", () => {
    expect(pickCategory([], [])).toBe("Things");
  });

  it("can return any category in the pool", () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 400; attempt++) seen.add(pickCategory([]));
    // Not a distribution test — just proof the choice is not pinned to one.
    expect(seen.size).toBeGreaterThan(1);
  });
});
