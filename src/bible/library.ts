import { createStore, get, set } from "idb-keyval";
import { bookById } from "./topos";
import { fetchBookUrl } from "./translations";
import type { BookText, Translation } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker";

/** Parsed books, by `${translationId}/${bookId}` */
const db = createStore("scripture-retention", "books");

/** Bump when parse.ts reads books differently (what it keeps of a verse, how it cleans text) */
const PARSER = 1;

/**
 * What reads books now: this parser and logoxide's text version, which changes only when a
 * release reads files differently. A book read by something else is downloaded again.
 */
export const READER = `${PARSER}/logoxide ${__LOGOXIDE_TEXT_VERSION__}`;

/** A book as saved, with what read it */
type SavedBook = BookText & { reader?: string };

type Pending = { resolve: (book: BookText | null) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function call(req: Omit<WorkerRequest, "id">) {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const p = pending.get(res.id);
      if (!p) return;
      pending.delete(res.id);
      if (res.ok) p.resolve(res.book);
      else p.reject(new Error(res.error));
    };
    worker.onerror = (event) => {
      for (const p of pending.values()) p.reject(new Error(event.message || "The Bible reader failed to load"));
      pending.clear();
      worker = null;
    };
  }
  const id = nextId++;
  return new Promise<BookText | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ ...req, id });
  });
}

const memory = new Map<string, Promise<BookText | null>>();

/**
 * A book of a translation: from memory, then IndexedDB, then downloaded and parsed. `null` when
 * the translation doesn't have the book.
 */
export function loadBook(translation: Translation, bookId: number): Promise<BookText | null> {
  const key = `${translation.id}/${bookId}`;
  let book = memory.get(key);
  if (!book) {
    book = (async () => {
      const saved = await get<SavedBook>(key, db).catch(() => undefined);
      if (saved && saved.reader === READER) return saved;
      let parsed: BookText | null;
      try {
        parsed = await call({ type: "fetchBook", url: fetchBookUrl(translation.source.id, bookById(bookId).usfm) });
      } catch (error) {
        // Offline, a book read the old way is better than none
        if (saved) return saved;
        throw error;
      }
      if (parsed) await set(key, { ...parsed, reader: READER } satisfies SavedBook, db).catch(() => {});
      return parsed;
    })();
    book.catch(() => memory.delete(key));
    memory.set(key, book);
  }
  return book;
}
