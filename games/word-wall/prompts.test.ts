import { describe, expect, it } from "vitest";

import { PROMPTS, pickPrompt } from "./prompts";

describe("the prompt list", () => {
  it("has no duplicates, which would make repeats possible", () => {
    expect(new Set(PROMPTS).size).toBe(PROMPTS.length);
  });

  it("contains no blank entries", () => {
    for (const prompt of PROMPTS) {
      expect(prompt.trim()).not.toBe("");
    }
  });
});

describe("pickPrompt", () => {
  it("always returns something from the list", () => {
    for (let i = 0; i < 100; i++) {
      expect(PROMPTS).toContain(pickPrompt(null));
    }
  });

  it("never returns the previous prompt", () => {
    for (const previous of PROMPTS) {
      for (let i = 0; i < 20; i++) {
        expect(pickPrompt(previous)).not.toBe(previous);
      }
    }
  });

  it("can reach every prompt in the list", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i++) seen.add(pickPrompt(null));
    expect(seen.size).toBe(PROMPTS.length);
  });

  it("repeats rather than failing when the list holds a single prompt", () => {
    expect(pickPrompt("only", ["only"])).toBe("only");
  });

  it("falls back to a usable string rather than undefined on an empty list", () => {
    expect(pickPrompt(null, [])).toBe("Say something.");
    expect(pickPrompt("anything", [])).toBe("Say something.");
  });

  it("picks from a two-prompt list by alternating", () => {
    expect(pickPrompt("a", ["a", "b"])).toBe("b");
    expect(pickPrompt("b", ["a", "b"])).toBe("a");
  });
});
