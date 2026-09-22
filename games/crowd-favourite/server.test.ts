import { describe, expect, it, vi } from "vitest";

import { NOT_HOST } from "../../engine/server";
import { context, host, player, seats } from "../../engine/testing";
import { PROMPTS } from "./prompts";
import { crowdFavourite, type CrowdFavouriteState } from "./server";
import {
  MAX_ANSWER_LENGTH,
  POINTS_PER_VOTE,
  TOTAL_ROUNDS,
  VOTING_SECONDS,
  WRITING_SECONDS,
  hasSubmitted,
  hasVoted,
  type CrowdFavouriteView,
  type ScoresView,
  type VotingView,
  type WritingView,
} from "./shared";

const NOW = 1_000_000;

type SeatList = ReturnType<typeof seats>;

function start(...roster: string[]): { state: CrowdFavouriteState; seatList: SeatList } {
  const seatList = seats(...roster);
  const state = crowdFavourite.create(context(seatList, NOW));
  return { state, seatList };
}

function send(
  state: CrowdFavouriteState,
  raw: unknown,
  actor: Parameters<typeof crowdFavourite.apply>[2],
  seatList: SeatList,
  now = NOW,
) {
  const command = crowdFavourite.parseCommand(raw);
  if (command === null) return { kind: "unparsed" as const };
  return crowdFavourite.apply(state, command, actor, context(seatList, now));
}

function viewFor(
  state: CrowdFavouriteState,
  who: Parameters<typeof crowdFavourite.view>[1],
  seatList: SeatList,
): CrowdFavouriteView {
  return crowdFavourite.view(state, who, context(seatList, NOW)) as CrowdFavouriteView;
}

/** Everyone writes, so the game lands in `voting`. */
function everyoneWrites(state: CrowdFavouriteState, seatList: SeatList): void {
  for (const seat of seatList) {
    if (!seat.connected) continue;
    send(state, { t: "submit", text: `by ${seat.id}` }, player(seat.id), seatList);
  }
}

/** The candidate id belonging to a given player, read off their own view. */
function myCandidate(state: CrowdFavouriteState, id: string, seatList: SeatList): string {
  const view = viewFor(state, player(id), seatList) as VotingView;
  const mine = view.yourCandidateId;
  if (mine === null) throw new Error(`${id} has no candidate`);
  return mine;
}

describe("parseCommand", () => {
  it("accepts the four commands the game defines", () => {
    expect(crowdFavourite.parseCommand({ t: "submit", text: "hi" })).toEqual({
      t: "submit",
      text: "hi",
    });
    expect(crowdFavourite.parseCommand({ t: "vote", candidateId: "x" })).toEqual({
      t: "vote",
      candidateId: "x",
    });
    expect(crowdFavourite.parseCommand({ t: "skip" })).toEqual({ t: "skip" });
    expect(crowdFavourite.parseCommand({ t: "next" })).toEqual({ t: "next" });
  });

  it("rejects anything else, since the platform does not validate payloads", () => {
    for (const raw of [
      null,
      undefined,
      42,
      "vote",
      [],
      {},
      { t: "explode" },
      { t: "submit" },
      { t: "submit", text: 5 },
      { t: "vote" },
      { t: "vote", candidateId: 7 },
    ]) {
      expect(crowdFavourite.parseCommand(raw), JSON.stringify(raw) ?? "undefined").toBe(
        null,
      );
    }
  });
});

describe("create", () => {
  it("opens on round one, writing, with a prompt and a timer", () => {
    const { state } = start("ana", "bo", "cy");

    expect(state.phase).toBe("writing");
    expect(state.round).toBe(1);
    expect(PROMPTS).toContain(state.prompt);
    expect(state.endsAt).toBe(NOW + WRITING_SECONDS * 1000);
    expect(state.entries).toEqual([]);
    expect(state.scores).toEqual({});
  });
});

describe("writing", () => {
  it("accepts one answer per player and reports progress", () => {
    const { state, seatList } = start("ana", "bo", "cy");

    expect(
      send(state, { t: "submit", text: "  mine  " }, player("ana"), seatList),
    ).toEqual({ kind: "changed" });

    expect(state.entries).toHaveLength(1);
    // Trimmed by the shared normalizer, like every other text field.
    expect(state.entries[0].text).toBe("mine");
    expect(state.entries[0].playerId).toBe("ana");
  });

  it("overwrites a re-submission instead of adding a second answer", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "submit", text: "first" }, player("ana"), seatList);
    const id = state.entries[0].id;

    send(state, { t: "submit", text: "second" }, player("ana"), seatList);

    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].text).toBe("second");
    // Same id, so a rewrite is not a different answer on the ballot.
    expect(state.entries[0].id).toBe(id);
  });

  it("rejects an empty answer", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    const outcome = send(state, { t: "submit", text: "   " }, player("ana"), seatList);

    expect(outcome.kind).toBe("rejected");
    expect(state.entries).toEqual([]);
  });

  it("truncates to the shared maximum", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "submit", text: "x".repeat(500) }, player("ana"), seatList);

    expect(state.entries[0].text).toHaveLength(MAX_ANSWER_LENGTH);
  });

  it("ignores the host, who has no seat to write from", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "submit", text: "no" }, host, seatList).kind).toBe("ignored");
    expect(state.entries).toEqual([]);
  });

  it("ignores someone with no seat in this room", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "submit", text: "no" }, player("ghost"), seatList).kind).toBe(
      "ignored",
    );
  });

  it("moves to voting once everyone connected has written", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);

    expect(state.phase).toBe("voting");
    expect(state.endsAt).toBe(NOW + VOTING_SECONDS * 1000);
  });

  it("does not wait on a player whose phone has dropped", () => {
    const { state, seatList } = start("ana", "bo", "cy!");
    everyoneWrites(state, seatList);

    // Only ana and bo are here, and both have written.
    expect(state.phase).toBe("voting");
  });

  it("skips voting entirely when fewer than two answers came in", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "submit", text: "only one" }, player("ana"), seatList);

    send(state, { t: "skip" }, host, seatList);

    // Nothing to vote for that is not your own, so voting would be a dead end.
    expect(state.phase).toBe("scores");
    expect(state.endsAt).toBeNull();
  });

  /**
   * Submission order is public: `submitted` is published while writing, so
   * everyone watching the big screen learns who finished first, second,
   * third. A ballot in that same order would hand out authorship for free,
   * which is why the entries are shuffled on the way into voting.
   */
  it("does not put the ballot in submission order", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { state, seatList } = start("ana", "bo", "cy", "di");
      everyoneWrites(state, seatList);
      expect(state.entries.map((entry) => entry.playerId)).not.toEqual([
        "ana",
        "bo",
        "cy",
        "di",
      ]);
    } finally {
      random.mockRestore();
    }
  });

  it("orders the ballot differently from one round to the next", () => {
    // A fixed reordering would be no better than none: it is learnable.
    const orders = new Set<string>();
    for (let attempt = 0; attempt < 50; attempt++) {
      const { state, seatList } = start("ana", "bo", "cy", "di");
      everyoneWrites(state, seatList);
      orders.add(state.entries.map((entry) => entry.playerId).join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("rejects an answer once writing is over", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);

    const outcome = send(state, { t: "submit", text: "late" }, player("ana"), seatList);
    expect(outcome.kind).toBe("rejected");
  });
});

describe("voting", () => {
  function atVote(...roster: string[]) {
    const { state, seatList } = start(...roster);
    everyoneWrites(state, seatList);
    return { state, seatList };
  }

  it("records a vote for someone else's answer", () => {
    const { state, seatList } = atVote("ana", "bo", "cy");
    const bos = myCandidate(state, "bo", seatList);

    expect(send(state, { t: "vote", candidateId: bos }, player("ana"), seatList)).toEqual(
      { kind: "changed" },
    );
    expect(state.votes).toEqual({ ana: bos });
  });

  /**
   * The rule the whole anonymous ballot exists to protect. The phone greys out
   * your own answer, but the phone is not trustworthy: it is a client.
   */
  it("refuses a vote for your own answer", () => {
    const { state, seatList } = atVote("ana", "bo", "cy");
    const mine = myCandidate(state, "ana", seatList);

    const outcome = send(
      state,
      { t: "vote", candidateId: mine },
      player("ana"),
      seatList,
    );

    expect(outcome).toMatchObject({ kind: "rejected" });
    expect(state.votes).toEqual({});
  });

  it("refuses a vote for an answer that is not on the ballot", () => {
    const { state, seatList } = atVote("ana", "bo", "cy");
    const outcome = send(
      state,
      { t: "vote", candidateId: "made-up" },
      player("ana"),
      seatList,
    );

    expect(outcome).toMatchObject({ kind: "rejected" });
    expect(state.votes).toEqual({});
  });

  it("lets a voter change their mind without double-counting", () => {
    const { state, seatList } = atVote("ana", "bo", "cy");
    const bos = myCandidate(state, "bo", seatList);
    const cys = myCandidate(state, "cy", seatList);

    send(state, { t: "vote", candidateId: bos }, player("ana"), seatList);
    send(state, { t: "vote", candidateId: cys }, player("ana"), seatList);

    expect(state.votes).toEqual({ ana: cys });
  });

  it("ignores the host and anyone without a seat", () => {
    const { state, seatList } = atVote("ana", "bo", "cy");
    const bos = myCandidate(state, "bo", seatList);

    expect(send(state, { t: "vote", candidateId: bos }, host, seatList).kind).toBe(
      "ignored",
    );
    expect(
      send(state, { t: "vote", candidateId: bos }, player("ghost"), seatList).kind,
    ).toBe("ignored");
  });

  it("rejects a vote when no vote is running", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(
      send(state, { t: "vote", candidateId: "x" }, player("ana"), seatList).kind,
    ).toBe("rejected");
  });

  it("closes the vote once everyone who can vote has", () => {
    const { state, seatList } = atVote("ana", "bo", "cy");
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "bo", seatList) },
      player("ana"),
      seatList,
    );
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "cy", seatList) },
      player("bo"),
      seatList,
    );
    expect(state.phase).toBe("voting");

    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "ana", seatList) },
      player("cy"),
      seatList,
    );

    expect(state.phase).toBe("scores");
    expect(state.endsAt).toBeNull();
  });

  /**
   * The invariant that lets `everyoneVoted` skip an eligibility check: a
   * ballot never reaches a player with nothing on it they are allowed to
   * pick. If this ever stops holding, the phase would stall until the timer
   * ran out, waiting on a vote that cannot legally be cast.
   */
  it("never opens a vote in which somebody has nothing they may pick", () => {
    for (const roster of [
      ["ana", "bo"],
      ["ana", "bo", "cy"],
      ["ana", "bo", "cy", "di!"],
    ]) {
      const { state, seatList } = atVote(...roster);
      expect(state.phase).toBe("voting");

      for (const seat of seatList) {
        const options = state.entries.filter((entry) => entry.playerId !== seat.id);
        expect(
          options.length,
          `${seat.id} in a room of ${roster.length}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("does not close a vote when nobody is connected to cast one", () => {
    const { state } = atVote("ana", "bo");
    const nobody = seats("ana!", "bo!");

    expect(crowdFavourite.onSeatsChanged!(state, context(nobody, NOW)).kind).toBe(
      "ignored",
    );
    expect(state.phase).toBe("voting");
  });
});

describe("scoring", () => {
  function scored() {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);
    const anas = myCandidate(state, "ana", seatList);
    // Two votes for ana, one for bo.
    send(state, { t: "vote", candidateId: anas }, player("bo"), seatList);
    send(state, { t: "vote", candidateId: anas }, player("cy"), seatList);
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "bo", seatList) },
      player("ana"),
      seatList,
    );
    return { state, seatList, anas };
  }

  it("awards points per vote to the author", () => {
    const { state } = scored();

    expect(state.phase).toBe("scores");
    expect(state.scores).toEqual({
      ana: 2 * POINTS_PER_VOTE,
      bo: POINTS_PER_VOTE,
    });
  });

  /**
   * The two halves of this game's anonymity rule, asserted together because
   * they are only correct as a pair: an author is withheld while the ballot
   * is open and published once it closes. Splitting them into two tests
   * would let either half be deleted while the other kept passing.
   *
   * `playerId` is also what the host screen seeds a player's blob on, so an
   * author going missing from a result is a visual bug as well as a scoring
   * one.
   */
  it("withholds the author during voting and names them in the results", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);

    const ballot = viewFor(state, player("ana"), seatList) as VotingView;
    expect(ballot.phase).toBe("voting");
    for (const candidate of ballot.candidates) {
      // Not `toBeUndefined` on a field: the point is that no key leaks one.
      expect(Object.keys(candidate).sort()).toEqual(["id", "text"]);
    }

    const anas = myCandidate(state, "ana", seatList);
    send(state, { t: "vote", candidateId: anas }, player("bo"), seatList);
    send(state, { t: "vote", candidateId: anas }, player("cy"), seatList);
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "bo", seatList) },
      player("ana"),
      seatList,
    );

    const scores = viewFor(state, host, seatList) as ScoresView;
    expect(scores.phase).toBe("scores");
    expect(scores.results.map((result) => result.playerId).sort()).toEqual([
      "ana",
      "bo",
      "cy",
    ]);
    // The author of an answer is the player it scored for, not just any seat.
    const top = scores.results[0]!;
    expect(top.playerId).toBe("ana");
    expect(top.points).toBe(2 * POINTS_PER_VOTE);
  });

  it("carries scores across rounds", () => {
    const { state, seatList } = scored();
    send(state, { t: "next" }, host, seatList);

    expect(state.round).toBe(2);
    expect(state.phase).toBe("writing");
    // The whole point of a multi-round game.
    expect(state.scores.ana).toBe(2 * POINTS_PER_VOTE);
    // Last round's answers and votes are gone.
    expect(state.entries).toEqual([]);
    expect(state.votes).toEqual({});
  });

  /**
   * Pinned with a fixed `Math.random` rather than by looking for duplicates.
   * A random draw from twenty prompts almost never repeats inside three
   * rounds, so a version that forgot the used list would pass that test most
   * of the time — which is worse than no test. Held at zero, `pickPrompt`
   * always takes the first *unused* prompt, so a forgotten used list shows up
   * as the same prompt three times.
   */
  it("does not repeat a prompt within one game", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { state, seatList } = start("ana", "bo", "cy");
      const seen = [state.prompt];

      for (let round = 1; round < TOTAL_ROUNDS; round++) {
        send(state, { t: "skip" }, host, seatList);
        send(state, { t: "next" }, host, seatList);
        seen.push(state.prompt);
      }

      expect(seen).toEqual(PROMPTS.slice(0, TOTAL_ROUNDS));
      expect(state.usedPrompts).toEqual(seen);
    } finally {
      random.mockRestore();
    }
  });

  it("ends on the final standings after the last round", () => {
    const { state, seatList } = start("ana", "bo", "cy");

    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      send(state, { t: "skip" }, host, seatList);
      send(state, { t: "next" }, host, seatList);
    }

    expect(state.phase).toBe("final");
    expect(state.round).toBe(TOTAL_ROUNDS);
  });

  it("ignores an unwanted vote for an answer that vanished", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);
    state.votes = { ana: "gone" };

    send(state, { t: "skip" }, host, seatList);

    expect(state.phase).toBe("scores");
    expect(state.scores).toEqual({});
  });
});

describe("host control", () => {
  it("refuses skip and next from a player", () => {
    const { state, seatList } = start("ana", "bo", "cy");

    // A game rejection carries a message; the platform is what turns it into
    // a `not_host` code on the wire.
    expect(send(state, { t: "skip" }, player("ana"), seatList)).toEqual(NOT_HOST);
    expect(send(state, { t: "next" }, player("ana"), seatList)).toEqual(NOT_HOST);
  });

  it("ignores skip when there is no phase to end", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "skip" }, host, seatList);
    expect(state.phase).toBe("scores");

    expect(send(state, { t: "skip" }, host, seatList).kind).toBe("ignored");
  });

  it("rejects next before the scores are in", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(send(state, { t: "next" }, host, seatList).kind).toBe("rejected");
  });

  it("ends the vote early, scoring whatever came in", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "bo", seatList) },
      player("ana"),
      seatList,
    );

    send(state, { t: "skip" }, host, seatList);

    expect(state.phase).toBe("scores");
    expect(state.scores).toEqual({ bo: POINTS_PER_VOTE });
  });
});

describe("the timer", () => {
  it("publishes a deadline while writing and voting, and none otherwise", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    expect(crowdFavourite.deadline(state)).toBe(NOW + WRITING_SECONDS * 1000);

    everyoneWrites(state, seatList);
    expect(crowdFavourite.deadline(state)).toBe(NOW + VOTING_SECONDS * 1000);

    send(state, { t: "skip" }, host, seatList);
    expect(crowdFavourite.deadline(state)).toBeNull();
  });

  it("closes writing when the clock runs out", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "submit", text: "a" }, player("ana"), seatList);
    send(state, { t: "submit", text: "b" }, player("bo"), seatList);

    expect(crowdFavourite.onDeadline(state, context(seatList, NOW)).kind).toBe("changed");
    expect(state.phase).toBe("voting");
  });

  it("closes the vote when the clock runs out", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);

    expect(crowdFavourite.onDeadline(state, context(seatList, NOW)).kind).toBe("changed");
    expect(state.phase).toBe("scores");
  });

  it("does nothing once the round is already settled", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "skip" }, host, seatList);

    expect(crowdFavourite.onDeadline(state, context(seatList, NOW)).kind).toBe("ignored");
  });
});

describe("when the roster changes", () => {
  it("closes writing when the last person it was waiting on leaves", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "submit", text: "a" }, player("ana"), seatList);
    send(state, { t: "submit", text: "b" }, player("bo"), seatList);
    expect(state.phase).toBe("writing");

    // cy's phone drops, and everyone still here has written.
    const without = seats("ana", "bo", "cy!");
    expect(crowdFavourite.onSeatsChanged!(state, context(without, NOW)).kind).toBe(
      "changed",
    );
    expect(state.phase).toBe("voting");
  });

  it("closes the vote when the last voter it was waiting on leaves", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "bo", seatList) },
      player("ana"),
      seatList,
    );
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "cy", seatList) },
      player("bo"),
      seatList,
    );

    const without = seats("ana", "bo", "cy!");
    expect(crowdFavourite.onSeatsChanged!(state, context(without, NOW)).kind).toBe(
      "changed",
    );
    expect(state.phase).toBe("scores");
  });

  it("does nothing when nobody is connected at all", () => {
    const { state } = start("ana", "bo");
    const nobody = seats("ana!", "bo!");

    expect(crowdFavourite.onSeatsChanged!(state, context(nobody, NOW)).kind).toBe(
      "ignored",
    );
  });

  it("does nothing during the scores", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "skip" }, host, seatList);

    expect(crowdFavourite.onSeatsChanged!(state, context(seatList, NOW)).kind).toBe(
      "ignored",
    );
  });
});

describe("view", () => {
  it("tells each player which anonymous answer is their own, and nobody else's", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);

    const anaView = viewFor(state, player("ana"), seatList) as VotingView;
    const boView = viewFor(state, player("bo"), seatList) as VotingView;

    // The reason this game needed per-viewer snapshots at all.
    expect(anaView.yourCandidateId).not.toBe(boView.yourCandidateId);
    expect(anaView.candidates.map((c) => c.id).sort()).toEqual(
      boView.candidates.map((c) => c.id).sort(),
    );
  });

  it("never reveals who wrote what while voting is open", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);

    // Authorship is a *mapping*, so the way to keep it is to publish nothing
    // that joins the two halves: candidates carry no identity, and standings
    // carry no reference to a candidate. Asserted on the exact key sets,
    // because a field added later is precisely how this would break.
    for (const who of [host, player("ana"), player("bo"), player("cy")]) {
      const view = viewFor(state, who, seatList) as VotingView;
      for (const candidate of view.candidates) {
        expect(Object.keys(candidate).sort()).toEqual(["id", "text"]);
      }
      for (const standing of view.standings) {
        expect(Object.keys(standing).sort()).toEqual(["name", "playerId", "score"]);
      }
    }
  });

  it("never reveals who voted for what", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);
    const bos = myCandidate(state, "bo", seatList);
    send(state, { t: "vote", candidateId: bos }, player("ana"), seatList);

    // The host sees that ana has voted, never what for.
    const hostView = viewFor(state, host, seatList) as VotingView;
    expect(hostView.voted).toEqual(["ana"]);
    expect(hostView.yourVote).toBeNull();

    // And neither does anybody else.
    const cyView = viewFor(state, player("cy"), seatList) as VotingView;
    expect(cyView.voted).toEqual(["ana"]);
    expect(cyView.yourVote).toBeNull();

    // Only ana is told what ana voted for.
    const anaView = viewFor(state, player("ana"), seatList) as VotingView;
    expect(anaView.yourVote).toBe(bos);
  });

  it("gives a writer their own text back so a reconnect can refill the box", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "submit", text: "mine" }, player("ana"), seatList);

    const anaView = viewFor(state, player("ana"), seatList) as WritingView;
    const boView = viewFor(state, player("bo"), seatList) as WritingView;

    expect(anaView.yourAnswer).toBe("mine");
    expect(boView.yourAnswer).toBeNull();
    // bo learns that ana is done, not what she wrote.
    expect(boView.submitted).toEqual(["ana"]);
    expect(JSON.stringify(boView)).not.toContain("mine");
  });

  it("reveals authors and points once voting is over", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);
    const anas = myCandidate(state, "ana", seatList);
    send(state, { t: "vote", candidateId: anas }, player("bo"), seatList);
    send(state, { t: "skip" }, host, seatList);

    const view = viewFor(state, player("cy"), seatList) as ScoresView;
    expect(view.phase).toBe("scores");
    const winner = view.results.find((result) => result.id === anas);
    expect(winner).toMatchObject({ name: "ANA", votes: 1, points: POINTS_PER_VOTE });
    expect(view.winnerId).toBe(anas);
  });

  it("names no winner when the top answers tie", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "ana", seatList) },
      player("bo"),
      seatList,
    );
    send(
      state,
      { t: "vote", candidateId: myCandidate(state, "bo", seatList) },
      player("ana"),
      seatList,
    );
    send(state, { t: "skip" }, host, seatList);

    const view = viewFor(state, host, seatList) as ScoresView;
    expect(view.winnerId).toBeNull();
  });

  it("names no winner when nobody voted at all", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    everyoneWrites(state, seatList);
    send(state, { t: "skip" }, host, seatList);

    const view = viewFor(state, host, seatList) as ScoresView;
    expect(view.winnerId).toBeNull();
  });

  it("reports empty results when nobody wrote anything", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    send(state, { t: "skip" }, host, seatList);

    const view = viewFor(state, host, seatList) as ScoresView;
    expect(view.results).toEqual([]);
    expect(view.winnerId).toBeNull();
  });

  it("ranks the standings, highest first, breaking ties by name", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    state.scores = { bo: 300, ana: 100, cy: 100 };

    const view = viewFor(state, host, seatList);
    expect(view.standings).toEqual([
      { playerId: "bo", name: "BO", score: 300 },
      { playerId: "ana", name: "ANA", score: 100 },
      { playerId: "cy", name: "CY", score: 100 },
    ]);
  });

  it("scores a player who has not scored yet as zero, not missing", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    const view = viewFor(state, host, seatList);
    expect(view.standings.every((standing) => standing.score === 0)).toBe(true);
  });

  it("flags the last round so the screen can say so", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    state.round = TOTAL_ROUNDS;
    send(state, { t: "skip" }, host, seatList);

    expect((viewFor(state, host, seatList) as ScoresView).lastRound).toBe(true);
  });

  it("carries the standings into the final view", () => {
    const { state, seatList } = start("ana", "bo", "cy");
    state.round = TOTAL_ROUNDS;
    state.scores = { ana: 200 };
    send(state, { t: "skip" }, host, seatList);
    send(state, { t: "next" }, host, seatList);

    const view = viewFor(state, host, seatList);
    expect(view.phase).toBe("final");
    expect(view.standings[0]).toEqual({ playerId: "ana", name: "ANA", score: 200 });
  });
});

describe("shared view helpers", () => {
  it("hasSubmitted only for a player who is in the submitted list", () => {
    const view = { submitted: ["ana"] } as WritingView;
    expect(hasSubmitted(view, "ana")).toBe(true);
    expect(hasSubmitted(view, "bo")).toBe(false);
    // The host has no seat, so it can never be true for them.
    expect(hasSubmitted(view, null)).toBe(false);
  });

  it("hasVoted only for a player who is in the voted list", () => {
    const view = { voted: ["ana"] } as VotingView;
    expect(hasVoted(view, "ana")).toBe(true);
    expect(hasVoted(view, "bo")).toBe(false);
    expect(hasVoted(view, null)).toBe(false);
  });
});
