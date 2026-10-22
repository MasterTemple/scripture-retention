/// <reference lib="webworker" />
// Fits FSRS's parameters off the main thread, with the Rust engine's WebAssembly (fsrs-rs, the
// optimizer Anki runs), loaded only when it's asked for
import { Grade, initialized, ScriptureSrs, type LogItem, type VerseRecord } from "scripture-srs";
import type { Verse } from "@/core/schedule";

export type OptimizeRequest = { verses: Verse[] };
export type OptimizeResponse = { ok: true; params: number[]; reviews: number; verses: number } | { ok: false; error: string };

const GRADES = [Grade.Again, Grade.Hard, Grade.Good, Grade.Easy];

const record = (v: Verse): VerseRecord => ({
  id: v.id,
  tag: v.tag,
  reference: v.ref,
  start: v.start,
  last: v.last ?? null,
  deck: v.deck ?? null,
  passage: v.passage ?? null,
  paused: v.paused ?? null,
  log: (v.log ?? []).map((e): LogItem => ("set" in e ? { tag: "Place", day: e.day, days: e.set } : { tag: "Review", day: e.day, grade: GRADES[e.grade - 1]! })),
});

self.onmessage = async (event: MessageEvent<OptimizeRequest>) => {
  try {
    await initialized;
    const fit = ScriptureSrs.new().optimizeFsrs(event.data.verses.map(record));
    self.postMessage({ ok: true, params: Array.from(fit.params), reviews: fit.reviews, verses: fit.verses } satisfies OptimizeResponse);
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies OptimizeResponse);
  }
};
