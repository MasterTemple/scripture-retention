import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { BUILT_IN, DEFAULT_TRANSLATION } from "@/bible/translations";
import type { Translation, TranslationEdit } from "@/bible/types";
import { today, type Day } from "@/core/dates";
import { DEFAULT_AUTO_START, dueFromQueue, type AutoStart, type Queued } from "@/core/queue";
import { DEFAULT_REMINDERS, type Reminders } from "@/core/reminders";
import { DEFAULT_ACCENT, type Accent } from "@/lib/color";
import { DEFAULT_DURATIONS, resumedStart, type Durations, type Order, type Verse } from "@/core/schedule";
import { DEFAULT_SRS, history, isPlacing, mergeSrs, placement, toAlgorithm, withEntry, type AlgorithmId, type Grade, type Scheduler, type SrsOptions } from "@/core/srs";
import { DEFAULT_DECK, DEFAULT_DECKS, deckOf, deckScheduler, readDecks, schedulers, type Deck, type DeckSchedule } from "@/core/decks";
import type { PassageGroup } from "@/core/passages";

export type Theme = "system" | "light" | "dark";

export interface Settings {
  /** The scheduling algorithm verses follow */
  algorithm: AlgorithmId;
  /** Each algorithm's options */
  srs: SrsOptions;
  /** The fixed schedule's phases (where a verse is placed when it starts, under any algorithm) */
  durations: Durations;
  /** Starting queued verses on a day of the week, or by hand */
  autoStart: AutoStart;
  order: Order;
  /** Hour of the day (0-11) a new day of reviews begins */
  dayStartsAt: number;
  translationId: string;
  /** Translations added from fetch.bible's list or uploaded */
  translations: Translation[];
  reminders: Reminders;
  accent: Accent;
  /** Show the bar at the top with the app's name (wider, it stays for the tabs, without the name) */
  showHeader: boolean;
  /** Show the prompt to say the verse aloud on a card before it's revealed */
  showPrompt: boolean;
  /** Show a card's topic and reference the same before and after revealing the verse */
  steadyCard: boolean;
  /** Show a card of several verses one verse at a time, each on a tap */
  verseByVerse: boolean;
  /** How large the verse is set on a card, 1 being the default */
  textScale: number;
  theme: Theme;
  /** The deck reviewed (all of them when null) */
  reviewDeck: string | null;
}

interface State {
  verses: Verse[];
  /** Verses waiting to be started, in order */
  queue: Queued[];
  /** The last day the queue was looked at, so days the app wasn't opened on still start theirs */
  queueChecked?: Day;
  settings: Settings;
  /** The decks, the default deck first */
  decks: Deck[];
  /** Books, chapters, and other passages added as one entry, whose cards are verses */
  passages: PassageGroup[];

  addVerses: (verses: Omit<Verse, "id">[]) => void;
  updateVerse: (id: string, patch: Partial<Omit<Verse, "id">>) => void;
  /**
   * Logs a review of a verse on `day`, graded (Good, under the fixed schedule), or, with `at`,
   * grades again the review logged there that day. Gives where in the log the grade is
   */
  reviewVerse: (id: string, grade: Grade, day: Day, at?: number) => number | null;
  /** Gives a verse a new start (`reviewed`: counted as reviewed on `day`), logging where that places it */
  moveVerse: (id: string, start: Day, day: Day, reviewed: boolean) => void;
  /** Places a verse by hand: next reviewed `days` after `day` (0: back to new), counted as reviewed when `reviewed` */
  placeVerse: (id: string, days: number, day: Day, reviewed: boolean) => void;
  removeVerse: (id: string) => void;
  /** Pauses verses on `day` (not due, and held where they are), or resumes them where they were */
  pauseVerses: (ids: string[], paused: boolean, day: Day) => void;
  queueVerses: (verses: Omit<Queued, "id">[]) => void;
  updateQueued: (id: string, patch: Partial<Omit<Queued, "id">>) => void;
  removeQueued: (id: string) => void;
  /** Moves a queued verse earlier (-1) or later (1) */
  reorderQueued: (id: string, by: number) => void;
  /** Takes a queued verse out of the queue and starts it on `start` */
  startQueued: (id: string, start: Day) => void;
  /** Puts a verse back in the queue, forgetting its start */
  unstart: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Adds a translation (from fetch.bible's list, or uploaded) and reads from it */
  addTranslation: (t: Translation) => void;
  /** Renames an added translation, or changes its books; its id (and so its saved books) stays */
  updateTranslation: (id: string, patch: TranslationEdit) => void;
  removeTranslation: (id: string) => void;
  /** Adds a deck (following the default schedule); gives its id */
  addDeck: (name: string) => string;
  updateDeck: (id: string, patch: { name?: string; schedule?: DeckSchedule | undefined }) => void;
  /** Deletes a deck with its verses, passages, and queued verses (not the default deck) */
  removeDeck: (id: string) => void;
  /** Adds a passage with its cards, as one; gives its id */
  addPassage: (passage: Omit<PassageGroup, "id">, cards: { ref: string; start: Day }[]) => string;
  /** Changes a passage's topic or deck, and its cards' with it */
  updatePassage: (id: string, patch: { tag?: string; deck?: string }) => void;
  /** Deletes a passage with its cards, as one */
  removePassage: (id: string) => void;
}

/** The phase lengths placing a verse uses: its deck's */
const durationsOf = (s: { settings: Settings; decks: Deck[] }, v: Verse) => deckScheduler(s.settings, s.decks, v.deck).durations;

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * localStorage, written a moment after the last change rather than on every one (typing in a
 * field changes the state on each key). Pending writes are flushed when the page is hidden or
 * closed, which on a phone is often the last chance.
 */
function lazyStorage<S>(delay = 300): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    if (!pending) return;
    try {
      localStorage.setItem(pending.name, JSON.stringify(pending.value));
    } catch {
      // Full or blocked storage: keep going without saving
    }
    pending = null;
  };
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  }
  return {
    getItem: (name) => {
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      pending = null;
      localStorage.removeItem(name);
    },
  };
}

export const useApp = create<State>()(
  persist(
    (set) => ({
      verses: [],
      queue: [],
      decks: DEFAULT_DECKS,
      passages: [],
      settings: {
        algorithm: "fixed",
        srs: DEFAULT_SRS,
        durations: { ...DEFAULT_DURATIONS },
        autoStart: { ...DEFAULT_AUTO_START },
        order: "phase",
        dayStartsAt: 0,
        translationId: DEFAULT_TRANSLATION,
        translations: [],
        steadyCard: true,
        showPrompt: true,
        verseByVerse: false,
        accent: DEFAULT_ACCENT,
        showHeader: true,
        reminders: DEFAULT_REMINDERS,
        textScale: 1,
        theme: "system",
        reviewDeck: null,
      },

      addVerses: (verses) => set((s) => ({ verses: [...s.verses, ...verses.map((v) => ({ ...v, id: newId() }))] })),
      updateVerse: (id, patch) => set((s) => ({ verses: s.verses.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
      reviewVerse: (id, grade, day, at) => {
        let wrote: number | null = null;
        set((s) => ({
          verses: s.verses.map((v) => {
            if (v.id !== id) return v;
            const entry = at === undefined ? undefined : v.log?.[at];
            if (entry && !isPlacing(entry) && entry.day === day) {
              wrote = at!;
              return { ...v, last: day, log: v.log!.map((e, i) => (i === at ? { day, grade } : e)) };
            }
            const log = withEntry(v, { day, grade }, durationsOf(s, v));
            wrote = log.length - 1;
            return { ...v, last: day, log };
          }),
        }));
        return wrote;
      },
      moveVerse: (id, start, day, reviewed) =>
        set((s) => ({
          verses: s.verses.map((v) => {
            if (v.id !== id) return v;
            const moved = { ...v, start, last: reviewed ? day : v.last };
            const placed = placement(moved, day, durationsOf(s, v)) ?? { day, set: 0 };
            return { ...moved, log: [...history(v, day, durationsOf(s, v)), placed] };
          }),
        })),
      placeVerse: (id, days, day, reviewed) =>
        set((s) => ({
          verses: s.verses.map((v) => (v.id === id ? { ...v, last: reviewed ? day : v.last, log: withEntry(v, { day, set: days }, durationsOf(s, v)) } : v)),
        })),
      removeVerse: (id) => set((s) => ({ verses: s.verses.filter((v) => v.id !== id) })),
      pauseVerses: (ids, paused, day) =>
        set((s) => ({
          verses: s.verses.map((v) => {
            if (!ids.includes(v.id) || !!v.paused === paused) return v;
            if (paused) return { ...v, paused: day };
            const { paused: _, ...rest } = v;
            return { ...rest, start: resumedStart(v, day) };
          }),
        })),
      queueVerses: (verses) => set((s) => ({ queue: [...s.queue, ...verses.map((v) => ({ ...v, id: newId() }))] })),
      updateQueued: (id, patch) => set((s) => ({ queue: s.queue.map((q) => (q.id === id ? { ...q, ...patch } : q)) })),
      removeQueued: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
      reorderQueued: (id, by) =>
        set((s) => {
          const queue = [...s.queue];
          const from = queue.findIndex((q) => q.id === id);
          const to = Math.max(0, Math.min(queue.length - 1, from + by));
          if (from < 0 || from === to) return {};
          queue.splice(to, 0, ...queue.splice(from, 1));
          return { queue };
        }),
      startQueued: (id, start) =>
        set((s) => {
          const q = s.queue.find((x) => x.id === id);
          return q ? { queue: s.queue.filter((x) => x.id !== id), verses: [...s.verses, { ...q, start }] } : {};
        }),
      unstart: (id) =>
        set((s) => {
          const v = s.verses.find((x) => x.id === id);
          return v ? { verses: s.verses.filter((x) => x.id !== id), queue: [...s.queue, { id: v.id, tag: v.tag, ref: v.ref, deck: v.deck }] } : {};
        }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      addTranslation: (t) =>
        set((s) => ({ settings: { ...s.settings, translations: [...s.settings.translations.filter((x) => x.id !== t.id), t], translationId: t.id } })),
      updateTranslation: (id, patch) =>
        set((s) => ({ settings: { ...s.settings, translations: s.settings.translations.map((t) => (t.id === id ? { ...t, ...patch } : t)) } })),
      removeTranslation: (id) =>
        set((s) => ({
          settings: {
            ...s.settings,
            translations: s.settings.translations.filter((t) => t.id !== id),
            translationId: s.settings.translationId === id ? DEFAULT_TRANSLATION : s.settings.translationId,
          },
        })),
      addDeck: (name) => {
        const id = newId();
        set((s) => ({ decks: [...s.decks, { id, name }] }));
        return id;
      },
      updateDeck: (id, patch) => set((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
      removeDeck: (id) =>
        set((s) =>
          id === DEFAULT_DECK
            ? {}
            : {
                decks: s.decks.filter((d) => d.id !== id),
                verses: s.verses.filter((v) => deckOf(v) !== id),
                passages: s.passages.filter((p) => deckOf(p) !== id),
                queue: s.queue.filter((q) => deckOf(q) !== id),
                settings: s.settings.reviewDeck === id ? { ...s.settings, reviewDeck: null } : s.settings,
              },
        ),
      addPassage: (passage, cards) => {
        const id = newId();
        const deck = passage.deck === DEFAULT_DECK ? undefined : passage.deck;
        set((s) => ({
          passages: [...s.passages, { ...passage, deck, id }],
          verses: [...s.verses, ...cards.map((c) => ({ id: newId(), tag: passage.tag, ref: c.ref, start: c.start, passage: id, ...(deck ? { deck } : {}) }))],
        }));
        return id;
      },
      updatePassage: (id, patch) =>
        set((s) => {
          const deck = patch.deck === DEFAULT_DECK ? undefined : patch.deck;
          const change = <T extends { tag: string; deck?: string }>(x: T): T => {
            const next = { ...x, ...(patch.tag !== undefined ? { tag: patch.tag } : {}) };
            if (patch.deck === undefined) return next;
            if (deck) return { ...next, deck };
            const { deck: _, ...rest } = next;
            return rest as T;
          };
          return { passages: s.passages.map((p) => (p.id === id ? change(p) : p)), verses: s.verses.map((v) => (v.passage === id ? change(v) : v)) };
        }),
      removePassage: (id) => set((s) => ({ passages: s.passages.filter((p) => p.id !== id), verses: s.verses.filter((v) => v.passage !== id) })),
    }),
    {
      name: "scripture-retention",
      version: 1,
      storage: lazyStorage(),
      partialize: ({ verses, queue, queueChecked, settings, decks, passages }) => ({ verses, queue, queueChecked, settings, decks, passages }) as State,
      // Settings added since a visit keep their defaults
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<State>;
        return {
          ...current,
          ...s,
          decks: readDecks(s.decks),
          passages: Array.isArray(s.passages) ? s.passages : [],
          settings: {
            ...current.settings,
            ...s.settings,
            durations: { ...DEFAULT_DURATIONS, ...s.settings?.durations },
            srs: mergeSrs(s.settings?.srs),
            algorithm: toAlgorithm(s.settings?.algorithm),
            autoStart: { ...DEFAULT_AUTO_START, ...s.settings?.autoStart },
            reminders: { ...DEFAULT_REMINDERS, ...s.settings?.reminders },
          },
        };
      },
    },
  ),
);

/** The day reviews are for: today, or yesterday before the hour a day begins */
export function reviewDay(dayStartsAt = useApp.getState().settings.dayStartsAt, now = new Date()): Day {
  const shifted = new Date(now);
  shifted.setHours(shifted.getHours() - dayStartsAt);
  return today(shifted);
}

/**
 * The day reviews are for, kept current: a phone keeps a page open for days, so it's checked
 * again when the page comes back into view and each minute while it's showing
 */
export function useReviewDay(): Day {
  const dayStartsAt = useApp((s) => s.settings.dayStartsAt);
  const [day, setDay] = useState(() => reviewDay(dayStartsAt));
  useEffect(() => {
    const check = () => setDay(reviewDay(dayStartsAt));
    check();
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [dayStartsAt]);
  return day;
}

/** The default schedule (decks without their own follow it), kept the same object until a part of it changes */
export function useScheduler(): Scheduler {
  const algorithm = useApp((s) => s.settings.algorithm);
  const durations = useApp((s) => s.settings.durations);
  const srs = useApp((s) => s.settings.srs);
  return useMemo(() => ({ algorithm, durations, srs }), [algorithm, durations, srs]);
}

/** What schedules each verse (its deck's schedule, or the default) */
export function useSchedulers(): (verse: Verse) => Scheduler {
  const defaults = useScheduler();
  const decks = useApp((s) => s.decks);
  return useMemo(() => schedulers(defaults, decks), [defaults, decks]);
}

/** What schedules each verse, outside React */
export const schedulersNow = (): ((verse: Verse) => Scheduler) => {
  const { settings, decks } = useApp.getState();
  return schedulers(settings, decks);
};

export const useTranslation = (): Translation => {
  const id = useApp((s) => s.settings.translationId);
  const added = useApp((s) => s.settings.translations);
  return BUILT_IN.find((t) => t.id === id) ?? added.find((t) => t.id === id) ?? BUILT_IN[0]!;
};

/** Starts the queued verses whose day has come (on `day`, or days since the app was last opened) */
export function startDueQueued(day: Day = reviewDay()) {
  const { queue, verses, queueChecked, settings } = useApp.getState();
  const { started, waiting } = dueFromQueue(queue, verses, queueChecked, day, settings.autoStart);
  if (started.length > 0) useApp.setState({ queue: waiting, verses: [...verses, ...started], queueChecked: day });
  else if (queueChecked !== day) useApp.setState({ queueChecked: day });
  return started;
}
