/**
 * What a game has to provide the browser: two components, one per screen.
 *
 * The platform renders everything around them — the room code, the countdown,
 * the connection badge, the lobby, the name form, the reconnect handling — and
 * hands the game its own view off the wire plus a way to send commands back.
 * A game never opens a socket or knows a route exists.
 */

import type { ComponentType } from "react";

import type { Identity, PublicPlayer } from "../shared/protocol";
import type { GameId } from "./ids";

interface GameViewProps<View> {
  /** Produced by this game's server-side `view`, forwarded untouched. */
  view: View;
  players: readonly PublicPlayer[];
  /**
   * Epoch ms at which whatever is running now runs out, or null when nothing
   * is timed. Display only — the server ends the phase itself.
   *
   * Who draws it differs by screen, which is worth knowing before you reach
   * for it. The host shell puts it in its header, because it has a permanent
   * bar to hang it in and the timer means the same thing all game. A phone
   * has no such bar — each phase fills the screen — so a `PlayerView` places
   * its own `<Countdown deadline={deadline} />` beside whatever it is asking
   * for: the prompt, the ballot label, or centred alone while you watch.
   */
  deadline: number | null;
  /** Send a command this game defined. */
  send: (command: unknown) => void;
}

export interface GameHostProps<View> extends GameViewProps<View> {
  /** Return the room to the lobby — a platform action, offered to the game's UI. */
  onEndGame: () => void;
}

export interface GamePlayerProps<View> extends GameViewProps<View> {
  you: Identity;
}

export interface GameClient<View> {
  readonly id: GameId;
  readonly name: string;
  /** One line shown next to the name when picking a game. */
  readonly tagline: string;
  /**
   * Mirrors the server definition's `minPlayers`, so the lobby can say why it
   * will not start yet. Both sides read it from the game's own shared module,
   * which is what stops the two copies drifting.
   */
  readonly minPlayers: number;
  /** The shared screen. */
  readonly HostView: ComponentType<GameHostProps<View>>;
  /** The phone. */
  readonly PlayerView: ComponentType<GamePlayerProps<View>>;
}

/**
 * Type-erased for the registry, for the same reason as `AnyGame`: the shell
 * forwards an opaque view without reading it. Each game's components are
 * typed against their own view, and this boundary is where that is dropped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameClient = GameClient<any>;
