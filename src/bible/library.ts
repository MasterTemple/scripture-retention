import { createStore, delMany, get, keys, set } from "idb-keyval";
import { bookById } from "./topos";
import { fetchBookUrl } from "./translations";
import type { BookText, Translation } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker";

/** Parsed books, by `${translationId}/${bookId}` */
const db = createStore("scripture-retention", "books");

/** Bump when parse.ts reads books differently (what it keeps of a verse, how it cleans text) */
const PARSER = 3;

/**
 * What reads books now: this parser and logoxide's text version, which changes only when a
 * release reads files differently. A downloaded book read by something else is downloaded again.
 */
export const READER = `${PARSER}/logoxide ${__LOGOXIDE_TEXT_VERSION__}`;

/** A book as saved: `reader` is what read it (missing for books saved before it was recorded) */
type SavedBook = BookText & { reader?: string };

/**
 * Whether a saved book can be used as it is. Uploads always can, since there's nothing to read
 * them again from; downloads only when read by today's reader.
 */
export const isCurrent = (saved: SavedBook, translation: Translation) =>
  translation.source.kind !== "fetch" || saved.reader === READER;

type Pending = {
  resolve: (r: { books: BookText[]; skipped: string[] }) => void;
  reject: (e: Error) => void;
  progress?: (done: number, total: number) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

/** A request without its id, for each kind */
type Request = WorkerRequest extends infer R ? (R extends unknown ? Omit<R, "id"> : never) : never;

function call(req: Request, transfer: Transferable[] = [], progress?: Pending["progress"]) {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const p = pending.get(res.id);
      if (!p) return;
      if ("progress" in res) {
        p.progress?.(res.progress.done, res.progress.total);
        return;
      }
      pending.delete(res.id);
      if (res.ok) p.resolve({ books: res.books, skipped: res.skipped });
      else p.reject(new Error(res.error));
    };
    worker.onerror = (event) => {
      for (const p of pending.values()) p.reject(new Error(event.message || "The Bible reader failed to load"));
      pending.clear();
      worker = null;
    };
  }
  const id = nextId++;
  return new Promise<{ books: BookText[]; skipped: string[] }>((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    worker!.postMessage({ ...req, id }, transfer);
  });
}

const memory = new Map<string, Promise<BookText | null>>();
const cacheKey = (translationId: string, bookId: number) => `${translationId}/${bookId}`;

/**
 * A book of a translation: from memory, then IndexedDB, then (for built-in translations)
 * downloaded and parsed. `null` when the translation doesn't have the book.
 */
export function loadBook(translation: Translation, bookId: number): Promise<BookText | null> {
  const key = cacheKey(translation.id, bookId);
  let book = memory.get(key);
  if (!book) {
    book = (async () => {
      const saved = await get<SavedBook>(key, db).catch(() => undefined);
      if (saved && isCurrent(saved, translation)) return saved;
      if (translation.source.kind !== "fetch") return null;
      const url = fetchBookUrl(translation.source.id, bookById(bookId).usfm);
      let parsed: BookText | null;
      try {
        parsed = (await call({ type: "fetchBook", url })).books[0] ?? null;
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

/** Book ids saved on this device, by translation id */
export async function downloadedBooks(): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (const key of await keys<string>(db)) {
    const slash = key.lastIndexOf("/");
    const id = key.slice(0, slash);
    out.set(id, [...(out.get(id) ?? []), Number(key.slice(slash + 1))]);
  }
  return out;
}

/** Forgets a translation's saved books (built-in ones download again when used) */
export async function removeTranslationBooks(translationId: string) {
  const mine = (await keys<string>(db)).filter((k) => k.startsWith(`${translationId}/`));
  await delMany(mine, db);
  for (const k of [...memory.keys()]) if (k.startsWith(`${translationId}/`)) memory.delete(k);
}

/** Reads uploaded USFM, USX, or OSIS files (or zips of them) and saves them as a translation */
export async function importFiles(translationId: string, files: File[], onProgress?: (done: number, total: number) => void) {
  const payload = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })));
  const { books, skipped } = await call({ type: "parseFiles", files: payload }, payload.map((p) => p.bytes), onProgress);
  for (const book of books) {
    const key = cacheKey(translationId, book.bookId);
    await set(key, { ...book, reader: READER } satisfies SavedBook, db);
    memory.set(key, Promise.resolve(book));
  }
  return { books: books.map((b) => b.bookId).sort((a, b) => a - b), skipped };
}
