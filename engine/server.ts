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
 * Caveat worth writing down: this interface was derived from exactly one game,
 * so it is a hypothesis, not a proven abstraction. It was kept as small as
 * Word Wall allows — there is deliberately no scoring, no teams, no private
 * per-player state and no cross-round bookkeeping here, because guessing at
 * those would produce an interface that fits one imaginary game rather than
 * two real ones. Expect to change it when the second game lands.
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
   * What this role is allowed to see. The only place hidden information is
   * withheld, so it is the only place a leak can happen.
   */
  view(state: State, role: Role, ctx: GameContext): unknown;
}

/**
 * A game with its type parameters erased, so one registry can hold several.
 *
 * `any` is load-bearing rather than lazy here: the platform stores state
 * opaquely and forwards commands without inspecting either, so it genuinely
 * cannot name these types. Inside a game module everything stays fully typed,
 * and this is the single boundary where that is given up.
 */
export type AnyGame = GameDefinition<any, any>;
