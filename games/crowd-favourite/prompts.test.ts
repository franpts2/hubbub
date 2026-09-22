import { describe, expect, it } from "vitest";

import { PROMPTS, pickPrompt } from "./prompts";

describe("the prompt list", () => {
  it("has no duplicates, so a game cannot repeat itself by accident", () => {
    expect(new Set(PROMPTS).size).toBe(PROMPTS.length);
  });

  it("holds enough prompts for several rounds without reuse", () => {
    expect(PROMPTS.length).toBeGreaterThan(10);
  });
});

describe("pickPrompt", () => {
  it("returns a prompt from the pool", () => {
    expect(PROMPTS).toContain(pickPrompt([]));
  });

  /**
   * Seeing the same prompt twice in one sitting is far more noticeable than
   * seeing it again in the next game, so the used list is what is avoided.
   */
  it("never returns a prompt already used this game", () => {
    const used = [...PROMPTS.slice(0, PROMPTS.length - 1)];
    // Only one prompt left unused; it must be the one chosen, every time.
    for (let attempt = 0; attempt < 30; attempt++) {
      expect(pickPrompt(used)).toBe(PROMPTS[PROMPTS.length - 1]);
    }
  });

  it("repeats rather than failing once every prompt has been used", () => {
    const pool = ["only one"];
    expect(pickPrompt(pool, pool)).toBe("only one");
  });

  it("falls back to something sayable if the pool is empty", () => {
    expect(pickPrompt([], [])).toBe("Say something.");
  });

  it("can return any prompt in the pool", () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 400; attempt++) seen.add(pickPrompt([]));
    // Not a distribution test — just proof the choice is not pinned to one.
    expect(seen.size).toBeGreaterThan(1);
  });
});
