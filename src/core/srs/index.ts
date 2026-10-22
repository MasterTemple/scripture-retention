import { addDays, addMonths, daysBetween, type Day } from "../dates.ts";
import { boundaries, PHASES, status, type Durations, type Order, type Status, type Verse } from "../schedule.ts";
import { anki } from "./anki.ts";
import { ebisu } from "./ebisu.ts";
import { fsrs } from "./fsrs.ts";
import { leitner, pimsleur } from "./ladder.ts";
import type { AlgorithmId, SrsOptions } from "./options.ts";
import { sm2 } from "./sm2.ts";
import { isPlacing, type Algorithm, type BaseState, type Grade, type LogEntry } from "./types.ts";
import { formatInterval, hash, seeded } from "./util.ts";

export * from "./options.ts";
export * from "./types.ts";
export { describeInterval, formatInterval, formatSteps, parseSteps } from "./util.ts";

/** What scheduling a verse takes: the algorithm, its options, and the fixed schedule's lengths (for placing verses) */
export interface Scheduler {
  algorithm: AlgorithmId;
  durations: Durations;
  srs: SrsOptions;
}

export const ALGORITHMS: Record<Exclude<AlgorithmId, "fixed">, Algorithm<BaseState>> = {
  anki: anki as Algorithm<BaseState>,
  fsrs: fsrs as Algorithm<BaseState>,
  sm2: sm2 as Algorithm<BaseState>,
  leitner: leitner as Algorithm<BaseState>,
  pimsleur: pimsleur as Algorithm<BaseState>,
  ebisu: ebisu as Algorithm<BaseState>,
};

/** Whether an algorithm grades reviews and adapts to them (every one but the fixed schedule) */
export const isAdaptive = (id: AlgorithmId): id is Exclude<AlgorithmId, "fixed"> => id !== "fixed";

/** The grades an algorithm asks for; the fixed schedule only goes on (counted as Good) */
export const gradesFor = (id: AlgorithmId): readonly Grade[] => (isAdaptive(id) ? ALGORITHMS[id].grades : [3]);

/**
 * Where a verse is in the fixed schedule, as a log entry an algorithm can start from: nothing
 * while it's new (before or on its first day, not yet reviewed), else last reviewed a phase's
 * interval before it's due (or when it was, if it isn't due)
 */
export function placement(verse: Pick<Verse, "start" | "last">, day: Day, durations: Durations): LogEntry | null {
  const s = status({ id: "", tag: "", ref: "", ...verse }, day, durations);
  if (s.phase === "upcoming") return null;
  if (s.phase === "retained") return { day: boundaries(verse.start, durations).retained, set: 365 };
  if (s.phase === "daily" && s.position === 1 && !verse.last) return null;
  const scheduled = s.scheduled!;
  const interval = s.phase === "daily" ? 1 : s.phase === "weekly" ? 7 : daysBetween(addMonths(scheduled, -1), scheduled);
  if (!s.due && verse.last) return { day: verse.last, set: Math.max(1, daysBetween(verse.last, s.next ?? addDays(verse.last, interval))) };
  return { day: addDays(scheduled, -interval), set: interval };
}

/** A verse's history: its log, or (before one is kept) where the fixed schedule has it on `day` */
export function history(verse: Verse, day: Day, durations: Durations): LogEntry[] {
  if (verse.log && verse.log.length > 0) return verse.log;
  const placed = placement(verse, day, durations);
  return placed ? [placed] : [];
}

/** The log with `entry` added; a verse's first entry keeps where it was placed before it */
export function withEntry(verse: Verse, entry: LogEntry, durations: Durations): LogEntry[] {
  return [...history(verse, entry.day, durations), entry];
}

const randomFor = (verse: Verse, index: number) => seeded(hash(verse.id) + index * 7919);

function fold(algorithm: Algorithm<BaseState>, verse: Verse, entries: readonly LogEntry[], o: SrsOptions): BaseState {
  let s = algorithm.init(o);
  entries.forEach((e, i) => {
    if (isPlacing(e)) s = e.set > 0 ? algorithm.place(s, e.day, e.set, o) : algorithm.init(o);
    else s = algorithm.review(s, e.grade, e.day, o, randomFor(verse, i));
  });
  return s;
}

interface Memo {
  algorithm: AlgorithmId;
  srs: SrsOptions;
  durations: Durations;
  /** The day it's for, when it came from a placement (which depends on the day) */
  day: Day | null;
  state: BaseState;
}
// The store's verses are replaced, never changed, so a verse's state holds until it is
const memo = new WeakMap<Verse, Memo>();

/** The state an adaptive algorithm has a verse in after its history */
export function cardState(verse: Verse, day: Day, sch: Scheduler & { algorithm: Exclude<AlgorithmId, "fixed"> }): BaseState {
  const logged = !!verse.log && verse.log.length > 0;
  const hit = memo.get(verse);
  if (hit && hit.algorithm === sch.algorithm && hit.srs === sch.srs && hit.durations === sch.durations && (logged || hit.day === day)) return hit.state;
  const state = fold(ALGORITHMS[sch.algorithm], verse, history(verse, day, sch.durations), sch.srs);
  memo.set(verse, { algorithm: sch.algorithm, srs: sch.srs, durations: sch.durations, day: logged ? null : day, state });
  return state;
}

/** Where a verse is on `day` under the scheduler's algorithm */
export function verseStatus(verse: Verse, day: Day, sch: Scheduler): Status {
  if (!isAdaptive(sch.algorithm)) return status(verse, day, sch.durations);
  const algorithm = sch.algorithm;
  if (day < verse.start) return { phase: "upcoming", position: 0, total: 0, scheduled: null, due: false, next: verse.paused ? null : verse.start, ...(verse.paused ? { paused: true } : {}) };
  // Paused, it's held where it was (as placed then, before reviews are logged)
  const s = cardState(verse, verse.paused && verse.paused < day ? verse.paused : day, { ...sch, algorithm });
  const dueDay = s.due ?? verse.start;
  const due = dueDay <= day;
  const fresh = s.last === null;
  const learning = !fresh && s.due !== null && s.last !== null && s.due <= s.last;
  const phase = fresh || learning || s.interval < 7 ? "daily" : s.interval < 30 ? "weekly" : "monthly";
  // Paused, it isn't due, however long it's been
  if (verse.paused) return { phase, position: 0, total: 0, scheduled: null, due: false, next: null, interval: s.interval, learning, fresh, paused: true };
  return { phase, position: 0, total: 0, scheduled: due ? dueDay : null, due, next: due ? null : dueDay, interval: s.interval, learning, fresh };
}

/** What an adaptive algorithm knows of a verse's memory on `day` (empty for the fixed schedule) */
export function memoryOf(verse: Verse, day: Day, sch: Scheduler): [string, string][] {
  if (!isAdaptive(sch.algorithm)) return [];
  const algorithm = sch.algorithm;
  return ALGORITHMS[algorithm].memory(cardState(verse, day, { ...sch, algorithm }), day, sch.srs);
}

export interface GradePreview {
  grade: Grade;
  /** When it'd be due: `<10m`, `3d`, `2.5mo` */
  label: string;
  /** Days until it'd be due (0: again today) */
  days: number;
}

/**
 * What each grade would do to a verse reviewed on `day`, for the buttons. With `at` (going back
 * to a card graded already), what each would do in place of the grade logged there
 */
export function preview(verse: Verse, day: Day, sch: Scheduler, at?: number): GradePreview[] {
  if (!isAdaptive(sch.algorithm)) return [];
  const algorithm = ALGORITHMS[sch.algorithm];
  const regrading = at !== undefined && !!verse.log && at < verse.log.length;
  const entries = regrading ? verse.log!.slice(0, at) : history(verse, day, sch.durations);
  const s = regrading ? fold(algorithm, verse, entries, sch.srs) : cardState(verse, day, { ...sch, algorithm: sch.algorithm });
  return algorithm.grades.map((grade) => {
    const after = algorithm.review(s, grade, day, sch.srs, randomFor(verse, entries.length));
    const days = after.due ? Math.max(0, daysBetween(day, after.due)) : 0;
    return { grade, days, label: formatInterval(days, days === 0 ? after.stepMinutes : undefined) };
  });
}

/** What schedules each verse: one scheduler for all, or each verse's (by its deck) */
export type Schedulers = Scheduler | ((verse: Verse) => Scheduler);
export const schedulerOf = (sch: Schedulers, verse: Verse): Scheduler => (typeof sch === "function" ? sch(verse) : sch);

/** The verses due on `day`: by phase (oldest first in each), or shuffled */
export function dueVerses(verses: readonly Verse[], day: Day, sch: Schedulers, order: Order = "phase", random: () => number = Math.random): Verse[] {
  const due = verses.map((verse) => ({ verse, status: verseStatus(verse, day, schedulerOf(sch, verse)) })).filter((v) => v.status.due);
  if (order === "shuffle") {
    for (let i = due.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [due[i], due[j]] = [due[j]!, due[i]!];
    }
  } else {
    due.sort((a, b) => PHASES.indexOf(a.status.phase) - PHASES.indexOf(b.status.phase) || a.verse.start.localeCompare(b.verse.start));
  }
  return due.map((v) => v.verse);
}
