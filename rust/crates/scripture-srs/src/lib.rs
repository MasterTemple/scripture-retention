//! Spaced repetition for memorized Scripture.
//!
//! Every verse keeps a log of its reviews. An algorithm's view of a verse is a fold over that
//! log, so switching algorithms replays the same history. A verse's place in the fixed schedule
//! (daily, weekly, monthly, from the day it started) seeds the log, so verses from before
//! grading, or added partway in, start in the right place.
//!
//! The algorithms:
//!
//! - **Scripture Memory** ([`AlgorithmId::Fixed`]): daily for 7 weeks, weekly for 7 months,
//!   monthly for 7 years
//! - **FSRS** 4.5, 5, and 6, by how many parameters are given, with Anki's learning steps
//! - **Anki's SM-2**: steps, ease, hard/good/easy with delay and early reviews, fuzz, leeches
//! - **SuperMemo SM-2**, **Leitner** boxes, **Pimsleur**'s ladder, and **Ebisu** v2
//!
//! It's the same engine as the web app's (`src/core/srs`), checked against the same cases
//! (`tests/conformance.json`), so both give the same days and the same text.
//!
//! ```
//! use scripture_srs::{AlgorithmId, Day, Durations, Grade, Order, Scheduler, SrsOptions, Verse};
//!
//! let today: Day = "2026-10-21".parse().unwrap();
//! let scheduler = Scheduler::new(AlgorithmId::Fsrs, Durations::default(), SrsOptions::default());
//! let verse = Verse::new("1", "love", "John 3:16", today);
//! let labels: Vec<String> = scheduler.preview(&verse, today).into_iter().map(|p| p.label).collect();
//! assert_eq!(labels, ["<1m", "<6m", "<10m", "10d"]);
//!
//! let verse = scheduler.reviewed(&verse, Grade::Good, today);
//! assert!(scheduler.status(&verse, today).learning);
//! assert_eq!(scheduler.due_verses(&[verse], today, Order::Phase).len(), 1);
//! ```

pub mod dates;
pub mod schedule;
pub mod srs;

pub use dates::{Day, ParseDayError, WEEKDAYS};
pub use schedule::{
    Boundaries, Bucket, Durations, PHASES, Phase, Status, Verse, boundaries, describe_position,
    phase_length, start_for, status,
};
pub use srs::fsrs::{
    FSRS5_DEFAULTS, FSRS6_DEFAULTS, FSRS45_DEFAULTS, FsrsModel, FsrsVersion, fsrs_version,
    parse_params,
};
pub use srs::util::{describe_interval, format_interval, format_steps, parse_steps};
pub use srs::{
    ALGORITHM_IDS, AlgorithmId, AnkiOptions, Base, Card, CardPhase, EbisuOptions, FsrsOptions,
    GRADES, Grade, GradePreview, LadderOptions, LogEntry, OnMiss, Order, Scheduler, Sm2Options,
    SrsOptions, grades_for, history, placement, with_entry,
};
