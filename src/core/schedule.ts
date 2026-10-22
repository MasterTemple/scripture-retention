import { addDays, addMonths, daysBetween, monthsBetween, type Day } from "./dates.ts";
import type { LogEntry } from "./srs/types.ts";
import { describeInterval } from "./srs/util.ts";

/**
 * A memorized verse. Where it is in the fixed schedule follows from `start` alone (the day its
 * daily reviews began); `last` is the day it was last reviewed. `log` is every review since
 * reviews were kept, which the adaptive algorithms work from
 */
export interface Verse {
  id: string;
  /** The topic, without `#` (`?` when it has none yet) */
  tag: string;
  /** The reference as written: `Psalm 119:147-148` */
  ref: string;
  start: Day;
  last?: Day;
  log?: LogEntry[];
  /** The deck it's in (the default deck when absent) */
  deck?: string;
  /** The passage it's a card of, added and deleted with it */
  passage?: string;
}

/** The reviewing phases a verse goes through, in order */
export type Bucket = "daily" | "weekly" | "monthly";
export const BUCKETS: readonly Bucket[] = ["daily", "weekly", "monthly"];

/** Before its start, a verse is upcoming; after its monthly reviews, retained */
export type Phase = "upcoming" | Bucket | "retained";
export const PHASES: readonly Phase[] = ["daily", "weekly", "monthly", "upcoming", "retained"];

/** How long each phase lasts: 7 weeks daily, 7 months weekly, 7 years monthly by default */
export interface Durations {
  dailyWeeks: number;
  weeklyMonths: number;
  monthlyYears: number;
}

export const DEFAULT_DURATIONS: Durations = { dailyWeeks: 7, weeklyMonths: 7, monthlyYears: 7 };

/** The days each phase of a verse starting on `start` begins, and the day it's retained */
export interface Boundaries {
  daily: Day;
  weekly: Day;
  monthly: Day;
  retained: Day;
}

export function boundaries(start: Day, durations: Durations): Boundaries {
  const weekly = addDays(start, durations.dailyWeeks * 7);
  const monthly = addMonths(weekly, durations.weeklyMonths);
  const retained = addMonths(monthly, durations.monthlyYears * 12);
  return { daily: start, weekly, monthly, retained };
}

/** How many reviews (days, weeks, or months) a phase has */
export function phaseLength(bucket: Bucket, durations: Durations, start?: Day): number {
  if (bucket === "daily") return durations.dailyWeeks * 7;
  if (bucket === "monthly") return durations.monthlyYears * 12;
  // Weeks in the weekly phase depend a little on which months it spans
  const b = boundaries(start ?? "2001-01-01", durations);
  return Math.ceil(daysBetween(b.weekly, b.monthly) / 7);
}

export interface Status {
  phase: Phase;
  /** Which review of its phase this is (1-based), 0 when upcoming or retained */
  position: number;
  /** How many reviews its phase has */
  total: number;
  /** The latest day on or before today it was scheduled for, in its phase */
  scheduled: Day | null;
  /** Whether it hasn't been reviewed since it was last scheduled */
  due: boolean;
  /** When it's next scheduled after today (null once retained) */
  next: Day | null;
  /** Under an adaptive algorithm: the days from its last review to its next */
  interval?: number;
  /** Under an adaptive algorithm: to be seen again the same day (a learning step, or a drill) */
  learning?: boolean;
  /** Under an adaptive algorithm: never reviewed */
  fresh?: boolean;
}

export function status(verse: Verse, day: Day, durations: Durations): Status {
  const b = boundaries(verse.start, durations);
  const reviewed = (scheduled: Day) => verse.last !== undefined && verse.last >= scheduled;
  if (day < b.daily) {
    return { phase: "upcoming", position: 0, total: 0, scheduled: null, due: false, next: b.daily };
  }
  if (day < b.weekly) {
    const total = phaseLength("daily", durations);
    return { phase: "daily", position: daysBetween(b.daily, day) + 1, total, scheduled: day, due: !reviewed(day), next: addDays(day, 1) };
  }
  if (day < b.monthly) {
    const weeks = Math.floor(daysBetween(b.weekly, day) / 7);
    const scheduled = addDays(b.weekly, weeks * 7);
    const following = addDays(scheduled, 7);
    const total = Math.ceil(daysBetween(b.weekly, b.monthly) / 7);
    return { phase: "weekly", position: weeks + 1, total, scheduled, due: !reviewed(scheduled), next: following < b.monthly ? following : b.monthly };
  }
  if (day < b.retained) {
    const months = monthsBetween(b.monthly, day);
    const scheduled = addMonths(b.monthly, months);
    const following = addMonths(b.monthly, months + 1);
    const total = phaseLength("monthly", durations);
    return { phase: "monthly", position: months + 1, total, scheduled, due: !reviewed(scheduled), next: following < b.retained ? following : null };
  }
  return { phase: "retained", position: 0, total: 0, scheduled: null, due: false, next: null };
}

/**
 * The start day that puts a verse at review `position` (1-based) of `bucket` today: `weekly`, 3
 * is the third week of its weekly reviews, which is then due today
 */
export function startFor(bucket: Bucket, position: number, day: Day, durations: Durations): Day {
  const n = Math.max(1, Math.floor(position));
  const dailyDays = durations.dailyWeeks * 7;
  if (bucket === "daily") return addDays(day, -(n - 1));
  if (bucket === "weekly") return addDays(day, -(n - 1) * 7 - dailyDays);
  // Months are uneven, so going back by them can land a day or two off: find the start whose monthly phase begins on the right day
  const monthly = addMonths(day, -(n - 1));
  const guess = addDays(addMonths(monthly, -durations.weeklyMonths), -dailyDays);
  for (const offset of [0, 1, -1, 2, -2, 3, -3]) {
    const start = addDays(guess, offset);
    if (boundaries(start, durations).monthly === monthly) return start;
  }
  return guess;
}

export type Order = "phase" | "shuffle";

/** `Day 12 of 49`, `Week 3 of 30`, `Month 5 of 84`, `Starts …`, `Retained`; under an adaptive algorithm, `New`, `Learning`, `Every 12 days` */
export function describePosition(s: Status): string {
  if (s.interval !== undefined && s.phase !== "upcoming") return s.fresh ? "New" : s.learning ? "Learning" : s.interval === 1 ? "Every day" : `Every ${describeInterval(s.interval)}`;
  switch (s.phase) {
    case "daily": return `Day ${s.position} of ${s.total}`;
    case "weekly": return `Week ${s.position} of ${s.total}`;
    case "monthly": return `Month ${s.position} of ${s.total}`;
    case "upcoming": return "Upcoming";
    case "retained": return "Retained";
  }
}

export const PHASE_NAMES: Record<Phase, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  upcoming: "Upcoming",
  retained: "Retained",
};

/** The phases' names under an adaptive algorithm, where a verse's phase is how far apart its reviews are */
export const ADAPTIVE_PHASE_NAMES: Record<Phase, string> = { ...PHASE_NAMES, daily: "Days", weekly: "Weeks", monthly: "Months" };

/** The unit a bucket's position counts */
export const BUCKET_UNITS: Record<Bucket, string> = { daily: "Day", weekly: "Week", monthly: "Month" };
