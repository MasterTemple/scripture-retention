import { expect, test } from "vitest";
import type { Passage } from "../src/bible/topos";
import type { VerseText } from "../src/bible/types";
import { showVerses } from "../src/state/text";

const passage = (chapter: number, verses: [number, number][]): Passage => ({
  reference: "",
  bookId: 19,
  verses: verses.map(([c, v]) => ({ bookId: 19, chapter: c ?? chapter, verse: v })),
});

test("a single verse has no number", () => {
  expect(showVerses(passage(101, [[101, 3]]), () => ({ text: "I will set nothing wicked before my eyes." }))).toEqual([
    { label: null, text: "I will set nothing wicked before my eyes." },
  ]);
});

test("verses are numbered, with the chapter when it changes, and verses printed together once", () => {
  const together: VerseText = { text: "Four and five.", span: [4, 5] };
  const texts: Record<string, VerseText> = { "1:3": { text: "Three." }, "1:4": together, "1:5": together, "2:1": { text: "One." } };
  const shown = showVerses(passage(1, [[1, 3], [1, 4], [1, 5], [2, 1]]), (key) => texts[key]);
  expect(shown).toEqual([
    { label: "3", text: "Three." },
    { label: "4–5", text: "Four and five." },
    { label: "2:1", text: "One." },
  ]);
});
