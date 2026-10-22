import { isDay, type Day } from "./dates.ts";
import type { Queued } from "./queue.ts";
import { DEFAULT_DECK, deckOf, type Deck } from "./decks.ts";
import type { CardUnit, PassageGroup } from "./passages.ts";
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
 * rather than started. List markers (`-`, `1.`) are ignored.
 *
 * A book, chapters, or any passage added as one says how its cards are split:
 * `1 Peter as chapters`, `Romans 8 as verses`, `Psalm 119 as groups of 8`, `James as one card`.
 * A `Deck: Name` heading puts the lines below it in that deck
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
  /** The deck it goes in, by name (under a `Deck:` heading); none for the default deck */
  deck?: string;
  /** A passage added as one, and how its cards are split */
  passage?: { unit: CardUnit; size?: number };
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
/** A passage may name a book alone ("1 Peter as chapters"), and be several, `;` apart ("Romans 8-12; Romans 14") */
const PASSAGE_PART = /^(?:[1-3]|I{1,3})?\s*[A-Za-z][A-Za-z .']*(?:\s+\d[\d:.,\s\-–—a-c]*)?$/;
const isPassage = (ref: string) => ref.split(/\s*;\s*/).every((part) => PASSAGE_PART.test(part) || /^\d[\d:.,\s\-–—a-c]*$/.test(part));

/** `verses`, `chapters`, `groups of 8`, `one card`: how a passage's cards are split */
function readUnit(text: string): { unit: CardUnit; size?: number } | null {
  const t = text.trim().toLowerCase();
  if (/^(?:a card per )?verses?$/.test(t)) return { unit: "verse" };
  if (/^(?:a card per )?chapters?$/.test(t)) return { unit: "chapter" };
  const group = /^groups? of (\d+)(?: verses)?$/.exec(t);
  if (group && Number(group[1]) >= 1) return { unit: "group", size: Number(group[1]) };
  if (/^(?:one card|one|a whole|whole)$/.test(t)) return { unit: "whole" };
  return null;
}

/** How a list writes a passage's split */
export function writeUnit(p: { unit: CardUnit; size?: number }): string {
  switch (p.unit) {
    case "verse": return "verses";
    case "chapter": return "chapters";
    case "group": return `groups of ${p.size ?? 5}`;
    case "whole": return "one card";
  }
}

export function parseList(text: string): ParsedList {
  const entries: ListEntry[] = [];
  const errors: ListError[] = [];
  let bucket: Bucket | "queue" = "daily";
  let deck: string | undefined;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const content = raw
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/, "")
      .replace(/`/g, "")
      .trim();
    if (!content) continue;
    const deckHeading = /^(?:#{1,6}\s+)?deck:\s*(.+)$/i.exec(content);
    if (deckHeading) {
      deck = deckHeading[1]!.trim();
      bucket = "daily";
      continue;
    }
    const heading = headingBucket(content);
    if (heading !== undefined) {
      if (heading) bucket = heading;
      continue;
    }
    const match = /^(?:#(\S*)\s+)?(.*?)(?:\s+@\s*(.+))?$/.exec(content)!;
    const tag = (match[1] ?? "").trim();
    let ref = (match[2] ?? "").replace(/\s+/g, " ").trim();
    const split = /^(.*?)\s+as\s+(.+)$/i.exec(ref);
    const passage = split ? readUnit(split[2]!) : null;
    if (split && !passage) {
      errors.push({ line, text: raw, message: `"as ${split[2]}" should be as verses, as chapters, as groups of 5, or as one card` });
      continue;
    }
    if (split) ref = split[1]!.trim();
    if (!(passage ? isPassage(ref) : REFERENCE.test(ref))) {
      errors.push({ line, text: raw, message: ref ? `"${ref}" doesn't look like a reference` : "No reference" });
      continue;
    }
    const entry: ListEntry = { line, tag, ref, bucket: bucket === "queue" ? "daily" : bucket, position: 1 };
    if (deck) entry.deck = deck;
    if (passage) entry.passage = passage;
    // A passage is started (a queue holds single verses)
    else if (bucket === "queue" && !match[3]) entry.queued = true;
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

/**
 * Every verse as a list that imports back to the same schedule (each line with its start day),
 * then the queue. With decks or passages, each deck is a `# Deck:` section, and each passage a line
 * (`1 Peter as chapters @2026-01-04`, its cards' first start)
 */
export function formatList(
  verses: readonly Verse[],
  day: Day,
  durations: Durations,
  queue: readonly Queued[] = [],
  decks: readonly Deck[] = [],
  passages: readonly PassageGroup[] = [],
): string {
  const line = (x: { tag: string; ref: string }) => `${x.tag ? `\`#${x.tag}\` ` : ""}${x.ref}`;
  const body = (deckVerses: readonly Verse[], deckQueue: readonly Queued[], deckPassages: readonly PassageGroup[]) => {
    const groups = new Map<Phase, Verse[]>(PHASES.map((p) => [p, []]));
    for (const verse of deckVerses) if (!verse.passage) groups.get(status(verse, day, durations).phase)!.push(verse);
    const sections: string[] = [];
    for (const [phase, list] of groups) {
      if (list.length === 0) continue;
      list.sort((a, b) => a.start.localeCompare(b.start));
      sections.push(`## ${PHASE_NAMES[phase]}\n\n${list.map((v) => `${line(v)} @${v.start}`).join("\n")}`);
    }
    if (deckPassages.length > 0) {
      const lines = deckPassages.map((p) => {
        const start = verses.filter((v) => v.passage === p.id).map((v) => v.start).sort()[0];
        return `${line(p)} as ${writeUnit(p)}${start ? ` @${start}` : ""}`;
      });
      sections.push(`## Passages\n\n${lines.join("\n")}`);
    }
    if (deckQueue.length > 0) sections.push(`## Queue\n\n${deckQueue.map(line).join("\n")}`);
    return sections.join("\n\n");
  };
  if (decks.length <= 1 && passages.length === 0) return body(verses, queue, []) + "\n";
  const out = decks.map((d) => {
    const inDeck = <T extends { deck?: string }>(x: T) => deckOf(x) === d.id;
    const text = body(verses.filter(inDeck), queue.filter(inDeck), passages.filter(inDeck));
    return text ? `# Deck: ${d.name}\n\n${text}` : "";
  });
  return out.filter(Boolean).join("\n\n") + "\n";
}

/** The deck a list names, among the decks there are (the default deck by its name or none); undefined for one to add */
export function deckNamed(name: string | undefined, decks: readonly Deck[]): string | undefined {
  if (!name) return DEFAULT_DECK;
  return decks.find((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase())?.id;
}

/** How many entries land in each phase when imported on `day`, and in the queue */
export function countByBucket(entries: readonly ListEntry[], day: Day, durations: Durations | ((entry: ListEntry) => Durations)): Record<Phase | "queued", number> {
  const counts = Object.fromEntries([...PHASES, "queued"].map((p) => [p, 0])) as Record<Phase | "queued", number>;
  for (const entry of entries) {
    if (entry.passage) continue;
    if (entry.queued) {
      counts.queued++;
      continue;
    }
    const d = typeof durations === "function" ? durations(entry) : durations;
    const start = entryStart(entry, day, d);
    counts[status({ id: "", tag: "", ref: "", start }, day, d).phase]++;
  }
  return counts;
}
