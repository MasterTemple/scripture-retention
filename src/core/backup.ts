import { isDay, type Day } from "./dates.ts";
import type { Queued } from "./queue.ts";
import type { Verse } from "./schedule.ts";
import type { LogEntry } from "./srs/types.ts";
import type { Deck } from "./decks.ts";
import { CARD_UNITS, type PassageGroup } from "./passages.ts";

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
  /** Decks, and books or passages added as one (absent in backups from before them) */
  decks?: Deck[];
  passages?: PassageGroup[];
}

export function makeBackup(
  state: { verses: Verse[]; queue: Queued[]; queueChecked?: Day; settings: object; decks?: Deck[]; passages?: PassageGroup[] },
  now = new Date(),
): Backup {
  const { verses, queue, queueChecked, settings, decks, passages } = state;
  return {
    app: "scripture-retention",
    version: 1,
    saved: now.toISOString(),
    verses,
    queue,
    ...(queueChecked ? { queueChecked } : {}),
    settings: { ...settings },
    ...(decks ? { decks } : {}),
    ...(passages ? { passages } : {}),
  };
}

const isDeck = (d: unknown): d is Deck => typeof d === "object" && d !== null && typeof (d as Deck).id === "string" && typeof (d as Deck).name === "string";
const isPassage = (p: unknown): p is PassageGroup =>
  typeof p === "object" && p !== null && typeof (p as PassageGroup).id === "string" && typeof (p as PassageGroup).ref === "string" && typeof (p as PassageGroup).tag === "string" && CARD_UNITS.includes((p as PassageGroup).unit);

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
    (x.paused === undefined || (typeof x.paused === "string" && isDay(x.paused))) &&
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
  if (b.decks !== undefined && !(Array.isArray(b.decks) && b.decks.every(isDeck))) return "The backup's decks can't be read.";
  if (b.passages !== undefined && !(Array.isArray(b.passages) && b.passages.every(isPassage))) return "The backup's passages can't be read.";
  return b as Backup;
}
