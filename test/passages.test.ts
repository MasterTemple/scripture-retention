import { beforeAll, test } from "vitest";
import assert from "node:assert/strict";
import { chapterLength, loadTopos, readPassages } from "../src/bible/topos.ts";
import { cardRefs, type CardUnit } from "../src/core/passages.ts";

beforeAll(loadTopos);

const cards = (ref: string, unit: CardUnit, size = 5) => cardRefs(readPassages(ref), unit, size, chapterLength);
const verses = (ref: string) => readPassages(ref).flatMap((p) => p.verses.map((v) => `${p.book} ${v.chapter}:${v.verse}`));

test("a book's cards, split each way", () => {
  assert.deepEqual(cards("1 Peter", "chapter"), ["1 Peter 1", "1 Peter 2", "1 Peter 3", "1 Peter 4", "1 Peter 5"]);
  assert.equal(cards("1 Peter", "verse").length, 105);
  assert.deepEqual(cards("1 Peter", "group").slice(0, 6), ["1 Peter 1:1-5", "1 Peter 1:6-10", "1 Peter 1:11-15", "1 Peter 1:16-20", "1 Peter 1:21-25", "1 Peter 2:1-5"]);
  // Groups stay within a chapter: 25, 25, 22, 19, and 14 verses
  assert.equal(cards("1 Peter", "group").length, 22);
  assert.deepEqual(cards("1 Peter", "whole"), ["1 Peter"]);
});

test("part of a chapter, a single-chapter book, and a passage named twice", () => {
  assert.deepEqual(cards("Romans 8:1-17", "chapter"), ["Romans 8:1-17"]);
  assert.deepEqual(cards("Romans 8-9", "chapter"), ["Romans 8", "Romans 9"]);
  // "Jude 1" would be its first verse, so its chapter is the book
  assert.deepEqual(cards("Jude", "chapter"), ["Jude"]);
  assert.deepEqual(cards("Psalm 23; Psalm 23:1", "verse").length, 6);
  assert.deepEqual(cards("1 Peter 1:3-2:10; Psalm 23", "whole"), ["1 Peter 1:3-2:10; Psalm 23"]);
  assert.deepEqual(cards("not a reference", "chapter"), []);
});

test("every card reads back as the verses it was cut from", () => {
  for (const [ref, unit, size] of [["1 Peter", "chapter", 5], ["Jude", "chapter", 5], ["Psalm 119:1-40", "group", 8], ["Romans 8:1-17", "chapter", 5], ["Philemon", "group", 7], ["James 1", "verse", 1]] as const) {
    const whole = verses(ref);
    const fromCards = cards(ref, unit, size).flatMap(verses);
    assert.deepEqual(fromCards, whole, `${ref} as ${unit}`);
  }
});
