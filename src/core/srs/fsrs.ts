import { addDays, daysBetween, type Day } from "../dates.ts";
import { isLeech, stepAnswer, type CardPhase } from "./anki.ts";
import type { SrsOptions } from "./options.ts";
import type { Algorithm, BaseState, Grade } from "./types.ts";
import { clamp, finalInterval, stepDue } from "./util.ts";

/** FSRS-6's default parameters (Anki's since 25.07) */
export const FSRS6_DEFAULTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
];
export const FSRS5_DEFAULTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
export const FSRS45_DEFAULTS = [0.5701, 1.4436, 4.1386, 10.9355, 5.1443, 1.2006, 0.8627, 0.0362, 1.629, 0.1342, 1.0166, 2.1174, 0.0839, 0.3204, 1.4676, 0.219, 2.8237];

export type FsrsVersion = "4.5" | "5" | "6";

const S_MIN = 0.001;
const S_MAX = 36500;

/** The FSRS version a set of parameters is for, by how many there are; null when it's no set FSRS knows */
export function fsrsVersion(params: readonly number[]): FsrsVersion | null {
  if (params.length === 0 || params.length === 21) return "6";
  if (params.length === 19) return "5";
  if (params.length === 17) return "4.5";
  return null;
}

/** Parameters as Anki shows them (`0.212, 1.2931, …`), read back; null when they aren't 17, 19, or 21 numbers */
export function parseParams(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return [];
  const params = parts.map(Number);
  if (params.some((n) => !Number.isFinite(n))) return null;
  return fsrsVersion(params) ? params : null;
}

/** FSRS's memory model for a set of parameters: how recall falls off, and how each review changes stability and difficulty */
export function fsrsModel(params: readonly number[]) {
  const version = fsrsVersion(params) ?? "6";
  const w = params.length > 0 && fsrsVersion(params) ? params : FSRS6_DEFAULTS;
  const p = (i: number) => w[i]!;
  const decay = version === "6" ? -p(20) : -0.5;
  const factor = 0.9 ** (1 / decay) - 1;
  const clampD = (d: number) => clamp(d, 1, 10);
  const rawInitD = (g: Grade) => (version === "4.5" ? p(4) - (g - 3) * p(5) : p(4) - Math.exp(p(5) * (g - 1)) + 1);

  return {
    version,
    /** The chance of recall `t` days after a review, at stability `s` */
    retrievability: (t: number, s: number) => (1 + (factor * t) / s) ** decay,
    /** The days until recall falls to `r` */
    interval: (s: number, r: number) => (s / factor) * (r ** (1 / decay) - 1),
    /** The stability that falls to `r` in `days` */
    stabilityFor: (days: number, r: number) => clamp((days * factor) / (r ** (1 / decay) - 1), S_MIN, S_MAX),
    initStability: (g: Grade) => Math.max(p(g - 1), S_MIN),
    initDifficulty: (g: Grade) => clampD(rawInitD(g)),
    nextDifficulty(d: number, g: Grade) {
      if (version === "4.5") return clampD(p(7) * p(4) + (1 - p(7)) * (d - p(6) * (g - 3)));
      const damped = d + (-p(6) * (g - 3) * (10 - d)) / 9;
      return clampD(p(7) * rawInitD(4) + (1 - p(7)) * damped);
    },
    recallStability(d: number, s: number, r: number, g: Grade) {
      const hard = g === 2 ? p(15) : 1;
      const easy = g === 4 ? p(16) : 1;
      return clamp(s * (1 + Math.exp(p(8)) * (11 - d) * s ** -p(9) * (Math.exp((1 - r) * p(10)) - 1) * hard * easy), S_MIN, S_MAX);
    },
    forgetStability(d: number, s: number, r: number) {
      const forgotten = p(11) * d ** -p(12) * ((s + 1) ** p(13) - 1) * Math.exp((1 - r) * p(14));
      // Since FSRS-5, a lapse never leaves it more stable than a same-day Again would
      const ceiling = version === "4.5" ? forgotten : Math.min(forgotten, s / Math.exp(p(17) * p(18)));
      return clamp(ceiling, S_MIN, S_MAX);
    },
    /** A review the same day as the last (FSRS-5 on; FSRS-4.5 leaves stability as it was) */
    shortTermStability(s: number, g: Grade) {
      if (version === "4.5") return s;
      let increase = Math.exp(p(17) * (g - 3 + p(18)));
      if (version === "6") {
        increase *= s ** -p(19);
        // Only Again lowers it
        if (g >= 2) increase = Math.max(increase, 1);
      }
      return clamp(s * increase, S_MIN, S_MAX);
    },
  };
}

export type FsrsModel = ReturnType<typeof fsrsModel>;

export interface FsrsState extends BaseState {
  phase: CardPhase;
  step: number;
  stability: number;
  difficulty: number;
}

// The model is rebuilt only when the parameters change
let cached: { params: readonly number[]; model: FsrsModel } | null = null;
export function modelFor(o: SrsOptions): FsrsModel {
  if (cached?.params !== o.fsrs.params) cached = { params: o.fsrs.params, model: fsrsModel(o.fsrs.params) };
  return cached.model;
}

/** Stability and difficulty after a review graded `g` on `day` */
export function nextMemory(m: FsrsModel, s: FsrsState, g: Grade, day: Day): { stability: number; difficulty: number } {
  if (s.phase === "new" || s.last === null) return { stability: m.initStability(g), difficulty: m.initDifficulty(g) };
  const elapsed = daysBetween(s.last, day);
  if (elapsed <= 0) {
    if (m.version === "4.5") return { stability: s.stability, difficulty: s.difficulty };
    return { stability: m.shortTermStability(s.stability, g), difficulty: m.nextDifficulty(s.difficulty, g) };
  }
  const r = m.retrievability(elapsed, s.stability);
  return {
    stability: g === 1 ? m.forgetStability(s.difficulty, s.stability, r) : m.recallStability(s.difficulty, s.stability, r, g),
    difficulty: m.nextDifficulty(s.difficulty, g),
  };
}

export const fsrs: Algorithm<FsrsState> = {
  grades: [1, 2, 3, 4],

  init: () => ({ due: null, last: null, interval: 0, reps: 0, lapses: 0, phase: "new", step: 0, stability: 0, difficulty: 0 }),

  place(s, day, days, o) {
    const m = modelFor(o);
    return {
      ...s,
      phase: "review",
      step: 0,
      stability: m.stabilityFor(days, o.fsrs.desiredRetention),
      difficulty: s.phase === "new" ? m.initDifficulty(3) : s.difficulty,
      interval: days,
      due: addDays(day, days),
      last: day,
      stepMinutes: undefined,
    };
  },

  review(s, grade, day, o, random) {
    const m = modelFor(o);
    const a = o.anki;
    const fuzz = random();
    const memory = nextMemory(m, s, grade, day);
    const next: FsrsState = { ...s, ...memory, reps: s.reps + 1, last: day, stepMinutes: undefined };
    const days = (stability: number, minimum = 1) => finalInterval(m.interval(stability, o.fsrs.desiredRetention), minimum, a.maximumInterval, a.fuzz, () => fuzz);
    const toReview = (interval: number): FsrsState => ({ ...next, phase: "review", step: 0, interval, due: addDays(day, interval) });

    if (s.phase !== "review") {
      const steps = s.phase === "relearning" ? a.relearningSteps : a.learningSteps;
      const answer = stepAnswer(steps, s.phase === "new" ? 0 : s.step, grade);
      if (answer === "graduate" || answer === "easy") return toReview(days(next.stability));
      return { ...next, phase: s.phase === "new" ? "learning" : s.phase, step: answer.step, ...stepDue(day, answer.minutes) };
    }

    if (grade === 1) {
      next.lapses++;
      const first = a.relearningSteps[0];
      if (first === undefined) return toReview(days(next.stability));
      return { ...next, phase: "relearning", step: 0, ...stepDue(day, first) };
    }
    // Hard, Good, and Easy in order, each longer than the one before, as Anki keeps them
    const raw = ([2, 3, 4] as const).map((g) => m.interval(nextMemory(m, s, g, day).stability, o.fsrs.desiredRetention));
    const fit = (interval: number, minimum: number) => finalInterval(interval, minimum, a.maximumInterval, a.fuzz, () => fuzz);
    const hard = fit(Math.min(raw[0]!, raw[1]!), 1);
    const good = fit(Math.max(raw[1]!, hard + 1), hard + 1);
    const easy = fit(Math.max(raw[2]!, good + 1), good + 1);
    return toReview(grade === 2 ? hard : grade === 3 ? good : easy);
  },

  memory(s, day, o) {
    if (s.phase === "new") return [];
    const m = modelFor(o);
    const elapsed = s.last ? Math.max(0, daysBetween(s.last, day)) : 0;
    const out: [string, string][] = [
      ["Stability", `${s.stability < 10 ? s.stability.toFixed(1) : Math.round(s.stability)} days`],
      ["Difficulty", `${Math.round(((s.difficulty - 1) / 9) * 100)}%`],
      ["Retrievability", `${Math.round(m.retrievability(elapsed, s.stability) * 100)}%`],
    ];
    if (s.phase === "learning" || s.phase === "relearning") out.unshift([s.phase === "learning" ? "Learning step" : "Relearning step", `${s.step + 1}`]);
    if (isLeech(s, o)) out.push(["Leech", `forgotten ${s.lapses} times`]);
    return out;
  },
};
