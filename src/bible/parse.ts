import { BookStyle, LogoxideBook, LogoxideErrorException, type BookVerseText, type Logoxide, type LogoxideBible, type Topos } from "logoxide";
import type { BookText, VerseText } from "./types";

export type Markup = "usx" | "usfm" | "osis";

/**
 * Cleans what logoxide's plain text keeps that a reader doesn't type: paragraph marks, extra
 * spaces, and the invisible characters logoxide's verse hashes drop (zero-width space,
 * byte-order mark, soft hyphen, word joiner; joiners that shape a script are kept). Composed
 * (NFC), so "é" is one character however the file wrote it. `verseTexts` composes and drops
 * those characters itself (verse-hash rule 1) but keeps paragraph marks.
 */
export const clean = (text: string) =>
  text
    .normalize("NFC")
    .replace(/[\u200B\uFEFF\u00AD\u2060]/g, "")
    .replace(/[¶§]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Every verse of a USX, USFM, or OSIS book; `null` if it isn't one logoxide can read */
export function readBook(lx: Logoxide, topos: Topos, markup: Markup, source: string): BookText | null {
  const usx = markup === "usfm" ? lx.usfmToUsx(source) : source;
  const book = LogoxideBook.parse(topos, markup === "osis" ? "osis" : "usx", usx);
  if (!book) return null;
  try {
    return bookText(topos, book);
  } finally {
    book.dispose();
  }
}

/** Every verse of a book logoxide has read; `null` if it names no book topos knows */
export function bookText(topos: Topos, book: LogoxideBook): BookText | null {
  const bookId = book.bookId();
  const osis = bookId ? topos.books()[bookId - 1]?.osis : undefined;
  if (!bookId || !osis) return null;
  // A verse printed in parts ("20a", "20b") is read whole, its parts joined
  const parts = new Map<string, { first: BookVerseText; texts: string[] }>();
  for (const v of book.verseTexts()) {
    const key = `${v.chapter}:${v.verse}`;
    const seen = parts.get(key);
    if (seen && v.part > 0) seen.texts.push(v.text);
    else if (!seen) parts.set(key, { first: v, texts: [v.text] });
  }
  const verses: Record<string, VerseText> = {};
  for (const { first: v, texts } of parts.values()) {
    const text = clean(texts.join(" "));
    if (!text) continue;
    // Verses printed together ("4-5", or across chapters "1:31-2:1") share their text
    const lastChapter = Math.max(v.lastChapter, v.chapter);
    const across = lastChapter > v.chapter;
    const last = across ? v.last : Math.max(v.last, v.verse);
    const together = across || last > v.verse;
    const entry: VerseText = !together ? { text } : across ? { text, span: [v.verse, last], chapters: [v.chapter, lastChapter] } : { text, span: [v.verse, last] };
    // Across chapters, the verses between are topos's (the default versification's), which
    // may not count to the translation's own first or last verse
    const passage = across ? topos.parse(`${osis}.${v.chapter}.${v.verse}-${osis}.${lastChapter}.${last}`, BookStyle.Name) : null;
    const covered = passage
      ? topos.verses(passage)
      : Array.from({ length: last - v.verse + 1 }, (_, i) => ({ chapter: v.chapter, verse: v.verse + i }));
    for (const end of [{ chapter: v.chapter, verse: v.verse }, { chapter: lastChapter, verse: last }]) {
      if (!covered.some((c) => c.chapter === end.chapter && c.verse === end.verse)) covered.push(end);
    }
    for (const c of covered) verses[`${c.chapter}:${c.verse}`] = entry;
  }
  return { bookId, verses };
}

/**
 * Reads uploaded files, keeping the books it can read. logoxide finds each file's format, opens
 * a zip (a whole Bible, as eBible.org and Paratext export them) whatever folders its books are
 * in, and cuts a whole-Bible OSIS file into its books. `skipped` names the uploaded files that
 * gave no book; a zip's other files (copyright pages, front matter, signatures) aren't worth
 * mentioning. `onProgress` hears how many books are read of how many.
 */
export function readFiles(
  lx: Logoxide,
  topos: Topos,
  files: { name: string; bytes: Uint8Array }[],
  onProgress?: (done: number, total: number) => void,
) {
  const uploaded = new Set(files.map((f) => f.name));
  let bible: LogoxideBible;
  try {
    bible = lx.openBible(files.map((f) => ({ path: f.name, bytes: f.bytes })));
  } catch (error) {
    // Not one book in them
    if (error instanceof LogoxideErrorException && error.value.tag === "NotFound") return { books: [], skipped: [...uploaded] };
    throw error;
  }
  try {
    const skipped = bible.skipped().map((s) => s.path).filter((path) => uploaded.has(path));
    const fileOf = new Map(bible.bookFiles().map((f) => [f.bookId, f.path]));
    const ids = [...bible.books()];
    const books: BookText[] = [];
    for (const [i, id] of ids.entries()) {
      onProgress?.(i, ids.length);
      let text: BookText | null = null;
      try {
        const book = bible.book(id);
        try {
          text = bookText(topos, book);
        } finally {
          book.dispose();
        }
      } catch {
        // Passed over, as a book without verses is
      }
      if (text && Object.keys(text.verses).length) books.push(text);
      else if (uploaded.has(fileOf.get(id) ?? "")) skipped.push(fileOf.get(id)!);
    }
    onProgress?.(ids.length, ids.length);
    return { books, skipped };
  } finally {
    bible.dispose();
  }
}
