import { addDays, daysBetween } from "../dates.ts";
import type { Algorithm, BaseState } from "./types.ts";

/** Ebisu's model: recall `t` days after a review is Beta(α, β) distributed */
export type EbisuModel = readonly [alpha: number, beta: number, t: number];

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(x), for x > 0 (Lanczos, g = 7) */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const betaln = (a: number, b: number) => lgamma(a) + lgamma(b) - lgamma(a + b);
/** ln(e^x − e^y), for x > y */
const logsubexp = (x: number, y: number) => x + Math.log1p(-Math.exp(y - x));

/** The expected chance of recall `tnow` days after the review the model is for */
export function predictRecall([alpha, beta, t]: EbisuModel, tnow: number): number {
  return Math.exp(betaln(alpha + tnow / t, beta) - betaln(alpha, beta));
}

/** The days until expected recall falls to `p` (0.5 for the half-life) */
export function timeToRecall(model: EbisuModel, p: number): number {
  const target = Math.log(p);
  const f = (x: number) => Math.log(predictRecall(model, x)) - target;
  let lo = model[2] / 1024;
  let hi = model[2];
  while (f(hi) > 0 && hi < 1e7) hi *= 2;
  while (f(lo) < 0 && lo > 1e-7) lo /= 2;
  for (let i = 0; i < 100 && hi / lo > 1 + 1e-9; i++) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/**
 * The model after a quiz `tnow` days after the last, recalled or not (Ebisu 2's update: the
 * posterior's first two moments, matched to a Beta at `tback`; rebalanced to its half-life when α
 * and β drift more than twice apart)
 */
export function updateRecall(prior: EbisuModel, success: boolean, tnow: number, tback?: number): EbisuModel {
  const updated = posterior(prior, success, tnow, tback ?? tnow);
  if (tback === undefined && (updated[0] > 2 * updated[1] || updated[1] > 2 * updated[0])) return posterior(prior, success, tnow, timeToRecall(updated, 0.5));
  return updated;
}

function posterior(prior: EbisuModel, success: boolean, tnow: number, tback: number): EbisuModel {
  const [alpha, beta, t] = prior;
  const dt = tnow / t;
  const delta = tback / t;
  let m1: number, m2: number;
  if (success) {
    const den = betaln(alpha + dt, beta);
    m1 = Math.exp(betaln(alpha + dt + delta, beta) - den);
    m2 = Math.exp(betaln(alpha + dt + 2 * delta, beta) - den);
  } else {
    const den = logsubexp(betaln(alpha, beta), betaln(alpha + dt, beta));
    m1 = Math.exp(logsubexp(betaln(alpha + delta, beta), betaln(alpha + dt + delta, beta)) - den);
    m2 = Math.exp(logsubexp(betaln(alpha + 2 * delta, beta), betaln(alpha + dt + 2 * delta, beta)) - den);
  }
  const variance = m2 - m1 * m1;
  const k = (m1 * (1 - m1)) / variance - 1;
  return [m1 * k, (1 - m1) * k, tback];
}

export interface EbisuState extends BaseState {
  model: EbisuModel;
}

/** A review the same day as the last counts as this many days after it */
const SAME_DAY = 0.1;
const MAX_INTERVAL = 36500;

export const ebisu: Algorithm<EbisuState> = {
  grades: [1, 3],

  init: (o) => ({ due: null, last: null, interval: 0, reps: 0, lapses: 0, model: [o.ebisu.ab, o.ebisu.ab, o.ebisu.halflife] }),

  place(s, day, days, o) {
    // The half-life whose recall falls to the target in `days`
    const unit = timeToRecall([o.ebisu.ab, o.ebisu.ab, 1], o.ebisu.targetRecall);
    return { ...s, model: [o.ebisu.ab, o.ebisu.ab, days / unit], interval: days, due: addDays(day, days), last: day };
  },

  review(s, grade, day, o) {
    const success = grade > 1;
    // A first review is a quiz just after learning it
    const model = updateRecall(s.model, success, s.last === null ? SAME_DAY : Math.max(SAME_DAY, daysBetween(s.last, day)));
    const interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(timeToRecall(model, o.ebisu.targetRecall))));
    return { ...s, model, interval, due: addDays(day, interval), last: day, reps: s.reps + 1, lapses: s.lapses + (success || s.last === null ? 0 : 1) };
  },

  memory(s, day) {
    if (s.last === null) return [];
    const elapsed = Math.max(0, daysBetween(s.last, day));
    const halflife = timeToRecall(s.model, 0.5);
    return [
      ["Half-life", `${halflife < 10 ? halflife.toFixed(1) : Math.round(halflife)} days`],
      ["Recall now", `${Math.round(predictRecall(s.model, elapsed) * 100)}%`],
    ];
  },
};
