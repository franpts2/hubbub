/**
 * Crowd Favourite's own contract: its limits, its views, its commands.
 *
 * Imported by its server definition and its React components, so the two
 * cannot drift. None of it is visible to the platform, which forwards views
 * and commands without looking inside.
 *
 * The shape worth noticing is the split between `writing`, `voting` and
 * `scores` views. They are separate types rather than one type with a `phase`
 * field and a lot of optional properties, so a component that renders the
 * voting screen cannot read a field that only exists during scoring.
 */

import { normalizeText } from "../../shared/validation";

export const MAX_ANSWER_LENGTH = 80;

export const WRITING_SECONDS = 60;
export const VOTING_SECONDS = 45;

/** How many rounds before the final standings. */
export const TOTAL_ROUNDS = 3;

export const POINTS_PER_VOTE = 100;

/**
 * Voting needs someone to vote for other than yourself, so two players is the
 * floor at which the game is playable and three before it is any fun.
 *
 * Read by both the server definition and the client one, so the number the
 * lobby shows and the number the server enforces cannot drift apart.
 */
export const MIN_PLAYERS = 3;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** An answer as offered for voting: no author, by design. */
export interface Candidate {
  /** Opaque and random, so the id cannot be traced back to who wrote it. */
  id: string;
  text: string;
}

/** An answer once voting is over and authorship is safe to reveal. */
export interface Result {
  id: string;
  /**
   * Who wrote it. Absent from `Candidate` above and present here, which is
   * the whole anonymity boundary of this game in one field: during voting
   * nobody may be able to work out an author, and once the votes are in it
   * is the point of the screen.
   *
   * Carried as well as `name` because the name is for reading and the id is
   * for keying, and a reconnecting phone may change the former while keeping
   * the latter. The blob beside the answer is seeded on this.
   */
  playerId: string;
  text: string;
  name: string;
  votes: number;
  points: number;
}

export interface Standing {
  playerId: string;
  name: string;
  score: number;
}

interface Common {
  round: number;
  totalRounds: number;
  prompt: string;
  standings: Standing[];
}

export interface WritingView extends Common {
  phase: "writing";
  /** Ids of players whose answer is in, so both screens can show progress. */
  submitted: string[];
  /** Whether *you* have answered. Null on the host screen. */
  yourAnswer: string | null;
}

export interface VotingView extends Common {
  phase: "voting";
  candidates: Candidate[];
  /** Ids of players who have voted, for progress. Never who they voted for. */
  voted: string[];
  /**
   * Which candidate is yours, so your phone can mark it and refuse it.
   *
   * This is the per-viewer field that the engine's role-keyed views could not
   * express: the list is anonymous, so a phone cannot work this out alone, and
   * nobody else may be told.
   */
  yourCandidateId: string | null;
  /** What you voted for, so the phone can show it. Never anyone else's. */
  yourVote: string | null;
}

export interface ScoresView extends Common {
  phase: "scores";
  results: Result[];
  /** Null when the round produced no clear single winner. */
  winnerId: string | null;
  /** True on the last round, so the screen can say so. */
  lastRound: boolean;
}

export interface FinalView extends Common {
  phase: "final";
}

export type CrowdFavouriteView = WritingView | VotingView | ScoresView | FinalView;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type CrowdFavouriteCommand =
  /** player: send an answer (re-sending overwrites) */
  | { t: "submit"; text: string }
  /** player: vote for a candidate that is not your own */
  | { t: "vote"; candidateId: string }
  /** host: end the current phase early */
  | { t: "skip" }
  /** host: from scores, start the next round or show the final standings */
  | { t: "next" };

export function normalizeAnswer(input: unknown): string | null {
  return normalizeText(input, MAX_ANSWER_LENGTH);
}

export function parseCrowdFavouriteCommand(raw: unknown): CrowdFavouriteCommand | null {
  if (typeof raw !== "object" || raw === null) return null;
  const command = raw as { t?: unknown; text?: unknown; candidateId?: unknown };
  switch (command.t) {
    case "skip":
      return { t: "skip" };
    case "next":
      return { t: "next" };
    case "submit":
      return typeof command.text === "string"
        ? { t: "submit", text: command.text }
        : null;
    case "vote":
      return typeof command.candidateId === "string"
        ? { t: "vote", candidateId: command.candidateId }
        : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function hasSubmitted(view: WritingView, playerId: string | null): boolean {
  return playerId !== null && view.submitted.includes(playerId);
}

export function hasVoted(view: VotingView, playerId: string | null): boolean {
  return playerId !== null && view.voted.includes(playerId);
}
