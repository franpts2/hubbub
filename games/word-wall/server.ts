/**
 * Word Wall, server side.
 *
 * Everything the platform needs to run this game, and nothing about how it is
 * stored or delivered. Note what is absent: no sockets, no storage, no alarm
 * scheduling, no broadcasting. It mutates its own state and returns an
 * outcome; the room decides what that costs.
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
} from "../../engine/server";
import type { Role } from "../../shared/protocol";
import { pickPrompt } from "./prompts";
import {
  ROUND_SECONDS,
  normalizeAnswer,
  parseWordWallCommand,
  type Answer,
  type WordWallCommand,
  type WordWallPhase,
  type WordWallView,
} from "./shared";

export interface WordWallState {
  phase: WordWallPhase;
  prompt: string;
  answers: Answer[];
  /** Null outside a round. Surfaced to the platform through `deadline`. */
  endsAt: number | null;
}

function beginRound(state: WordWallState, now: number): void {
  state.phase = "prompt";
  state.prompt = pickPrompt(state.prompt);
  // Clearing answers also resets who counts as submitted, which is derived.
  state.answers = [];
  state.endsAt = now + ROUND_SECONDS * 1000;
}

function finishRound(state: WordWallState): void {
  state.phase = "results";
  state.endsAt = null;
}

function hasAnswered(state: WordWallState, playerId: string): boolean {
  return state.answers.some((answer) => answer.playerId === playerId);
}

/**
 * True once everyone still in the room has sent something, which lets the
 * round end early instead of making people watch a timer tick down.
 *
 * Only players who are actually here can be waited on — someone who closed
 * their phone would otherwise stall the round until the full timer expired.
 */
function everyoneAnswered(state: WordWallState, ctx: GameContext): boolean {
  const present = ctx.seats.filter((seat) => seat.connected);
  if (present.length === 0) return false;
  return present.every((seat) => hasAnswered(state, seat.id));
}

function submit(
  state: WordWallState,
  raw: string,
  actor: Actor,
  ctx: GameContext,
): GameOutcome {
  if (actor.role !== "player") return IGNORED;
  if (state.phase !== "prompt") {
    return rejected("There is no round running right now.");
  }

  const seat = ctx.seats.find((entry) => entry.id === actor.playerId);
  if (seat === undefined) return IGNORED;

  const text = normalizeAnswer(raw);
  if (text === null) return rejected("Write something first.");

  // Re-submitting overwrites: players change their mind constantly.
  const answer: Answer = { playerId: seat.id, name: seat.name, text, at: ctx.now };
  const index = state.answers.findIndex((entry) => entry.playerId === seat.id);
  if (index === -1) state.answers.push(answer);
  else state.answers[index] = answer;

  if (everyoneAnswered(state, ctx)) finishRound(state);

  return CHANGED;
}

export const wordWall: GameDefinition<WordWallState, WordWallCommand> = {
  id: "word-wall",
  name: "Word Wall",

  create(ctx) {
    const state: WordWallState = {
      phase: "prompt",
      prompt: "",
      answers: [],
      endsAt: null,
    };
    beginRound(state, ctx.now);
    return state;
  },

  parseCommand: parseWordWallCommand,

  apply(state, command, actor, ctx) {
    switch (command.t) {
      case "submit":
        return submit(state, command.text, actor, ctx);

      case "skip":
        if (actor.role !== "host") return NOT_HOST;
        if (state.phase !== "prompt") return IGNORED;
        finishRound(state);
        return CHANGED;

      case "next":
        if (actor.role !== "host") return NOT_HOST;
        if (state.phase !== "results") return rejected("A round is already running.");
        beginRound(state, ctx.now);
        return CHANGED;
    }
  },

  deadline(state) {
    return state.phase === "prompt" ? state.endsAt : null;
  },

  onDeadline(state) {
    if (state.phase !== "prompt") return IGNORED;
    finishRound(state);
    return CHANGED;
  },

  /** Someone leaving may have been the last one the round was waiting on. */
  onSeatsChanged(state, ctx) {
    if (state.phase !== "prompt") return IGNORED;
    if (!everyoneAnswered(state, ctx)) return IGNORED;
    finishRound(state);
    return CHANGED;
  },

  view(state, role: Role): WordWallView {
    return {
      phase: state.phase,
      prompt: state.prompt,
      submitted: state.answers.map((answer) => answer.playerId),
      // The one place hidden information is withheld.
      answers: role === "host" || state.phase === "results" ? state.answers : [],
    };
  },
};
