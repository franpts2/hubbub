import { describe, expect, it } from "vitest";

import { CODE_ALPHABET, CODE_LENGTH, MAX_NAME_LENGTH } from "./protocol";
import {
  normalizeCode,
  normalizeName,
  normalizeText,
  parseClientMessage,
} from "./validation";

describe("normalizeText", () => {
  it("keeps ordinary text as it is", () => {
    expect(normalizeText("Wet socks", 80)).toBe("Wet socks");
  });

  it("trims and collapses runs of whitespace", () => {
    expect(normalizeText("  lots   of\t\tspace  ", 80)).toBe("lots of space");
    expect(normalizeText("a\n\n\nb", 80)).toBe("a b");
  });

  it("strips control characters rather than storing them", () => {
    expect(normalizeText("hi\u0000\u0001\u001fthere", 80)).toBe("hi there");
    expect(normalizeText("hi\u007f\u009fthere", 80)).toBe("hi there");
  });

  it("truncates to the caller's limit", () => {
    expect(normalizeText("x".repeat(500), 10)).toHaveLength(10);
  });

  it("returns null when nothing survives", () => {
    for (const input of ["", " ", "\t\n", "\u0000\u0001"]) {
      expect(normalizeText(input, 80), JSON.stringify(input)).toBeNull();
    }
  });

  it("returns null for anything that is not a string", () => {
    for (const input of [null, undefined, 42, {}, [], true]) {
      expect(normalizeText(input, 80), JSON.stringify(input)).toBeNull();
    }
  });

  it("keeps emoji and non-latin text intact", () => {
    expect(normalizeText("Olá 🎉", 80)).toBe("Olá 🎉");
    expect(normalizeText("日本語", 80)).toBe("日本語");
  });
});

describe("normalizeName", () => {
  it("applies the platform's name limit", () => {
    expect(normalizeName("x".repeat(50))).toHaveLength(MAX_NAME_LENGTH);
  });

  it("rejects an empty name", () => {
    expect(normalizeName("   ")).toBeNull();
    expect(normalizeName(null)).toBeNull();
  });
});

describe("normalizeCode", () => {
  it("accepts a valid code, upper-casing and trimming it", () => {
    expect(normalizeCode(" abcd ")).toBe("ABCD");
    expect(normalizeCode("WXYZ")).toBe("WXYZ");
  });

  it("rejects the wrong length", () => {
    expect(normalizeCode("ABC")).toBeNull();
    expect(normalizeCode("ABCDE")).toBeNull();
    expect(normalizeCode("")).toBeNull();
  });

  /** These are excluded because people misread them off a TV. */
  it("rejects the ambiguous characters left out of the alphabet", () => {
    for (const char of ["I", "O", "0", "1"]) {
      expect(normalizeCode(`ABC${char}`), char).toBeNull();
    }
  });

  it("rejects punctuation and anything outside the alphabet", () => {
    for (const code of ["AB-D", "AB D", "AB.D", "AB/D", "ÁBCD"]) {
      expect(normalizeCode(code), code).toBeNull();
    }
  });

  it("rejects non-strings", () => {
    for (const input of [null, undefined, 1234, {}]) {
      expect(normalizeCode(input), JSON.stringify(input)).toBeNull();
    }
  });

  it("accepts every character it claims to allow", () => {
    for (const char of CODE_ALPHABET) {
      const code = char.repeat(CODE_LENGTH);
      expect(normalizeCode(code), char).toBe(code);
    }
  });
});

describe("parseClientMessage", () => {
  it("accepts the two platform commands", () => {
    expect(parseClientMessage('{"t":"start_game"}')).toEqual({ t: "start_game" });
    expect(parseClientMessage('{"t":"end_game"}')).toEqual({ t: "end_game" });
  });

  it("ignores extra fields on a platform command", () => {
    expect(parseClientMessage('{"t":"start_game","gameId":"whatever"}')).toEqual({
      t: "start_game",
    });
  });

  /**
   * The platform deliberately does not look inside a game payload — it cannot
   * validate commands it does not define. That is the game's parser's job.
   */
  it("forwards a game payload of any shape without inspecting it", () => {
    expect(parseClientMessage('{"t":"game","c":{"t":"submit","text":"hi"}}')).toEqual({
      t: "game",
      c: { t: "submit", text: "hi" },
    });
    expect(parseClientMessage('{"t":"game","c":42}')).toEqual({ t: "game", c: 42 });
    expect(parseClientMessage('{"t":"game","c":null}')).toEqual({ t: "game", c: null });
  });

  it("rejects a game envelope with no payload at all", () => {
    expect(parseClientMessage('{"t":"game"}')).toBeNull();
  });

  it("rejects malformed json", () => {
    for (const raw of ["", "{", "not json", "undefined"]) {
      expect(parseClientMessage(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("rejects json that is not an object", () => {
    for (const raw of ["null", "42", '"start_game"', "[]", "true"]) {
      expect(parseClientMessage(raw), raw).toBeNull();
    }
  });

  it("rejects unknown and pre-engine message types", () => {
    // These were the old flat Word Wall messages; they must not still work.
    for (const raw of [
      '{"t":"start"}',
      '{"t":"reset"}',
      '{"t":"skip"}',
      '{"t":"submit","text":"hi"}',
      '{"t":"nope"}',
      "{}",
    ]) {
      expect(parseClientMessage(raw), raw).toBeNull();
    }
  });
});
