import { addDays, daysBetween } from "../dates.ts";
import type { AnkiOptions, SrsOptions } from "./options.ts";
import type { Algorithm, BaseState, Grade } from "./types.ts";
import { finalInterval, stepDelay, stepDue } from "./util.ts";

export type CardPhase = "new" | "learning" | "review" | "relearning";

export interface AnkiState extends BaseState {
  phase: CardPhase;
  /** Which learning or relearning step it's on */
  step: number;
  ease: number;
  /** Its review interval: in relearning, the one it goes back to */
  scheduled: number;
}

/** Where an answer at learning step `index` leads: another step, graduating, or graduating early (Easy) */
export function stepAnswer(steps: readonly number[], index: number, grade: Grade): { step: number; minutes: number } | "graduate" | "easy" {
  if (grade === 4) return "easy";
  const minutes = grade === 1 ? stepDelay.again(steps) : grade === 2 ? stepDelay.hard(steps, index) : stepDelay.good(steps, index);
  if (minutes === null) return "graduate";
  return { step: grade === 1 ? 0 : grade === 2 ? index : index + 1, minutes };
}

/** A whole-day review interval as Anki sets one: times the interval modifier, at least `minimum`, fuzzed */
const passing = (a: AnkiOptions, interval: number, minimum: number, fuzz: number) =>
  finalInterval(interval * a.intervalModifier, Math.max(minimum, 1), a.maximumInterval, a.fuzz, () => fuzz);

/**
 * The intervals Hard, Good, and Easy give a review card, after Anki's v3 scheduler: on time or
 * late, the delay counts toward them; early, the days that did pass do. Each is longer than the
 * one before, and all share one fuzz factor
 */
export function reviewIntervals(a: AnkiOptions, scheduled: number, elapsed: number, ease: number, fuzz: number) {
  const delay = elapsed - scheduled;
  let hard: number, good: number, easy: number;
  if (delay >= 0) {
    hard = passing(a, scheduled * a.hardInterval, a.hardInterval <= 1 ? 0 : scheduled + 1, fuzz);
    good = passing(a, (scheduled + delay / 2) * ease, a.hardInterval <= 1 ? scheduled + 1 : hard + 1, fuzz);
    easy = passing(a, (scheduled + delay) * ease * a.easyBonus, good + 1, fuzz);
  } else {
    hard = passing(a, Math.max(elapsed * a.hardInterval, (scheduled * a.hardInterval) / 2), 1, fuzz);
    good = passing(a, Math.max(elapsed * ease, scheduled), hard + 1, fuzz);
    easy = passing(a, Math.max(elapsed * ease, scheduled) * (a.easyBonus - (a.easyBonus - 1) / 2), good + 1, fuzz);
  }
  return { hard, good, easy };
}

const MIN_EASE = 1.3;

export const anki: Algorithm<AnkiState> = {
  grades: [1, 2, 3, 4],

  init: (o) => ({ due: null, last: null, interval: 0, reps: 0, lapses: 0, phase: "new", step: 0, ease: o.anki.startingEase, scheduled: 0 }),

  place: (s, day, days, o) => ({
    ...s,
    phase: "review",
    step: 0,
    ease: s.phase === "review" || s.phase === "relearning" ? s.ease : o.anki.startingEase,
    scheduled: days,
    interval: days,
    due: addDays(day, days),
    last: day,
    stepMinutes: undefined,
  }),

  review(s, grade, day, o, random) {
    const a = o.anki;
    const fuzz = random();
    const next: AnkiState = { ...s, reps: s.reps + 1, last: day, stepMinutes: undefined };
    const toReview = (days: number): AnkiState => ({ ...next, phase: "review", step: 0, scheduled: days, interval: days, due: addDays(day, days) });

    if (s.phase === "new" || s.phase === "learning") {
      const answer = stepAnswer(a.learningSteps, s.phase === "new" ? 0 : s.step, grade);
      next.ease = a.startingEase;
      if (answer === "graduate") return toReview(finalInterval(a.graduatingInterval, 1, a.maximumInterval, a.fuzz, () => fuzz));
      if (answer === "easy") return toReview(finalInterval(a.easyInterval, 1, a.maximumInterval, a.fuzz, () => fuzz));
      return { ...next, phase: "learning", step: answer.step, ...stepDue(day, answer.minutes) };
    }

    if (s.phase === "relearning") {
      const answer = stepAnswer(a.relearningSteps, s.step, grade);
      if (answer === "graduate") return toReview(s.scheduled);
      if (answer === "easy") return toReview(Math.min(s.scheduled + 1, a.maximumInterval));
      return { ...next, step: answer.step, ...stepDue(day, answer.minutes) };
    }

    // A review card
    const elapsed = s.last ? daysBetween(s.last, day) : s.scheduled;
    if (grade === 1) {
      next.lapses++;
      next.ease = Math.max(MIN_EASE, s.ease - 0.2);
      const days = Math.min(Math.max(a.minimumInterval, Math.round(s.scheduled * a.newInterval), 1), a.maximumInterval);
      const first = a.relearningSteps[0];
      if (first === undefined) return toReview(days);
      return { ...next, phase: "relearning", step: 0, scheduled: days, ...stepDue(day, first) };
    }
    const intervals = reviewIntervals(a, s.scheduled, elapsed, s.ease, fuzz);
    if (grade === 2) next.ease = Math.max(MIN_EASE, s.ease - 0.15);
    if (grade === 4) next.ease = s.ease + 0.15;
    return toReview(grade === 2 ? intervals.hard : grade === 3 ? intervals.good : intervals.easy);
  },

  memory(s, _day, o) {
    const out: [string, string][] = [];
    if (s.phase === "learning") out.push(["Learning step", `${s.step + 1} of ${o.anki.learningSteps.length}`]);
    if (s.phase === "relearning") out.push(["Relearning step", `${s.step + 1} of ${o.anki.relearningSteps.length}`]);
    if (s.phase !== "new") out.push(["Ease", `${Math.round(s.ease * 100)}%`]);
    if (isLeech(s, o)) out.push(["Leech", `forgotten ${s.lapses} times`]);
    return out;
  },
};

/** Forgotten as often as Anki's leech threshold: a verse worth a closer look */
export const isLeech = (s: BaseState, o: SrsOptions) => o.anki.leechThreshold > 0 && s.lapses >= o.anki.leechThreshold;
