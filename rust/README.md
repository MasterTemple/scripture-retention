# Scripture Retention in Rust

The web app's spaced-repetition engine as a Rust library, bindings for other languages, and a
terminal app.

| Crate | What it is |
| --- | --- |
| [`scripture-srs`](crates/scripture-srs) | The engine: the fixed schedule, FSRS 4.5/5/6, Anki's SM-2, SuperMemo SM-2, Leitner, Pimsleur, and Ebisu, over each verse's review log. No dependencies by default; `serde` reads the web app's JSON, and `optimizer` fits FSRS's parameters with fsrs-rs (which the web app runs, as WebAssembly, from `vendor/scripture-srs`) |
| [`scripture-srs-ffi`](crates/scripture-srs-ffi) | Bindings for TypeScript (WebAssembly) and Python, made with [BoltFFI](https://github.com/boltffi/boltffi) (Swift and Kotlin can be generated too) |
| [`scripture-tui`](crates/scripture-tui) | Reviewing in the terminal, with [Ratatui](https://ratatui.rs) |

## The same answers as the web app

The library is a port of `src/core/srs`, and the two are checked against each other case by
case. `test/conformance.test.ts` (in the web app) writes 2,520 cases to
`crates/scripture-srs/tests/conformance.json`: 24 verses with mixed histories (same-day reviews,
lapses, verses placed by hand and started over), under five sets of options (Anki's defaults, no
fuzz, FSRS-5 and FSRS-4.5 parameters, and unusual steps and ladders), for every algorithm, on
three days each. Each case records where the verse is, what every grade would do (days and the
button's label), and the memory text (stability, ease, half-life…). They match:

- in Rust (`cargo test`)
- through the WebAssembly package in Node (`crates/scripture-srs-ffi/examples/node/conformance.ts`)
- through the Python wheel (`crates/scripture-srs-ffi/examples/python/conformance.py`)

JavaScript's rounding (`Math.round`, `toFixed`), the seeded generator behind fuzz (mulberry32),
and the hash of a verse's id (FNV-1a over UTF-16) are reproduced, so even fuzzed intervals agree.
After changing an algorithm in the web app, regenerate the cases
(`UPDATE_CONFORMANCE=1 npx vitest run test/conformance.test.ts`) and port the change until
`cargo test` passes again.

## The terminal app

```sh
cargo run --release -p scripture-tui -- --file scripture-retention-backup.json
```

It reads and writes the web app's backup (Settings → Data → Save backup, and Restore), keeping
every setting it doesn't use, so verses and their reviews go back and forth. Without `--file` it
keeps them in `$XDG_DATA_HOME/scripture-retention/backup.json`.

- **Review**: Space shows the verse (downloaded from [fetch.bible](https://fetch.bible) once,
  then kept in `$XDG_CACHE_HOME/scripture-retention`), then 1–4 grade it with each grade's
  interval shown (Space for Good; under the fixed schedule, Space goes on). `t`, `w`, `m` bring
  it back tomorrow, in a week, or in a month; ← goes back (and grading again replaces the grade).
  A learning step under a day brings the verse back later in the same sitting.
- **Verses**: every verse by phase, soonest due first, with the algorithm's view of the one
  selected (stability, difficulty, ease, box, half-life…) and its history; `a` adds one, `x`
  deletes, `f` starts one over as new.
- **Settings**: the default schedule's algorithm (with how many verses each has due today), the
  translation (BSB, KJV, WEB, ASV, LSV, YLT), and FSRS's desired retention.
- **Decks and passages** from the web app come along: each verse is scheduled by its deck's own
  schedule (or the default), a passage's card names its passage, and deleting one deletes the
  whole passage. Making decks and passages, and a deck's own options, are the web app's.

## Development

```sh
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --check
```

The bindings' packaging and checks are in [their README](crates/scripture-srs-ffi/README.md).
