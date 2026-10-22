/**
 * Passages: a book, chapters, or any reference ("1 Peter", "Romans 8-12", "Psalm 119:1-16")
 * memorized as a whole and added as one entry. Its cards (a card per verse, per chapter, per
 * group of verses, or one card) are ordinary verses, each with its own schedule, added and
 * deleted together.
 */
export type CardUnit = "verse" | "chapter" | "group" | "whole";
export const CARD_UNITS: readonly CardUnit[] = ["verse", "chapter", "group", "whole"];

export interface PassageGroup {
  id: string;
  /** The reference as written: `1 Peter`, `Romans 8-12` */
  ref: string;
  /** The topic its cards share, without `#` */
  tag: string;
  deck?: string;
  unit: CardUnit;
  /** Verses a card, for groups */
  size?: number;
}

/** A passage as topos reads it: its book, the book's chapter count, and every verse in it */
export interface ReadPassage {
  book: string;
  /** How many chapters the book has (a single-chapter book's chapter is named by the book alone) */
  chapters: number;
  /** As topos writes it: `1 Peter 1:3-2:10` */
  reference: string;
  verses: readonly { chapter: number; verse: number }[];
}

/** Verses in a chapter, in order */
type Run = number[];

/** `3`, `3-7`, or several ranges: `3-7,9` */
function ranges(verses: Run): string {
  const parts: string[] = [];
  let start = verses[0]!;
  let end = start;
  for (const v of verses.slice(1)) {
    if (v === end + 1) end = v;
    else {
      parts.push(start === end ? `${start}` : `${start}-${end}`);
      start = end = v;
    }
  }
  parts.push(start === end ? `${start}` : `${start}-${end}`);
  return parts.join(",");
}

/** The passage's verses by chapter, in order */
function byChapter(p: ReadPassage): [number, Run][] {
  const chapters = new Map<number, Run>();
  for (const { chapter, verse } of p.verses) {
    const run = chapters.get(chapter) ?? [];
    if (!run.includes(verse)) run.push(verse);
    chapters.set(chapter, run);
  }
  return [...chapters].map(([c, run]) => [c, run.sort((a, b) => a - b)]);
}

/**
 * The references of a passage's cards: `1 Peter 1:3` a verse; `1 Peter 1` a whole chapter (a
 * single-chapter book's by its name alone, since `Jude 1` is its first verse), or the verses of
 * one in part (`Romans 8:1-17`); `1 Peter 1:1-5` a group of verses within a chapter; or the
 * passage itself as one card. `chapterLength` gives how many verses a chapter has
 */
export function cardRefs(read: readonly ReadPassage[], unit: CardUnit, size: number, chapterLength: (book: string, chapter: number) => number): string[] {
  if (read.length === 0) return [];
  if (unit === "whole") return [read.map((p) => p.reference).join("; ")];
  const out: string[] = [];
  for (const p of read) {
    for (const [chapter, verses] of byChapter(p)) {
      const at = (vs: Run) => `${p.book} ${chapter}:${ranges(vs)}`;
      if (unit === "verse") {
        out.push(...verses.map((v) => at([v])));
      } else if (unit === "chapter") {
        const whole = verses.length === chapterLength(p.book, chapter) && verses[0] === 1;
        out.push(whole ? (p.chapters === 1 ? p.book : `${p.book} ${chapter}`) : at(verses));
      } else {
        const n = Math.max(1, Math.floor(size));
        for (let i = 0; i < verses.length; i += n) out.push(at(verses.slice(i, i + n)));
      }
    }
  }
  // A reference named twice ("Psalm 23; Psalm 23:1") is one card
  return [...new Set(out)];
}

/** `a card per verse`, `a card per chapter`, `groups of 5 verses`, `one card` */
export function describeUnit(unit: CardUnit, size = 1): string {
  switch (unit) {
    case "verse": return "a card per verse";
    case "chapter": return "a card per chapter";
    case "group": return `groups of ${size} verses`;
    case "whole": return "one card";
  }
}
