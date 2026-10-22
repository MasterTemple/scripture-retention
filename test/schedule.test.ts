import { test } from "vitest";
import assert from "node:assert/strict";
import { addDays, addMonths, monthsBetween, isDay } from "../src/core/dates.ts";
import { boundaries, DEFAULT_DURATIONS as D, startFor, status, type Verse } from "../src/core/schedule.ts";
import { DEFAULT_SRS, dueVerses } from "../src/core/srs/index.ts";

const verse = (start: string, last?: string): Verse => ({ id: start, tag: "t", ref: "John 3:16", start, last });

test("dates", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-03-15", -3), "2025-12-15");
  assert.equal(monthsBetween("2026-01-31", "2026-02-28"), 1);
  assert.equal(monthsBetween("2026-01-15", "2026-02-14"), 0);
  assert.ok(isDay("2024-02-29"));
  assert.ok(!isDay("2026-02-29"));
});

test("phases follow the start day", () => {
  const b = boundaries("2026-01-01", D);
  assert.deepEqual(b, { daily: "2026-01-01", weekly: "2026-02-19", monthly: "2026-09-19", retained: "2033-09-19" });
  assert.equal(status(verse("2026-01-01"), "2025-12-31", D).phase, "upcoming");
  assert.deepEqual(
    { ...status(verse("2026-01-01"), "2026-02-18", D) },
    { phase: "daily", position: 49, total: 49, scheduled: "2026-02-18", due: true, next: "2026-02-19" },
  );
  const weekly = status(verse("2026-01-01"), "2026-02-25", D);
  assert.equal(weekly.phase, "weekly");
  assert.equal(weekly.position, 1);
  assert.equal(weekly.scheduled, "2026-02-19");
  assert.equal(weekly.next, "2026-02-26");
  assert.equal(weekly.total, 31);
  const monthly = status(verse("2026-01-01"), "2026-10-19", D);
  assert.equal(monthly.phase, "monthly");
  assert.equal(monthly.position, 2);
  assert.equal(monthly.total, 84);
  assert.equal(status(verse("2026-01-01"), "2033-09-19", D).phase, "retained");
});

test("a verse is due until reviewed after its scheduled day", () => {
  assert.equal(status(verse("2026-01-01", "2026-02-19"), "2026-02-24", D).due, false);
  assert.equal(status(verse("2026-01-01", "2026-02-18"), "2026-02-24", D).due, true);
  assert.equal(status(verse("2026-01-01", "2026-02-18"), "2026-02-18", D).due, false);
});

test("startFor puts a verse at the given position today", () => {
  const day = "2026-10-14";
  for (const [bucket, max] of [["daily", 49], ["weekly", 30], ["monthly", 84]] as const) {
    for (let n = 1; n <= max; n++) {
      const s = status(verse(startFor(bucket, n, day, D)), day, D);
      assert.equal(s.phase, bucket);
      assert.equal(s.position, n, `${bucket} ${n}`);
      assert.equal(s.scheduled, day, `${bucket} ${n} is due today`);
    }
  }
  // Month ends
  for (const day of ["2026-03-31", "2026-02-28", "2024-02-29", "2026-08-31"]) {
    for (let n = 1; n <= 84; n++) {
      const s = status(verse(startFor("monthly", n, day, D)), day, D);
      assert.equal(s.phase, "monthly");
      assert.equal(s.position, n, `${day} month ${n}`);
    }
  }
});

test("due verses come daily, then weekly, then monthly", () => {
  const day = "2026-10-14";
  const m = verse(startFor("monthly", 2, day, D));
  const w = verse(startFor("weekly", 2, day, D));
  const d = verse(startFor("daily", 2, day, D));
  const done = verse(startFor("daily", 3, day, D), day);
  assert.deepEqual(dueVerses([m, done, w, d], day, { algorithm: "fixed", durations: D, srs: DEFAULT_SRS }).map((v) => v.id), [d.id, w.id, m.id]);
});
