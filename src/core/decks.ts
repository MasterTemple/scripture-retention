import type { Durations, Verse } from "./schedule.ts";
import type { AlgorithmId, Scheduler, SrsOptions } from "./srs/index.ts";

/** A deck's own algorithm and options, in place of the default schedule */
export interface DeckSchedule {
  algorithm: AlgorithmId;
  srs: SrsOptions;
  durations: Durations;
}

/**
 * A set of verses reviewed together or apart from the rest (topical verses, a book being
 * memorized), each following the default schedule or its own
 */
export interface Deck {
  id: string;
  name: string;
  /** Its own algorithm and options; without one, it follows the default schedule in Settings */
  schedule?: DeckSchedule;
}

/** The deck every verse without one is in, which is always there */
export const DEFAULT_DECK = "default";
export const DEFAULT_DECKS: Deck[] = [{ id: DEFAULT_DECK, name: "Verses" }];

/** The deck a verse (or queued verse, or passage) is in */
export const deckOf = (item: { deck?: string }): string => item.deck ?? DEFAULT_DECK;

/** What schedules a deck's verses: its own schedule, or the default */
export function deckScheduler(defaults: Scheduler, decks: readonly Deck[], deck: string = DEFAULT_DECK): Scheduler {
  return decks.find((d) => d.id === deck)?.schedule ?? defaults;
}

/**
 * What schedules each verse, by its deck. The same scheduler object comes back for a deck each
 * time (as long as its schedule is the same), so what's worked out for a verse is kept
 */
export function schedulers(defaults: Scheduler, decks: readonly Deck[]): (verse: Pick<Verse, "deck">) => Scheduler {
  const byDeck = new Map<string, Scheduler>();
  return (verse) => {
    const deck = deckOf(verse);
    let sch = byDeck.get(deck);
    if (!sch) byDeck.set(deck, (sch = deckScheduler(defaults, decks, deck)));
    return sch;
  };
}

/** Saved decks, with the default deck first whatever was saved, and anything unreadable left out */
export function readDecks(saved: unknown): Deck[] {
  const list = Array.isArray(saved) ? saved : [];
  const decks = list.filter((d): d is Deck => typeof d === "object" && d !== null && typeof d.id === "string" && typeof d.name === "string");
  const main = decks.find((d) => d.id === DEFAULT_DECK) ?? DEFAULT_DECKS[0]!;
  return [main, ...decks.filter((d) => d.id !== DEFAULT_DECK)];
}
