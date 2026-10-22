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
  /**
   * Beside each place in the queue, the log entry its grade wrote (null before it's graded), so
   * going back and grading again replaces that grade, and its buttons show what they'd do then
   */
  wrote: (number | null)[];
}

export const useReview = create<Review>()(() => ({ queue: [], index: 0, revealed: false, reviewed: 0, day: "", wrote: [] }));

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
  useReview.setState((r) => {
    const kept = r.queue.map((id, i) => ids.has(id) ? i : -1).filter((i) => i >= 0);
    return {
      queue: kept.map((i) => r.queue[i]!),
      wrote: kept.map((i) => r.wrote[i] ?? null),
      index: r.index - r.queue.slice(0, r.index).filter((id) => !ids.has(id)).length,
    };
  });
});

/**
 * Starts the review over with what's due on `day`. With `keepCurrent` (verses added mid-way),
 * the review stays as it is and the verses newly due join its end.
 */
export function startReview(day: Day = reviewDay(), keepCurrent = false) {
  const { verses, settings } = useApp.getState();
  const r = useReview.getState();
  const due = dueVerses(verses, day, settings, settings.order).map((v) => v.id);
  if (keepCurrent && r.day === day && r.index < r.queue.length) {
    const added = due.filter((id) => !r.queue.includes(id));
    useReview.setState({ queue: [...r.queue, ...added], wrote: [...r.wrote, ...added.map(() => null)] });
    return;
  }
  useReview.setState({ queue: due, index: 0, revealed: false, reviewed: 0, day, wrote: due.map(() => null) });
}

/** The log entry the card in front was graded with in this review, if it was (going back to it) */
export const gradedAt = (r: Review): number | undefined => r.wrote[r.index] ?? undefined;

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

/** Grades the card in front (Good, under the fixed schedule; again, in place of its grade) and goes on */
export function next(day: Day, grade: Grade = 3) {
  const r = useReview.getState();
  const verse = currentVerse(useApp.getState().verses, r);
  let wrote: number | null = null;
  if (verse) {
    count(verse, day);
    wrote = useApp.getState().reviewVerse(verse.id, grade, day, gradedAt(r));
  }
  advance(verse, day, wrote);
}

/**
 * Goes on without grading: past a card graded already (stepping forward after going back), or
 * else grading it Good, as Space and swipes do
 */
export function forward(day: Day) {
  const r = useReview.getState();
  if (gradedAt(r) !== undefined) useReview.setState({ index: r.index + 1, revealed: false });
  else next(day);
}

/** Puts the card in front at another place in the fixed schedule (counted as reviewed) and goes on */
export function moveCurrent(start: Day, day: Day) {
  const verse = currentVerse(useApp.getState().verses, useReview.getState());
  if (!verse) return;
  count(verse, day);
  useApp.getState().moveVerse(verse.id, start, day, true);
  advance(verse, day, lastEntry(verse.id));
}

/** Reschedules the card in front to come back in `days` (counted as reviewed) and goes on */
export function rescheduleCurrent(days: number, day: Day) {
  const verse = currentVerse(useApp.getState().verses, useReview.getState());
  if (!verse) return;
  count(verse, day);
  useApp.getState().placeVerse(verse.id, days, day, true);
  advance(verse, day, lastEntry(verse.id));
}

/** Where a verse's newest log entry is (a move or reschedule just made, which marks its card answered) */
const lastEntry = (id: string) => (useApp.getState().verses.find((v) => v.id === id)?.log?.length ?? 0) - 1;

/**
 * Goes to the next card, noting the log entry the card in front was graded with. A verse that's
 * still due today (a learning step, or a drill) goes to the back of the queue, to be seen again
 * before the review is done; graded again after going back, it may no longer need that second look
 */
function advance(verse: Verse | null, day: Day, wrote: number | null = null) {
  const { verses, settings } = useApp.getState();
  const updated = verse && verses.find((v) => v.id === verse.id);
  useReview.setState((r) => {
    const marks = r.wrote.slice();
    marks[r.index] = wrote;
    if (!updated) return { index: r.index + 1, revealed: false, wrote: marks };
    const due = verseStatus(updated, day, settings).due;
    const aheadHas = r.queue.slice(r.index + 1).includes(updated.id);
    if (due && !aheadHas) return { index: r.index + 1, revealed: false, queue: [...r.queue, updated.id], wrote: [...marks, null] };
    if (!due && aheadHas) {
      // Its later looks not yet graded leave; those graded stay, to go back to
      const keep = r.queue.map((id, i) => i <= r.index || id !== updated.id || marks[i] != null);
      return { index: r.index + 1, revealed: false, queue: r.queue.filter((_, i) => keep[i]), wrote: marks.filter((_, i) => keep[i]) };
    }
    return { index: r.index + 1, revealed: false, wrote: marks };
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
