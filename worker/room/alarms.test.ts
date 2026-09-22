import { describe, expect, it } from "vitest";

import { ROOM_IDLE_MS } from "../../shared/protocol";
import { deadlinePassed, idleExpired, nextAlarmAt } from "./alarms";
import type { StoredRoom } from "./state";

const NOW = 1_000_000_000;

/** Only the two fields the alarm logic reads. */
function at(lastActivity: number, deadline: number | null): StoredRoom {
  return { lastActivity, deadline } as StoredRoom;
}

describe("choosing the next alarm", () => {
  it("uses the game's deadline when it comes first", () => {
    expect(nextAlarmAt(at(NOW, NOW + 60_000), NOW)).toBe(NOW + 60_000);
  });

  it("uses room expiry when no game is running", () => {
    expect(nextAlarmAt(at(NOW, null), NOW)).toBe(NOW + ROOM_IDLE_MS);
  });

  it("uses room expiry when it comes first", () => {
    // A deadline further out than the idle timeout should not delay cleanup.
    const room = at(NOW - ROOM_IDLE_MS + 5_000, NOW + ROOM_IDLE_MS);
    expect(nextAlarmAt(room, NOW)).toBe(NOW + 5_000);
  });

  /**
   * The containment guard. A game that advertises a deadline in the past but
   * does not act when woken would otherwise be scheduled for "now", forever,
   * burning duration on a timer nobody can see.
   */
  it("never schedules in the past, degrading a spin into a slow poll", () => {
    expect(nextAlarmAt(at(NOW, NOW - 60_000), NOW)).toBe(NOW + 1_000);
    expect(nextAlarmAt(at(NOW - ROOM_IDLE_MS - 1, null), NOW)).toBe(NOW + 1_000);
  });

  it("floors a deadline that is imminent but not yet due", () => {
    expect(nextAlarmAt(at(NOW, NOW + 400), NOW)).toBe(NOW + 1_000);
  });

  it("leaves a normal round untouched by the floor", () => {
    for (const seconds of [2, 5, 30, 60, 300]) {
      const deadline = NOW + seconds * 1000;
      expect(nextAlarmAt(at(NOW, deadline), NOW)).toBe(deadline);
    }
  });
});

describe("has the deadline passed", () => {
  it("is false with no deadline set", () => {
    expect(deadlinePassed(at(NOW, null), NOW)).toBe(false);
  });

  it("is false well before the deadline", () => {
    expect(deadlinePassed(at(NOW, NOW + 10_000), NOW)).toBe(false);
  });

  it("is true at and after the deadline", () => {
    expect(deadlinePassed(at(NOW, NOW), NOW)).toBe(true);
    expect(deadlinePassed(at(NOW, NOW - 5_000), NOW)).toBe(true);
  });

  /**
   * Alarms can fire a little early. Without slack the round would not end and
   * would have to wait for the next alarm, stranding everyone on a dead timer.
   */
  it("tolerates an alarm that fires slightly early", () => {
    expect(deadlinePassed(at(NOW, NOW + 200), NOW)).toBe(true);
    expect(deadlinePassed(at(NOW, NOW + 250), NOW)).toBe(true);
    expect(deadlinePassed(at(NOW, NOW + 251), NOW)).toBe(false);
  });
});

describe("has the room expired", () => {
  it("is false while there has been recent activity", () => {
    expect(idleExpired(at(NOW, null), NOW)).toBe(false);
    expect(idleExpired(at(NOW - ROOM_IDLE_MS + 1, null), NOW)).toBe(false);
  });

  it("is true once the idle window has elapsed", () => {
    expect(idleExpired(at(NOW - ROOM_IDLE_MS, null), NOW)).toBe(true);
    expect(idleExpired(at(NOW - ROOM_IDLE_MS * 2, null), NOW)).toBe(true);
  });
});
