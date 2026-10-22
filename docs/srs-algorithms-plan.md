# Plan: every major spaced-repetition algorithm

Branch: `feature/srs-algorithms` (never pushed to `main`, which deploys to GitHub Pages).

## Where the app starts

The app has one schedule: a verse is reviewed daily for 7 weeks, weekly for 7 months, then monthly
for 7 years. Where a verse is follows from its `start` day alone, plus `last` (the day it was last
reviewed). Reviews aren't graded: a card is revealed, then "Next".

Adaptive algorithms need two things the app doesn't have: a **grade** for each review, and a
**history** of reviews to compute memory state from.

## Algorithms

| Id | Algorithm | Grades | Notes |
| --- | --- | --- | --- |
| `fixed` | Scripture Memory (the app's schedule, still the default) | Next | Unchanged; start-day based |
| `anki` | Anki SM-2 (Anki's v3 scheduler without FSRS) | Again/Hard/Good/Easy | Learning and relearning steps, starting ease, easy bonus, hard interval, interval modifier, new interval, minimum interval, graduating/easy intervals, maximum interval, fuzz, leech threshold |
| `fsrs` | FSRS (Anki's modern scheduler) | Again/Hard/Good/Easy | FSRS-4.5, FSRS-5, and FSRS-6, picked by how many parameters are given (17/19/21, so Anki's own can be pasted in); desired retention; shares Anki's steps, maximum interval and fuzz, as in Anki's deck options |
| `sm2` | SuperMemo SM-2 (Woźniak, 1987) | Again/Hard/Good/Easy → q 2/3/4/5 | Items below 4 are drilled again the same day without changing their schedule, as SM-2 says |
| `leitner` | Leitner boxes | Again/Good | Configurable box intervals; a miss goes back to the first box or down one |
| `pimsleur` | Pimsleur graduated-interval recall | Again/Good | The day-scale rungs of Pimsleur's ×5 ladder (1, 5, 25, 120, 730 days), editable |
| `ebisu` | Ebisu v2 (Bayesian) | Again/Good | Beta prior on recall at a half-life; due when predicted recall falls to the target |

Not included, with reasons (in the README): SuperMemo SM-17/18 (proprietary, unpublished in
full), Duolingo's half-life regression (its weights have to be trained on a large review corpus).

## Design

### A review log per verse

`Verse.log?: LogEntry[]`, each `{ day, grade }` (1 Again, 2 Hard, 3 Good, 4 Easy) or `{ day, set }`
(placed by hand: last reviewed `day`, next in `set` days; `set: 0` forgets it back to new).

* Every algorithm's state is a fold over the log, so switching algorithms is instant and lossless:
  the history replays through the new one. The fixed schedule logs too (each "Next" is a Good).
* A verse's state before its first logged review is its **placement** in the fixed schedule
  (`start`, `last`): new on its first day, otherwise "reviewed a phase-interval ago". That's how
  verses that predate the log, and imports at `@week 3`, start adaptive algorithms in the right
  place. When the first entry is logged, that placement is written in front of it, so later changes
  to `start` don't rewrite history.
* Moves and edits of the start in the fixed schedule log a `set` entry for the new placement, so
  adaptive algorithms see them too.
* `last` keeps its meaning (the day last reviewed), so "done today" and resets work as before.
* Results are memoized per verse object (the store is immutable), so a fold runs once per change.

### Days, not minutes

The app counts days. Steps under a day (Anki's `1m 10m`) mean "again later in this session": the
card goes to the back of today's queue, as Anki shows learning cards again. Steps of a day or more
are days. A card left in learning is due again the next time.

### Engine (`src/core/srs/`)

* `types.ts`: grades, log entries, the `Algorithm` interface (`init`, `place`, `review`, `card`).
* One file per algorithm, pure functions, no React.
* `engine.ts`: fold with memo, `verseStatus` (the `Status` the UI already uses, now with the
  interval and the algorithm's memory details), `dueVerses`, `preview` (what each grade would do,
  for the buttons), `placement`.
* Deterministic fuzz (Anki's ranges), seeded by the verse's id and review count, so a preview
  shows exactly what a grade will do and a replay gives the same days.

### Status and phases

`Status` gains `interval`, `learning`, `fresh` (never reviewed), and `memory` (ease, stability,
difficulty, retrievability, box…). For adaptive algorithms, a verse's phase is its interval's
size: under a week, "Days" (the daily color); under a month, "Weeks"; else "Months". Upcoming is
as before (start ahead). Positions read "New", "Learning", "Every 12 days".

### Store

* `settings.algorithm` (default `fixed`) and `settings.srs` (per-algorithm options, merged with
  defaults on load so options added later get theirs).
* `logReview(id, grade, day)`, `setInterval(id, days, day)`, `forget(id, day)`.
* `resetDay` drops that day's graded entries as well as `last`.

### Review screen

* Fixed: unchanged (Continue, then Move / Next).
* Adaptive: after the verse shows, the algorithm's grade buttons, each with the interval it gives
  (`<10m`, `3d`, `2mo`), keys 1–4, Space for Good. A card still due today (learning, or drilled)
  goes to the back of the queue. Move becomes "Reschedule": next review in N days.

### Verses and editing

* Headings and pills use the adaptive names. Each row shows the interval and "Due".
* Edit dialog, adaptive: due day, interval, the memory details, the review history, reschedule,
  forget. A verse with no history still uses the position picker (that's its placement).

### Settings → Schedule

An algorithm picker with a sentence on each, then that algorithm's options (only those): the
fixed phase lengths; Anki's steps and multipliers; FSRS parameters (paste from Anki), desired
retention; Leitner/Pimsleur ladders; Ebisu's target and starting half-life. A line on how many
verses are due today under the choice.

### Data

* A full backup (JSON: verses with their history, queue, settings) to save and restore, since a
  list keeps only start days.
* The list format is unchanged.

### Tests

Each algorithm against hand-worked cases; FSRS-4.5/5/6 cross-checked against `ts-fsrs` (dev
dependency only); fold/placement/switching; Anki steps and fuzz bounds; session requeue.

## Order of work (each a commit)

1. Plan (this file).
2. Types, placement, engine, fixed adapter; tests.
3. SM-2, Leitner, Pimsleur; tests.
4. Anki SM-2 with steps and fuzz; tests.
5. FSRS 4.5/5/6; tests against ts-fsrs.
6. Ebisu; tests.
7. Store: settings, log, actions, migration-free merge; callers switch to the engine.
8. Review screen grading and requeue; move/reschedule.
9. Verses view, edit dialog details/history.
10. Settings Schedule tab.
11. JSON backup and restore.
12. README, then typecheck, test, build, and try it in a browser.

13. (Asked for later) The same spaced-repetition logic as a Rust library, with FFI bindings made
    with BoltFFI (see the `boltffi-bindings` skill; logoxide and topos are examples), and a Rust
    TUI with Ratatui. The TypeScript engine and its tests are the spec; the Rust crate gets the
    same tests (FSRS against the same reference numbers) so the two stay in step.

## Second round (asked 2026-10-22)

### FSRS's optimizer

Fit FSRS's parameters to the reviews logged, with fsrs-rs 6.6.2 (the optimizer Anki runs).

* `scripture-srs` has it behind an `optimizer` feature (`srs::optimize`); the bindings expose
  `ScriptureSrs.optimizeFsrs(verses)`. fsrs-rs no longer uses burn (ndarray), and builds for plain
  wasm32 single-threaded (rayon falls back to the current thread; `getrandom`'s browser backend).
  The published `fsrs-browser` needs shared memory (cross-origin isolation), which GitHub Pages
  can't give, so it isn't used.
* A verse's training history starts at its first review as new (the start of its log, or after it
  was last started over); a log beginning with a placing is left out until it's started over, as
  Anki leaves out cards without their first learning. Items end at reviews on a later day than the
  one before (fsrs-rs requires one such review in each item).
* The web app depends on the package vendored in `vendor/scripture-srs` (`scripts/vendor-srs.sh`
  rebuilds it; it isn't on npm), loaded only when optimizing, in a worker.
* Settings → Schedule → FSRS: "Optimize from my reviews" for the deck (or the default schedule),
  showing how many reviews were used, and putting the parameters in.

### Passages and decks

* **Decks**: `decks: Deck[]` (`id`, `name`, optional own `schedule`: algorithm, options, phase
  lengths, else the default schedule in Settings). A built-in deck (`default`, "Verses") holds every
  verse without one. Review all decks or one; Settings → Schedule edits the default schedule or a
  deck's own; deleting a deck deletes its verses and passages (with undo).
* **Passages**: a book, chapters, or any reference ("1 Peter", "Romans 8-12", "Psalm 119:1-16")
  added as one entry, `passages: PassageGroup[]` (`id`, `ref`, `tag`, `deck`, `unit`: a card per
  verse, per chapter, per group of N verses, or one card). Its cards are ordinary verses
  (`verse.passage` = its id), each with its own schedule and log, added and deleted together.
  Card references: `1 Peter 1:3`, `1 Peter 1` (a whole chapter; a single-chapter book's is the
  book, since topos reads "Jude 1" as a verse), `1 Peter 1:1-5`, partial chapters as ranges.
* Picking: type a reference, or pick a book and tick chapters. The Verses view lists passages as
  one row each (cards, due) opening to their cards.
* Lists: `Deck: Name` headings; `1 Peter as chapters`, `Psalm 119 as groups of 8`, `James as one
  card`, `Romans 8 as verses` lines. A backup keeps decks and passages.
* Rust: `Verse` keeps `deck` and `passage`; the TUI uses each deck's schedule.

### Later: half-life regression (Duolingo)

Not built. h = 2^(θ·x), p = 2^(−Δ/h), x = (1, √(1+right), √(1+wrong), …). Duolingo's weights were
fitted to its vocabulary data, not Scripture, so defaults would be invented; it would need θ fitted
to the user's own grades (a small regression, cheap in the browser, noisy with few reviews). A
module like Ebisu's in both engines, conformance cases, and a "fit" button like FSRS's.

## Progress

- [x] 1. Plan
- [x] 2–8. Engine, all algorithms (FSRS checked against ts-fsrs 3/4/5), store, review screen
- [x] 9. Verses view, Edit dialog (summary, reschedule, start over, history), Move/Reschedule
- [x] 10. Settings Schedule tab
- [x] 11. JSON backup and restore
- [x] 12. README, typecheck, test, build, browser check (headless Chromium: FSRS and Anki reviews,
      learning-step requeue, going back and regrading, settings, verses, edit dialog; fixed unchanged)
- [x] 13. Rust library (rust/crates/scripture-srs; 2,520 conformance cases from the web app pass),
      BoltFFI bindings (the cases pass through WebAssembly in Node and the Python wheel; README
      examples run and checked), Ratatui TUI (reads/writes the app's backup; tested, and run in
      tmux against fetch.bible)
- [x] 14. FSRS optimizer in Rust and the bindings (vendored for the web app)
- [x] 15. Decks and passages: data, engine (per-deck schedulers), store, import/export, backup
- [x] 16. UI: deck chips, passage dialog (picker, units), passages in Verses, review by deck,
      Settings per deck, Optimize button (checked in Chromium: 1 Peter by chapters into a new
      deck, reviewing it alone, a deck's own schedule, optimizing 420 reviews in the browser)
- [x] 17. Rust: deck/passage fields (core, bindings: README examples and conformance rerun in
      Node and Python), TUI per-deck schedules and whole-passage delete (run in tmux); READMEs
