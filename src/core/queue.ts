import { addDays, weekday, type Day } from "./dates.ts";
import type { Verse } from "./schedule.ts";

/**
 * Verses waiting to be started, in order: entered whenever, each started on the next free
 * `weekday` (one new verse a week) when starting them is on, or by hand
 */
export interface Queued {
  id: string;
  tag: string;
  ref: string;
}

export interface AutoStart {
  enabled: boolean;
  /** 0 Sunday to 6 Saturday */
  weekday: number;
}

export const DEFAULT_AUTO_START: AutoStart = { enabled: true, weekday: 1 };

/**
 * The days the first `count` queued verses start, looking from `from` on: each the next
 * `weekday` that no verse began in the week up to (a week already given a new verse, by hand
 * or from the queue, is passed over). Empty when starting them is off.
 */
export function queueStarts(count: number, verses: readonly Pick<Verse, "start">[], from: Day, autoStart: AutoStart): Day[] {
  if (!autoStart.enabled || count <= 0) return [];
  const starts = verses.map((v) => v.start);
  const taken = (slot: Day) => {
    const after = addDays(slot, -6);
    return starts.some((s) => s >= after && s <= slot);
  };
  let slot = addDays(from, (autoStart.weekday - weekday(from) + 7) % 7);
  const out: Day[] = [];
  while (out.length < count) {
    while (taken(slot)) slot = addDays(slot, 7);
    out.push(slot);
    starts.push(slot);
    slot = addDays(slot, 7);
  }
  return out;
}

/**
 * The queued verses whose day has come by `day`, looking from `checked` (the last day the queue
 * was looked at, so days the app wasn't opened on still start theirs), as verses, and the rest
 */
export function dueFromQueue(
  queue: readonly Queued[],
  verses: readonly Pick<Verse, "start">[],
  checked: Day | undefined,
  day: Day,
  autoStart: AutoStart,
): { started: Verse[]; waiting: Queued[] } {
  const from = checked && checked < day ? checked : day;
  const starts = queueStarts(queue.length, verses, from, autoStart);
  const started: Verse[] = [];
  const waiting: Queued[] = [];
  for (const [i, q] of queue.entries()) {
    const start = starts[i];
    if (start !== undefined && start <= day) started.push({ ...q, start });
    else waiting.push(q);
  }
  return { started, waiting };
}
