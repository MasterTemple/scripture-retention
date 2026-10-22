import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { BUILT_IN, DEFAULT_TRANSLATION } from "@/bible/translations";
import type { Translation } from "@/bible/types";
import { today, type Day } from "@/core/dates";
import { DEFAULT_DURATIONS, type Durations, type Order, type Verse } from "@/core/schedule";

export type Theme = "system" | "light" | "dark";

export interface Settings {
  durations: Durations;
  order: Order;
  /** Hour of the day (0-11) a new day of reviews begins */
  dayStartsAt: number;
  translationId: string;
  /** Translations added from fetch.bible's list or uploaded */
  translations: Translation[];
  /** How large the verse is set on a card, 1 being the default */
  textScale: number;
  theme: Theme;
}

interface State {
  verses: Verse[];
  settings: Settings;

  addVerses: (verses: Omit<Verse, "id">[]) => void;
  updateVerse: (id: string, patch: Partial<Omit<Verse, "id">>) => void;
  removeVerse: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Adds a translation (from fetch.bible's list, or uploaded) and reads from it */
  addTranslation: (t: Translation) => void;
  removeTranslation: (id: string) => void;
}

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
      settings: {
        durations: { ...DEFAULT_DURATIONS },
        order: "phase",
        dayStartsAt: 0,
        translationId: DEFAULT_TRANSLATION,
        translations: [],
        textScale: 1,
        theme: "system",
      },

      addVerses: (verses) => set((s) => ({ verses: [...s.verses, ...verses.map((v) => ({ ...v, id: newId() }))] })),
      updateVerse: (id, patch) => set((s) => ({ verses: s.verses.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
      removeVerse: (id) => set((s) => ({ verses: s.verses.filter((v) => v.id !== id) })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      addTranslation: (t) =>
        set((s) => ({ settings: { ...s.settings, translations: [...s.settings.translations.filter((x) => x.id !== t.id), t], translationId: t.id } })),
      removeTranslation: (id) =>
        set((s) => ({
          settings: {
            ...s.settings,
            translations: s.settings.translations.filter((t) => t.id !== id),
            translationId: s.settings.translationId === id ? DEFAULT_TRANSLATION : s.settings.translationId,
          },
        })),
    }),
    {
      name: "scripture-retention",
      version: 1,
      storage: lazyStorage(),
      partialize: ({ verses, settings }) => ({ verses, settings }) as State,
      // Settings added since a visit keep their defaults
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<State>;
        return {
          ...current,
          ...s,
          settings: { ...current.settings, ...s.settings, durations: { ...DEFAULT_DURATIONS, ...s.settings?.durations } },
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

export const useTranslation = (): Translation => {
  const id = useApp((s) => s.settings.translationId);
  const added = useApp((s) => s.settings.translations);
  return BUILT_IN.find((t) => t.id === id) ?? added.find((t) => t.id === id) ?? BUILT_IN[0]!;
};
