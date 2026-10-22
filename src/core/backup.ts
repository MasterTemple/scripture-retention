import { isDay, type Day } from "./dates.ts";
import type { Queued } from "./queue.ts";
import type { Verse } from "./schedule.ts";
import type { LogEntry } from "./srs/types.ts";

/**
 * Everything, as one file: the verses with their review history (which a list leaves out), the
 * queue, and the settings, to restore here or on another device
 */
export interface Backup {
  app: "scripture-retention";
  version: 1;
  saved: string;
  verses: Verse[];
  queue: Queued[];
  queueChecked?: Day;
  settings: Record<string, unknown>;
}

export function makeBackup(state: { verses: Verse[]; queue: Queued[]; queueChecked?: Day; settings: object }, now = new Date()): Backup {
  const { verses, queue, queueChecked, settings } = state;
  return { app: "scripture-retention", version: 1, saved: now.toISOString(), verses, queue, ...(queueChecked ? { queueChecked } : {}), settings: { ...settings } };
}

const isEntry = (e: unknown): e is LogEntry => {
  if (typeof e !== "object" || e === null) return false;
  const x = e as Record<string, unknown>;
  if (typeof x.day !== "string" || !isDay(x.day)) return false;
  return "set" in x ? typeof x.set === "number" && x.set >= 0 : [1, 2, 3, 4].includes(x.grade as number);
};

const isVerse = (v: unknown): v is Verse => {
  if (typeof v !== "object" || v === null) return false;
  const x = v as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.tag === "string" &&
    typeof x.ref === "string" &&
    typeof x.start === "string" &&
    isDay(x.start) &&
    (x.last === undefined || (typeof x.last === "string" && isDay(x.last))) &&
    (x.log === undefined || (Array.isArray(x.log) && x.log.every(isEntry)))
  );
};

const isQueued = (q: unknown): q is Queued =>
  typeof q === "object" && q !== null && typeof (q as Queued).id === "string" && typeof (q as Queued).tag === "string" && typeof (q as Queued).ref === "string";

/** A backup read back, or why it can't be */
export function readBackup(text: string): Backup | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "This isn't a backup file (it isn't JSON).";
  }
  const b = data as Partial<Backup>;
  if (typeof data !== "object" || data === null || b.app !== "scripture-retention") return "This isn't a Scripture Retention backup.";
  if (b.version !== 1) return "This backup is from a newer version of the app.";
  if (!Array.isArray(b.verses) || !b.verses.every(isVerse)) return "The backup's verses can't be read.";
  if (!Array.isArray(b.queue) || !b.queue.every(isQueued)) return "The backup's queue can't be read.";
  if (typeof b.settings !== "object" || b.settings === null) return "The backup's settings can't be read.";
  return b as Backup;
}
