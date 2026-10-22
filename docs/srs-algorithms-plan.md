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
