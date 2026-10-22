import { create } from "zustand";
import type { Day } from "@/core/dates";
import { dueVerses, type Verse } from "@/core/schedule";
import { reviewDay, useApp } from "./store";

/**
 * Today's review: the verses due when it began (by id), one card at a time, the topic and
 * reference first and the verse once revealed. Not saved: a reload starts over with what's
 * still due, which leaves out what was reviewed.
 */
interface Review {
  queue: string[];
  index: number;
  revealed: boolean;
  /** Verses reviewed in this sitting, for the summary */
  reviewed: number;
  /** The day the queue is for, so a page left open overnight starts again */
  day: Day;
}

export const useReview = create<Review>()(() => ({ queue: [], index: 0, revealed: false, reviewed: 0, day: "" }));

useApp.subscribe((state, previous) => {
  if (state.verses.length === previous.verses.length) return;
  // Verses added and due today join the review: after the card in front, or as a new review
  // once it was done (still counting what was reviewed)
  if (state.verses.length > previous.verses.length) {
    const r = useReview.getState();
    if (!r.day) return;
    if (r.index < r.queue.length) return startReview(r.day, true);
    const { reviewed } = r;
    startReview(r.day);
    useReview.setState({ reviewed });
    return;
  }
  // A verse deleted mid-review leaves the queue (the cards before it step back one)
  const ids = new Set(state.verses.map((v) => v.id));
  useReview.setState((r) => ({
    queue: r.queue.filter((id) => ids.has(id)),
    index: r.index - r.queue.slice(0, r.index).filter((id) => !ids.has(id)).length,
  }));
});

/**
 * Starts the review over with what's due on `day`. With `keepCurrent`, the card in front stays
 * there if it's still due (coming back to the review mid-way), and the cards before it stay
 * behind it for going back to.
 */
export function startReview(day: Day = reviewDay(), keepCurrent = false) {
  const { verses, settings } = useApp.getState();
  const r = useReview.getState();
  const due = dueVerses(verses, day, settings.durations, settings.order).map((v) => v.id);
  const current = r.queue[r.index];
  if (keepCurrent && r.day === day && current !== undefined && due.includes(current)) {
    const before = r.queue.slice(0, r.index);
    const queue = [...before, ...due.filter((id) => !before.includes(id))];
    useReview.setState({ queue, index: queue.indexOf(current) });
    return;
  }
  useReview.setState({ queue: due, index: 0, revealed: false, reviewed: 0, day });
}

/** The verse in front, skipping any deleted since the review began */
export function currentVerse(verses: readonly Verse[], r: Review): Verse | null {
  const id = r.queue[r.index];
  return id === undefined ? null : (verses.find((v) => v.id === id) ?? null);
}

export const reveal = () => useReview.setState({ revealed: true });

export function back() {
  const { index } = useReview.getState();
  if (index > 0) useReview.setState({ index: index - 1, revealed: true });
}

/** Counts a verse reviewed on `day` (once, however often it's seen) */
export function markReviewed(verse: Verse, day: Day) {
  if (verse.last !== day) useReview.setState((r) => ({ reviewed: r.reviewed + 1 }));
  useApp.getState().updateVerse(verse.id, { last: day });
}

/** Marks the card in front reviewed and goes on */
export function next(day: Day) {
  const r = useReview.getState();
  const verse = currentVerse(useApp.getState().verses, r);
  if (verse) markReviewed(verse, day);
  advance();
}

/** Puts the card in front at another place in the schedule (counted as reviewed) and goes on */
export function moveCurrent(start: Day, day: Day) {
  const r = useReview.getState();
  const verse = currentVerse(useApp.getState().verses, r);
  if (!verse) return;
  useApp.getState().updateVerse(verse.id, { start });
  markReviewed({ ...verse, start }, day);
  advance();
}

function advance() {
  useReview.setState((r) => ({ index: r.index + 1, revealed: false }));
}
