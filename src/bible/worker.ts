/// <reference lib="webworker" />
// Parses USX with logoxide off the main thread: its WebAssembly is large, so the page stays
// responsive and only loads it when a book is first needed.
import { initialized, Logoxide, Topos } from "logoxide";
import { readBook } from "./parse";
import type { BookText } from "./types";

export type WorkerRequest = { id: number; type: "fetchBook"; url: string };

export type WorkerResponse = { id: number; ok: true; book: BookText | null } | { id: number; ok: false; error: string };

let lx: Logoxide;
let topos: Topos;
const ready = initialized.then(() => {
  lx = Logoxide.new();
  topos = Topos.new();
});

async function handle(req: WorkerRequest): Promise<BookText | null> {
  await ready;
  const response = await fetch(req.url);
  if (response.status === 404) return null; // the translation lacks the book
  if (!response.ok) throw new Error(`Download failed (${response.status} ${response.statusText})`);
  const book = readBook(lx, topos, "usx", await response.text()); // fetch.bible serves USX
  if (!book) throw new Error("The downloaded book couldn't be read");
  return book;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    self.postMessage({ id: req.id, ok: true, book: await handle(req) } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({ id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
  }
};
