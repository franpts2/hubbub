import { describe, expect, it } from "vitest";

import { context, host, player, seats } from "../../engine/testing";
import { PROMPTS } from "./prompts";
import { wordWall, type WordWallState } from "./server";
import {
  MAX_ANSWER_LENGTH,
  ROUND_SECONDS,
  hasSubmitted,
  type WordWallView,
} from "./shared";

const NOW = 1_000_000;

function start(...roster: string[]): {
  state: WordWallState;
  seatList: ReturnType<typeof seats>;
} {
  const seatList = seats(...roster);
  const state = wordWall.create(context(seatList, NOW));
  return { state, seatList };
}

/** Applies a command and asserts it was accepted, returning the outcome kind. */
function send(
  state: WordWallState,
  raw: unknown,
  actor: Parameters<typeof wordWall.apply>[2],
  seatList: ReturnType<typeof seats>,
  now = NOW,
) {
  const command = wordWall.parseCommand(raw);
  if (command === null) return { kind: "unparsed" as const };
  return wordWall.apply(state, command, actor, context(seatList, now));
}

describe("parseCommand", () => {
  it("accepts the three commands the game defines", () => {
    expect(wordWall.parseCommand({ t: "submit", text: "hi" })).toEqual({
      t: "submit",
      text: "hi",
    });
    expect(wordWall.parseCommand({ t: "skip" })).toEqual({ t: "skip" });
    expect(wordWall.parseCommand({ t: "next" })).toEqual({ t: "next" });
  });

  it("rejects anything else, since the platform does not validate payloads", () => {
    for (const raw of [
      null,
      undefined,
      42,
      "submit",
      [],
      {},
      { t: "explode" },
      { t: "submit" }, // missing text
      { t: "submit", text: 5 }, // wrong type
    ]) {
      expect(
        wordWall.parseCommand(raw),
        `should reject ${JSON.stringify(raw)}`,
      ).toBeNull();
    }
  });
});

describe("create", () => {
  it("opens in a round with a prompt and a deadline", () => {
    const { state } = start("ana", "bo");
    expect(state.phase).toBe("prompt");
    expect(PROMPTS).toContain(state.prompt);
    expect(state.answers).toEqual([]);
    expect(state.endsAt).toBe(NOW + ROUND_SECONDS * 1000);
    expect(wordWall.deadline(state)).toBe(NOW + ROUND_SECONDS * 1000);
  });
});

describe("submit", () => {
  it("records an answer with the sender's name", () => {
    const { state, seatList } = start("ana", "bo");
    expect(
      send(state, { t: "submit", text: "Wet socks" }, player("ana"), seatList).kind,
    ).toBe("changed");
    expect(state.answers).toEqual([
      { playerId: "ana", name: "ANA", text: "Wet socks", at: NOW },
    ]);
  });

  it("overwrites rather than duplicating, because players change their mind", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "submit", text: "first" }, player("ana"), seatList);
    send(state, { t: "submit", text: "second" }, player("ana"), seatList, NOW + 500);
    expect(state.answers).toHaveLength(1);
    expect(state.answers[0].text).toBe("second");
    expect(state.answers[0].at).toBe(NOW + 500);
  });

  it("normalises whitespace and truncates to the game's own limit", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "submit", text: "  lots   of\n\tspace  " }, player("ana"), seatList);
    expect(state.answers[0].text).toBe("lots of space");

    send(
      state,
      { t: "submit", text: "x".repeat(MAX_ANSWER_LENGTH + 50) },
      player("bo"),
      seatList,
    );
    expect(state.answers[1].text).toHaveLength(MAX_ANSWER_LENGTH);
  });

  it("rejects an answer with no content", () => {
    const { state, seatList } = start("ana", "bo");
    for (const text of ["", "   ", "\n\t", "\u0000\u0001"]) {
      const outcome = send(state, { t: "submit", text }, player("ana"), seatList);
      expect(outcome.kind, `should reject ${JSON.stringify(text)}`).toBe("rejected");
    }
    expect(state.answers).toEqual([]);
  });

  it("ignores the host, who has no seat to answer from", () => {
    const { state, seatList } = start("ana", "bo");
    expect(send(state, { t: "submit", text: "hi" }, host, seatList).kind).toBe("ignored");
    expect(state.answers).toEqual([]);
  });

  it("ignores someone who is not in the room", () => {
    const { state, seatList } = start("ana", "bo");
    expect(send(state, { t: "submit", text: "hi" }, player("ghost"), seatList).kind).toBe(
      "ignored",
    );
    expect(state.answers).toEqual([]);
  });

  it("refuses once the round is over, rather than silently accepting", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "skip" }, host, seatList);
    const outcome = send(
      state,
      { t: "submit", text: "too late" },
      player("ana"),
      seatList,
    );
    expect(outcome.kind).toBe("rejected");
    expect(state.answers).toEqual([]);
  });
});

describe("ending a round early", () => {
  it("ends as soon as everyone present has answered", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "submit", text: "one" }, player("ana"), seatList);
    expect(state.phase).toBe("prompt");

    send(state, { t: "submit", text: "two" }, player("bo"), seatList);
    expect(state.phase).toBe("results");
    // The platform reads this to drop its alarm.
    expect(wordWall.deadline(state)).toBeNull();
  });

  it("does not wait on a player whose phone has dropped", () => {
    // "bo!" holds a seat but is not connected, so the round must not stall.
    const { state, seatList } = start("ana", "bo!");
    send(state, { t: "submit", text: "only me" }, player("ana"), seatList);
    expect(state.phase).toBe("results");
  });

  it("stays open when an empty room technically satisfies 'everyone'", () => {
    const { state, seatList } = start();
    expect(state.phase).toBe("prompt");
    expect(wordWall.onSeatsChanged?.(state, context(seatList)).kind).toBe("ignored");
    expect(state.phase).toBe("prompt");
  });

  it("ends when the last player being waited on leaves", () => {
    const { state } = start("ana", "bo");
    const present = seats("ana", "bo");
    send(state, { t: "submit", text: "one" }, player("ana"), present);
    expect(state.phase).toBe("prompt");

    // Bo's phone drops; nobody is left to wait for.
    const outcome = wordWall.onSeatsChanged!(state, context(seats("ana", "bo!")));
    expect(outcome.kind).toBe("changed");
    expect(state.phase).toBe("results");
  });

  it("ignores people leaving while the wall is on screen", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "skip" }, host, seatList);
    expect(state.phase).toBe("results");

    // Everyone closes their phone during the results; nothing should change.
    const outcome = wordWall.onSeatsChanged!(state, context(seats("ana!", "bo!")));
    expect(outcome.kind).toBe("ignored");
    expect(state.phase).toBe("results");
  });

  it("does nothing on a seat change that leaves someone still to answer", () => {
    const { state } = start("ana", "bo", "cy");
    send(state, { t: "submit", text: "one" }, player("ana"), seats("ana", "bo", "cy"));
    const outcome = wordWall.onSeatsChanged!(state, context(seats("ana", "bo", "cy!")));
    expect(outcome.kind).toBe("ignored");
    expect(state.phase).toBe("prompt");
  });
});

describe("host controls", () => {
  it("lets the host end a round early", () => {
    const { state, seatList } = start("ana", "bo");
    expect(send(state, { t: "skip" }, host, seatList).kind).toBe("changed");
    expect(state.phase).toBe("results");
    expect(state.endsAt).toBeNull();
  });

  it("refuses skip and next from a player", () => {
    const { state, seatList } = start("ana", "bo");
    expect(send(state, { t: "skip" }, player("ana"), seatList).kind).toBe("rejected");
    expect(state.phase).toBe("prompt");

    send(state, { t: "skip" }, host, seatList);
    expect(send(state, { t: "next" }, player("ana"), seatList).kind).toBe("rejected");
    expect(state.phase).toBe("results");
  });

  it("starts a fresh round on next, clearing the previous answers", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "submit", text: "keep me?" }, player("ana"), seatList);
    send(state, { t: "skip" }, host, seatList);

    const later = NOW + 30_000;
    expect(send(state, { t: "next" }, host, seatList, later).kind).toBe("changed");
    expect(state.phase).toBe("prompt");
    expect(state.answers).toEqual([]);
    expect(state.endsAt).toBe(later + ROUND_SECONDS * 1000);
  });

  it("refuses next while a round is already running", () => {
    const { state, seatList } = start("ana", "bo");
    expect(send(state, { t: "next" }, host, seatList).kind).toBe("rejected");
  });

  it("ignores skip when there is no round to skip", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "skip" }, host, seatList);
    expect(send(state, { t: "skip" }, host, seatList).kind).toBe("ignored");
  });

  it("never repeats the prompt back to back", () => {
    const { state, seatList } = start("ana", "bo");
    // Enough rounds that a repeat would be overwhelmingly likely by chance.
    for (let round = 0; round < 60; round++) {
      const previous = state.prompt;
      send(state, { t: "skip" }, host, seatList);
      send(state, { t: "next" }, host, seatList);
      expect(state.prompt).not.toBe(previous);
      expect(PROMPTS).toContain(state.prompt);
    }
  });
});

describe("the deadline", () => {
  it("is only advertised while a round is running", () => {
    const { state, seatList } = start("ana", "bo");
    expect(wordWall.deadline(state)).toBe(NOW + ROUND_SECONDS * 1000);
    send(state, { t: "skip" }, host, seatList);
    expect(wordWall.deadline(state)).toBeNull();
  });

  it("force-ends the round when it fires", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "submit", text: "just me" }, player("ana"), seatList);
    const outcome = wordWall.onDeadline(state, context(seatList, NOW + 60_000));
    expect(outcome.kind).toBe("changed");
    expect(state.phase).toBe("results");
  });

  /**
   * Guards the invariant behind the platform's alarm floor: a game that
   * ignores its own deadline while still advertising it would spin the
   * Durable Object. Ignoring and reporting null must go together.
   */
  it("reports no deadline whenever it would ignore one", () => {
    const { state, seatList } = start("ana", "bo");
    send(state, { t: "skip" }, host, seatList);
    expect(wordWall.onDeadline(state, context(seatList)).kind).toBe("ignored");
    expect(wordWall.deadline(state)).toBeNull();
  });
});

describe("view", () => {
  const withAnswers = () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "submit", text: "mine" }, player("ana"), seatList);
    return { state, seatList };
  };

  it("withholds answers from players mid-round but still reports progress", () => {
    const { state, seatList } = withAnswers();
    const view = wordWall.view(state, player("bo"), context(seatList)) as WordWallView;
    expect(view.answers).toEqual([]);
    // Progress is safe to share; the text is not.
    expect(view.submitted).toEqual(["ana"]);
    expect(view.phase).toBe("prompt");
    expect(view.prompt).toBe(state.prompt);
  });

  it("shows answers to the host mid-round, since that screen is the game", () => {
    const { state, seatList } = withAnswers();
    const view = wordWall.view(state, host, context(seatList)) as WordWallView;
    expect(view.answers).toHaveLength(1);
    expect(view.answers[0].text).toBe("mine");
  });

  it("reveals answers to players once the round is over", () => {
    const { state, seatList } = withAnswers();
    send(state, { t: "skip" }, host, seatList);
    const view = wordWall.view(state, player("bo"), context(seatList)) as WordWallView;
    expect(view.answers).toHaveLength(1);
    expect(view.answers[0].text).toBe("mine");
  });

  it("never leaks answer text through the submitted list", () => {
    const { state, seatList } = withAnswers();
    const view = wordWall.view(state, player("bo"), context(seatList)) as WordWallView;
    expect(JSON.stringify(view)).not.toContain("mine");
  });
});

describe("hasSubmitted", () => {
  const view = (...submitted: string[]): WordWallView => ({
    phase: "prompt",
    prompt: "p",
    submitted,
    answers: [],
  });

  it("answers for a known player", () => {
    expect(hasSubmitted(view("ana"), "ana")).toBe(true);
    expect(hasSubmitted(view("ana"), "bo")).toBe(false);
  });

  /** The phone may not know its own id yet on a first render. */
  it("is false when we do not know who we are", () => {
    expect(hasSubmitted(view("ana"), null)).toBe(false);
    expect(hasSubmitted(view(), null)).toBe(false);
  });
});
