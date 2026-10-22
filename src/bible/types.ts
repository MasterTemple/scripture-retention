/** One verse, by topos's book id (1 Genesis … 66 Revelation) */
export interface VerseRef {
  bookId: number;
  chapter: number;
  verse: number;
}

/** A verse's text in one translation; verses printed together share their text */
export interface VerseText {
  text: string;
  /** The first and last verse of a combined verse ("4-5"), when it is one */
  span?: [first: number, last: number];
  /** The chapters a combined verse starts and ends in, when they differ ("1:31-2:1") */
  chapters?: [first: number, last: number];
}

/** The verses printed with this one, "4–5" or "1:31–2:1"; `null` for a verse printed alone */
export function spanLabel(t: VerseText): string | null {
  if (!t.span) return null;
  const [first, last] = t.span;
  return t.chapters ? `${t.chapters[0]}:${first}–${t.chapters[1]}:${last}` : `${first}–${last}`;
}

/** Every verse of one book in one translation, keyed by `chapter:verse` */
export interface BookText {
  bookId: number;
  verses: Record<string, VerseText>;
}

/** A Bible on fetch.bible, by its id there */
export type TranslationSource = { kind: "fetch"; id: string };

export interface Translation {
  /** Stable id used for storage, e.g. "fetch:eng_bsb" */
  id: string;
  name: string;
  abbreviation: string;
  source: TranslationSource;
  language?: string;
  attribution?: string;
  attributionUrl?: string;
}
