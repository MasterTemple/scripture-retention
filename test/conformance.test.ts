import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { addDays } from "../src/core/dates.ts";
import { DEFAULT_DURATIONS, type Verse } from "../src/core/schedule.ts";
import { FSRS45_DEFAULTS, FSRS5_DEFAULTS } from "../src/core/srs/fsrs.ts";
import { ALGORITHM_IDS, DEFAULT_SRS, memoryOf, preview, verseStatus, type Grade, type LogEntry, type SrsOptions } from "../src/core/srs/index.ts";
import { seeded } from "../src/core/srs/util.ts";

/**
 * Cases the Rust crate (rust/crates/scripture-srs) checks itself against, so the two engines
 * give the same days and the same text. Regenerate after changing an algorithm:
 * `UPDATE_CONFORMANCE=1 npx vitest run test/conformance.test.ts`, then run `cargo test` in rust/
 */
const FILE = new URL("../rust/crates/scripture-srs/tests/conformance.json", import.meta.url);

const OPTIONS: Record<string, SrsOptions> = {
  default: DEFAULT_SRS,
  noFuzz: { ...DEFAULT_SRS, anki: { ...DEFAULT_SRS.anki, fuzz: false } },
  fsrs5: { ...DEFAULT_SRS, fsrs: { params: FSRS5_DEFAULTS, desiredRetention: 0.85 } },
  fsrs45: { ...DEFAULT_SRS, fsrs: { params: FSRS45_DEFAULTS, desiredRetention: 0.95 }, anki: { ...DEFAULT_SRS.anki, learningSteps: [], relearningSteps: [] } },
  custom: {
    anki: { ...DEFAULT_SRS.anki, learningSteps: [1, 1440], relearningSteps: [], newInterval: 0.5, startingEase: 2.3, easyBonus: 1.5, hardInterval: 1, intervalModifier: 0.9, leechThreshold: 2 },
    fsrs: { params: [], desiredRetention: 0.8 },
    sm2: { startingEase: 2.1 },
    leitner: { intervals: [1, 3, 7, 21], onMiss: "back" },
    pimsleur: { intervals: [2, 10, 50], onMiss: "first" },
    ebisu: { targetRecall: 0.9, halflife: 2, ab: 4 },
  },
};

function verses(): Verse[] {
  const random = seeded(2026);
  const pick = (n: number) => Math.floor(random() * n);
  const out: Verse[] = [];
  for (let i = 0; i < 24; i++) {
    const start = addDays("2025-01-01", pick(600));
    const verse: Verse = { id: `v${i}-${pick(1e6).toString(36)}`, tag: "t", ref: "John 3:16", start };
    if (i % 4 === 0) {
      // Never graded: placed by the fixed schedule alone, maybe reviewed
      if (random() < 0.5) verse.last = addDays(start, pick(400));
    } else {
      const log: LogEntry[] = [];
      let day = addDays(start, pick(30));
      for (let n = 0, count = 1 + pick(14); n < count; n++) {
        if (random() < 0.12) log.push({ day, set: random() < 0.25 ? 0 : 1 + pick(60) });
        else log.push({ day, grade: (1 + pick(4)) as Grade });
        // Some reviews the same day, most days or weeks apart
        day = addDays(day, random() < 0.2 ? 0 : 1 + pick(random() < 0.5 ? 10 : 90));
      }
      verse.log = log;
      verse.last = log.at(-1)!.day;
    }
    // Some paused, between the days looked at (without drawing on the random numbers, so the other cases stay as they were)
    if (i % 6 === 5) verse.paused = addDays(verse.last ?? start, 10);
    out.push(verse);
  }
  return out;
}

function generate() {
  const vs = verses();
  const cases = [];
  for (const [name, srs] of Object.entries(OPTIONS)) {
    for (const algorithm of ALGORITHM_IDS) {
      const sch = { algorithm, durations: DEFAULT_DURATIONS, srs };
      vs.forEach((verse, index) => {
        const lastDay = verse.last ?? verse.start;
        for (const day of [lastDay, addDays(lastDay, 3), addDays(lastDay, 45)]) {
          const s = verseStatus(verse, day, sch);
          cases.push({
            verse: index,
            options: name,
            algorithm,
            day,
            status: [s.phase, s.position, s.total, s.scheduled, s.due, s.next, s.interval ?? null, s.learning ?? false, s.fresh ?? false],
            preview: preview(verse, day, sch).map((p) => [p.grade, p.label, p.days]),
            memory: memoryOf(verse, day, sch),
          });
        }
      });
    }
  }
  return { durations: DEFAULT_DURATIONS, options: OPTIONS, verses: vs, cases };
}

test("the Rust crate's conformance cases are this engine's", () => {
  const text = JSON.stringify(generate()) + "\n";
  if (process.env.UPDATE_CONFORMANCE || !existsSync(FILE)) writeFileSync(FILE, text);
  assert.ok(readFileSync(FILE, "utf8") === text, "The engine changed: regenerate with UPDATE_CONFORMANCE=1 and run the Rust tests");
});
