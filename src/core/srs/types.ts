import type { Day } from "../dates.ts";
import type { SrsOptions } from "./options.ts";

/** How well a verse was recalled: Again (forgotten), Hard, Good, Easy */
export type Grade = 1 | 2 | 3 | 4;
export const GRADES: readonly Grade[] = [1, 2, 3, 4];
export const GRADE_NAMES: Record<Grade, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

/**
 * One thing that happened to a verse: a review and how it went, or a placing by hand (last
 * reviewed on `day`, next in `set` days; `set: 0` forgets it, back to new)
 */
export type LogEntry = { day: Day; grade: Grade } | { day: Day; set: number };

export const isPlacing = (e: LogEntry): e is { day: Day; set: number } => "set" in e;

/** What every algorithm keeps about a card, besides its own memory model */
export interface BaseState {
  /** The day it's due next; null while it's new (it's due from its start) */
  due: Day | null;
  /** The day it was last reviewed or placed */
  last: Day | null;
  /** Days from its last review to when it's due (0 while it's to be seen again the same day) */
  interval: number;
  reps: number;
  lapses: number;
  /** For a step under a day (seen again in this sitting), its length in minutes */
  stepMinutes?: number;
}

/** A spaced-repetition algorithm, as pure functions over a card's state */
export interface Algorithm<S extends BaseState = BaseState> {
  /** The grades it asks for, in button order */
  grades: readonly Grade[];
  /** A card never reviewed */
  init(o: SrsOptions): S;
  /** A card placed by hand: last reviewed on `day`, due `days` later */
  place(s: S, day: Day, days: number, o: SrsOptions): S;
  /** The card after a review on `day`. `random` gives the same numbers for the same review, for fuzz */
  review(s: S, grade: Grade, day: Day, o: SrsOptions, random: () => number): S;
  /** What to show of its memory model on `day`: label and value */
  memory(s: S, day: Day, o: SrsOptions): [string, string][];
}
