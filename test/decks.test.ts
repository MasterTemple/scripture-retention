import { beforeEach, test } from "vitest";
import assert from "node:assert/strict";
import { makeBackup, readBackup } from "../src/core/backup.ts";
import { DEFAULT_DECK, deckOf, readDecks, schedulers } from "../src/core/decks.ts";
import { formatList, parseList } from "../src/core/lists.ts";
import { DEFAULT_DURATIONS } from "../src/core/schedule.ts";
import { DEFAULT_SRS, verseStatus } from "../src/core/srs/index.ts";
import { startReview, useReview } from "../src/state/review.ts";
import { useApp } from "../src/state/store.ts";

const day = "2026-10-21";

beforeEach(() => {
  useApp.setState((s) => ({ verses: [], queue: [], passages: [], decks: readDecks([]), settings: { ...s.settings, algorithm: "fixed", reviewDeck: null } }));
});

test("a passage is added and deleted as one, its cards each with their own schedule", () => {
  const app = useApp.getState();
  const deck = app.addDeck("1 Peter");
  const id = app.addPassage({ ref: "1 Peter", tag: "", unit: "chapter", deck }, [1, 2, 3].map((c) => ({ ref: `1 Peter ${c}`, start: day })));
  const cards = useApp.getState().verses;
  assert.equal(cards.length, 3);
  assert.ok(cards.every((v) => v.passage === id && v.deck === deck));
  useApp.getState().reviewVerse(cards[0]!.id, 3, day);
  assert.equal(useApp.getState().verses[0]!.log?.length, 1);
  assert.equal(useApp.getState().verses[1]!.log, undefined, "the others aren't reviewed");
  useApp.getState().updatePassage(id, { tag: "hope", deck: DEFAULT_DECK });
  assert.ok(useApp.getState().verses.every((v) => v.tag === "hope" && deckOf(v) === DEFAULT_DECK));
  useApp.getState().removePassage(id);
  assert.deepEqual(useApp.getState().verses, []);
  assert.deepEqual(useApp.getState().passages, []);
});

test("each deck follows its own schedule, or the default", () => {
  const app = useApp.getState();
  const deck = app.addDeck("FSRS");
  app.updateDeck(deck, { schedule: { algorithm: "fsrs", srs: DEFAULT_SRS, durations: DEFAULT_DURATIONS } });
  app.addVerses([{ tag: "", ref: "John 3:16", start: day }, { tag: "", ref: "Romans 8:28", start: day, deck }]);
  const [plain, own] = useApp.getState().verses;
  const schedulerFor = schedulers(useApp.getState().settings, useApp.getState().decks);
  assert.equal(schedulerFor(plain!).algorithm, "fixed");
  assert.equal(schedulerFor(own!).algorithm, "fsrs");
  assert.equal(verseStatus(own!, day, schedulerFor(own!)).fresh, true);
  // Reviewing one deck reviews only it
  useApp.getState().updateSettings({ reviewDeck: deck });
  startReview(day);
  assert.deepEqual(useReview.getState().queue, [own!.id]);
  useApp.getState().updateSettings({ reviewDeck: null });
  startReview(day);
  assert.equal(useReview.getState().queue.length, 2);
});

test("deleting a deck deletes what's in it, and never the default deck", () => {
  const app = useApp.getState();
  const deck = app.addDeck("Psalms");
  app.addVerses([{ tag: "", ref: "Psalm 1:1", start: day, deck }, { tag: "", ref: "John 1:1", start: day }]);
  app.addPassage({ ref: "Psalm 23", tag: "", unit: "whole", deck }, [{ ref: "Psalm 23", start: day }]);
  app.queueVerses([{ tag: "", ref: "Psalm 2:1", deck }]);
  app.removeDeck(deck);
  const s = useApp.getState();
  assert.deepEqual(s.verses.map((v) => v.ref), ["John 1:1"]);
  assert.deepEqual([s.passages.length, s.queue.length, s.decks.length], [0, 0, 1]);
  app.removeDeck(DEFAULT_DECK);
  assert.equal(useApp.getState().decks.length, 1);
});

test("lists carry decks and passages, and read back the same", () => {
  const parsed = parseList("Deck: 1 Peter\n1 Peter as chapters @2026-01-04\n`#hope` 1 Peter 1:3 @week 2\n\nDeck: Psalms\nPsalm 119 as groups of 8\nPsalm 23 as one card\nPsalm 1 as pages");
  assert.deepEqual(
    parsed.entries.map((e) => [e.deck, e.ref, e.passage?.unit, e.passage?.size]),
    [["1 Peter", "1 Peter", "chapter", undefined], ["1 Peter", "1 Peter 1:3", undefined, undefined], ["Psalms", "Psalm 119", "group", 8], ["Psalms", "Psalm 23", "whole", undefined]],
  );
  assert.equal(parsed.errors.length, 1, "pages isn't a way to split");

  const decks = [...readDecks([]), { id: "p", name: "1 Peter" }];
  const verses = [
    { id: "a", tag: "", ref: "John 3:16", start: "2026-10-01" },
    { id: "b", tag: "", ref: "1 Peter 1", start: "2026-01-04", deck: "p", passage: "x" },
    { id: "c", tag: "", ref: "1 Peter 2", start: "2026-01-04", deck: "p", passage: "x" },
  ];
  const text = formatList(verses, day, DEFAULT_DURATIONS, [], decks, [{ id: "x", ref: "1 Peter", tag: "", unit: "chapter", deck: "p" }]);
  assert.equal(text, "# Deck: Verses\n\n## Daily\n\nJohn 3:16 @2026-10-01\n\n# Deck: 1 Peter\n\n## Passages\n\n1 Peter as chapters @2026-01-04\n");
  const back = parseList(text).entries;
  assert.deepEqual(back.map((e) => [e.deck, e.ref, e.passage?.unit, e.start]), [["Verses", "John 3:16", undefined, "2026-10-01"], ["1 Peter", "1 Peter", "chapter", "2026-01-04"]]);
  // With one deck and no passages, a list is as it always was
  assert.equal(formatList(verses.slice(0, 1), day, DEFAULT_DURATIONS, [], readDecks([]), []), "## Daily\n\nJohn 3:16 @2026-10-01\n");
});

test("a backup keeps decks and passages", () => {
  const backup = makeBackup({ verses: [], queue: [], settings: {}, decks: readDecks([{ id: "p", name: "1 Peter" }]), passages: [{ id: "x", ref: "1 Peter", tag: "", unit: "chapter", deck: "p" }] });
  const read = readBackup(JSON.stringify(backup));
  assert.notEqual(typeof read, "string");
  assert.deepEqual((read as typeof backup).passages, backup.passages);
  assert.match(readBackup(JSON.stringify({ ...backup, passages: [{ id: "x", ref: "1 Peter", tag: "", unit: "pages" }] })) as string, /passages/);
});
