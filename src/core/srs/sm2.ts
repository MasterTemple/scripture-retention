import { addDays, type Day } from "../dates.ts";
import type { Algorithm, BaseState, Grade } from "./types.ts";

export interface Sm2State extends BaseState {
  /** The E-Factor */
  ef: number;
  /** Repetitions in a row recalled (n in SM-2) */
  n: number;
  /** The day it's next due by its interval (`due` is today while it's drilled) */
  next: Day | null;
  /** Scored below 4 today: drilled again until it's 4 or more, without changing its schedule */
  drill: boolean;
}

/** SM-2's quality (0–5) for a grade: Again 2, Hard 3, Good 4, Easy 5 */
export const quality = (g: Grade) => g + 1;

/**
 * SuperMemo SM-2 (Woźniak, 1987): I(1) = 1, I(2) = 6, then I(n) = I(n-1) × EF; EF moves by
 * 0.1 − (5−q)(0.08 + (5−q)·0.02), never under 1.3; q < 3 starts the repetitions over with EF as it
 * was; and items under 4 are repeated the same day until they reach 4. A review before the item is
 * due (SM-2 has no rule for one) leaves its schedule as it was, unless it's forgotten
 */
export const sm2: Algorithm<Sm2State> = {
  grades: [1, 2, 3, 4],

  init: (o) => ({ due: null, last: null, interval: 0, reps: 0, lapses: 0, ef: o.sm2.startingEase, n: 0, next: null, drill: false }),

  place: (s, day, days) => {
    const next = addDays(day, days);
    return { ...s, n: days >= 6 ? 2 : 1, interval: days, next, due: next, last: day, drill: false };
  },

  review(s, grade, day) {
    const q = quality(grade);
    const out: Sm2State = { ...s, reps: s.reps + 1, last: day };
    const sameDay = s.last === day;
    const early = s.next !== null && day < s.next;
    if (sameDay && s.drill) {
      // Drilling doesn't change the schedule: it goes on until it scores 4 or more
      out.drill = q < 4;
      out.due = out.drill ? day : s.next;
      return out;
    }
    if (q >= 3 && (sameDay || early)) {
      // An early review recalled: the schedule stands
      out.drill = q < 4;
      out.due = out.drill ? day : s.next;
      return out;
    }
    if (q < 3) {
      if (s.n > 0) out.lapses++;
      out.n = 0;
      out.interval = 1;
    } else {
      out.ef = Math.max(1.3, s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      out.n = s.n + 1;
      out.interval = out.n === 1 ? 1 : out.n === 2 ? 6 : Math.round(s.interval * out.ef);
    }
    out.next = addDays(day, out.interval);
    out.drill = q < 4;
    out.due = out.drill ? day : out.next;
    return out;
  },

  memory: (s) => (s.reps === 0 && s.n === 0 ? [] : [["E-Factor", s.ef.toFixed(2)], ["Repetition", `${s.n}`], ...(s.drill ? [["Drill", "again today"] as [string, string]] : [])]),
};
