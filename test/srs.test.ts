import { test } from "vitest";
import assert from "node:assert/strict";
import { addDays, daysBetween } from "../src/core/dates.ts";
import { DEFAULT_DURATIONS as D, startFor, type Verse } from "../src/core/schedule.ts";
import { anki, reviewIntervals } from "../src/core/srs/anki.ts";
import { predictRecall, timeToRecall, updateRecall, type EbisuModel } from "../src/core/srs/ebisu.ts";
import {
  ALGORITHM_IDS,
  ALGORITHMS,
  DEFAULT_SRS,
  dueVerses,
  isAdaptive,
  mergeSrs,
  placement,
  preview,
  verseStatus,
  withEntry,
  type AlgorithmId,
  type Grade,
  type Scheduler,
  type SrsOptions,
} from "../src/core/srs/index.ts";
import { leitner, pimsleur } from "../src/core/srs/ladder.ts";
import { sm2 } from "../src/core/srs/sm2.ts";
import type { Algorithm, BaseState } from "../src/core/srs/types.ts";
import { fuzzBounds } from "../src/core/srs/util.ts";

const noFuzz: SrsOptions = { ...DEFAULT_SRS, anki: { ...DEFAULT_SRS.anki, fuzz: false } };
const half = () => 0.5;

/** Reviews a new card with each grade on its day, returning the state after each */
function run<S extends BaseState>(algorithm: Algorithm<S>, reviews: [day: string, grade: Grade][], o: SrsOptions = noFuzz): S[] {
  let s = algorithm.init(o);
  return reviews.map(([day, grade]) => (s = algorithm.review(s, grade, day, o, half)));
}

/** Reviews a card each day it's due with `grade`, returning the intervals */
function intervals<S extends BaseState>(algorithm: Algorithm<S>, grade: Grade, count: number, o: SrsOptions = noFuzz): number[] {
  let s = algorithm.init(o);
  let day = "2026-01-01";
  const out: number[] = [];
  while (out.length < count) {
    s = algorithm.review(s, grade, day, o, half);
    if (s.due! > day) out.push(s.interval);
    day = s.due! > day ? s.due! : day;
  }
  return out;
}

test("SM-2: 1 day, 6 days, then times the E-Factor; below 4 is drilled the same day", () => {
  assert.deepEqual(intervals(sm2, 3, 5), [1, 6, 15, 38, 95]);
  const [first] = run(sm2, [["2026-01-01", 4]]);
  assert.equal(first!.ef, 2.6);
  // Hard (q 3) lowers the E-Factor by 0.14 and is drilled today
  const [, hard] = run(sm2, [["2026-01-01", 3], ["2026-01-02", 2]]);
  assert.equal(hard!.ef.toFixed(2), "2.36");
  assert.equal(hard!.due, "2026-01-02");
  assert.equal(hard!.next, "2026-01-08");
  // Forgotten: back to the start, E-Factor kept; a drill recalled leaves the schedule
  const states = run(sm2, [["2026-01-01", 3], ["2026-01-02", 3], ["2026-01-08", 1], ["2026-01-08", 1], ["2026-01-08", 3]]);
  const [, , lapse, drill, done] = states;
  assert.equal(lapse!.n, 0);
  assert.equal(lapse!.ef, 2.5);
  assert.equal(lapse!.lapses, 1);
  assert.equal(lapse!.due, "2026-01-08");
  assert.equal(drill!.next, "2026-01-09");
  assert.equal(done!.due, "2026-01-09");
  assert.equal(done!.lapses, 1);
  // Early reviews don't count toward the schedule
  const early = run(sm2, [["2026-01-01", 3], ["2026-01-02", 3], ["2026-01-03", 3]]);
  assert.equal(early[2]!.due, "2026-01-08");
});

test("Anki: learning steps in the sitting, then graduating, then ease", () => {
  const [a, b, c] = run(anki, [["2026-01-01", 3], ["2026-01-01", 3], ["2026-01-02", 3]]);
  assert.equal(a!.phase, "learning");
  assert.equal(a!.due, "2026-01-01");
  assert.equal(a!.stepMinutes, 10);
  assert.equal(b!.phase, "review");
  assert.equal(b!.interval, 1);
  assert.equal(c!.interval, 3);
  // Easy from new graduates at the easy interval
  assert.equal(run(anki, [["2026-01-01", 4]])[0]!.interval, 4);
  // Hard, Good, Easy at 10 days with 250%: 12, 25, 33 (each longer than the last)
  assert.deepEqual(reviewIntervals(noFuzz.anki, 10, 10, 2.5, 0.5), { hard: 12, good: 25, easy: 33 });
  // Four days late, Good counts half the delay and Easy all of it
  assert.deepEqual(reviewIntervals(noFuzz.anki, 10, 14, 2.5, 0.5), { hard: 12, good: 30, easy: 46 });
  // Early: by the days that did pass, never shorter than it was for Good
  assert.deepEqual(reviewIntervals(noFuzz.anki, 10, 4, 2.5, 0.5), { hard: 6, good: 10, easy: 12 });
});

test("Anki: a lapse relearns, lowers the ease, and keeps a share of the interval", () => {
  let s = anki.place(anki.init(noFuzz), "2026-01-01", 20, noFuzz);
  s = anki.review(s, 1, "2026-01-21", noFuzz, half);
  assert.equal(s.phase, "relearning");
  assert.equal(s.ease, 2.3);
  assert.equal(s.lapses, 1);
  assert.equal(s.due, "2026-01-21");
  s = anki.review(s, 3, "2026-01-21", noFuzz, half);
  assert.equal(s.phase, "review");
  assert.equal(s.interval, 1);
  const keep = { ...noFuzz, anki: { ...noFuzz.anki, newInterval: 0.5, relearningSteps: [] } };
  const kept = anki.review(anki.place(anki.init(keep), "2026-01-01", 20, keep), 1, "2026-01-21", keep, half);
  assert.equal(kept.interval, 10);
});

test("fuzz stays in Anki's ranges", () => {
  assert.deepEqual(fuzzBounds(2, 1, 100), [2, 2]);
  assert.deepEqual(fuzzBounds(10, 1, 100), [8, 12]);
  assert.deepEqual(fuzzBounds(100, 1, 100), [93, 100]);
  const fuzzy = { ...DEFAULT_SRS };
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const r = Math.random;
    const s = anki.review(anki.place(anki.init(fuzzy), "2026-01-01", 10, fuzzy), 3, "2026-01-11", fuzzy, r);
    seen.add(s.interval);
  }
  for (const n of seen) assert.ok(n >= 22 && n <= 28, `${n}`);
  assert.ok(seen.size > 1);
});

test("Leitner and Pimsleur climb a box at a time", () => {
  assert.deepEqual(intervals(leitner, 3, 9), [1, 2, 4, 8, 16, 32, 64, 128, 128]);
  assert.deepEqual(intervals(pimsleur, 3, 6), [1, 5, 25, 120, 730, 730]);
  const [, , , missed] = run(leitner, [["2026-01-01", 3], ["2026-01-02", 3], ["2026-01-04", 3], ["2026-01-08", 1]]);
  assert.equal(missed!.box, 0);
  assert.equal(missed!.interval, 1);
  const [, , , back] = run(pimsleur, [["2026-01-01", 3], ["2026-01-02", 3], ["2026-01-07", 3], ["2026-02-01", 1]]);
  assert.equal(back!.box, 1);
  assert.equal(back!.interval, 5);
});

/** Ebisu's posterior moments by integrating over the prior, to check the closed form */
function integrate(prior: EbisuModel, success: boolean, tnow: number, tback: number) {
  const [a, b, t] = prior;
  const n = 20000;
  let z = 0, m1 = 0, m2 = 0;
  for (let i = 1; i < n; i++) {
    const p = i / n;
    const density = p ** (a - 1) * (1 - p) ** (b - 1);
    const pnow = p ** (tnow / t);
    const like = success ? pnow : 1 - pnow;
    const pback = p ** (tback / t);
    z += density * like;
    m1 += density * like * pback;
    m2 += density * like * pback * pback;
  }
  return { mean: m1 / z, variance: m2 / z - (m1 / z) ** 2 };
}

test("Ebisu: recall halves at the half-life, and quizzes move it", () => {
  const prior: EbisuModel = [3, 3, 1];
  assert.ok(Math.abs(predictRecall(prior, 1) - 0.5) < 1e-12);
  assert.ok(Math.abs(timeToRecall(prior, 0.5) - 1) < 1e-6);
  for (const success of [true, false]) {
    for (const tnow of [0.5, 2, 5]) {
      const post = updateRecall(prior, success, tnow, tnow);
      const mean = post[0] / (post[0] + post[1]);
      const variance = (post[0] * post[1]) / ((post[0] + post[1]) ** 2 * (post[0] + post[1] + 1));
      const want = integrate(prior, success, tnow, tnow);
      assert.ok(Math.abs(mean - want.mean) < 1e-3, `mean ${success} ${tnow}: ${mean} ${want.mean}`);
      assert.ok(Math.abs(variance - want.variance) < 1e-3, `variance ${success} ${tnow}`);
    }
  }
  assert.ok(timeToRecall(updateRecall(prior, true, 2), 0.5) > 1);
  assert.ok(timeToRecall(updateRecall(prior, false, 0.5), 0.5) < 1);
});

const verse = (start: string, last?: string, log?: Verse["log"]): Verse => ({ id: `v${start}`, tag: "t", ref: "John 3:16", start, last, log });
const sch = (algorithm: AlgorithmId, srs: SrsOptions = noFuzz): Scheduler => ({ algorithm, durations: D, srs });

test("placement: where the fixed schedule has a verse, as a last review and an interval", () => {
  assert.equal(placement(verse("2026-03-01"), "2026-02-01", D), null);
  assert.equal(placement(verse("2026-03-01"), "2026-03-01", D), null);
  assert.deepEqual(placement(verse("2026-03-01", "2026-03-01"), "2026-03-01", D), { day: "2026-03-01", set: 1 });
  assert.deepEqual(placement(verse("2026-03-01"), "2026-03-05", D), { day: "2026-03-04", set: 1 });
  const weekly = startFor("weekly", 3, "2026-06-01", D);
  assert.deepEqual(placement(verse(weekly), "2026-06-01", D), { day: "2026-05-25", set: 7 });
  const monthly = startFor("monthly", 2, "2026-06-15", D);
  assert.deepEqual(placement(verse(monthly), "2026-06-15", D), { day: "2026-05-15", set: 31 });
  assert.deepEqual(placement(verse(monthly, "2026-06-15"), "2026-06-20", D), { day: "2026-06-15", set: 30 });
});

test("a verse placed in the fixed schedule starts there under every algorithm", () => {
  const day = "2026-06-01";
  const weekly = verse(startFor("weekly", 3, day, D));
  for (const id of ALGORITHM_IDS) {
    const s = verseStatus(weekly, day, sch(id));
    assert.equal(s.due, true, id);
    if (isAdaptive(id)) {
      assert.equal(s.interval, 7, id);
      assert.equal(s.phase, "weekly", id);
    }
  }
  // Not yet started: upcoming everywhere
  for (const id of ALGORITHM_IDS) assert.equal(verseStatus(verse("2026-07-01"), day, sch(id)).phase, "upcoming");
});

test("FSRS from new: steps in the sitting, then days by stability", () => {
  const day = "2026-01-01";
  let v = verse(day);
  const s0 = verseStatus(v, day, sch("fsrs"));
  assert.equal(s0.fresh, true);
  assert.equal(s0.due, true);
  assert.deepEqual(preview(v, day, sch("fsrs")).map((p) => p.label), ["<1m", "<6m", "<10m", "8d"]);
  v = { ...v, last: day, log: withEntry(v, { day, grade: 3 }, D) };
  const s1 = verseStatus(v, day, sch("fsrs"));
  assert.equal(s1.learning, true);
  assert.equal(s1.due, true);
  v = { ...v, log: withEntry(v, { day, grade: 3 }, D) };
  const s2 = verseStatus(v, day, sch("fsrs"));
  assert.equal(s2.due, false);
  assert.ok(s2.interval! >= 2, `${s2.interval}`);
});

test("one history replays through every algorithm", () => {
  // Reviewed every day for a month the fixed way, then switched
  const start = "2026-01-01";
  let v = verse(start);
  for (let i = 0; i < 30; i++) {
    const day = addDays(start, i);
    v = { ...v, last: day, log: withEntry(v, { day, grade: 3 }, D) };
  }
  const day = addDays(start, 30);
  for (const id of ALGORITHM_IDS) {
    const s = verseStatus(v, day, sch(id));
    assert.ok(s.phase !== "upcoming", id);
    if (isAdaptive(id)) {
      // Nobody's schedule runs away from a month of daily reviews
      assert.ok(s.interval! >= 1 && s.interval! <= 400, `${id}: ${s.interval}`);
      const due = s.scheduled ?? s.next!;
      assert.ok(daysBetween(day, due) <= 400, id);
    }
  }
});

test("due verses come by phase, under any algorithm", () => {
  const day = "2026-06-01";
  const verses = [verse(startFor("monthly", 2, day, D)), verse(startFor("daily", 4, day, D)), verse("2026-07-01")];
  for (const id of ALGORITHM_IDS) assert.deepEqual(dueVerses(verses, day, sch(id)).map((v) => v.id), [verses[1]!.id, verses[0]!.id], id);
});

test("every algorithm's grades preview the intervals they give", () => {
  const day = "2026-06-01";
  const v = verse(startFor("weekly", 2, day, D));
  for (const id of ALGORITHM_IDS.filter(isAdaptive)) {
    const p = preview(v, day, sch(id));
    assert.deepEqual(p.map((x) => x.grade), [...ALGORITHMS[id].grades], id);
    const passing = p.filter((x) => x.grade > 1).map((x) => x.days);
    assert.deepEqual(passing, [...passing].sort((a, b) => a - b), `${id} in order`);
  }
});

test("options saved before an option existed get its default", () => {
  const merged = mergeSrs({ anki: { startingEase: 2.3 } });
  assert.equal(merged.anki.startingEase, 2.3);
  assert.equal(merged.anki.easyBonus, 1.3);
  assert.deepEqual(merged.fsrs, DEFAULT_SRS.fsrs);
});
