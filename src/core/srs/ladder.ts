import { addDays } from "../dates.ts";
import type { LadderOptions, SrsOptions } from "./options.ts";
import type { Algorithm, BaseState } from "./types.ts";

export interface LadderState extends BaseState {
  /** The box it's in (0 is the first); -1 before it's first reviewed */
  box: number;
}

/**
 * A ladder of intervals, one a box: Leitner's boxes, or Pimsleur's graduated intervals. Recalled
 * when due, a verse climbs a box (staying in the last); forgotten, it goes to the first box or
 * back one. Recalled before it's due, it stays where it is
 */
function ladder(options: (o: SrsOptions) => LadderOptions): Algorithm<LadderState> {
  const intervalOf = (o: SrsOptions, box: number) => {
    const { intervals } = options(o);
    return Math.max(1, Math.round(intervals[Math.min(box, intervals.length - 1)] ?? 1));
  };
  return {
    grades: [1, 3],

    init: () => ({ due: null, last: null, interval: 0, reps: 0, lapses: 0, box: -1 }),

    place(s, day, days, o) {
      const { intervals } = options(o);
      let box = 0;
      intervals.forEach((interval, i) => {
        if (interval <= days) box = i;
      });
      return { ...s, box, interval: days, due: addDays(day, days), last: day };
    },

    review(s, grade, day, o) {
      const { intervals, onMiss } = options(o);
      const last = Math.max(0, intervals.length - 1);
      let box: number;
      if (grade === 1) box = onMiss === "first" || s.box < 0 ? 0 : Math.max(0, s.box - 1);
      else if (s.box >= 0 && s.due !== null && day < s.due) return { ...s, reps: s.reps + 1, last: day };
      else box = Math.min(s.box + 1, last);
      const interval = intervalOf(o, box);
      return { ...s, box, interval, due: addDays(day, interval), last: day, reps: s.reps + 1, lapses: s.lapses + (grade === 1 && s.box >= 0 ? 1 : 0) };
    },

    // Boxes past the last (since the ladder was shortened) are in the last
    memory: (s, _day, o) => (s.box < 0 ? [] : [["Box", `${Math.min(s.box, Math.max(0, options(o).intervals.length - 1)) + 1} of ${options(o).intervals.length}`]]),
  };
}

export const leitner = ladder((o) => o.leitner);
export const pimsleur = ladder((o) => o.pimsleur);
