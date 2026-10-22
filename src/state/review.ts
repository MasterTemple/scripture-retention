import { create } from "zustand";
import type { Day } from "@/core/dates";
import type { Verse } from "@/core/schedule";
import { dueVerses, isPlacing, verseStatus, type Grade } from "@/core/srs";
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
  const due = dueVerses(verses, day, settings, settings.order).map((v) => v.id);
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
function count(verse: Verse, day: Day) {
  if (verse.last !== day) useReview.setState((r) => ({ reviewed: r.reviewed + 1 }));
}

/** Grades the card in front (Good, under the fixed schedule) and goes on */
export function next(day: Day, grade: Grade = 3) {
  const r = useReview.getState();
  const verse = currentVerse(useApp.getState().verses, r);
  if (verse) {
    count(verse, day);
    useApp.getState().reviewVerse(verse.id, grade, day);
  }
  advance(verse, day);
}

/** Puts the card in front at another place in the fixed schedule (counted as reviewed) and goes on */
export function moveCurrent(start: Day, day: Day) {
  const verse = currentVerse(useApp.getState().verses, useReview.getState());
  if (!verse) return;
  count(verse, day);
  useApp.getState().moveVerse(verse.id, start, day, true);
  advance(verse, day);
}

/** Reschedules the card in front to come back in `days` (counted as reviewed) and goes on */
export function rescheduleCurrent(days: number, day: Day) {
  const verse = currentVerse(useApp.getState().verses, useReview.getState());
  if (!verse) return;
  count(verse, day);
  useApp.getState().placeVerse(verse.id, days, day, true);
  advance(verse, day);
}

/**
 * Goes to the next card. A verse that's still due today (a learning step, or a drill) goes to
 * the back of the queue, to be seen again before the review is done
 */
function advance(verse: Verse | null, day: Day) {
  const { verses, settings } = useApp.getState();
  const updated = verse && verses.find((v) => v.id === verse.id);
  useReview.setState((r) => {
    const again = updated && verseStatus(updated, day, settings).due && !r.queue.slice(r.index + 1).includes(updated.id);
    return { index: r.index + 1, revealed: false, queue: again ? [...r.queue, updated.id] : r.queue };
  });
}

/**
 * Forgets the reviews done on `day`, so those verses are due again and the review starts over
 * with them (handy for going through a day twice, or trying the app out). Moves stay as they are.
 */
export function resetDay(day: Day): number {
  const { verses } = useApp.getState();
  const done = verses.filter((v) => v.last === day);
  const undo = (v: Verse): Verse => {
    const log = v.log?.filter((e) => isPlacing(e) || e.day !== day);
    const last = log?.filter((e) => !isPlacing(e)).at(-1)?.day;
    return { ...v, last, log };
  };
  if (done.length > 0) useApp.setState({ verses: verses.map((v) => (v.last === day ? undo(v) : v)) });
  startReview(day);
  return done.length;
}
