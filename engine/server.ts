/**
 * What a game has to provide the server, and nothing more.
 *
 * The division of labour: the platform owns the room — codes, seats, names,
 * presence, sockets, persistence, broadcasting, and the Durable Object's
 * single alarm slot. A game owns what happens once the host presses start.
 *
 * A game never touches a socket, never writes to storage and never schedules
 * an alarm. It is handed a snapshot of who is at the table, mutates its own
 * state, and reports what happened. The platform decides what that means for
 * persistence and fan-out. This is what keeps a game portable and keeps the
 * room machinery reusable.
 *
 * History worth keeping, because it is the argument for not guessing: this
 * interface was first derived from Word Wall alone, and deliberately had no
 * scoring, no teams, no private per-player state and no cross-round
 * bookkeeping, on the grounds that inventing them would fit an imaginary game
 * rather than a real one.
 *
 * Crowd Favourite then needed exactly two changes, and only two:
 *   - `view` became per-viewer rather than per-role, because a game showing an
 *     anonymous list must privately tell each player which entry is theirs.
 *   - `minPlayers`, because a voting game does not work with one player.
 *
 * Everything else it needed — three phases, cross-round scoring, shuffling,
 * opaque answer ids — it expressed in its own state with no engine support at
 * all. That is the evidence that the opaque-state seam is in the right place.
 */

import type { Role } from "../shared/protocol";
import type { GameId } from "./ids";

/** A seat at the table, as the game sees it. */
export interface Seat {
  id: string;
  name: string;
  /** False while their phone is reconnecting. They keep their seat. */
  connected: boolean;
}

/**
 * The room as it stands right now, passed in rather than held, so a game has
 * no way to cache a stale roster across a hibernation.
 */
export interface GameContext {
  seats: readonly Seat[];
  now: number;
}

/** Who sent a command. `playerId` is `"host"` for the shared screen. */
export interface Actor {
  playerId: string;
  role: Role;
}

/**
 * Who a snapshot is being built for. `playerId` is `"host"` for the shared
 * screen, which never holds a seat.
 *
 * Structurally identical to `Actor`, and spelled out separately rather than
 * aliased so that type errors name the one the call site meant. "Who did
 * this" and "who is this for" are different questions, and a game's `view` is
 * the one place where confusing them would leak information.
 */
export interface Viewer {
  playerId: string;
  role: Role;
}

/**
 * What a game did. The platform turns "changed" into persist + broadcast, and
 * a rejection into a message sent to the one client that asked.
 */
export type GameOutcome =
  { kind: "changed" } | { kind: "ignored" } | { kind: "rejected"; message: string };

export const CHANGED: GameOutcome = { kind: "changed" };
export const IGNORED: GameOutcome = { kind: "ignored" };

export function rejected(message: string): GameOutcome {
  return { kind: "rejected", message };
}

/** Shared because host authority is a platform idea, phrased the same everywhere. */
export const NOT_HOST: GameOutcome = rejected("Only the host screen can do that.");

export interface GameDefinition<State, Command> {
  readonly id: GameId;
  /** Shown in the lobby so players know what is about to start. */
  readonly name: string;

  /**
   * Fewest seats this game needs to work at all.
   *
   * The platform enforces it on `start_game` and the lobby uses it to explain
   * why the button is disabled. A game that needs people to vote on each
   * other's answers is simply broken with one player, and that is the game's
   * knowledge, not the room's.
   */
  readonly minPlayers: number;

  /** Fresh state, built when the host starts the game. */
  create(ctx: GameContext): State;

  /**
   * Narrow an untrusted value off the wire into a command this game accepts.
   * Return null to reject it. The platform does no validation of its own here
   * beyond having parsed the JSON envelope.
   */
  parseCommand(raw: unknown): Command | null;

  /** Apply a command, mutating `state`. */
  apply(state: State, command: Command, actor: Actor, ctx: GameContext): GameOutcome;

  /**
   * Epoch ms at which `onDeadline` should run, or null for no timer.
   *
   * The game says *when*; the platform owns the alarm and multiplexes this
   * against room expiry. Re-read after every change, so a game only has to
   * keep its own state right.
   */
  deadline(state: State): number | null;

  onDeadline(state: State, ctx: GameContext): GameOutcome;

  /**
   * Someone joined, dropped or came back. Optional, but this is how a game
   * avoids waiting on a player who has left the party.
   */
  onSeatsChanged?(state: State, ctx: GameContext): GameOutcome;

  /**
   * What this one viewer is allowed to see. The only place hidden information
   * is withheld, so it is the only place a leak can happen.
   *
   * Keyed on the viewer rather than just their role because "what everyone on
   * a phone sees" is not always enough. A game that shows an anonymous list of
   * answers has to tell each player which one is theirs — nobody else may know
   * that, and the phone cannot work it out for itself. The platform therefore
   * builds one snapshot per connection; see `Room.broadcast`.
   */
  view(state: State, viewer: Viewer, ctx: GameContext): unknown;
}

/**
 * A game with its type parameters erased, so one registry can hold several.
 *
 * `any` is load-bearing rather than lazy here: the platform stores state
 * opaquely and forwards commands without inspecting either, so it genuinely
 * cannot name these types. Inside a game module everything stays fully typed,
 * and this is the single boundary where that is given up.
 *
 * `unknown` cannot stand in: a `GameDefinition<unknown, unknown>` will not
 * accept a `GameDefinition<WordWallState, WordWallCommand>`, because the
 * state and command appear in parameter position.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = GameDefinition<any, any>;
