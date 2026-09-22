/**
 * A Durable Object has exactly one alarm slot, but two deadlines to honour:
 * whatever the active game is waiting for, and the idle timeout that destroys
 * the room. So the alarm is always set to whichever comes first, and every
 * wake-up re-asks both questions.
 *
 * Note this file no longer knows what a "round" is. The game publishes a
 * timestamp through its `deadline`, the room caches it, and the arithmetic
 * here is the same regardless of which game asked.
 */

import { ROOM_IDLE_MS } from "../../shared/protocol";
import type { StoredRoom } from "./state";

/** Slack for early wake-ups, so a deadline is not left hanging until the next alarm. */
const DEADLINE_SLACK_MS = 250;

/**
 * Floor on how soon the next alarm may be, which exists purely to contain a
 * misbehaving game.
 *
 * If a game reports a deadline that has already passed but does not act on it
 * when woken, the naive schedule is "wake immediately", forever — a runaway
 * loop burning duration on a timer nobody can see. That is a bug in the game,
 * but the platform should degrade into a slow poll rather than a hot spin.
 */
const MIN_ALARM_DELAY_MS = 1_000;

export function nextAlarmAt(room: StoredRoom, now: number): number {
  const candidates: number[] = [room.lastActivity + ROOM_IDLE_MS];
  if (room.deadline !== null) candidates.push(room.deadline);
  return Math.max(Math.min(...candidates), now + MIN_ALARM_DELAY_MS);
}

export function deadlinePassed(room: StoredRoom, now: number): boolean {
  if (room.deadline === null) return false;
  return now >= room.deadline - DEADLINE_SLACK_MS;
}

export function idleExpired(room: StoredRoom, now: number): boolean {
  return now - room.lastActivity >= ROOM_IDLE_MS;
}
