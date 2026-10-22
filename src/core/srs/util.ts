import { addDays, type Day } from "../dates.ts";

const DAY_MINUTES = 1440;

/** A small seeded generator (mulberry32): the same seed gives the same numbers */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
];

/** The days an interval may be fuzzed to, as Anki does: none under 2.5 days, then 15%, 10%, 5% of each stretch */
export function fuzzBounds(interval: number, minimum: number, maximum: number): [number, number] {
  minimum = Math.min(minimum, maximum);
  interval = Math.min(Math.max(interval, minimum), maximum);
  const delta = interval < 2.5 ? 0 : FUZZ_RANGES.reduce((d, r) => d + r.factor * Math.max(0, Math.min(interval, r.end) - r.start), 1);
  const clamp = (n: number) => Math.min(Math.max(n, minimum), maximum);
  const lower = clamp(Math.round(interval - delta));
  let upper = clamp(Math.round(interval + delta));
  if (upper === lower && upper > 2 && upper < maximum) upper = lower + 1;
  return [lower, upper];
}

/** A whole number of days for `interval` between `minimum` and `maximum`, fuzzed when `fuzz` is on */
export function finalInterval(interval: number, minimum: number, maximum: number, fuzz: boolean, random: () => number): number {
  if (!fuzz) return Math.min(Math.max(Math.round(interval), minimum), maximum);
  const [lower, upper] = fuzzBounds(interval, minimum, maximum);
  return Math.floor(lower + random() * (1 + upper - lower));
}

/** The delays of Anki's learning steps (minutes) for each answer at step `index`; null graduates */
export const stepDelay = {
  again: (steps: readonly number[]) => steps[0] ?? null,
  hard: (steps: readonly number[], index: number) => {
    const current = steps[index];
    if (current === undefined) return null;
    if (index > 0) return current;
    const next = steps[1];
    return next !== undefined ? (current + next) / 2 : Math.min(current * 1.5, current + DAY_MINUTES);
  },
  good: (steps: readonly number[], index: number) => steps[index + 1] ?? null,
};

/** When a step of `minutes` from `day` comes due: the same day under a day, else that many days on */
export function stepDue(day: Day, minutes: number): { due: Day; interval: number; stepMinutes?: number } {
  if (minutes < DAY_MINUTES) return { due: day, interval: 0, stepMinutes: minutes };
  const days = Math.round(minutes / DAY_MINUTES);
  return { due: addDays(day, days), interval: days };
}

/** An interval as a grade button shows it: `<10m`, `3d`, `2.5mo`, `1.2y` */
export function formatInterval(days: number, stepMinutes?: number): string {
  if (stepMinutes !== undefined) return stepMinutes < 60 ? `<${Math.max(1, Math.round(stepMinutes))}m` : `<${trim(stepMinutes / 60)}h`;
  if (days < 1) return "Today";
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${trim(days / 30.4)}mo`;
  return `${trim(days / 365.25)}y`;
}

/** An interval in words: `12 days`, `3 months`, `1.5 years` */
export function describeInterval(days: number): string {
  if (days < 60) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 730) return `${trim(days / 30.4)} months`;
  return `${trim(days / 365.25)} years`;
}

const trim = (n: number) => (Math.round(n * 10) / 10).toString();

export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
