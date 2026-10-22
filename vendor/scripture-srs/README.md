# scripture-srs

Spaced repetition for memorized Scripture, for TypeScript (over WebAssembly) and Python: the
scheduling engine of [Scripture Retention](https://github.com/MasterTemple/scripture-retention),
written in Rust.

- **Scripture Memory**: each verse daily for 7 weeks, weekly for 7 months, monthly for 7 years
- **FSRS** 4.5, 5, and 6 (by how many parameters are given, so Anki's own can be pasted in),
  with Anki's learning steps
- **Anki's SM-2**: learning and relearning steps, ease, hard/good/easy intervals with delay and
  early reviews, fuzz, leeches
- **SuperMemo SM-2**, **Leitner** boxes, **Pimsleur**'s graduated intervals, and **Ebisu** v2

Every verse carries a log of its reviews, and an algorithm's view of a verse comes from all of
them, so switching algorithms loses nothing. It gives exactly what the web app gives: the same
2,520 cases are checked in Rust, in Node, and in Python.

Days are `YYYY-MM-DD` strings. Nothing is changed in place: a review returns the verse with the
review added, for you to save.

## Install

```sh
npm install scripture-srs
pip install scripture-srs
```

In a browser, `await initialized` (exported beside the API) before the first call; in Node and
Bun it's already loaded.

## A scheduler

`ScriptureSrs` makes schedulers and lists the algorithms. A scheduler starts on the fixed
schedule, every option at its default; each `with…` returns a new one.

```ts
import { Algorithm, Grade, ScriptureSrs, type VerseRecord } from "scripture-srs";

const srs = ScriptureSrs.new();
srs.algorithms().map((a) => a.key); // → ["fixed","fsrs","anki","sm2","leitner","pimsleur","ebisu"]
const fsrs = srs.scheduler().withAlgorithm(Algorithm.Fsrs);
```

```python
from scripture_srs import Algorithm, Grade, ScriptureSrs, VerseRecord

srs = ScriptureSrs()
[a.key for a in srs.algorithms()]  # → ["fixed","fsrs","anki","sm2","leitner","pimsleur","ebisu"]
fsrs = srs.scheduler().with_algorithm(Algorithm.FSRS)
```

## Reviewing a verse

`preview` gives what each grade would do (`<10m`: again later in the same sitting, as Anki's
learning steps do); `review` returns the verse with the review logged.

```ts
let verse: VerseRecord = { id: "1", tag: "love", reference: "John 3:16", start: "2026-10-21", last: null, log: [] };
fsrs.preview(verse, "2026-10-21").map((o) => o.label); // → ["<1m","<6m","<10m","10d"]
verse = fsrs.review(verse, Grade.Good, "2026-10-21");
fsrs.status(verse, "2026-10-21").description; // → "Learning"
verse = fsrs.review(verse, Grade.Good, "2026-10-21");
fsrs.status(verse, "2026-10-21").next; // → "2026-10-23"
fsrs.memory(verse, "2026-10-21").map((m) => `${m.label}: ${m.value}`); // → ["Stability: 2.3 days","Difficulty: 12%","Retrievability: 100%"]
```

```python
verse = VerseRecord(id="1", tag="love", reference="John 3:16", start="2026-10-21", last=None, log=[])
[o.label for o in fsrs.preview(verse, "2026-10-21")]  # → ["<1m","<6m","<10m","10d"]
verse = fsrs.review(verse, Grade.GOOD, "2026-10-21")
fsrs.status(verse, "2026-10-21").description  # → "Learning"
verse = fsrs.review(verse, Grade.GOOD, "2026-10-21")
fsrs.status(verse, "2026-10-21").next  # → "2026-10-23"
[f"{m.label}: {m.value}" for m in fsrs.memory(verse, "2026-10-21")]  # → ["Stability: 2.3 days","Difficulty: 12%","Retrievability: 100%"]
```

## Verses from before grading

A verse with no reviews logged starts where the fixed schedule has it, so a verse in its weekly
reviews comes into FSRS every 7 days.

```ts
const psalm: VerseRecord = { id: "2", tag: "word", reference: "Psalm 119:11", start: "2026-05-01", last: null, log: [] };
srs.scheduler().status(psalm, "2026-10-21").description; // → "Week 18 of 31"
fsrs.status(psalm, "2026-10-21").description; // → "Every 7 days"
fsrs.due([verse, psalm], "2026-10-21").map((v) => v.reference); // → ["Psalm 119:11"]
```

```python
psalm = VerseRecord(id="2", tag="word", reference="Psalm 119:11", start="2026-05-01", last=None, log=[])
srs.scheduler().status(psalm, "2026-10-21").description  # → "Week 18 of 31"
fsrs.status(psalm, "2026-10-21").description  # → "Every 7 days"
[v.reference for v in fsrs.due([verse, psalm], "2026-10-21")]  # → ["Psalm 119:11"]
```

## Rescheduling

`reschedule` places a verse by hand: next due so many days on (0 starts it over as new).

```ts
const later = fsrs.reschedule(psalm, 30, "2026-10-21", true);
fsrs.status(later, "2026-10-21").next; // → "2026-11-20"
later.log.length; // → 2
```

```python
later = fsrs.reschedule(psalm, 30, "2026-10-21", True)
fsrs.status(later, "2026-10-21").next  # → "2026-11-20"
len(later.log)  # → 2
```

## The web app's settings and data

`schedulerFromJson` (and `withJson`) take the settings as the web app saves them; what isn't
given keeps its default. `readVerses` reads a backup or the app's saved state, and
`writeVerses` writes verses back as it saves them.

```ts
const anki = srs.schedulerFromJson('{"algorithm": "anki", "srs": {"anki": {"learningSteps": [10]}}}');
anki.preview(psalm, "2026-10-21").map((o) => o.label); // → ["<10m","9d","25d","1.3mo"]
JSON.parse(anki.toJson()).srs.anki.startingEase; // → 2.5
srs.readVerses('{"verses": [{"id": "a", "tag": "", "ref": "Romans 12:2", "start": "2026-01-01"}]}')[0].reference; // → "Romans 12:2"
```

```python
import json
anki = srs.scheduler_from_json('{"algorithm": "anki", "srs": {"anki": {"learningSteps": [10]}}}')
[o.label for o in anki.preview(psalm, "2026-10-21")]  # → ["<10m","9d","25d","1.3mo"]
json.loads(anki.to_json())["srs"]["anki"]["startingEase"]  # → 2.5
srs.read_verses('{"verses": [{"id": "a", "tag": "", "ref": "Romans 12:2", "start": "2026-01-01"}]}')[0].reference  # → "Romans 12:2"
```

FSRS's parameters can be pasted as Anki shows them (17, 19, or 21 numbers), and its desired
retention set:

```ts
fsrs.withFsrsParams("0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621").withDesiredRetention(0.85).algorithm() === Algorithm.Fsrs; // → true
```

```python
fsrs.with_fsrs_params("0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621").with_desired_retention(0.85).algorithm() == Algorithm.FSRS  # → true
```

## Errors

A bad day, verse, or option throws `SrsErrorException`, whose value says which
(`InvalidDay`, `InvalidVerse`, `InvalidOptions`) and why.

```ts
import { SrsErrorException } from "scripture-srs";
const error = (() => {
  try {
    fsrs.status(psalm, "Tuesday");
  } catch (e) {
    return e as SrsErrorException;
  }
})();
error?.value.tag; // → "InvalidDay"
error?.message; // → "not a day (YYYY-MM-DD): Tuesday"
```

```python
from scripture_srs import SrsErrorException, SrsErrorInvalidDay
try:
    fsrs.status(psalm, "Tuesday")
except SrsErrorException as e:
    error = e
isinstance(error.error, SrsErrorInvalidDay)  # → true
error.error.message  # → "not a day (YYYY-MM-DD): Tuesday"
```

## Helpers

```ts
srs.formatInterval(45, null); // → "1.5mo"
Array.from(srs.parseSteps("1m 10m 1d")); // → [1,10,1440]
```

```python
srs.format_interval(45, None)  # → "1.5mo"
srs.parse_steps("1m 10m 1d")  # → [1.0,10.0,1440.0]
```

## Every export

| Export | What it is | Example |
| --- | --- | --- |
| `ScriptureSrs` | Makes schedulers; lists algorithms; reads and writes the app's data | [A scheduler](#a-scheduler) |
| `ScriptureSrs.scheduler`, `schedulerFromJson` | A scheduler, by default or from the app's settings | [A scheduler](#a-scheduler), [settings](#the-web-apps-settings-and-data) |
| `ScriptureSrs.algorithms` | Each algorithm: key, name, description, grades, adaptive | [A scheduler](#a-scheduler) |
| `ScriptureSrs.readVerses`, `writeVerses` | Verses from and to the app's JSON | [settings and data](#the-web-apps-settings-and-data) |
| `ScriptureSrs.parseSteps`, `formatInterval`, `version` | Anki's steps; an interval as a button shows it; the version | [Helpers](#helpers) |
| `SrsScheduler.create`, `withAlgorithm`, `algorithm`, `withDurations` | Making a scheduler | [A scheduler](#a-scheduler) |
| `SrsScheduler.withFsrsParams`, `withDesiredRetention` | FSRS's parameters and retention | [settings and data](#the-web-apps-settings-and-data) |
| `SrsScheduler.withJson`, `toJson` | Options as the app saves them | [settings and data](#the-web-apps-settings-and-data) |
| `SrsScheduler.status`, `preview`, `memory`, `grades` | Where a verse is; what each grade would do; what's known of its memory | [Reviewing](#reviewing-a-verse) |
| `SrsScheduler.review`, `reschedule`, `due` | A review logged; placing by hand; the verses due | [Reviewing](#reviewing-a-verse), [Rescheduling](#rescheduling) |
| `VerseRecord`, `LogItem`, `VerseStatus`, `GradeOption`, `MemoryItem`, `AlgorithmInfo`, `Durations` | The records | |
| `Grade`, `Algorithm`, `Phase` | The enums | |
| `SrsError`, `SrsErrorException` | Errors | [Errors](#errors) |

## Development

```sh
cargo test                    # the crate's tests (and, in ../scripture-srs, the conformance cases)
npm install && npm run pack:wasm && (cd examples/node && npm install && node conformance.ts && node readme.ts)
npm run pack:python && pip install dist/python/wheelhouse/*.whl && python examples/python/conformance.py && python examples/python/readme.py
```

`examples/node/readme.ts` and `examples/python/readme.py` run this README's examples and check
each `→`.
