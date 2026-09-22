/**
 * Helpers for testing the room, plus a fake game to test it *against*.
 *
 * The fake is the important part. Exercising the platform with Word Wall would
 * prove only that the platform works with Word Wall — and would quietly let a
 * Word Wall assumption leak back into `worker/room/` without any test
 * noticing. A stand-in game with different phases, different commands and a
 * different view shape is what actually pins down "the room is game-agnostic".
 *
 * Test-only: nothing here is imported by shipping code.
 */

import type { GameDefinition } from "../../engine/server";
import { CHANGED, IGNORED, NOT_HOST, rejected } from "../../engine/server";
import type { Role } from "../../shared/protocol";
import { createRoom, type IsConnected, type StoredRoom } from "./state";

// ---------------------------------------------------------------------------
// A fake game, deliberately unlike Word Wall
// ---------------------------------------------------------------------------

export interface FakeState {
  /** Nothing like a Word Wall phase, on purpose. */
  step: "counting" | "done";
  count: number;
  /** Only ever shown to the host, to test the role split. */
  secret: string;
  expiresAt: number | null;
}

export type FakeCommand = { t: "bump" } | { t: "finish" };

export interface FakeView {
  step: string;
  count: number;
  secret: string | null;
}

/** Records what the platform asked of the game, so delegation can be asserted. */
export interface FakeCalls {
  create: number;
  deadline: number;
  onDeadline: number;
  onSeatsChanged: number;
  view: Role[];
  seatsSeen: number[];
}

export function fakeGame(): {
  game: GameDefinition<FakeState, FakeCommand>;
  calls: FakeCalls;
} {
  const calls: FakeCalls = {
    create: 0,
    deadline: 0,
    onDeadline: 0,
    onSeatsChanged: 0,
    view: [],
    seatsSeen: [],
  };

  const game: GameDefinition<FakeState, FakeCommand> = {
    id: "word-wall", // the only id the registry knows; irrelevant to these tests
    name: "Fake Game",

    create(ctx) {
      calls.create += 1;
      calls.seatsSeen.push(ctx.seats.length);
      return {
        step: "counting",
        count: 0,
        secret: "host-only",
        expiresAt: ctx.now + 5_000,
      };
    },

    parseCommand(raw) {
      if (typeof raw !== "object" || raw === null) return null;
      const command = raw as { t?: unknown };
      if (command.t === "bump") return { t: "bump" };
      if (command.t === "finish") return { t: "finish" };
      return null;
    },

    apply(state, command, actor, ctx) {
      calls.seatsSeen.push(ctx.seats.length);
      if (command.t === "finish") {
        if (actor.role !== "host") return NOT_HOST;
        state.step = "done";
        state.expiresAt = null;
        return CHANGED;
      }
      if (state.step === "done") return rejected("Already finished.");
      if (actor.role === "host") return IGNORED;
      state.count += 1;
      return CHANGED;
    },

    deadline(state) {
      calls.deadline += 1;
      return state.step === "counting" ? state.expiresAt : null;
    },

    onDeadline(state) {
      calls.onDeadline += 1;
      if (state.step === "done") return IGNORED;
      state.step = "done";
      state.expiresAt = null;
      return CHANGED;
    },

    onSeatsChanged(state, ctx) {
      calls.onSeatsChanged += 1;
      calls.seatsSeen.push(ctx.seats.length);
      // Finish once nobody is left connected.
      if (state.step === "done") return IGNORED;
      if (ctx.seats.some((seat) => seat.connected)) return IGNORED;
      state.step = "done";
      return CHANGED;
    },

    view(state, role): FakeView {
      calls.view.push(role);
      return {
        step: state.step,
        count: state.count,
        secret: role === "host" ? state.secret : null,
      };
    },
  };

  return { game, calls };
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/**
 * A room with a roster, described the same way as `engine/testing`'s seats:
 * a trailing `!` marks someone whose phone has dropped.
 */
export function room(...roster: string[]): {
  stored: StoredRoom;
  isConnected: IsConnected;
} {
  const stored = createRoom("ABCD", "secret-host-token", "word-wall");
  const dropped = new Set<string>();

  for (const entry of roster) {
    const connected = !entry.endsWith("!");
    const id = connected ? entry : entry.slice(0, -1);
    if (!connected) dropped.add(id);
    stored.players.push({ id, name: id.toUpperCase(), joinedAt: 0 });
  }

  return {
    stored,
    isConnected: (playerId) =>
      stored.players.some((p) => p.id === playerId) && !dropped.has(playerId),
  };
}

/** Puts a room into a running game, as `start_game` would. */
export function playing(
  stored: StoredRoom,
  game: GameDefinition<FakeState, FakeCommand>,
  isConnected: IsConnected,
): void {
  stored.status = "playing";
  stored.game = game.create({
    seats: stored.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: isConnected(p.id),
    })),
    now: Date.now(),
  });
  stored.deadline = game.deadline(stored.game as FakeState);
}
