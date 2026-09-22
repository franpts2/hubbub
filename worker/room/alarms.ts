/**
 * A Durable Object has exactly one alarm slot, but two deadlines to honour:
 * the end of the current round and the idle timeout that destroys the room.
 * So the alarm is always set to whichever comes first, and every wake-up
 * re-asks both questions.
 */

import { ROOM_IDLE_MS } from "../../shared/protocol";
import type { StoredRoom } from "./state";

/** Slack for early wake-ups, so a round is not left hanging until the next alarm. */
const DEADLINE_SLACK_MS = 250;

export function nextAlarmAt(room: StoredRoom): number {
  const candidates: number[] = [room.lastActivity + ROOM_IDLE_MS];
  if (room.phase === "prompt" && room.deadline !== null) {
    candidates.push(room.deadline);
  }
  return Math.min(...candidates);
}

export function roundExpired(room: StoredRoom, now: number): boolean {
  if (room.phase !== "prompt" || room.deadline === null) return false;
  return now >= room.deadline - DEADLINE_SLACK_MS;
}

export function idleExpired(room: StoredRoom, now: number): boolean {
  return now - room.lastActivity >= ROOM_IDLE_MS;
}
