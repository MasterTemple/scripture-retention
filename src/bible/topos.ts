import { BookStyle, initialized, OffsetUnit, ToposOptions, type BookInfo, type Topos } from "topos-bible";
import type { VerseRef } from "./types";

let instance: Topos | null = null;
let books: BookInfo[] = [];

/** Loads topos's WebAssembly; call once before anything else here */
export async function loadTopos() {
  if (instance) return;
  await initialized;
  // A book named alone ("Jude") is the whole book
  instance = ToposOptions.create().booksAlone(true).build();
  books = instance.books();
}

function topos(): Topos {
  if (!instance) throw new Error("topos is not loaded yet");
  return instance;
}

export function bookById(id: number): BookInfo {
  const book = books[id - 1];
  if (!book) throw new Error(`no book ${id}`);
  return book;
}

/** A reference as written, read by topos: the passages in it, each with its verses */
export interface Passage {
  /** As topos writes it, e.g. "Romans 8:28-30" */
  reference: string;
  bookId: number;
  verses: VerseRef[];
}

/** Every passage a reference names ("Psalm 119:147-148", "1 John 1:9; 2:1"), in order */
export function readReference(text: string): Passage[] {
  if (!text.trim()) return [];
  const t = topos();
  return t.search(text, OffsetUnit.Utf16).map((m) => ({
    reference: m.passage.reference,
    bookId: m.passage.bookId,
    verses: t.verses(m.passage).map(({ chapter, verse }) => ({ bookId: m.passage.bookId, chapter, verse })),
  }));
}

/** Reference completions for what's typed at `cursor`, replacing `start`–`end` with `text` */
export function completeReference(text: string, cursor: number, limit = 6) {
  return topos().complete(text, cursor, OffsetUnit.Utf16, BookStyle.Name, limit);
}
