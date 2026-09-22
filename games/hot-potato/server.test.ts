import { describe, expect, it, vi } from "vitest";

import { NOT_HOST } from "../../engine/server";
import { context, host, player, seats } from "../../engine/testing";
import { CATEGORIES } from "./categories";
import { hotPotato, type HotPotatoState } from "./server";
import {
  MAX_ANSWER_LENGTH,
  POINTS_PER_ANSWER,
  POINTS_PER_ROUND,
  REVIEW_SECONDS,
  TOTAL_ROUNDS,
  TURN_SECONDS,
  VOTE_SECONDS,
  hasVoted,
  isYourTurn,
  type AnsweringView,
  type HotPotatoView,
  type ReviewingView,
  type RoundOverView,
  type VotingView,
} from "./shared";

const NOW = 1_000_000;

type SeatList = ReturnType<typeof seats>;

/**
 * Run something with `Math.random` pinned just below 1.
 *
 * Fisher-Yates swaps `out[i]` with `out[floor(r * (i + 1))]`, so a value this
 * close to 1 always picks `i` itself and every swap is a no-op. Turn order
 * therefore comes out as the seat order, which is what makes these tests
 * readable. The shuffle is still exercised for real in its own test below.
 */
function fixedOrder<T>(fn: () => T): T {
  const spy = vi.spyOn(Math, "random").mockReturnValue(0.999999);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

function start(...roster: string[]): { state: HotPotatoState; seatList: SeatList } {
  const seatList = seats(...roster);
  const state = fixedOrder(() => hotPotato.create(context(seatList, NOW)));
  return { state, seatList };
}

function send(
  state: HotPotatoState,
  raw: unknown,
  actor: Parameters<typeof hotPotato.apply>[2],
  seatList: SeatList,
  now = NOW,
) {
  const command = hotPotato.parseCommand(raw);
  if (command === null) return { kind: "unparsed" as const };
  return hotPotato.apply(state, command, actor, context(seatList, now));
}

function viewFor(
  state: HotPotatoState,
  who: Parameters<typeof hotPotato.view>[1],
  seatList: SeatList,
): HotPotatoView {
  return hotPotato.view(state, who, context(seatList, NOW)) as HotPotatoView;
}

function whoseTurn(state: HotPotatoState, seatList: SeatList): string | null {
  return (viewFor(state, host, seatList) as AnsweringView).activePlayerId;
}

function answerBy(
  state: HotPotatoState,
  id: string,
  text: string,
  seatList: SeatList,
  now = NOW,
) {
  return send(state, { t: "answer", text }, player(id), seatList, now);
}

/** Answer and let the challenge window lapse, so the turn simply passes on. */
function answerAndAccept(
  state: HotPotatoState,
  id: string,
  text: string,
  seatList: SeatList,
): void {
  answerBy(state, id, text, seatList);
  if (state.stage.phase === "reviewing") {
    hotPotato.onDeadline(state, context(seatList, NOW));
  }
}

describe("parseCommand", () => {
  it("accepts the five commands the game defines", () => {
    expect(hotPotato.parseCommand({ t: "answer", text: "milk" })).toEqual({
      t: "answer",
      text: "milk",
    });
    expect(hotPotato.parseCommand({ t: "challenge" })).toEqual({ t: "challenge" });
    expect(hotPotato.parseCommand({ t: "vote", ok: false })).toEqual({
      t: "vote",
      ok: false,
    });
    expect(hotPotato.parseCommand({ t: "skip" })).toEqual({ t: "skip" });
    expect(hotPotato.parseCommand({ t: "next" })).toEqual({ t: "next" });
  });

  it("refuses anything else", () => {
    expect(hotPotato.parseCommand(null)).toBeNull();
    expect(hotPotato.parseCommand("answer")).toBeNull();
    expect(hotPotato.parseCommand({})).toBeNull();
    expect(hotPotato.parseCommand({ t: "nope" })).toBeNull();
    expect(hotPotato.parseCommand({ t: "answer" })).toBeNull();
    expect(hotPotato.parseCommand({ t: "answer", text: 7 })).toBeNull();
    expect(hotPotato.parseCommand({ t: "vote" })).toBeNull();
    // "truthy" is not a boolean, and a vote is too consequential to coerce.
    expect(hotPotato.parseCommand({ t: "vote", ok: "yes" })).toBeNull();
  });
});

describe("starting a round", () => {
  it("seats everyone in a turn order and starts the clock", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    const view = viewFor(state, host, seatList) as AnsweringView;

    expect(view.phase).toBe("answering");
    expect(view.alive.map((entry) => entry.playerId)).toEqual(["ana", "bo", "cy"]);
    expect(view.activePlayerId).toBe("ana");
    expect(view.said).toEqual([]);
    expect(view.lastOut).toBeNull();
    expect(CATEGORIES).toContain(view.category);
    expect(hotPotato.deadline(state)).toBe(NOW + TURN_SECONDS * 1000);
  });

  it("shuffles the turn order rather than using the order people joined in", () => {
    const orders = new Set<string>();
    for (let attempt = 0; attempt < 60; attempt++) {
      const seatList = seats("ana", "bo", "cy", "dee", "eli");
      const state = hotPotato.create(context(seatList, NOW));
      orders.add(state.order.join(","));
    }
    // Five players give 120 orderings; seeing only one in 60 tries would mean
    // the shuffle is not shuffling.
    expect(orders.size).toBeGreaterThan(1);
  });

  it("does not repeat a category within one game", () => {
    const { state } = start("ana", "bo", "cy");
    expect(state.usedCategories).toHaveLength(1);
    expect(state.usedCategories).toContain(state.category);
  });
});

describe("taking a turn", () => {
  it("refuses an answer from anyone but the player whose turn it is", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(answerBy(state, "bo", "milk", seatList)).toEqual({
      kind: "rejected",
      message: "Wait for your turn.",
    });
    expect(state.said).toEqual([]);
  });

  it("refuses an empty answer and leaves the turn where it is", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(answerBy(state, "ana", "   ", seatList)).toEqual({
      kind: "rejected",
      message: "Name something first.",
    });
    expect(whoseTurn(state, seatList)).toBe("ana");
  });

  it("passes the turn to the next player once an answer is accepted", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerAndAccept(state, "ana", "milk", seatList);

    expect(whoseTurn(state, seatList)).toBe("bo");
    expect(state.said.map((said) => said.text)).toEqual(["milk"]);
  });

  it("wraps back round to the first player", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerAndAccept(state, "ana", "milk", seatList);
    answerAndAccept(state, "bo", "butter", seatList);
    answerAndAccept(state, "cy", "jam", seatList);

    expect(whoseTurn(state, seatList)).toBe("ana");
  });

  it("ignores an answer from the host", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "answer", text: "milk" }, host, seatList)).toEqual({
      kind: "ignored",
    });
  });

  it("refuses an answer sent while the table is busy with something else", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList); // now reviewing

    expect(answerBy(state, "bo", "butter", seatList)).toEqual({
      kind: "rejected",
      message: "It is not time to answer.",
    });
  });

  it("ignores an answer from someone with no seat", () => {
    const { state } = start("ana", "bo", "cy");
    // Their turn by the order, but they are no longer at the table.
    const without = seats("bo", "cy");
    expect(answerBy(state, "ana", "milk", without)).toEqual({ kind: "ignored" });
  });

  it("trims an over-long answer rather than refusing it", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "m".repeat(MAX_ANSWER_LENGTH + 40), seatList);
    const view = viewFor(state, host, seatList) as ReviewingView;
    expect(view.pending.text).toHaveLength(MAX_ANSWER_LENGTH);
  });
});

describe("repeats", () => {
  it("refuses something already said and lets the player try again", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerAndAccept(state, "ana", "milk", seatList);

    expect(answerBy(state, "bo", "milk", seatList)).toEqual({
      kind: "rejected",
      message: '"milk" has already been said.',
    });
    // Still their turn: a repeat costs time, not your place.
    expect(whoseTurn(state, seatList)).toBe("bo");
    expect(state.said).toHaveLength(1);

    answerAndAccept(state, "bo", "butter", seatList);
    expect(state.said.map((said) => said.text)).toEqual(["milk", "butter"]);
  });

  it("ignores case and spacing when comparing", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerAndAccept(state, "ana", "Milk", seatList);

    expect(answerBy(state, "bo", "  mILk  ", seatList)).toMatchObject({
      kind: "rejected",
    });
  });

  it("does not count an answer that was thrown out as said", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    send(state, { t: "vote", ok: false }, player("cy"), seatList);

    expect(state.said).toEqual([]);
    // So the next player may use it.
    expect(answerBy(state, "bo", "milk", seatList)).toMatchObject({ kind: "changed" });
  });
});

describe("running out of time", () => {
  it("puts the active player out and moves on", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    hotPotato.onDeadline(state, context(seatList, NOW + TURN_SECONDS * 1000));

    const view = viewFor(state, host, seatList) as AnsweringView;
    expect(view.lastOut).toEqual({ playerId: "ana", name: "ANA", reason: "timeout" });
    expect(view.alive.map((entry) => entry.playerId)).toEqual(["bo", "cy"]);
    expect(view.activePlayerId).toBe("bo");
  });

  it("lets the host cut a turn short with the same effect", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "skip" }, host, seatList)).toEqual({ kind: "changed" });
    expect(state.lastOut?.reason).toBe("timeout");
  });

  it("refuses skip from a player", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "skip" }, player("ana"), seatList)).toBe(NOT_HOST);
  });
});

describe("the challenge window", () => {
  it("holds the answer for review while three or more are still in", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);

    const view = viewFor(state, host, seatList) as ReviewingView;
    expect(view.phase).toBe("reviewing");
    expect(view.pending).toEqual({ playerId: "ana", name: "ANA", text: "milk" });
    expect(hotPotato.deadline(state)).toBe(NOW + REVIEW_SECONDS * 1000);
  });

  it("offers the button to other players still in, and nobody else", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);

    const forBo = viewFor(state, player("bo"), seatList) as ReviewingView;
    const forAna = viewFor(state, player("ana"), seatList) as ReviewingView;
    const forHost = viewFor(state, host, seatList) as ReviewingView;

    expect(forBo.canChallenge).toBe(true);
    expect(forAna.canChallenge).toBe(false);
    expect(forHost.canChallenge).toBe(false);
  });

  it("accepts the answer and pays for it when the window lapses", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);
    hotPotato.onDeadline(state, context(seatList, NOW + REVIEW_SECONDS * 1000));

    expect(state.said.map((said) => said.text)).toEqual(["milk"]);
    expect(state.scores["ana"]).toBe(POINTS_PER_ANSWER);
    expect(whoseTurn(state, seatList)).toBe("bo");
  });

  it("is skipped entirely once only two are left, since nobody could judge", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    hotPotato.onDeadline(state, context(seatList, NOW)); // ana times out

    expect(state.alive).toEqual(["bo", "cy"]);
    answerBy(state, "bo", "milk", seatList);
    // Straight to the next turn, no review.
    expect(state.stage.phase).toBe("answering");
    expect(whoseTurn(state, seatList)).toBe("cy");
  });

  it("refuses a challenge when there is nothing to challenge", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "challenge" }, player("bo"), seatList)).toEqual({
      kind: "rejected",
      message: "There is nothing to challenge.",
    });
  });

  it("refuses to let you challenge your own answer", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);
    expect(send(state, { t: "challenge" }, player("ana"), seatList)).toEqual({
      kind: "rejected",
      message: "You cannot challenge your own answer.",
    });
  });

  it("refuses a challenge from someone already out of the round", () => {
    const { state, seatList } = start("ana", "bo", "cy", "dee");
    hotPotato.onDeadline(state, context(seatList, NOW)); // ana out
    answerBy(state, "bo", "milk", seatList);

    expect(send(state, { t: "challenge" }, player("ana"), seatList)).toEqual({
      kind: "rejected",
      message: "You are out of this round.",
    });
  });

  it("ignores a challenge from the host or from someone with no seat", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);

    expect(send(state, { t: "challenge" }, host, seatList)).toEqual({ kind: "ignored" });
    expect(send(state, { t: "challenge" }, player("bo"), seats("ana", "cy"))).toEqual({
      kind: "ignored",
    });
  });
});

describe("judging a challenge", () => {
  it("asks everyone except the two arguing", () => {
    const { state, seatList } = start("ana", "bo", "cy", "dee");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);

    const view = viewFor(state, host, seatList) as VotingView;
    expect(view.phase).toBe("voting");
    expect(view.pending.playerId).toBe("ana");
    expect(view.challenger).toEqual({ playerId: "bo", name: "BO" });
    expect(hotPotato.deadline(state)).toBe(NOW + VOTE_SECONDS * 1000);

    expect((viewFor(state, player("cy"), seatList) as VotingView).canVote).toBe(true);
    expect((viewFor(state, player("ana"), seatList) as VotingView).canVote).toBe(false);
    expect((viewFor(state, player("bo"), seatList) as VotingView).canVote).toBe(false);
    expect((viewFor(state, host, seatList) as VotingView).canVote).toBe(false);
  });

  it("throws the answer out, and the answerer with it, when the table agrees", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    send(state, { t: "vote", ok: false }, player("cy"), seatList);

    expect(state.lastOut).toEqual({ playerId: "ana", name: "ANA", reason: "challenged" });
    expect(state.alive).toEqual(["bo", "cy"]);
    expect(state.said).toEqual([]);
    expect(state.scores["ana"]).toBeUndefined();
    expect(whoseTurn(state, seatList)).toBe("bo");
  });

  it("puts the challenger out when the table says the answer was fine", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    send(state, { t: "vote", ok: true }, player("cy"), seatList);

    expect(state.lastOut).toEqual({
      playerId: "bo",
      name: "BO",
      reason: "bad_challenge",
    });
    expect(state.alive).toEqual(["ana", "cy"]);
    // The answer stood, so it counts and it pays.
    expect(state.said.map((said) => said.text)).toEqual(["milk"]);
    expect(state.scores["ana"]).toBe(POINTS_PER_ANSWER);
    expect(whoseTurn(state, seatList)).toBe("cy");
  });

  it("gives the answer the benefit of the doubt on a tie", () => {
    const { state, seatList } = start("ana", "bo", "cy", "dee");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    send(state, { t: "vote", ok: true }, player("cy"), seatList);
    send(state, { t: "vote", ok: false }, player("dee"), seatList);

    expect(state.lastOut?.playerId).toBe("bo");
    expect(state.said.map((said) => said.text)).toEqual(["milk"]);
  });

  it("does the same when the clock runs out with nobody having voted", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    hotPotato.onDeadline(state, context(seatList, NOW + VOTE_SECONDS * 1000));

    expect(state.lastOut?.playerId).toBe("bo");
    expect(state.said.map((said) => said.text)).toEqual(["milk"]);
  });

  it("settles at once if every possible judge has dropped", () => {
    const { state } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seats("ana", "bo", "cy"));
    // cy is the only judge, and their phone is gone before the challenge.
    const dropped = seats("ana", "bo", "cy!");
    send(state, { t: "challenge" }, player("bo"), dropped);

    expect(state.stage.phase).toBe("answering");
    expect(state.lastOut?.playerId).toBe("bo");
  });

  it("keeps each vote private, publishing only who has voted", () => {
    const { state, seatList } = start("ana", "bo", "cy", "dee");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    send(state, { t: "vote", ok: true }, player("cy"), seatList);

    const forCy = viewFor(state, player("cy"), seatList) as VotingView;
    const forDee = viewFor(state, player("dee"), seatList) as VotingView;

    expect(forCy.voted).toEqual(["cy"]);
    expect(forCy.yourVote).toBe(true);
    // dee can see that cy has voted, but not which way.
    expect(forDee.voted).toEqual(["cy"]);
    expect(forDee.yourVote).toBeNull();
    // The votes record itself must never reach the wire in any shape.
    expect(JSON.stringify(forDee)).not.toContain('"cy":true');
    expect(JSON.stringify(forDee)).not.toContain('"cy":false');
  });

  it("refuses votes from the two people arguing, and from the bystanders", () => {
    const { state, seatList } = start("ana", "bo", "cy", "dee");
    hotPotato.onDeadline(state, context(seatList, NOW)); // ana out on time
    answerBy(state, "bo", "milk", seatList);
    send(state, { t: "challenge" }, player("cy"), seatList);

    expect(send(state, { t: "vote", ok: true }, player("bo"), seatList)).toEqual({
      kind: "rejected",
      message: "You cannot judge your own answer.",
    });
    expect(send(state, { t: "vote", ok: true }, player("cy"), seatList)).toEqual({
      kind: "rejected",
      message: "You cannot judge your own challenge.",
    });
    expect(send(state, { t: "vote", ok: true }, player("ana"), seatList)).toEqual({
      kind: "rejected",
      message: "You are out of this round.",
    });
  });

  it("refuses a vote when no challenge is running, and ignores one from the host", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "vote", ok: true }, player("bo"), seatList)).toEqual({
      kind: "rejected",
      message: "There is no challenge to judge.",
    });
    expect(send(state, { t: "vote", ok: true }, host, seatList)).toEqual({
      kind: "ignored",
    });
  });

  it("lets the host settle a challenge early", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    expect(send(state, { t: "skip" }, host, seatList)).toEqual({ kind: "changed" });
    expect(state.lastOut?.playerId).toBe("bo");
  });
});

describe("a dropped phone", () => {
  it("puts the active player out rather than waiting forever", () => {
    const { state } = start("ana", "bo", "cy");
    const dropped = seats("ana!", "bo", "cy");

    expect(hotPotato.onSeatsChanged?.(state, context(dropped, NOW))).toEqual({
      kind: "changed",
    });
    expect(state.lastOut).toEqual({ playerId: "ana", name: "ANA", reason: "left" });
    expect(whoseTurn(state, dropped)).toBe("bo");
  });

  it("clears a whole row of dropped players in one pass", () => {
    const { state } = start("ana", "bo", "cy");
    const dropped = seats("ana!", "bo!", "cy");

    hotPotato.onSeatsChanged?.(state, context(dropped, NOW));

    // ana and bo both go; cy is left alone, which ends the round.
    expect(state.alive).toEqual(["cy"]);
    expect(state.stage.phase).toBe("round_over");
    expect(state.scores["cy"]).toBe(POINTS_PER_ROUND);
  });

  it("leaves a dropped player alone when it is not their turn", () => {
    const { state } = start("ana", "bo", "cy");
    const dropped = seats("ana", "bo!", "cy");

    expect(hotPotato.onSeatsChanged?.(state, context(dropped, NOW))).toEqual({
      kind: "ignored",
    });
    expect(state.alive).toEqual(["ana", "bo", "cy"]);
  });

  it("removes someone who gave up their seat altogether", () => {
    const { state } = start("ana", "bo", "cy", "dee");
    const gone = seats("ana", "cy", "dee"); // bo left the room

    expect(hotPotato.onSeatsChanged?.(state, context(gone, NOW))).toEqual({
      kind: "changed",
    });
    expect(state.alive).toEqual(["ana", "cy", "dee"]);
    expect(state.lastOut).toEqual({ playerId: "bo", name: "Someone", reason: "left" });
  });

  it("ends the round when leaving reduces it to one player", () => {
    const { state } = start("ana", "bo", "cy");
    const gone = seats("ana"); // bo and cy both left

    hotPotato.onSeatsChanged?.(state, context(gone, NOW));
    expect(state.stage.phase).toBe("round_over");
    expect(state.scores["ana"]).toBe(POINTS_PER_ROUND);
  });

  it("closes a vote that only the departed had left to cast", () => {
    const { state, seatList } = start("ana", "bo", "cy", "dee");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    send(state, { t: "vote", ok: false }, player("cy"), seatList);
    // dee was the last judge outstanding, and has now dropped.
    const dropped = seats("ana", "bo", "cy", "dee!");

    expect(hotPotato.onSeatsChanged?.(state, context(dropped, NOW))).toEqual({
      kind: "changed",
    });
    expect(state.lastOut?.playerId).toBe("ana");
  });

  it("does nothing once the round is over", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    hotPotato.onDeadline(state, context(seatList, NOW));
    hotPotato.onDeadline(state, context(seats("bo", "cy"), NOW)); // down to one

    expect(state.stage.phase).toBe("round_over");
    expect(hotPotato.onSeatsChanged?.(state, context(seats("bo"), NOW))).toEqual({
      kind: "ignored",
    });
  });
});

describe("winning and scoring", () => {
  it("pays the last player standing", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    hotPotato.onDeadline(state, context(seatList, NOW)); // ana out
    hotPotato.onDeadline(state, context(seatList, NOW)); // bo out

    const view = viewFor(state, host, seatList) as RoundOverView;
    expect(view.phase).toBe("round_over");
    expect(view.winner).toEqual({ playerId: "cy", name: "CY" });
    expect(view.lastRound).toBe(false);
    expect(state.scores["cy"]).toBe(POINTS_PER_ROUND);
    expect(hotPotato.deadline(state)).toBeNull();
  });

  it("pays for every answer that survived, even from someone who went out", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerAndAccept(state, "ana", "milk", seatList);
    answerAndAccept(state, "bo", "butter", seatList);
    answerAndAccept(state, "cy", "jam", seatList);
    hotPotato.onDeadline(state, context(seatList, NOW)); // ana out on her second turn

    expect(state.scores["ana"]).toBe(POINTS_PER_ANSWER);
    expect(state.scores["bo"]).toBe(POINTS_PER_ANSWER);
  });

  it("adds up every answer a player gets in, not just their last", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerAndAccept(state, "ana", "milk", seatList);
    answerAndAccept(state, "bo", "butter", seatList);
    answerAndAccept(state, "cy", "jam", seatList);
    answerAndAccept(state, "ana", "cheese", seatList); // round the circle again

    expect(state.scores["ana"]).toBe(POINTS_PER_ANSWER * 2);
    expect(state.scores["bo"]).toBe(POINTS_PER_ANSWER);
  });

  it("carries scores across rounds and resets the board", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerAndAccept(state, "ana", "milk", seatList);
    hotPotato.onDeadline(state, context(seatList, NOW)); // bo out
    hotPotato.onDeadline(state, context(seatList, NOW)); // cy out, ana wins

    expect(state.stage.phase).toBe("round_over");
    fixedOrder(() => send(state, { t: "next" }, host, seatList));

    expect(state.round).toBe(2);
    expect(state.said).toEqual([]);
    expect(state.alive).toEqual(["ana", "bo", "cy"]);
    expect(state.lastOut).toBeNull();
    // Kept from round one: one answer plus the round win.
    expect(state.scores["ana"]).toBe(POINTS_PER_ANSWER + POINTS_PER_ROUND);
    expect(state.usedCategories).toHaveLength(2);
  });

  it("shows the final standings after the last round", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      hotPotato.onDeadline(state, context(seatList, NOW));
      hotPotato.onDeadline(state, context(seatList, NOW));
      expect(state.stage.phase).toBe("round_over");
      if (round < TOTAL_ROUNDS) {
        expect((viewFor(state, host, seatList) as RoundOverView).lastRound).toBe(false);
      }
      fixedOrder(() => send(state, { t: "next" }, host, seatList));
    }

    const view = viewFor(state, host, seatList);
    expect(view.phase).toBe("final");
    expect(view.standings[0].playerId).toBe("cy");
    expect(hotPotato.deadline(state)).toBeNull();
  });

  it("refuses to move on mid-round, and refuses next from a player", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "next" }, host, seatList)).toEqual({
      kind: "rejected",
      message: "There is nothing to move on from yet.",
    });
    expect(send(state, { t: "next" }, player("ana"), seatList)).toBe(NOT_HOST);
  });

  it("ignores a skip once the round is over", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    hotPotato.onDeadline(state, context(seatList, NOW));
    hotPotato.onDeadline(state, context(seatList, NOW));

    expect(send(state, { t: "skip" }, host, seatList)).toEqual({ kind: "ignored" });
    expect(hotPotato.onDeadline(state, context(seatList, NOW))).toEqual({
      kind: "ignored",
    });
  });

  it("names no winner if the last players leave together", () => {
    const { state } = start("ana", "bo", "cy");
    hotPotato.onSeatsChanged?.(state, context(seats(), NOW));

    const view = viewFor(state, host, seats()) as RoundOverView;
    expect(view.winner).toBeNull();
    expect(view.standings).toEqual([]);
  });

  /**
   * The host can press on after the whole table has walked out, which deals a
   * round to nobody. It has to end on its own rather than sit on a clock that
   * can never be answered.
   */
  it("ends a round dealt to an empty table instead of hanging", () => {
    const { state } = start("ana", "bo", "cy");
    const empty = seats();
    hotPotato.onSeatsChanged?.(state, context(empty, NOW));
    expect(state.stage.phase).toBe("round_over");

    send(state, { t: "next" }, host, empty);
    expect(state.stage.phase).toBe("answering");
    expect(state.alive).toEqual([]);

    const view = viewFor(state, host, empty) as AnsweringView;
    expect(view.activePlayerId).toBeNull();
    expect(view.activeName).toBeNull();

    expect(hotPotato.onDeadline(state, context(empty, NOW))).toEqual({ kind: "changed" });
    expect(state.stage.phase).toBe("round_over");
  });

  it("sorts standings by score, then by name", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    answerAndAccept(state, "ana", "milk", seatList);

    const view = viewFor(state, host, seatList);
    expect(view.standings.map((entry) => entry.playerId)).toEqual(["ana", "bo", "cy"]);
    expect(view.standings[0].score).toBe(POINTS_PER_ANSWER);
  });
});

describe("shared helpers", () => {
  it("isYourTurn only for the active player", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    const view = viewFor(state, player("ana"), seatList) as AnsweringView;

    expect(isYourTurn(view, "ana")).toBe(true);
    expect(isYourTurn(view, "bo")).toBe(false);
    expect(isYourTurn(view, null)).toBe(false);
  });

  it("hasVoted reads the published list", () => {
    const { state, seatList } = start("ana", "bo", "cy", "dee");
    answerBy(state, "ana", "milk", seatList);
    send(state, { t: "challenge" }, player("bo"), seatList);
    send(state, { t: "vote", ok: true }, player("cy"), seatList);

    const view = viewFor(state, host, seatList) as VotingView;
    expect(hasVoted(view, "cy")).toBe(true);
    expect(hasVoted(view, "dee")).toBe(false);
    expect(hasVoted(view, null)).toBe(false);
  });
});
