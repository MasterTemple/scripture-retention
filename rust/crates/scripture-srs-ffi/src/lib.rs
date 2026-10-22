//! The API every language binding sees: owned data, two objects, and no lifetimes.
//!
//! Days cross the boundary as `YYYY-MM-DD` strings. Verses carry their review log, and every
//! method returns new values rather than changing what it's given: a review returns the verse
//! with the review added, for the host to save.

use boltffi::*;
use serde_json::Value;
use srs_core::{
    AlgorithmId, Day, LogEntry, Order, Phase as CorePhase, Scheduler, SrsOptions, Verse,
    describe_position, format_interval, parse_params, parse_steps,
};

#[cfg(test)]
mod tests;

/// How well a verse was recalled
#[data]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Grade {
    Again,
    Hard,
    Good,
    Easy,
}

impl From<Grade> for srs_core::Grade {
    fn from(g: Grade) -> Self {
        match g {
            Grade::Again => Self::Again,
            Grade::Hard => Self::Hard,
            Grade::Good => Self::Good,
            Grade::Easy => Self::Easy,
        }
    }
}

impl From<srs_core::Grade> for Grade {
    fn from(g: srs_core::Grade) -> Self {
        match g {
            srs_core::Grade::Again => Self::Again,
            srs_core::Grade::Hard => Self::Hard,
            srs_core::Grade::Good => Self::Good,
            srs_core::Grade::Easy => Self::Easy,
        }
    }
}

/// A scheduling algorithm
#[data]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Algorithm {
    /// Scripture Memory: daily for 7 weeks, weekly for 7 months, monthly for 7 years
    Fixed,
    /// FSRS 4.5, 5, or 6 (by how many parameters are given), with Anki's learning steps
    Fsrs,
    /// Anki's SM-2: steps, ease, fuzz, leeches
    Anki,
    /// SuperMemo SM-2 (1987)
    Sm2,
    Leitner,
    Pimsleur,
    /// Ebisu v2 (Bayesian)
    Ebisu,
}

impl From<Algorithm> for AlgorithmId {
    fn from(a: Algorithm) -> Self {
        match a {
            Algorithm::Fixed => Self::Fixed,
            Algorithm::Fsrs => Self::Fsrs,
            Algorithm::Anki => Self::Anki,
            Algorithm::Sm2 => Self::Sm2,
            Algorithm::Leitner => Self::Leitner,
            Algorithm::Pimsleur => Self::Pimsleur,
            Algorithm::Ebisu => Self::Ebisu,
        }
    }
}

impl From<AlgorithmId> for Algorithm {
    fn from(a: AlgorithmId) -> Self {
        match a {
            AlgorithmId::Fixed => Self::Fixed,
            AlgorithmId::Fsrs => Self::Fsrs,
            AlgorithmId::Anki => Self::Anki,
            AlgorithmId::Sm2 => Self::Sm2,
            AlgorithmId::Leitner => Self::Leitner,
            AlgorithmId::Pimsleur => Self::Pimsleur,
            AlgorithmId::Ebisu => Self::Ebisu,
        }
    }
}

/// Where a verse is: before its start, upcoming; in a phase (under an adaptive algorithm, how far
/// apart its reviews are: under a week, a month, or more); after the fixed schedule, retained
#[data]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Daily,
    Weekly,
    Monthly,
    Upcoming,
    Retained,
}

impl From<CorePhase> for Phase {
    fn from(p: CorePhase) -> Self {
        match p {
            CorePhase::Daily => Self::Daily,
            CorePhase::Weekly => Self::Weekly,
            CorePhase::Monthly => Self::Monthly,
            CorePhase::Upcoming => Self::Upcoming,
            CorePhase::Retained => Self::Retained,
        }
    }
}

/// One thing that happened to a verse: a review and how it went, or a placing by hand (last
/// reviewed on `day`, next in `days` days; 0 days starts it over as new)
#[data]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LogItem {
    Review { day: String, grade: Grade },
    Place { day: String, days: u32 },
}

/// A memorized verse, with every review since reviews were kept
#[data]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerseRecord {
    pub id: String,
    /// The topic, without `#`
    pub tag: String,
    /// The reference as written: `Psalm 119:147-148`
    pub reference: String,
    /// The day its reviews began (or will)
    pub start: String,
    /// The day it was last reviewed
    pub last: Option<String>,
    pub log: Vec<LogItem>,
    /// The deck it's in, by id (none: the default deck)
    pub deck: Option<String>,
    /// The passage it's a card of, by id (a book or chapters added as one)
    pub passage: Option<String>,
}

/// Where a verse is on a day
#[data]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerseStatus {
    pub phase: Phase,
    /// Under the fixed schedule, which review of its phase this is (1-based); otherwise 0
    pub position: u32,
    /// Under the fixed schedule, how many reviews its phase has; otherwise 0
    pub total: u32,
    /// When it's due, if it is: the day it came due
    pub scheduled: Option<String>,
    pub due: bool,
    /// When it's next due, if it isn't now
    pub next: Option<String>,
    /// Under an adaptive algorithm: days from its last review to its next
    pub interval: Option<u32>,
    /// To be seen again the same day (a learning step, or a drill)
    pub learning: bool,
    /// Never reviewed
    pub fresh: bool,
    /// `Day 12 of 49`, `Every 12 days`, `New`, `Learning`, `Upcoming`, …
    pub description: String,
}

/// What a grade would do to a verse
#[data]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GradeOption {
    pub grade: Grade,
    /// When it'd come back: `<10m` (again in this sitting), `3d`, `2.5mo`
    pub label: String,
    /// Days until it'd be due (0: again today)
    pub days: u32,
}

/// Something an algorithm knows of a verse's memory: `Stability`, `12 days`
#[data]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MemoryItem {
    pub label: String,
    pub value: String,
}

/// An algorithm, for listing
#[data]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AlgorithmInfo {
    pub algorithm: Algorithm,
    /// Its id as the web app saves it: `fixed`, `fsrs`, `anki`, `sm2`, `leitner`, `pimsleur`, `ebisu`
    pub key: String,
    pub name: String,
    pub description: String,
    /// The grades it asks for, in button order
    pub grades: Vec<Grade>,
    /// Whether it grades reviews and adapts to them
    pub adaptive: bool,
}

/// FSRS's parameters fitted to the reviews logged
#[data]
#[derive(Clone, Debug, PartialEq)]
pub struct FsrsFit {
    /// FSRS-6's 21 parameters, for `withFsrsParams` (joined with `, `) or the web app's settings
    pub params: Vec<f64>,
    /// Reviews learned from (each on a later day than the one before)
    pub reviews: u32,
    /// Verses they came from
    pub verses: u32,
}

/// How long each phase of the fixed schedule lasts
#[data]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Durations {
    pub daily_weeks: u32,
    pub weekly_months: u32,
    pub monthly_years: u32,
}

#[error]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SrsError {
    /// A day isn't `YYYY-MM-DD`, or isn't one the calendar has
    InvalidDay { message: String },
    /// A verse (or a list of them) couldn't be read
    InvalidVerse { message: String },
    /// Options couldn't be read or used
    InvalidOptions { message: String },
    /// Fitting FSRS's parameters failed
    Training { message: String },
}

fn day(text: &str) -> Result<Day, SrsError> {
    text.parse()
        .map_err(|e: srs_core::ParseDayError| SrsError::InvalidDay {
            message: e.to_string(),
        })
}

impl TryFrom<VerseRecord> for Verse {
    type Error = SrsError;

    fn try_from(v: VerseRecord) -> Result<Verse, SrsError> {
        let log = v
            .log
            .iter()
            .map(|item| {
                Ok(match item {
                    LogItem::Review { day: d, grade } => LogEntry::Review {
                        day: day(d)?,
                        grade: (*grade).into(),
                    },
                    LogItem::Place { day: d, days } => LogEntry::Place {
                        day: day(d)?,
                        days: *days,
                    },
                })
            })
            .collect::<Result<_, SrsError>>()?;
        Ok(Verse {
            start: day(&v.start)?,
            last: v.last.as_deref().map(day).transpose()?,
            log,
            id: v.id,
            tag: v.tag,
            reference: v.reference,
            deck: v.deck,
            passage: v.passage,
        })
    }
}

impl From<Verse> for VerseRecord {
    fn from(v: Verse) -> Self {
        let log = v
            .log
            .iter()
            .map(|entry| match *entry {
                LogEntry::Review { day, grade } => LogItem::Review {
                    day: day.to_string(),
                    grade: grade.into(),
                },
                LogEntry::Place { day, days } => LogItem::Place {
                    day: day.to_string(),
                    days,
                },
            })
            .collect();
        VerseRecord {
            id: v.id,
            tag: v.tag,
            reference: v.reference,
            start: v.start.to_string(),
            last: v.last.map(|d| d.to_string()),
            log,
            deck: v.deck,
            passage: v.passage,
        }
    }
}

/// Where everything starts: schedulers, the algorithms, and reading the web app's data.
///
/// ```ts
/// import { ScriptureSrs, Algorithm } from "scripture-srs";
/// const srs = ScriptureSrs.new();
/// const fsrs = srs.scheduler().withAlgorithm(Algorithm.Fsrs);
/// ```
#[derive(Default)]
pub struct ScriptureSrs;

#[export]
impl ScriptureSrs {
    pub fn new() -> Self {
        Self
    }

    /// This library's version
    pub fn version(&self) -> String {
        env!("CARGO_PKG_VERSION").to_owned()
    }

    /// A scheduler with the fixed schedule and every option at its default
    pub fn scheduler(&self) -> SrsScheduler {
        SrsScheduler::create()
    }

    /// A scheduler from the web app's settings (an object with `algorithm`, `durations`, and
    /// `srs`; other fields are passed over, so the app's whole settings object will do)
    pub fn scheduler_from_json(&self, json: String) -> Result<SrsScheduler, SrsError> {
        SrsScheduler::create().with_json(json)
    }

    /// Every algorithm, in the order the web app lists them
    pub fn algorithms(&self) -> Vec<AlgorithmInfo> {
        srs_core::ALGORITHM_IDS
            .into_iter()
            .map(|id| AlgorithmInfo {
                algorithm: id.into(),
                key: id.key().into(),
                name: id.name().into(),
                description: id.description().into(),
                grades: srs_core::grades_for(id)
                    .iter()
                    .map(|g| (*g).into())
                    .collect(),
                adaptive: id.is_adaptive(),
            })
            .collect()
    }

    /// The verses in the web app's JSON: a backup (`{ "verses": [...] }`), its saved state
    /// (`{ "state": { "verses": [...] } }`), or a list of verses
    pub fn read_verses(&self, json: String) -> Result<Vec<VerseRecord>, SrsError> {
        let invalid = |message: String| SrsError::InvalidVerse { message };
        let value: Value = serde_json::from_str(&json).map_err(|e| invalid(e.to_string()))?;
        let list = value
            .get("verses")
            .or_else(|| value.get("state").and_then(|s| s.get("verses")))
            .unwrap_or(&value)
            .clone();
        let verses: Vec<Verse> =
            serde_json::from_value(list).map_err(|e| invalid(e.to_string()))?;
        Ok(verses.into_iter().map(Into::into).collect())
    }

    /// Verses as the web app saves them (a JSON list, for a backup's `verses`)
    pub fn write_verses(&self, verses: Vec<VerseRecord>) -> Result<String, SrsError> {
        let verses = verses
            .into_iter()
            .map(Verse::try_from)
            .collect::<Result<Vec<_>, _>>()?;
        serde_json::to_string(&verses).map_err(|e| SrsError::InvalidVerse {
            message: e.to_string(),
        })
    }

    /// FSRS-6's parameters fitted to the verses' reviews, by fsrs-rs (the optimizer Anki runs).
    /// A verse counts from its first review as new (from the start of its log, or after it was
    /// last started over), so verses from before grading are left out until they're started
    /// over. Under 8 reviews the parameters are the defaults; under 64 only the first stabilities
    /// are fitted. It takes a few seconds for a few thousand reviews: call it from a worker
    pub fn optimize_fsrs(&self, verses: Vec<VerseRecord>) -> Result<FsrsFit, SrsError> {
        let verses = verses
            .into_iter()
            .map(Verse::try_from)
            .collect::<Result<Vec<_>, _>>()?;
        let fit = srs_core::srs::optimize::optimize(&verses)
            .map_err(|message| SrsError::Training { message })?;
        Ok(FsrsFit {
            params: fit.params,
            reviews: fit.reviews as u32,
            verses: fit.verses as u32,
        })
    }

    /// Learning steps as Anki writes them (`1m 10m 1d`), in minutes
    pub fn parse_steps(&self, text: String) -> Result<Vec<f64>, SrsError> {
        parse_steps(&text).ok_or_else(|| SrsError::InvalidOptions {
            message: format!("not lengths of time (as 1m 10m 1d): {text}"),
        })
    }

    /// An interval as a grade button shows it: `<10m` (a step in minutes), `3d`, `2.5mo`, `1.2y`
    pub fn format_interval(&self, days: u32, step_minutes: Option<f64>) -> String {
        format_interval(days, step_minutes)
    }
}

/// An algorithm and its options, which say where verses are and what reviews do. Immutable:
/// each `with…` returns a new scheduler.
///
/// ```ts
/// const scheduler = srs.scheduler().withAlgorithm(Algorithm.Fsrs).withDesiredRetention(0.85);
/// const verse = { id: "1", tag: "love", reference: "John 3:16", start: "2026-10-21", last: null, log: [] };
/// scheduler.preview(verse, "2026-10-21").map((o) => o.label); // ["<1m", "<6m", "<10m", "8d"]
/// const reviewed = scheduler.review(verse, Grade.Good, "2026-10-21"); // to save
/// ```
#[derive(Clone, Debug, Default)]
pub struct SrsScheduler {
    inner: Scheduler,
}

impl SrsScheduler {
    /// The core's scheduler, for Rust callers
    pub fn core(&self) -> &Scheduler {
        &self.inner
    }

    fn settings(&self) -> Value {
        serde_json::json!({
            "algorithm": self.inner.algorithm(),
            "durations": self.inner.durations(),
            "srs": self.inner.options(),
        })
    }
}

/// `patch`'s fields over `base`'s, objects merged field by field
fn merge(base: &mut Value, patch: Value) {
    match (base, patch) {
        (Value::Object(base), Value::Object(patch)) => {
            for (key, value) in patch {
                merge(base.entry(key).or_insert(Value::Null), value);
            }
        }
        (base, patch) => *base = patch,
    }
}

#[export]
impl SrsScheduler {
    /// The fixed schedule, every option at its default
    pub fn create() -> Self {
        Self::default()
    }

    pub fn with_algorithm(&self, algorithm: Algorithm) -> Self {
        Self {
            inner: self.inner.with_algorithm(algorithm.into()),
        }
    }

    pub fn algorithm(&self) -> Algorithm {
        self.inner.algorithm().into()
    }

    /// The fixed schedule's phase lengths (also used to place a verse added partway in)
    pub fn with_durations(&self, durations: Durations) -> Self {
        let d = srs_core::Durations {
            daily_weeks: durations.daily_weeks,
            weekly_months: durations.weekly_months,
            monthly_years: durations.monthly_years,
        };
        Self {
            inner: self.inner.with_durations(d),
        }
    }

    /// FSRS's desired retention (0.7 to 0.99; 0.9 by default)
    pub fn with_desired_retention(&self, retention: f64) -> Self {
        let mut o = self.inner.options().clone();
        o.fsrs.desired_retention = retention.clamp(0.7, 0.99);
        Self {
            inner: self.inner.with_options(o),
        }
    }

    /// FSRS's parameters as Anki shows them (17, 19, or 21 numbers for FSRS-4.5, 5, or 6;
    /// empty for FSRS-6's defaults)
    pub fn with_fsrs_params(&self, params: String) -> Result<SrsScheduler, SrsError> {
        let params = parse_params(&params).ok_or_else(|| SrsError::InvalidOptions {
            message: "FSRS takes 17, 19, or 21 numbers".into(),
        })?;
        let mut o = self.inner.options().clone();
        o.fsrs.params = params;
        Ok(Self {
            inner: self.inner.with_options(o),
        })
    }

    /// This scheduler with the fields of a JSON object over its own, as the web app saves its
    /// settings: `{"algorithm": "anki", "srs": {"anki": {"learningSteps": [1, 10]}}}`. Objects
    /// merge field by field; fields other than `algorithm`, `durations`, and `srs` are passed over
    pub fn with_json(&self, json: String) -> Result<SrsScheduler, SrsError> {
        let invalid = |e: serde_json::Error| SrsError::InvalidOptions {
            message: e.to_string(),
        };
        let patch: Value = serde_json::from_str(&json).map_err(invalid)?;
        let Value::Object(mut patch) = patch else {
            return Err(SrsError::InvalidOptions {
                message: "settings are a JSON object".into(),
            });
        };
        patch.retain(|key, _| matches!(key.as_str(), "algorithm" | "durations" | "srs"));
        let mut settings = self.settings();
        merge(&mut settings, Value::Object(patch));
        let algorithm: AlgorithmId =
            serde_json::from_value(settings["algorithm"].clone()).map_err(invalid)?;
        let durations: srs_core::Durations =
            serde_json::from_value(settings["durations"].clone()).map_err(invalid)?;
        let srs: SrsOptions = serde_json::from_value(settings["srs"].clone()).map_err(invalid)?;
        Ok(Self {
            inner: Scheduler::new(algorithm, durations, srs),
        })
    }

    /// Its algorithm, phase lengths, and options, as the web app saves them
    pub fn to_json(&self) -> String {
        self.settings().to_string()
    }

    /// The grades its algorithm asks for, in button order (only Good for the fixed schedule)
    pub fn grades(&self) -> Vec<Grade> {
        self.inner.grades().iter().map(|g| (*g).into()).collect()
    }

    /// Where a verse is on `day`
    pub fn status(&self, verse: VerseRecord, day: String) -> Result<VerseStatus, SrsError> {
        let verse = Verse::try_from(verse)?;
        let s = self.inner.status(&verse, self::day(&day)?);
        Ok(VerseStatus {
            phase: s.phase.into(),
            position: s.position,
            total: s.total,
            scheduled: s.scheduled.map(|d| d.to_string()),
            due: s.due,
            next: s.next.map(|d| d.to_string()),
            interval: s.interval,
            learning: s.learning,
            fresh: s.fresh,
            description: if s.phase == CorePhase::Upcoming {
                format!("Starts {}", verse.start)
            } else {
                describe_position(&s)
            },
        })
    }

    /// What each grade would do to a verse reviewed on `day` (none under the fixed schedule)
    pub fn preview(&self, verse: VerseRecord, day: String) -> Result<Vec<GradeOption>, SrsError> {
        let verse = Verse::try_from(verse)?;
        Ok(self
            .inner
            .preview(&verse, self::day(&day)?)
            .into_iter()
            .map(|p| GradeOption {
                grade: p.grade.into(),
                label: p.label,
                days: p.days,
            })
            .collect())
    }

    /// What the algorithm knows of a verse's memory on `day`: stability, difficulty, ease, box,
    /// half-life… (none under the fixed schedule)
    pub fn memory(&self, verse: VerseRecord, day: String) -> Result<Vec<MemoryItem>, SrsError> {
        let verse = Verse::try_from(verse)?;
        Ok(self
            .inner
            .memory(&verse, self::day(&day)?)
            .into_iter()
            .map(|(label, value)| MemoryItem { label, value })
            .collect())
    }

    /// The verses due on `day`: shortest intervals first, oldest first in each
    pub fn due(&self, verses: Vec<VerseRecord>, day: String) -> Result<Vec<VerseRecord>, SrsError> {
        let verses = verses
            .into_iter()
            .map(Verse::try_from)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(self
            .inner
            .due_verses(&verses, self::day(&day)?, Order::Phase)
            .into_iter()
            .map(|v| v.clone().into())
            .collect())
    }

    /// The verse after a review on `day` graded `grade` (Good, under the fixed schedule), to save
    pub fn review(
        &self,
        verse: VerseRecord,
        grade: Grade,
        day: String,
    ) -> Result<VerseRecord, SrsError> {
        let verse = Verse::try_from(verse)?;
        Ok(self
            .inner
            .reviewed(&verse, grade.into(), self::day(&day)?)
            .into())
    }

    /// The verse placed by hand: next due `days` after `day` (0 starts it over as new), counted
    /// as reviewed on `day` when `reviewed`
    pub fn reschedule(
        &self,
        verse: VerseRecord,
        days: u32,
        day: String,
        reviewed: bool,
    ) -> Result<VerseRecord, SrsError> {
        let verse = Verse::try_from(verse)?;
        Ok(self
            .inner
            .placed(&verse, days, self::day(&day)?, reviewed)
            .into())
    }
}
