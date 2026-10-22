import { test } from "vitest";
import assert from "node:assert/strict";
import * as v6 from "ts-fsrs";
import * as v5 from "ts-fsrs-v4";
import * as v45 from "ts-fsrs-v3";
import { FSRS45_DEFAULTS, FSRS5_DEFAULTS, FSRS6_DEFAULTS, fsrsModel, fsrsVersion, parseParams, type FsrsModel } from "../src/core/srs/fsrs.ts";
import { seeded } from "../src/core/srs/util.ts";
import type { Grade } from "../src/core/srs/types.ts";

// ts-fsrs 5 is FSRS-6, 4 is FSRS-5, 3 is FSRS-4.5: each version's memory model, checked against its reference

const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b)), `${what}: ${a} ≠ ${b}`);

type Memory = { stability: number; difficulty: number } | null;

/** Our model's memory after a review `t` days after the last (0: the same day) */
function ours(m: FsrsModel, memory: Memory, t: number, g: Grade): { stability: number; difficulty: number } {
  if (!memory) return { stability: m.initStability(g), difficulty: m.initDifficulty(g) };
  const { stability: s, difficulty: d } = memory;
  if (t === 0) return { stability: m.shortTermStability(s, g), difficulty: m.nextDifficulty(d, g) };
  const r = m.retrievability(t, s);
  return { stability: g === 1 ? m.forgetStability(d, s, r) : m.recallStability(d, s, r, g), difficulty: m.nextDifficulty(d, g) };
}

function cases(count: number) {
  const random = seeded(7);
  return Array.from({ length: count }, () => ({
    stability: 0.1 + random() * 400,
    difficulty: 1 + random() * 9,
    t: random() < 0.15 ? 0 : 1 + Math.floor(random() * 300),
    g: (1 + Math.floor(random() * 4)) as Grade,
  }));
}

test("FSRS-6 matches ts-fsrs 5", () => {
  const ref = v6.fsrs(v6.generatorParameters({ enable_fuzz: false, enable_short_term: true }));
  const m = fsrsModel(FSRS6_DEFAULTS);
  assert.equal(m.version, "6");
  for (const g of [1, 2, 3, 4] as Grade[]) {
    const a = ref.next_state(null, 0, g);
    const b = ours(m, null, 0, g);
    close(b.stability, a.stability, `init S ${g}`);
    close(b.difficulty, a.difficulty, `init D ${g}`);
  }
  for (const c of cases(500)) {
    const a = ref.next_state({ stability: c.stability, difficulty: c.difficulty }, c.t, c.g);
    const b = ours(m, c, c.t, c.g);
    close(b.stability, a.stability, `S ${JSON.stringify(c)}`);
    close(b.difficulty, a.difficulty, `D ${JSON.stringify(c)}`);
    close(m.retrievability(c.t, c.stability), ref.forgetting_curve(c.t, c.stability), "R");
    assert.equal(Math.max(1, Math.round(m.interval(c.stability, 0.9))), ref.next_interval(c.stability, c.t), `interval ${c.stability}`);
  }
});

test("FSRS-5 matches ts-fsrs 4", () => {
  const ref = v5.fsrs(v5.generatorParameters({ enable_fuzz: false, enable_short_term: true }));
  const m = fsrsModel(FSRS5_DEFAULTS);
  assert.equal(m.version, "5");
  for (const c of cases(500)) {
    const a = ref.next_state({ stability: c.stability, difficulty: c.difficulty }, c.t, c.g);
    const b = ours(m, c, c.t, c.g);
    close(b.stability, a.stability, `S ${JSON.stringify(c)}`);
    close(b.difficulty, a.difficulty, `D ${JSON.stringify(c)}`);
    assert.equal(Math.max(1, Math.round(m.interval(c.stability, 0.9))), ref.next_interval(c.stability, c.t), `interval ${c.stability}`);
  }
});

test("FSRS-4.5 matches ts-fsrs 3", () => {
  const ref = v45.fsrs(v45.generatorParameters({ enable_fuzz: false }));
  const m = fsrsModel(FSRS45_DEFAULTS);
  assert.equal(m.version, "4.5");
  for (const g of [1, 2, 3, 4] as Grade[]) {
    close(m.initStability(g), ref.init_stability(g), `init S ${g}`);
    close(m.initDifficulty(g), ref.init_difficulty(g), `init D ${g}`);
  }
  for (const c of cases(500).filter((c) => c.t > 0)) {
    const r = m.retrievability(c.t, c.stability);
    close(r, ref.forgetting_curve(c.t, c.stability), "R");
    close(m.nextDifficulty(c.difficulty, c.g), ref.next_difficulty(c.difficulty, c.g), `D ${JSON.stringify(c)}`);
    if (c.g === 1) close(m.forgetStability(c.difficulty, c.stability, r), ref.next_forget_stability(c.difficulty, c.stability, r), `S fail ${JSON.stringify(c)}`);
    else close(m.recallStability(c.difficulty, c.stability, r, c.g), ref.next_recall_stability(c.difficulty, c.stability, r, c.g), `S ${JSON.stringify(c)}`);
    assert.equal(Math.max(1, Math.round(m.interval(c.stability, 0.9))), ref.next_interval(c.stability), `interval ${c.stability}`);
  }
});

test("parameters pasted from Anki pick their version", () => {
  assert.equal(fsrsVersion([]), "6");
  assert.deepEqual(parseParams(FSRS5_DEFAULTS.join(", ")), FSRS5_DEFAULTS);
  assert.equal(fsrsVersion(parseParams(FSRS45_DEFAULTS.join(" "))!), "4.5");
  assert.equal(parseParams("1, 2, 3"), null);
  assert.equal(parseParams("x ".repeat(21)), null);
  assert.deepEqual(parseParams("  "), []);
});
