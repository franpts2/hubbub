/**
 * Hot Potato, server side.
 *
 * Name something in the category when it comes round to you. Repeat what has
 * already been said and you can try again; run down the clock and you are out.
 * Anyone still in may challenge an answer, and the rest of the table decides
 * who was right — the loser of that argument goes out, whichever of the two
 * it turns out to be.
 *
 * This is the first game in the room that has a *turn*. Word Wall and Crowd
 * Favourite both move everyone through a phase together, so "waiting for a
 * player" always meant waiting for whoever was slowest. Here it means waiting
 * for one named person, which introduces a failure mode neither of the others
 * can produce: if that person's phone dies, nothing ever moves again. The rule
 * that prevents it is `onSeatsChanged` putting a disconnected active player out
 * of the round rather than waiting for a clock they can no longer see.
 *
 * Three rules are enforced here rather than in the UI, because a client cannot
 * be trusted:
 *   - only the player whose turn it is may answer
 *   - you may not challenge your own answer, nor judge an argument you are in
 *   - a challenge costs the loser their place, so it cannot be spammed for free
 */

import {
  CHANGED,
  IGNORED,
  NOT_HOST,
  rejected,
  type Actor,
  type GameContext,
  type GameDefinition,
  type GameOutcome,
  type Viewer,
} from "../../engine/server";
import { pickCategory } from "./categories";
import {
  MIN_ALIVE_TO_CHALLENGE,
  MIN_PLAYERS,
  POINTS_PER_ANSWER,
  POINTS_PER_ROUND,
  REVIEW_SECONDS,
  TOTAL_ROUNDS,
  TURN_SECONDS,
  VOTE_SECONDS,
  comparable,
  normalizeAnswer,
  parseHotPotatoCommand,
  type HotPotatoCommand,
  type HotPotatoView,
  type Out,
  type OutReason,
  type Player,
  type Said,
  type Standing,
} from "./shared";

interface Challenge {
  challengerId: string;
  challengerName: string;
  /** voter id -> true if they think the answer should stand. Never published. */
  votes: Record<string, boolean>;
}

/**
 * Where the round is, and the data that only makes sense there.
 *
 * A union rather than a `phase` string beside a couple of nullable fields.
 * There is no such thing as reviewing without an answer to review, or a vote
 * without a challenge behind it, so the type says so and no code has to check
 * for a combination that cannot occur. The alternative leaves impossible
 * branches everywhere, and impossible branches are the ones nothing tests.
 */
type Stage =
  | { phase: "answering" }
  | { phase: "reviewing"; pending: Said }
  | { phase: "voting"; pending: Said; challenge: Challenge }
  | { phase: "round_over" }
  | { phase: "final" };

type VotingStage = Extract<Stage, { phase: "voting" }>;

export interface HotPotatoState {
  stage: Stage;
  round: number;
  category: string;
  /** Every category used this game, so no round repeats one. */
  usedCategories: string[];
  /**
   * Turn order, fixed when the round starts and never rewritten.
   *
   * Elimination shrinks `alive` instead, so the circle keeps its shape and a
   * player going out cannot shuffle everyone else's position mid-round.
   */
  order: string[];
  /** Index into `order`. Always points at someone in `alive` while playing. */
  turn: number;
  alive: string[];
  said: Said[];
  /** The most recent elimination this round, for the screen to explain. */
  lastOut: Out | null;
  /** Cumulative, surviving every round. Seats can come and go; scores do not. */
  scores: Record<string, number>;
  endsAt: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fisher-Yates, so turn order is not just the order people joined in. */
function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function nameOf(ctx: GameContext, playerId: string): string {
  return ctx.seats.find((seat) => seat.id === playerId)?.name ?? "Someone";
}

function isConnected(ctx: GameContext, playerId: string): boolean {
  return ctx.seats.some((seat) => seat.id === playerId && seat.connected);
}

/**
 * Whose turn it is, or null when the round has nobody left in it.
 *
 * `turn` is only ever set to an index `advanceTurn` found a live player at, so
 * once anyone is alive the lookup always hits. The null case is not defensive
 * padding: a round can legitimately begin with an empty table if the host
 * presses on after everyone has walked away.
 */
function activeId(state: HotPotatoState): string | null {
  return state.alive.length > 0 ? state.order[state.turn] : null;
}

function beginRound(state: HotPotatoState, ctx: GameContext): void {
  state.stage = { phase: "answering" };
  state.category = pickCategory(state.usedCategories);
  state.usedCategories.push(state.category);
  state.order = shuffle(ctx.seats.map((seat) => seat.id));
  state.turn = 0;
  state.alive = state.order.slice();
  state.said = [];
  state.lastOut = null;
  state.endsAt = ctx.now + TURN_SECONDS * 1000;
}

/**
 * Move to the next player still in.
 *
 * Walks the fixed order rather than a live list, so the rotation is unaffected
 * by how many people have gone out or in what order.
 */
function advanceTurn(state: HotPotatoState): void {
  for (let step = 1; step <= state.order.length; step++) {
    const index = (state.turn + step) % state.order.length;
    if (state.alive.includes(state.order[index])) {
      state.turn = index;
      return;
    }
  }
}

function finishRound(state: HotPotatoState): void {
  const survivor = state.alive[0];
  if (survivor !== undefined) {
    state.scores[survivor] = (state.scores[survivor] ?? 0) + POINTS_PER_ROUND;
  }
  state.stage = { phase: "round_over" };
  state.endsAt = null;
}

/** Hand the turn on, or end the round if there is nobody left to hand it to. */
function continuePlay(state: HotPotatoState, ctx: GameContext): void {
  if (state.alive.length <= 1) {
    finishRound(state);
    return;
  }
  advanceTurn(state);
  state.stage = { phase: "answering" };
  state.endsAt = ctx.now + TURN_SECONDS * 1000;
}

function eliminate(
  state: HotPotatoState,
  playerId: string,
  reason: OutReason,
  ctx: GameContext,
): void {
  state.alive = state.alive.filter((id) => id !== playerId);
  state.lastOut = { playerId, name: nameOf(ctx, playerId), reason };
}

/** The answer survives: it joins the list, and its author is paid for it. */
function accept(state: HotPotatoState, pending: Said, ctx: GameContext): void {
  state.said.push(pending);
  state.scores[pending.playerId] =
    (state.scores[pending.playerId] ?? 0) + POINTS_PER_ANSWER;
  continuePlay(state, ctx);
}

/** Whoever's turn it was does not get to finish it. */
function dropActive(state: HotPotatoState, ctx: GameContext, reason: OutReason): void {
  const active = activeId(state);
  if (active === null) {
    finishRound(state);
    return;
  }
  eliminate(state, active, reason, ctx);
  continuePlay(state, ctx);
}

/**
 * Who is left to judge a challenge: everyone still in except the two arguing.
 *
 * Disconnected players are excluded so a dead phone cannot hold the vote open,
 * which is the same reason the other two games filter on presence.
 */
function judges(state: HotPotatoState, stage: VotingStage, ctx: GameContext): string[] {
  return state.alive.filter(
    (id) =>
      id !== stage.pending.playerId &&
      id !== stage.challenge.challengerId &&
      isConnected(ctx, id),
  );
}

/**
 * Every judge has voted.
 *
 * True when there are no judges at all, which is reachable: the challenge
 * window only opens with three or more still in, but the others can drop
 * between the answer and the challenge. Resolving at once beats holding the
 * table on a vote nobody can cast.
 */
function everyoneVoted(
  state: HotPotatoState,
  stage: VotingStage,
  ctx: GameContext,
): boolean {
  return judges(state, stage, ctx).every((id) => id in stage.challenge.votes);
}

/**
 * Settle the argument. The loser is out either way.
 *
 * A tie, or a vote nobody cast, leaves the answer standing and the challenger
 * out. Someone has to carry the burden of proof and it belongs with the person
 * who interrupted play.
 */
function resolveChallenge(
  state: HotPotatoState,
  stage: VotingStage,
  ctx: GameContext,
): void {
  const cast = Object.values(stage.challenge.votes);
  const stands = cast.filter((ok) => ok).length;
  const against = cast.length - stands;

  if (against > stands) {
    eliminate(state, stage.pending.playerId, "challenged", ctx);
    continuePlay(state, ctx);
    return;
  }
  eliminate(state, stage.challenge.challengerId, "bad_challenge", ctx);
  accept(state, stage.pending, ctx);
}

function standings(state: HotPotatoState, ctx: GameContext): Standing[] {
  return ctx.seats
    .map((seat) => ({
      playerId: seat.id,
      name: seat.name,
      score: state.scores[seat.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function players(state: HotPotatoState, ctx: GameContext): Player[] {
  return state.order
    .filter((id) => state.alive.includes(id))
    .map((id) => ({ playerId: id, name: nameOf(ctx, id) }));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function answer(
  state: HotPotatoState,
  raw: string,
  actor: Actor,
  ctx: GameContext,
): GameOutcome {
  if (actor.role !== "player") return IGNORED;
  if (state.stage.phase !== "answering") return rejected("It is not time to answer.");
  if (activeId(state) !== actor.playerId) return rejected("Wait for your turn.");

  const seat = ctx.seats.find((entry) => entry.id === actor.playerId);
  if (seat === undefined) return IGNORED;

  const text = normalizeAnswer(raw);
  if (text === null) return rejected("Name something first.");

  // Rejected rather than fatal: the clock is still running, so they get to
  // think again. This is the only thing the server can judge on its own.
  if (state.said.some((said) => comparable(said.text) === comparable(text))) {
    return rejected(`"${text}" has already been said.`);
  }

  const pending: Said = { playerId: seat.id, name: seat.name, text };

  // With two left there is nobody who could judge a challenge, so there is no
  // point opening a window for one.
  if (state.alive.length >= MIN_ALIVE_TO_CHALLENGE) {
    state.stage = { phase: "reviewing", pending };
    state.endsAt = ctx.now + REVIEW_SECONDS * 1000;
  } else {
    accept(state, pending, ctx);
  }
  return CHANGED;
}

function challenge(state: HotPotatoState, actor: Actor, ctx: GameContext): GameOutcome {
  if (actor.role !== "player") return IGNORED;
  const stage = state.stage;
  if (stage.phase !== "reviewing") return rejected("There is nothing to challenge.");
  if (!state.alive.includes(actor.playerId)) {
    return rejected("You are out of this round.");
  }
  if (stage.pending.playerId === actor.playerId) {
    return rejected("You cannot challenge your own answer.");
  }

  const seat = ctx.seats.find((entry) => entry.id === actor.playerId);
  if (seat === undefined) return IGNORED;

  const voting: VotingStage = {
    phase: "voting",
    pending: stage.pending,
    challenge: { challengerId: seat.id, challengerName: seat.name, votes: {} },
  };
  state.stage = voting;
  state.endsAt = ctx.now + VOTE_SECONDS * 1000;
  if (everyoneVoted(state, voting, ctx)) resolveChallenge(state, voting, ctx);
  return CHANGED;
}

function vote(
  state: HotPotatoState,
  ok: boolean,
  actor: Actor,
  ctx: GameContext,
): GameOutcome {
  if (actor.role !== "player") return IGNORED;
  const stage = state.stage;
  if (stage.phase !== "voting") return rejected("There is no challenge to judge.");
  if (!state.alive.includes(actor.playerId)) {
    return rejected("You are out of this round.");
  }
  if (actor.playerId === stage.pending.playerId) {
    return rejected("You cannot judge your own answer.");
  }
  if (actor.playerId === stage.challenge.challengerId) {
    return rejected("You cannot judge your own challenge.");
  }

  stage.challenge.votes[actor.playerId] = ok;
  if (everyoneVoted(state, stage, ctx)) resolveChallenge(state, stage, ctx);
  return CHANGED;
}

/** Whatever is running right now, end it the way its clock would have. */
function closeStage(state: HotPotatoState, ctx: GameContext): GameOutcome {
  const stage = state.stage;
  switch (stage.phase) {
    case "answering":
      dropActive(state, ctx, "timeout");
      return CHANGED;
    case "reviewing":
      accept(state, stage.pending, ctx);
      return CHANGED;
    case "voting":
      resolveChallenge(state, stage, ctx);
      return CHANGED;
    default:
      return IGNORED;
  }
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

export const hotPotato: GameDefinition<HotPotatoState, HotPotatoCommand> = {
  id: "hot-potato",
  name: "Hot Potato",
  minPlayers: MIN_PLAYERS,

  create(ctx) {
    const state: HotPotatoState = {
      stage: { phase: "answering" },
      round: 1,
      category: "",
      usedCategories: [],
      order: [],
      turn: 0,
      alive: [],
      said: [],
      lastOut: null,
      scores: {},
      endsAt: null,
    };
    beginRound(state, ctx);
    return state;
  },

  parseCommand: parseHotPotatoCommand,

  apply(state, command, actor, ctx) {
    switch (command.t) {
      case "answer":
        return answer(state, command.text, actor, ctx);

      case "challenge":
        return challenge(state, actor, ctx);

      case "vote":
        return vote(state, command.ok, actor, ctx);

      case "skip":
        if (actor.role !== "host") return NOT_HOST;
        return closeStage(state, ctx);

      case "next": {
        if (actor.role !== "host") return NOT_HOST;
        if (state.stage.phase !== "round_over") {
          return rejected("There is nothing to move on from yet.");
        }
        if (state.round >= TOTAL_ROUNDS) {
          state.stage = { phase: "final" };
          state.endsAt = null;
          return CHANGED;
        }
        state.round += 1;
        beginRound(state, ctx);
        return CHANGED;
      }
    }
  },

  deadline(state) {
    switch (state.stage.phase) {
      case "answering":
      case "reviewing":
      case "voting":
        return state.endsAt;
      default:
        return null;
    }
  },

  onDeadline(state, ctx) {
    return closeStage(state, ctx);
  },

  /**
   * The seam this game exists to test.
   *
   * A turn belongs to one named person, so a dropped phone is not merely slow
   * — it is a round that never ends. Putting them out costs them a round they
   * were not present for anyway, and keeps everyone else playing.
   */
  onSeatsChanged(state, ctx) {
    const stage = state.stage;
    if (stage.phase === "round_over" || stage.phase === "final") return IGNORED;

    let changed = false;

    // Someone who gave up their seat entirely cannot be waited on at all.
    for (const id of state.alive.slice()) {
      if (!ctx.seats.some((seat) => seat.id === id)) {
        eliminate(state, id, "left", ctx);
        changed = true;
      }
    }

    if (state.alive.length <= 1) {
      finishRound(state);
      return CHANGED;
    }

    // A loop rather than a single check, because a whole car full of people
    // can lose signal at once. Each pass puts one player out, so it ends.
    while (state.stage.phase === "answering") {
      const active = activeId(state);
      if (active !== null && isConnected(ctx, active)) break;
      dropActive(state, ctx, "left");
      changed = true;
    }

    if (stage.phase === "voting" && everyoneVoted(state, stage, ctx)) {
      resolveChallenge(state, stage, ctx);
      return CHANGED;
    }

    return changed ? CHANGED : IGNORED;
  },

  view(state, viewer: Viewer, ctx): HotPotatoView {
    const common = {
      round: state.round,
      totalRounds: TOTAL_ROUNDS,
      category: state.category,
      alive: players(state, ctx),
      said: state.said,
      lastOut: state.lastOut,
      standings: standings(state, ctx),
    };
    const stage = state.stage;

    switch (stage.phase) {
      case "answering": {
        const active = activeId(state);
        return {
          ...common,
          phase: "answering",
          activePlayerId: active,
          activeName: active === null ? null : nameOf(ctx, active),
        };
      }

      case "reviewing":
        return {
          ...common,
          phase: "reviewing",
          pending: stage.pending,
          canChallenge:
            viewer.role === "player" &&
            state.alive.includes(viewer.playerId) &&
            viewer.playerId !== stage.pending.playerId,
        };

      case "voting":
        return {
          ...common,
          phase: "voting",
          pending: stage.pending,
          challenger: {
            playerId: stage.challenge.challengerId,
            name: stage.challenge.challengerName,
          },
          voted: Object.keys(stage.challenge.votes),
          canVote:
            viewer.role === "player" &&
            state.alive.includes(viewer.playerId) &&
            viewer.playerId !== stage.pending.playerId &&
            viewer.playerId !== stage.challenge.challengerId,
          // Per-viewer: how the table is leaning must not be visible while the
          // vote is open, so only your own answer comes back to you.
          yourVote: stage.challenge.votes[viewer.playerId] ?? null,
        };

      case "round_over": {
        const survivor = state.alive[0];
        return {
          ...common,
          phase: "round_over",
          winner:
            survivor === undefined
              ? null
              : { playerId: survivor, name: nameOf(ctx, survivor) },
          lastRound: state.round >= TOTAL_ROUNDS,
        };
      }

      case "final":
        return { ...common, phase: "final" };
    }
  },
};
