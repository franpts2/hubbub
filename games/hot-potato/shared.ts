/**
 * Hot Potato's own contract: its limits, its views, its commands.
 *
 * Imported by its server definition and its React components, so the two
 * cannot drift. None of it is visible to the platform, which forwards views
 * and commands without looking inside.
 *
 * The shape worth noticing is that every view carries `activePlayerId` rather
 * than a per-viewer `yourTurn` flag. Whose turn it is has to be public — the
 * whole table is watching one person — so deriving "is that me" on the phone
 * keeps a single source of truth. The genuinely private field is `yourVote`
 * during a challenge, which nobody else may see.
 */

import { normalizeText } from "../../shared/validation";

export const MAX_ANSWER_LENGTH = 60;

/** How long you have to name something once it is your turn. */
export const TURN_SECONDS = 15;

/**
 * The pause after an answer in which someone may challenge it.
 *
 * Short on purpose. It is dead time on every single turn, so it buys the
 * table just enough to react and no more.
 */
export const REVIEW_SECONDS = 4;

export const VOTE_SECONDS = 15;

/** How many rounds before the final standings. */
export const TOTAL_ROUNDS = 3;

/** For surviving to the end of a round. */
export const POINTS_PER_ROUND = 100;

/** For each answer that is accepted, so playing well pays even if you go out. */
export const POINTS_PER_ANSWER = 10;

/**
 * A challenge needs an answerer, a challenger and at least one person left to
 * judge between them, so three is the floor.
 *
 * Read by both the server definition and the client one, so the number the
 * lobby shows and the number the server enforces cannot drift apart.
 */
export const MIN_PLAYERS = 3;

/**
 * Below this many players still in, the challenge window is skipped entirely.
 *
 * Not a style choice: a challenge is decided by the players who are neither
 * the answerer nor the challenger, and with two left there is nobody in that
 * set. Offering the button would open a vote that could never be decided.
 */
export const MIN_ALIVE_TO_CHALLENGE = 3;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** Why someone is out of the current round. */
export type OutReason =
  /** Ran down the clock without naming anything. */
  | "timeout"
  /** Their answer was challenged and the table agreed it did not count. */
  | "challenged"
  /** They challenged an answer and the table said it was fine. */
  | "bad_challenge"
  /** Their phone dropped when their turn came round. */
  | "left";

export interface Player {
  playerId: string;
  name: string;
}

export interface Said {
  playerId: string;
  name: string;
  text: string;
}

/** The last elimination, so the screen can explain the gap in the circle. */
export interface Out extends Player {
  reason: OutReason;
}

export interface Standing extends Player {
  score: number;
}

/** An answer waiting to be accepted, or currently being argued over. */
export interface Pending extends Player {
  text: string;
}

interface Common {
  round: number;
  totalRounds: number;
  category: string;
  /** Everyone still in this round, in turn order. */
  alive: Player[];
  /** Everything accepted so far this round, most recent last. */
  said: Said[];
  /** Null at the start of a round, or once a new answer is in. */
  lastOut: Out | null;
  standings: Standing[];
}

export interface AnsweringView extends Common {
  phase: "answering";
  /** Null only if everyone has somehow gone, which ends the round anyway. */
  activePlayerId: string | null;
  activeName: string | null;
}

export interface ReviewingView extends Common {
  phase: "reviewing";
  pending: Pending;
  /** Whether *this* viewer is allowed to challenge it. False on the host. */
  canChallenge: boolean;
}

export interface VotingView extends Common {
  phase: "voting";
  pending: Pending;
  challenger: Player;
  /** Ids of those who have voted, for progress. Never which way they voted. */
  voted: string[];
  /** Whether this viewer is one of the judges. */
  canVote: boolean;
  /** How you voted. Per-viewer, and never shown to anyone else. */
  yourVote: boolean | null;
}

export interface RoundOverView extends Common {
  phase: "round_over";
  /** Null if the round somehow ended with nobody left standing. */
  winner: Player | null;
  /** True on the last round, so the screen can say so. */
  lastRound: boolean;
}

export interface FinalView extends Common {
  phase: "final";
}

export type HotPotatoView =
  AnsweringView | ReviewingView | VotingView | RoundOverView | FinalView;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type HotPotatoCommand =
  /** player: name something, on your turn */
  | { t: "answer"; text: string }
  /** player: dispute the answer just given */
  | { t: "challenge" }
  /** player: judge a challenge. `ok` means the answer should stand. */
  | { t: "vote"; ok: boolean }
  /** host: end the current phase early */
  | { t: "skip" }
  /** host: from the round summary, start the next round or show the final */
  | { t: "next" };

export function normalizeAnswer(input: unknown): string | null {
  return normalizeText(input, MAX_ANSWER_LENGTH);
}

/**
 * The form two answers are compared in to decide whether one repeats the other.
 *
 * Case and spacing only. Anything cleverer — plurals, synonyms, near misses —
 * is exactly the judgement the challenge mechanic exists to hand back to the
 * players, so it deliberately stops here.
 */
export function comparable(text: string): string {
  return text.toLowerCase();
}

export function parseHotPotatoCommand(raw: unknown): HotPotatoCommand | null {
  if (typeof raw !== "object" || raw === null) return null;
  const command = raw as { t?: unknown; text?: unknown; ok?: unknown };
  switch (command.t) {
    case "challenge":
      return { t: "challenge" };
    case "skip":
      return { t: "skip" };
    case "next":
      return { t: "next" };
    case "answer":
      return typeof command.text === "string"
        ? { t: "answer", text: command.text }
        : null;
    case "vote":
      return typeof command.ok === "boolean" ? { t: "vote", ok: command.ok } : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function isYourTurn(view: AnsweringView, playerId: string | null): boolean {
  return playerId !== null && view.activePlayerId === playerId;
}

export function hasVoted(view: VotingView, playerId: string | null): boolean {
  return playerId !== null && view.voted.includes(playerId);
}
