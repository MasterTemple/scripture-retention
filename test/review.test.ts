import { beforeEach, test } from "vitest";
import assert from "node:assert/strict";
import { DEFAULT_SRS, mergeSrs, preview, toAlgorithm } from "../src/core/srs/index.ts";
import { back, currentVerse, forward, gradedAt, next, startReview, useReview } from "../src/state/review.ts";
import { useApp } from "../src/state/store.ts";

const day = "2026-10-21";
// Review cards due today (placed 30 days ago), and the settings Anki's defaults without fuzz
const placed = (id: string) => ({ id, tag: "", ref: `John 3:${id.charCodeAt(0) - 96}`, start: "2026-01-01", last: "2026-09-21", log: [{ day: "2026-09-21", set: 30 }] });

beforeEach(() => {
  useApp.setState((s) => ({
    verses: [placed("a"), placed("b"), placed("c")],
    queue: [],
    settings: { ...s.settings, algorithm: "anki", order: "phase", srs: { ...DEFAULT_SRS, anki: { ...DEFAULT_SRS.anki, fuzz: false } } },
  }));
  startReview(day);
});

const ids = () => useReview.getState().queue;
const verse = (id: string) => useApp.getState().verses.find((v) => v.id === id)!;
const grades = (id: string) => verse(id).log!.flatMap((e) => ("grade" in e ? [e.grade] : []));

test("a forgotten verse comes back, and deleting another mid-review doesn't make its next grade a regrade", () => {
  next(day, 1);
  assert.deepEqual(ids(), ["a", "b", "c", "a"]);
  next(day, 3);
  next(day, 3);
  // Delete b while a's second look is in front
  useApp.setState((s) => ({ verses: s.verses.filter((v) => v.id !== "b") }));
  assert.deepEqual(ids(), ["a", "c", "a"]);
  assert.equal(currentVerse(useApp.getState().verses, useReview.getState())?.id, "a");
  next(day, 3);
  assert.deepEqual(grades("a"), [1, 3], "the Again stays, the Good is added");
});

test("going back and forward doesn't grade a card again", () => {
  next(day, 1);
  back();
  forward(day);
  assert.deepEqual(grades("a"), [1]);
  assert.deepEqual(ids(), ["a", "b", "c", "a"], "its second look stays");
});

test("going back and grading again replaces that grade, and the buttons show what they'd do in its place", () => {
  const first = preview(verse("a"), day, useApp.getState().settings).map((p) => p.label);
  next(day, 1);
  back();
  assert.deepEqual(preview(verse("a"), day, useApp.getState().settings, gradedAt(useReview.getState())).map((p) => p.label), first);
  next(day, 3);
  assert.deepEqual(grades("a"), [3]);
  assert.deepEqual(ids(), ["a", "b", "c"], "recalled, it no longer needs a second look");
});

test("regrading the first of two looks replaces that one, not the second", () => {
  next(day, 1);
  next(day, 3);
  next(day, 3);
  next(day, 3); // a's second look: relearned
  assert.deepEqual(grades("a"), [1, 3]);
  useReview.setState({ index: 0 });
  next(day, 2);
  assert.deepEqual(grades("a"), [2, 3]);
});

test("saved settings this version can't use fall back to defaults", () => {
  assert.equal(toAlgorithm("foo"), "fixed");
  assert.equal(toAlgorithm("ebisu"), "ebisu");
  const merged = mergeSrs({ anki: { learningSteps: "1m 10m", easyBonus: 1.5, fuzz: "yes" }, fsrs: { params: [1, "x"] }, nope: {} });
  assert.deepEqual(merged.anki.learningSteps, DEFAULT_SRS.anki.learningSteps);
  assert.equal(merged.anki.easyBonus, 1.5);
  assert.equal(merged.anki.fuzz, true);
  assert.deepEqual(merged.fsrs.params, []);
  assert.deepEqual(mergeSrs(undefined), DEFAULT_SRS);
});
