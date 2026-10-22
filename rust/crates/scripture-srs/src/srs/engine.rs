//! A verse's history run through the algorithm chosen: where it is, what each grade would do,
//! and which verses are due.

use super::anki::{self, AnkiState};
use super::ebisu::{self, EbisuState};
use super::fsrs::{self, FsrsModel, FsrsState};
use super::ladder::{self, LadderState};
use super::sm2::{self, Sm2State};
use super::util::{Seeded, format_interval, fuzz_for};
use super::{AlgorithmId, Base, Grade, LadderOptions, LogEntry, SrsOptions};
use crate::dates::Day;
use crate::schedule::{Durations, Phase, Status, Verse, boundaries, status};

/// The state an adaptive algorithm has a verse in
#[derive(Clone, Debug, PartialEq)]
pub enum Card {
    Anki(AnkiState),
    Fsrs(FsrsState),
    Sm2(Sm2State),
    Ladder(LadderState),
    Ebisu(EbisuState),
}

impl Card {
    /// What every algorithm keeps: due day, last review, interval, reviews, lapses
    pub fn base(&self) -> &Base {
        match self {
            Card::Anki(s) => &s.base,
            Card::Fsrs(s) => &s.base,
            Card::Sm2(s) => &s.base,
            Card::Ladder(s) => &s.base,
            Card::Ebisu(s) => &s.base,
        }
    }
}

/// What each grade would do to a verse
#[derive(Clone, Debug, PartialEq)]
pub struct GradePreview {
    pub grade: Grade,
    /// When it'd be due: `<10m`, `3d`, `2.5mo`
    pub label: String,
    /// Days until it'd be due (0: again today)
    pub days: u32,
}

/// The order due verses come in
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Order {
    /// Daily (or shortest intervals) first, then weekly, then monthly, oldest first in each
    Phase,
    /// Shuffled by a seed
    Shuffle(u32),
}

/// The grades an algorithm asks for, in button order; the fixed schedule only goes on (as Good)
pub fn grades_for(id: AlgorithmId) -> &'static [Grade] {
    match id {
        AlgorithmId::Fixed => &[Grade::Good],
        AlgorithmId::Anki | AlgorithmId::Fsrs | AlgorithmId::Sm2 => {
            &[Grade::Again, Grade::Hard, Grade::Good, Grade::Easy]
        }
        AlgorithmId::Leitner | AlgorithmId::Pimsleur | AlgorithmId::Ebisu => {
            &[Grade::Again, Grade::Good]
        }
    }
}

/// Where a verse is in the fixed schedule, as a log entry an algorithm can start from: nothing
/// while it's new (before or on its first day, not yet reviewed), else last reviewed a phase's
/// interval before it's due (or when it was, if it isn't due)
pub fn placement(verse: &Verse, day: Day, durations: &Durations) -> Option<LogEntry> {
    let s = status(verse, day, durations);
    match s.phase {
        Phase::Upcoming => return None,
        Phase::Retained => {
            return Some(LogEntry::Place {
                day: boundaries(verse.start, durations).retained,
                days: 365,
            });
        }
        Phase::Daily if s.position == 1 && verse.last.is_none() => return None,
        _ => {}
    }
    let scheduled = s.scheduled?;
    let interval = match s.phase {
        Phase::Daily => 1,
        Phase::Weekly => 7,
        _ => scheduled.add_months(-1).days_until(scheduled),
    };
    if let (false, Some(last)) = (s.due, verse.last) {
        let next = s.next.unwrap_or(last.add_days(interval));
        return Some(LogEntry::Place {
            day: last,
            days: last.days_until(next).max(1) as u32,
        });
    }
    Some(LogEntry::Place {
        day: scheduled.add_days(-interval),
        days: interval as u32,
    })
}

/// A verse's history: its log, or (before one is kept) where the fixed schedule has it on `day`
pub fn history(verse: &Verse, day: Day, durations: &Durations) -> Vec<LogEntry> {
    if !verse.log.is_empty() {
        return verse.log.clone();
    }
    placement(verse, day, durations).into_iter().collect()
}

/// The log with `entry` added; a verse's first entry keeps where it was placed before it
pub fn with_entry(verse: &Verse, entry: LogEntry, durations: &Durations) -> Vec<LogEntry> {
    let mut log = history(verse, entry.day(), durations);
    log.push(entry);
    log
}

/// What scheduling takes: the algorithm, its options, and the fixed schedule's lengths (for placing verses)
#[derive(Clone, Debug, PartialEq)]
pub struct Scheduler {
    algorithm: AlgorithmId,
    durations: Durations,
    srs: SrsOptions,
    model: FsrsModel,
}

impl Default for Scheduler {
    fn default() -> Scheduler {
        Scheduler::new(
            AlgorithmId::Fixed,
            Durations::default(),
            SrsOptions::default(),
        )
    }
}

impl Scheduler {
    pub fn new(algorithm: AlgorithmId, durations: Durations, srs: SrsOptions) -> Scheduler {
        let model = FsrsModel::new(&srs.fsrs.params);
        Scheduler {
            algorithm,
            durations,
            srs,
            model,
        }
    }

    pub fn algorithm(&self) -> AlgorithmId {
        self.algorithm
    }

    pub fn durations(&self) -> &Durations {
        &self.durations
    }

    pub fn options(&self) -> &SrsOptions {
        &self.srs
    }

    /// The FSRS model its parameters make
    pub fn fsrs_model(&self) -> &FsrsModel {
        &self.model
    }

    pub fn with_algorithm(&self, algorithm: AlgorithmId) -> Scheduler {
        Scheduler {
            algorithm,
            ..self.clone()
        }
    }

    pub fn with_durations(&self, durations: Durations) -> Scheduler {
        Scheduler {
            durations,
            ..self.clone()
        }
    }

    pub fn with_options(&self, srs: SrsOptions) -> Scheduler {
        Scheduler::new(self.algorithm, self.durations, srs)
    }

    /// The grades its algorithm asks for
    pub fn grades(&self) -> &'static [Grade] {
        grades_for(self.algorithm)
    }

    fn ladder(&self) -> &LadderOptions {
        if self.algorithm == AlgorithmId::Pimsleur {
            &self.srs.pimsleur
        } else {
            &self.srs.leitner
        }
    }

    fn init(&self) -> Option<Card> {
        let o = &self.srs;
        Some(match self.algorithm {
            AlgorithmId::Fixed => return None,
            AlgorithmId::Anki => Card::Anki(anki::init(o)),
            AlgorithmId::Fsrs => Card::Fsrs(fsrs::init()),
            AlgorithmId::Sm2 => Card::Sm2(sm2::init(o)),
            AlgorithmId::Leitner | AlgorithmId::Pimsleur => Card::Ladder(ladder::init()),
            AlgorithmId::Ebisu => Card::Ebisu(ebisu::init(o)),
        })
    }

    fn place(&self, card: &Card, day: Day, days: u32) -> Card {
        let o = &self.srs;
        match card {
            Card::Anki(s) => Card::Anki(anki::place(s, day, days, o)),
            Card::Fsrs(s) => Card::Fsrs(fsrs::place(&self.model, s, day, days, o)),
            Card::Sm2(s) => Card::Sm2(sm2::place(s, day, days)),
            Card::Ladder(s) => Card::Ladder(ladder::place(s, day, days, self.ladder())),
            Card::Ebisu(s) => Card::Ebisu(ebisu::place(s, day, days, o)),
        }
    }

    fn review(&self, card: &Card, grade: Grade, day: Day, fuzz: f64) -> Card {
        let o = &self.srs;
        match card {
            Card::Anki(s) => Card::Anki(anki::review(s, grade, day, o, fuzz)),
            Card::Fsrs(s) => Card::Fsrs(fsrs::review(&self.model, s, grade, day, o, fuzz)),
            Card::Sm2(s) => Card::Sm2(sm2::review(s, grade, day)),
            Card::Ladder(s) => Card::Ladder(ladder::review(s, grade, day, self.ladder())),
            Card::Ebisu(s) => Card::Ebisu(ebisu::review(s, grade, day, o)),
        }
    }

    /// The state the adaptive algorithm has a verse in after its history (`None` under the fixed schedule)
    pub fn card(&self, verse: &Verse, day: Day) -> Option<Card> {
        let entries = history(verse, day, &self.durations);
        self.fold(verse, &entries)
    }

    fn fold(&self, verse: &Verse, entries: &[LogEntry]) -> Option<Card> {
        let mut card = self.init()?;
        for (i, entry) in entries.iter().enumerate() {
            card = match *entry {
                LogEntry::Place { days: 0, .. } => self.init()?,
                LogEntry::Place { day, days } => self.place(&card, day, days),
                LogEntry::Review { day, grade } => {
                    self.review(&card, grade, day, fuzz_for(&verse.id, i))
                }
            };
        }
        Some(card)
    }

    /// Where a verse is on `day`
    pub fn status(&self, verse: &Verse, day: Day) -> Status {
        let Some(card) = (day >= verse.start)
            .then(|| self.card(verse, day))
            .flatten()
        else {
            if !self.algorithm.is_adaptive() {
                return status(verse, day, &self.durations);
            }
            return Status {
                phase: Phase::Upcoming,
                position: 0,
                total: 0,
                scheduled: None,
                due: false,
                next: Some(verse.start),
                interval: None,
                learning: false,
                fresh: false,
            };
        };
        let s = card.base();
        let due_day = s.due.unwrap_or(verse.start);
        let due = due_day <= day;
        let fresh = s.last.is_none();
        let learning = !fresh && matches!((s.due, s.last), (Some(d), Some(l)) if d <= l);
        let phase = if fresh || learning || s.interval < 7 {
            Phase::Daily
        } else if s.interval < 30 {
            Phase::Weekly
        } else {
            Phase::Monthly
        };
        Status {
            phase,
            position: 0,
            total: 0,
            scheduled: due.then_some(due_day),
            due,
            next: (!due).then_some(due_day),
            interval: Some(s.interval),
            learning,
            fresh,
        }
    }

    /// What the adaptive algorithm knows of a verse's memory on `day`: label and value (none for the fixed schedule)
    pub fn memory(&self, verse: &Verse, day: Day) -> Vec<(String, String)> {
        let Some(card) = self.card(verse, day) else {
            return Vec::new();
        };
        let o = &self.srs;
        match &card {
            Card::Anki(s) => anki::memory(s, o),
            Card::Fsrs(s) => fsrs::memory(&self.model, s, day, o),
            Card::Sm2(s) => sm2::memory(s),
            Card::Ladder(s) => ladder::memory(s, self.ladder()),
            Card::Ebisu(s) => ebisu::memory(s, day),
        }
    }

    /// What each grade would do to a verse reviewed on `day`, for the buttons (none for the fixed schedule)
    pub fn preview(&self, verse: &Verse, day: Day) -> Vec<GradePreview> {
        self.preview_at(verse, day, None)
    }

    /// What each grade would do in place of the review logged at `at` (going back to a card
    /// graded already), or, with none, what [`Scheduler::preview`] gives
    pub fn preview_at(&self, verse: &Verse, day: Day, at: Option<usize>) -> Vec<GradePreview> {
        let entries = match at {
            Some(at) if at < verse.log.len() => verse.log[..at].to_vec(),
            _ => history(verse, day, &self.durations),
        };
        let Some(card) = self.fold(verse, &entries) else {
            return Vec::new();
        };
        let fuzz = fuzz_for(&verse.id, entries.len());
        self.grades()
            .iter()
            .map(|&grade| {
                let after = self.review(&card, grade, day, fuzz);
                let base = after.base();
                let days = base.due.map_or(0, |due| day.days_until(due).max(0)) as u32;
                GradePreview {
                    grade,
                    days,
                    label: format_interval(days, if days == 0 { base.step_minutes } else { None }),
                }
            })
            .collect()
    }

    /// The verses due on `day`, in `order`
    pub fn due_verses<'a>(&self, verses: &'a [Verse], day: Day, order: Order) -> Vec<&'a Verse> {
        let mut due: Vec<(&Verse, Status)> = verses
            .iter()
            .map(|v| (v, self.status(v, day)))
            .filter(|(_, s)| s.due)
            .collect();
        match order {
            Order::Shuffle(seed) => {
                let mut random = Seeded::new(seed);
                for i in (1..due.len()).rev() {
                    let j = (random.next_f64() * (i + 1) as f64).floor() as usize;
                    due.swap(i, j);
                }
            }
            Order::Phase => due.sort_by(|(a, sa), (b, sb)| {
                sa.phase
                    .order()
                    .cmp(&sb.phase.order())
                    .then(a.start.cmp(&b.start))
            }),
        }
        due.into_iter().map(|(v, _)| v).collect()
    }

    /// A verse after a review graded `grade` on `day` (Good under the fixed schedule): its log
    /// gains the review, its first entry keeping where it was placed before
    pub fn reviewed(&self, verse: &Verse, grade: Grade, day: Day) -> Verse {
        Verse {
            last: Some(day),
            log: with_entry(verse, LogEntry::Review { day, grade }, &self.durations),
            ..verse.clone()
        }
    }

    /// A verse placed by hand: next due `days` after `day` (0: back to new), counted as reviewed when `reviewed`
    pub fn placed(&self, verse: &Verse, days: u32, day: Day, reviewed: bool) -> Verse {
        Verse {
            last: if reviewed { Some(day) } else { verse.last },
            log: with_entry(verse, LogEntry::Place { day, days }, &self.durations),
            ..verse.clone()
        }
    }
}
