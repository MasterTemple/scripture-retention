import { useEffect, useState } from "react";
import { loadBook } from "@/bible/library";
import { readReference, type Passage } from "@/bible/topos";
import { spanLabel, type Translation, type VerseText } from "@/bible/types";

/** A verse of a passage as shown: its number (when the passage has several) and its text */
export interface ShownVerse {
  label: string | null;
  text: string;
}

export interface ShownPassage {
  reference: string;
  verses: ShownVerse[];
}

export type PassageText =
  | { status: "loading" }
  | { status: "ready"; passages: ShownPassage[] }
  /** The reference names no verse topos knows */
  | { status: "unknown" }
  /** The translation doesn't have these verses */
  | { status: "missing" }
  | { status: "error"; error: string };

/** The text of every passage a reference names, in a translation */
export async function passageText(reference: string, translation: Translation): Promise<PassageText> {
  const passages = readReference(reference);
  if (passages.length === 0) return { status: "unknown" };
  const shown: ShownPassage[] = [];
  for (const passage of passages) {
    const book = await loadBook(translation, passage.bookId);
    const verses = book ? showVerses(passage, (key) => book.verses[key]) : [];
    if (verses.length > 0) shown.push({ reference: passage.reference, verses });
  }
  return shown.length > 0 ? { status: "ready", passages: shown } : { status: "missing" };
}

/**
 * A passage's verses, numbered when there are several (with the chapter when it changes), and
 * verses printed together ("4–5") shown once
 */
export function showVerses(passage: Passage, text: (key: string) => VerseText | undefined): ShownVerse[] {
  const out: ShownVerse[] = [];
  const many = passage.verses.length > 1;
  let chapter = passage.verses[0]?.chapter;
  let previous: VerseText | undefined;
  for (const v of passage.verses) {
    const t = text(`${v.chapter}:${v.verse}`);
    if (!t || (previous && t.text === previous.text && t.span && previous.span)) continue;
    previous = t;
    const number = spanLabel(t) ?? String(v.verse);
    const label = !many ? null : v.chapter !== chapter && !t.chapters ? `${v.chapter}:${number}` : number;
    chapter = v.chapter;
    out.push({ label, text: t.text });
  }
  return out;
}

/** The text of a reference, loading (the book downloads the first time) */
export function usePassageText(reference: string, translation: Translation): [PassageText, () => void] {
  const [state, setState] = useState<PassageText>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    passageText(reference, translation).then(
      (s) => live && setState(s),
      (error: unknown) => live && setState({ status: "error", error: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      live = false;
    };
  }, [reference, translation, attempt]);
  return [state, () => setAttempt((n) => n + 1)];
}

/** Downloads the books of these references ahead, so the cards after this one open at once and offline */
export function prefetch(references: string[], translation: Translation) {
  const books = new Set<number>();
  for (const reference of references) {
    try {
      for (const p of readReference(reference)) books.add(p.bookId);
    } catch {
      // Not a reference topos reads; its card says so
    }
  }
  for (const bookId of books) loadBook(translation, bookId).catch(() => {});
}
