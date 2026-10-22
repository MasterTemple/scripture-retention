import { isDay, type Day } from "./dates.ts";
import type { Queued } from "./queue.ts";
import { status, PHASE_NAMES, PHASES, startFor, type Bucket, type Durations, type Phase, type Verse } from "./schedule.ts";

/**
 * Lists of verses, for importing many at once and exporting them all. A line is a verse:
 *
 *     `#topic` Psalm 119:147-148 @week 3
 *
 * The topic is optional (backticks too); a heading such as `Daily:`, `Weekly:`, or `## Monthly`
 * puts the verses below it in that bucket, at its first review today unless the line says
 * otherwise: `@day 12`, `@week 3`, `@month 5` (a bucket and a position in it), or `@2026-09-01`
 * (the day its daily reviews began). Under a `Queue:` heading, verses without either are queued
 * rather than started. List markers (`-`, `1.`) are ignored
 */
export interface ListEntry {
  /** 1-based line in the text */
  line: number;
  tag: string;
  ref: string;
  bucket: Bucket;
  /** Where in the bucket it starts (1 when not given) */
  position: number;
  /** A start day given outright, which wins over the bucket and position */
  start?: Day;
  /** Under a queue heading with no position or date: queued, not started */
  queued?: true;
}

export interface ListError {
  line: number;
  text: string;
  message: string;
}

export interface ParsedList {
  entries: ListEntry[];
  errors: ListError[];
}

const BUCKET_WORDS: [RegExp, Bucket | "queue"][] = [
  [/\b(queue|queued)\b/i, "queue"],
  [/\b(day|daily)\b/i, "daily"],
  [/\b(week|weekly)\b/i, "weekly"],
  [/\b(month|monthly)\b/i, "monthly"],
];

const POSITION_WORDS: Record<string, Bucket> = { d: "daily", day: "daily", w: "weekly", week: "weekly", m: "monthly", month: "monthly" };

/** Something that looks like a reference: a book (maybe numbered) and a chapter, ending in a number */
const REFERENCE = /^(?:[1-3]|I{1,3})?\s*[A-Za-z][A-Za-z .']*\s+\d[\d:.,;\s\-–—a-c]*$/;

export function parseList(text: string): ParsedList {
  const entries: ListEntry[] = [];
  const errors: ListError[] = [];
  let bucket: Bucket | "queue" = "daily";
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const content = raw
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/, "")
      .replace(/`/g, "")
      .trim();
    if (!content) continue;
    const heading = headingBucket(content);
    if (heading !== undefined) {
      if (heading) bucket = heading;
      continue;
    }
    const match = /^(?:#(\S*)\s+)?(.*?)(?:\s+@\s*(.+))?$/.exec(content)!;
    const tag = (match[1] ?? "").trim();
    const ref = (match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!REFERENCE.test(ref)) {
      errors.push({ line, text: raw, message: ref ? `"${ref}" doesn't look like a reference` : "No reference" });
      continue;
    }
    const entry: ListEntry = { line, tag, ref, bucket: bucket === "queue" ? "daily" : bucket, position: 1 };
    if (bucket === "queue" && !match[3]) entry.queued = true;
    if (match[3]) {
      const at = match[3].trim();
      const position = /^(d|day|w|week|m|month)\s*(\d+)$/i.exec(at);
      if (isDay(at)) entry.start = at;
      else if (position && Number(position[2]) >= 1) {
        entry.bucket = POSITION_WORDS[position[1]!.toLowerCase()]!;
        entry.position = Number(position[2]);
      } else {
        errors.push({ line, text: raw, message: `"@${at}" should be a date (@2026-09-01) or a position (@day 12, @week 3, @month 5)` });
        continue;
      }
    }
    entries.push(entry);
  }
  return { entries, errors };
}

/**
 * The bucket a heading line names, null for a heading naming none (`Retained:`), undefined when
 * the line isn't a heading. A heading is a Markdown heading, or a line ending in `:` with no digits
 */
function headingBucket(content: string): Bucket | "queue" | null | undefined {
  const markdown = /^#{1,6}\s+(.*)$/.exec(content);
  const text = markdown ? (markdown[1] ?? "") : content.endsWith(":") && !/\d/.test(content) ? content : null;
  if (text === null) return undefined;
  for (const [pattern, bucket] of BUCKET_WORDS) if (pattern.test(text)) return bucket;
  return null;
}

/** The start day of an imported entry, when imported on `day` */
export function entryStart(entry: ListEntry, day: Day, durations: Durations): Day {
  return entry.start ?? startFor(entry.bucket, entry.position, day, durations);
}

/** Every verse as a list that imports back to the same schedule (each line with its start day), then the queue */
export function formatList(verses: readonly Verse[], day: Day, durations: Durations, queue: readonly Queued[] = []): string {
  const groups = new Map<Phase, Verse[]>(PHASES.map((p) => [p, []]));
  for (const verse of verses) groups.get(status(verse, day, durations).phase)!.push(verse);
  const sections: string[] = [];
  for (const [phase, list] of groups) {
    if (list.length === 0) continue;
    list.sort((a, b) => a.start.localeCompare(b.start));
    const lines = list.map((v) => `${v.tag ? `\`#${v.tag}\` ` : ""}${v.ref} @${v.start}`);
    sections.push(`## ${PHASE_NAMES[phase]}\n\n${lines.join("\n")}`);
  }
  if (queue.length > 0) sections.push(`## Queue\n\n${queue.map((q) => `${q.tag ? `\`#${q.tag}\` ` : ""}${q.ref}`).join("\n")}`);
  return sections.join("\n\n") + "\n";
}

/** How many entries land in each phase when imported on `day`, and in the queue */
export function countByBucket(entries: readonly ListEntry[], day: Day, durations: Durations): Record<Phase | "queued", number> {
  const counts = Object.fromEntries([...PHASES, "queued"].map((p) => [p, 0])) as Record<Phase | "queued", number>;
  for (const entry of entries) {
    if (entry.queued) {
      counts.queued++;
      continue;
    }
    const start = entryStart(entry, day, durations);
    counts[status({ id: "", tag: "", ref: "", start }, day, durations).phase]++;
  }
  return counts;
}
