import { beforeEach, test } from "vitest";
import assert from "node:assert/strict";
import { makeBackup, readBackup } from "../src/core/backup.ts";
import { addDays } from "../src/core/dates.ts";
import { DEFAULT_DURATIONS as D, status, type Verse } from "../src/core/schedule.ts";
import { DEFAULT_SRS, dueVerses, verseStatus } from "../src/core/srs/index.ts";
import { currentVerse, hasMore, next, reveal, showAll, startReview, step, useReview } from "../src/state/review.ts";
import { useApp } from "../src/state/store.ts";

const day = "2026-10-21";
const fixed = { algorithm: "fixed" as const, durations: D, srs: DEFAULT_SRS };
const anki = { ...fixed, algorithm: "anki" as const };
// Started ten days ago, reviewed through yesterday: due today at day 11
const verse = (id: string, extra: Partial<Verse> = {}): Verse => ({ id, tag: "", ref: "John 3:16", start: addDays(day, -10), last: addDays(day, -1), ...extra });

beforeEach(() => {
  useApp.setState((s) => ({ verses: [verse("a"), verse("b"), verse("c")], queue: [], passages: [], settings: { ...s.settings, algorithm: "fixed", order: "phase", reviewDeck: null, verseByVerse: false } }));
  startReview(day);
});

const ids = () => useReview.getState().queue;
const find = (id: string) => useApp.getState().verses.find((v) => v.id === id)!;

test("a paused verse isn't due, and is held where it was, under any algorithm", () => {
  const paused = verse("a", { paused: addDays(day, -5) });
  const later = addDays(day, 30);
  const s = status(paused, later, D);
  assert.deepEqual([s.phase, s.position, s.due, s.next, s.paused], ["daily", 6, false, null, true]);
  assert.deepEqual(dueVerses([paused], later, fixed), []);
  assert.deepEqual(dueVerses([paused], later, anki), []);
  assert.equal(verseStatus(paused, later, anki).paused, true);
  // Never graded: placed then as the fixed schedule had it, not as it'd have it now
  assert.equal(verseStatus(paused, later, anki).interval, verseStatus({ ...paused, paused: undefined }, addDays(day, -5), anki).interval);
});

test("resumed, a verse picks up where it was when paused", () => {
  const app = useApp.getState();
  app.pauseVerses(["a"], true, day);
  assert.equal(find("a").paused, day);
  app.pauseVerses(["a"], false, addDays(day, 20));
  const a = find("a");
  assert.equal(a.paused, undefined);
  const s = status(a, addDays(day, 20), D);
  assert.deepEqual([s.phase, s.position, s.due], ["daily", 11, true], "day 11 again, due");
  // Paused and resumed the same day, nothing moves
  app.pauseVerses(["b"], true, day);
  app.pauseVerses(["b"], false, day);
  assert.equal(find("b").start, verse("b").start);
});

test("pausing mid-review takes the verse out of the cards ahead; resuming brings it back", () => {
  assert.deepEqual(ids(), ["a", "b", "c"]);
  next(day);
  useApp.getState().pauseVerses(["a", "c"], true, day);
  assert.deepEqual(ids(), ["a", "b"], "a was graded already, so it stays to go back to");
  assert.equal(currentVerse(useApp.getState().verses, useReview.getState())?.id, "b");
  useApp.getState().pauseVerses(["c"], false, day);
  assert.deepEqual(ids(), ["a", "b", "c"]);
  next(day);
  next(day);
  assert.equal(useReview.getState().reviewed, 3);
});

test("a paused verse comes through a backup", () => {
  useApp.getState().pauseVerses(["a"], true, day);
  const read = readBackup(JSON.stringify(makeBackup(useApp.getState())));
  assert.ok(typeof read !== "string");
  assert.equal(read.verses.find((v) => v.id === "a")?.paused, day);
  assert.equal(typeof readBackup(JSON.stringify(makeBackup({ ...useApp.getState(), verses: [verse("x", { paused: "soon" })] }))), "string");
});

test("verse by verse, each step shows the next verse, then goes on", () => {
  useApp.getState().updateSettings({ verseByVerse: true });
  reveal();
  useReview.setState({ length: 3 });
  assert.equal(useReview.getState().shown, 1);
  step(day);
  step(day);
  assert.equal(useReview.getState().shown, 3);
  assert.ok(!hasMore(useReview.getState()));
  step(day);
  assert.equal(useReview.getState().index, 1, "with every verse shown, it goes on");
  assert.equal(find("a").last, day);
  reveal();
  showAll();
  assert.ok(!hasMore(useReview.getState()));
});

test("with verse by verse off, the whole card shows at once", () => {
  reveal();
  useReview.setState({ length: 3 });
  assert.ok(!hasMore(useReview.getState()));
  step(day);
  assert.equal(useReview.getState().index, 1);
});
