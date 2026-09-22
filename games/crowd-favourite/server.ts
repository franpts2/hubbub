/**
 * Crowd Favourite, server side.
 *
 * Write an answer, vote for the best one that isn't yours, score over three
 * rounds. Everything it needs beyond Word Wall — three phases, cross-round
 * scores, anonymity, shuffling — it holds in its own state; the platform
 * supplies only seats, a timer slot and a way to reach one viewer at a time.
 *
 * Two rules do the heavy lifting, and both are enforced here rather than in
 * the UI because a client cannot be trusted:
 *   - you may not vote for your own answer
 *   - nobody learns who wrote what until voting is over
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
import { pickPrompt } from "./prompts";
import {
  MIN_PLAYERS,
  POINTS_PER_VOTE,
  TOTAL_ROUNDS,
  VOTING_SECONDS,
  WRITING_SECONDS,
  normalizeAnswer,
  parseCrowdFavouriteCommand,
  type Candidate,
  type CrowdFavouriteCommand,
  type CrowdFavouriteView,
  type Result,
  type Standing,
} from "./shared";

interface Entry {
  /** Random and unrelated to the author, so the id itself reveals nothing. */
  id: string;
  playerId: string;
  name: string;
  text: string;
}

export interface CrowdFavouriteState {
  phase: "writing" | "voting" | "scores" | "final";
  round: number;
  prompt: string;
  /** Every prompt used this game, so no round repeats one. */
  usedPrompts: string[];
  entries: Entry[];
  /** voter id -> entry id. Kept out of every view; only counts are published. */
  votes: Record<string, string>;
  /** Cumulative, surviving every round. Seats can come and go; scores do not. */
  scores: Record<string, number>;
  endsAt: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Short random id for an answer.
 *
 * Only has to be unguessable enough that a client cannot map ids back to
 * authors within one round, and unique within a handful of entries.
 */
function entryId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Fisher-Yates, so the order of the ballot cannot leak submission order. */
function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function present(ctx: GameContext) {
  return ctx.seats.filter((seat) => seat.connected);
}

function beginWriting(state: CrowdFavouriteState, now: number): void {
  state.phase = "writing";
  state.prompt = pickPrompt(state.usedPrompts);
  state.usedPrompts.push(state.prompt);
  state.entries = [];
  state.votes = {};
  state.endsAt = now + WRITING_SECONDS * 1000;
}

/**
 * Moves from writing to voting, or straight past it.
 *
 * With fewer than two answers there is nothing anyone could vote for that is
 * not their own, so voting would be a screen full of nothing. Skipping to the
 * scores is the only honest option.
 */
function closeWriting(state: CrowdFavouriteState, now: number): void {
  if (state.entries.length < 2) {
    state.phase = "scores";
    state.endsAt = null;
    return;
  }
  state.phase = "voting";
  state.entries = shuffle(state.entries);
  state.endsAt = now + VOTING_SECONDS * 1000;
}

/** Awards points and reveals authorship. */
function closeVoting(state: CrowdFavouriteState): void {
  for (const entryIdVoted of Object.values(state.votes)) {
    const entry = state.entries.find((candidate) => candidate.id === entryIdVoted);
    if (entry === undefined) continue;
    state.scores[entry.playerId] = (state.scores[entry.playerId] ?? 0) + POINTS_PER_VOTE;
  }
  state.phase = "scores";
  state.endsAt = null;
}

function voteCount(state: CrowdFavouriteState, id: string): number {
  return Object.values(state.votes).filter((voted) => voted === id).length;
}

/** Everyone still here has answered. */
function everyoneWritten(state: CrowdFavouriteState, ctx: GameContext): boolean {
  const seats = present(ctx);
  if (seats.length === 0) return false;
  return seats.every((seat) => state.entries.some((entry) => entry.playerId === seat.id));
}

/**
 * Everyone still here has voted.
 *
 * No eligibility check is needed, and one used to be here. `closeWriting` is
 * the only way into voting and it diverts to the scores below two answers, so
 * a ballot always has at least two — and since nobody writes twice, every
 * player always has at least one answer they are allowed to pick. Filtering
 * for "can this person vote at all" was therefore dead code that no test
 * could distinguish from its own absence.
 */
function everyoneVoted(state: CrowdFavouriteState, ctx: GameContext): boolean {
  const seats = present(ctx);
  if (seats.length === 0) return false;
  return seats.every((seat) => seat.id in state.votes);
}

function standings(state: CrowdFavouriteState, ctx: GameContext): Standing[] {
  return ctx.seats
    .map((seat) => ({
      playerId: seat.id,
      name: seat.name,
      score: state.scores[seat.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function submit(
  state: CrowdFavouriteState,
  raw: string,
  actor: Actor,
  ctx: GameContext,
): GameOutcome {
  if (actor.role !== "player") return IGNORED;
  if (state.phase !== "writing") return rejected("The writing phase is over.");

  const seat = ctx.seats.find((entry) => entry.id === actor.playerId);
  if (seat === undefined) return IGNORED;

  const text = normalizeAnswer(raw);
  if (text === null) return rejected("Write something first.");

  const existing = state.entries.find((entry) => entry.playerId === seat.id);
  if (existing !== undefined) {
    // Keep the id so a rewrite does not look like a different answer.
    existing.text = text;
    existing.name = seat.name;
  } else {
    state.entries.push({ id: entryId(), playerId: seat.id, name: seat.name, text });
  }

  if (everyoneWritten(state, ctx)) closeWriting(state, ctx.now);
  return CHANGED;
}

function vote(
  state: CrowdFavouriteState,
  candidateId: string,
  actor: Actor,
  ctx: GameContext,
): GameOutcome {
  if (actor.role !== "player") return IGNORED;
  if (state.phase !== "voting") return rejected("There is no vote running.");

  const seat = ctx.seats.find((entry) => entry.id === actor.playerId);
  if (seat === undefined) return IGNORED;

  const target = state.entries.find((entry) => entry.id === candidateId);
  if (target === undefined) return rejected("That answer is not on the ballot.");
  // The rule the anonymous ballot exists to protect. A phone is told which
  // entry is its own so it can grey it out, but the server is what enforces it.
  if (target.playerId === seat.id) {
    return rejected("You cannot vote for your own answer.");
  }

  state.votes[seat.id] = candidateId;
  if (everyoneVoted(state, ctx)) closeVoting(state);
  return CHANGED;
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

export const crowdFavourite: GameDefinition<CrowdFavouriteState, CrowdFavouriteCommand> =
  {
    id: "crowd-favourite",
    name: "Crowd Favourite",
    minPlayers: MIN_PLAYERS,

    create(ctx) {
      const state: CrowdFavouriteState = {
        phase: "writing",
        round: 1,
        prompt: "",
        usedPrompts: [],
        entries: [],
        votes: {},
        scores: {},
        endsAt: null,
      };
      beginWriting(state, ctx.now);
      return state;
    },

    parseCommand: parseCrowdFavouriteCommand,

    apply(state, command, actor, ctx) {
      switch (command.t) {
        case "submit":
          return submit(state, command.text, actor, ctx);

        case "vote":
          return vote(state, command.candidateId, actor, ctx);

        case "skip":
          if (actor.role !== "host") return NOT_HOST;
          if (state.phase === "writing") {
            closeWriting(state, ctx.now);
            return CHANGED;
          }
          if (state.phase === "voting") {
            closeVoting(state);
            return CHANGED;
          }
          return IGNORED;

        case "next": {
          if (actor.role !== "host") return NOT_HOST;
          if (state.phase !== "scores") {
            return rejected("There is nothing to move on from yet.");
          }
          if (state.round >= TOTAL_ROUNDS) {
            state.phase = "final";
            state.endsAt = null;
            return CHANGED;
          }
          state.round += 1;
          beginWriting(state, ctx.now);
          return CHANGED;
        }
      }
    },

    deadline(state) {
      return state.phase === "writing" || state.phase === "voting" ? state.endsAt : null;
    },

    onDeadline(state, ctx) {
      if (state.phase === "writing") {
        closeWriting(state, ctx.now);
        return CHANGED;
      }
      if (state.phase === "voting") {
        closeVoting(state);
        return CHANGED;
      }
      return IGNORED;
    },

    /** Someone leaving may have been the last one a phase was waiting on. */
    onSeatsChanged(state, ctx) {
      if (state.phase === "writing" && everyoneWritten(state, ctx)) {
        closeWriting(state, ctx.now);
        return CHANGED;
      }
      if (state.phase === "voting" && everyoneVoted(state, ctx)) {
        closeVoting(state);
        return CHANGED;
      }
      return IGNORED;
    },

    view(state, viewer: Viewer, ctx): CrowdFavouriteView {
      const common = {
        round: state.round,
        totalRounds: TOTAL_ROUNDS,
        prompt: state.prompt,
        standings: standings(state, ctx),
      };

      switch (state.phase) {
        case "writing": {
          const yours = state.entries.find((entry) => entry.playerId === viewer.playerId);
          return {
            ...common,
            phase: "writing",
            submitted: state.entries.map((entry) => entry.playerId),
            // Your own text comes back so a reconnecting phone can refill the box.
            yourAnswer: yours?.text ?? null,
          };
        }

        case "voting": {
          const candidates: Candidate[] = state.entries.map((entry) => ({
            id: entry.id,
            text: entry.text,
          }));
          const yours = state.entries.find((entry) => entry.playerId === viewer.playerId);
          return {
            ...common,
            phase: "voting",
            candidates,
            voted: Object.keys(state.votes),
            // Per-viewer, and the reason this game needed the engine to change.
            yourCandidateId: yours?.id ?? null,
            yourVote: state.votes[viewer.playerId] ?? null,
          };
        }

        case "scores": {
          const results: Result[] = state.entries
            .map((entry) => {
              const votes = voteCount(state, entry.id);
              return {
                id: entry.id,
                playerId: entry.playerId,
                text: entry.text,
                name: entry.name,
                votes,
                points: votes * POINTS_PER_VOTE,
              };
            })
            .sort((a, b) => b.votes - a.votes);

          // Only call it a winner if one answer is clear of the rest.
          const top = results[0];
          const tied = top !== undefined && results[1]?.votes === top.votes;
          return {
            ...common,
            phase: "scores",
            results,
            winnerId: top !== undefined && top.votes > 0 && !tied ? top.id : null,
            lastRound: state.round >= TOTAL_ROUNDS,
          };
        }

        case "final":
          return { ...common, phase: "final" };
      }
    },
  };
