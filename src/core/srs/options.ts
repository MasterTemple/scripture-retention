/** The scheduling algorithms a verse can follow */
export type AlgorithmId = "fixed" | "anki" | "fsrs" | "sm2" | "leitner" | "pimsleur" | "ebisu";
export const ALGORITHM_IDS: readonly AlgorithmId[] = ["fixed", "fsrs", "anki", "sm2", "leitner", "pimsleur", "ebisu"];

export const ALGORITHM_INFO: Record<AlgorithmId, { name: string; short: string; description: string }> = {
  fixed: {
    name: "Scripture Memory",
    short: "Fixed",
    description: "Each verse daily, then weekly, then monthly, for set lengths of time. No grading: every review counts the same.",
  },
  fsrs: {
    name: "FSRS",
    short: "FSRS",
    description:
      "Anki's modern scheduler: models how stable and how difficult each verse is, and reviews it when you'd recall it with the retention you choose. FSRS-6 by default; paste Anki's parameters (FSRS-4.5, 5, or 6) to use your own.",
  },
  anki: {
    name: "Anki (SM-2)",
    short: "Anki",
    description: "Anki's classic scheduler: learning steps, then intervals that grow by each verse's ease, which Hard lowers and Easy raises.",
  },
  sm2: {
    name: "SuperMemo SM-2",
    short: "SM-2",
    description: "The 1987 algorithm Anki grew from: 1 day, 6 days, then each interval times an easiness factor. Verses you struggle with are drilled again the same day.",
  },
  leitner: {
    name: "Leitner boxes",
    short: "Leitner",
    description: "Each verse sits in a box with its own interval. Recalled, it moves up a box; forgotten, it goes back.",
  },
  pimsleur: {
    name: "Pimsleur",
    short: "Pimsleur",
    description: "Graduated-interval recall: each interval about five times the last (1 day, 5 days, 25 days, 4 months, 2 years).",
  },
  ebisu: {
    name: "Ebisu",
    short: "Ebisu",
    description: "A Bayesian model of each verse's half-life, updated by every review; a verse comes due when the chance you'd recall it falls to your target.",
  },
};

export interface AnkiOptions {
  /** Learning steps in minutes (under a day: again in the same sitting) */
  learningSteps: number[];
  relearningSteps: number[];
  graduatingInterval: number;
  easyInterval: number;
  startingEase: number;
  easyBonus: number;
  intervalModifier: number;
  hardInterval: number;
  /** The share of the old interval kept after a lapse */
  newInterval: number;
  minimumInterval: number;
  maximumInterval: number;
  leechThreshold: number;
  fuzz: boolean;
}

export interface FsrsOptions {
  /** 17 (FSRS-4.5), 19 (FSRS-5), or 21 (FSRS-6) parameters; empty for FSRS-6's defaults */
  params: number[];
  desiredRetention: number;
}

export interface Sm2Options {
  startingEase: number;
}

export interface LadderOptions {
  /** The interval of each box, in days */
  intervals: number[];
  /** Where a forgotten verse goes: the first box, or back one */
  onMiss: "first" | "back";
}

export interface EbisuOptions {
  /** Recall probability at which a verse comes due */
  targetRecall: number;
  /** A new verse's half-life, in days */
  halflife: number;
  /** The prior's α = β: lower is less sure of the half-life */
  ab: number;
}

/**
 * Every algorithm's options. FSRS uses Anki's steps, maximum interval, fuzz, and leech
 * threshold, as Anki's deck options share them
 */
export interface SrsOptions {
  anki: AnkiOptions;
  fsrs: FsrsOptions;
  sm2: Sm2Options;
  leitner: LadderOptions;
  pimsleur: LadderOptions;
  ebisu: EbisuOptions;
}

export const DEFAULT_SRS: SrsOptions = {
  anki: {
    learningSteps: [1, 10],
    relearningSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    easyBonus: 1.3,
    intervalModifier: 1,
    hardInterval: 1.2,
    newInterval: 0,
    minimumInterval: 1,
    maximumInterval: 36500,
    leechThreshold: 8,
    fuzz: true,
  },
  fsrs: { params: [], desiredRetention: 0.9 },
  sm2: { startingEase: 2.5 },
  leitner: { intervals: [1, 2, 4, 8, 16, 32, 64, 128], onMiss: "first" },
  pimsleur: { intervals: [1, 5, 25, 120, 730], onMiss: "back" },
  ebisu: { targetRecall: 0.85, halflife: 1, ab: 3 },
};

/** Saved options over the defaults, so options added since still get theirs */
export function mergeSrs(saved: Partial<{ [K in keyof SrsOptions]: Partial<SrsOptions[K]> }> | undefined): SrsOptions {
  const out = {} as Record<keyof SrsOptions, unknown>;
  for (const key of Object.keys(DEFAULT_SRS) as (keyof SrsOptions)[]) out[key] = { ...DEFAULT_SRS[key], ...saved?.[key] };
  return out as unknown as SrsOptions;
}
