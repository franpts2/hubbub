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
  /** Already rendered as a countdown by the platform; here for game logic. */
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
export type AnyGameClient = GameClient<any>;
