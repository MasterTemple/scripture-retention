//! The fixed schedule: each verse daily, then weekly, then monthly, for set lengths of time,
//! following from the day its daily reviews began.

use crate::dates::Day;
use crate::srs::LogEntry;
use crate::srs::util::describe_interval;

/// A memorized verse. Where it is in the fixed schedule follows from `start` alone; `last` is the
/// day it was last reviewed. `log` is every review since reviews were kept, which the adaptive
/// algorithms work from
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Verse {
    pub id: String,
    /// The topic, without `#`
    pub tag: String,
    /// The reference as written: `Psalm 119:147-148`
    #[cfg_attr(feature = "serde", serde(rename = "ref"))]
    pub reference: String,
    pub start: Day,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub last: Option<Day>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Vec::is_empty")
    )]
    pub log: Vec<LogEntry>,
}

impl Verse {
    /// A verse starting on `start`, never reviewed
    pub fn new(
        id: impl Into<String>,
        tag: impl Into<String>,
        reference: impl Into<String>,
        start: Day,
    ) -> Verse {
        Verse {
            id: id.into(),
            tag: tag.into(),
            reference: reference.into(),
            start,
            last: None,
            log: Vec::new(),
        }
    }
}

/// The reviewing phases of the fixed schedule, in order
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Bucket {
    Daily,
    Weekly,
    Monthly,
}

/// Where a verse is: before its start, upcoming; in a phase; or after the fixed schedule, retained
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "lowercase")
)]
pub enum Phase {
    Daily,
    Weekly,
    Monthly,
    Upcoming,
    Retained,
}

/// Phases in the order verses are reviewed and listed
pub const PHASES: [Phase; 5] = [
    Phase::Daily,
    Phase::Weekly,
    Phase::Monthly,
    Phase::Upcoming,
    Phase::Retained,
];

impl Phase {
    /// `Daily`, …; under an adaptive algorithm (where a phase is how far apart reviews are) `Days`, `Weeks`, `Months`
    pub fn name(self, adaptive: bool) -> &'static str {
        match (self, adaptive) {
            (Phase::Daily, false) => "Daily",
            (Phase::Weekly, false) => "Weekly",
            (Phase::Monthly, false) => "Monthly",
            (Phase::Daily, true) => "Days",
            (Phase::Weekly, true) => "Weeks",
            (Phase::Monthly, true) => "Months",
            (Phase::Upcoming, _) => "Upcoming",
            (Phase::Retained, _) => "Retained",
        }
    }

    pub(crate) fn order(self) -> usize {
        PHASES.iter().position(|p| *p == self).unwrap_or(0)
    }
}

impl From<Bucket> for Phase {
    fn from(b: Bucket) -> Phase {
        match b {
            Bucket::Daily => Phase::Daily,
            Bucket::Weekly => Phase::Weekly,
            Bucket::Monthly => Phase::Monthly,
        }
    }
}

/// How long each phase lasts: 7 weeks daily, 7 months weekly, 7 years monthly by default
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "camelCase", default)
)]
pub struct Durations {
    pub daily_weeks: u32,
    pub weekly_months: u32,
    pub monthly_years: u32,
}

impl Default for Durations {
    fn default() -> Durations {
        Durations {
            daily_weeks: 7,
            weekly_months: 7,
            monthly_years: 7,
        }
    }
}

/// The days each phase of a verse starting on `start` begins, and the day it's retained
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Boundaries {
    pub daily: Day,
    pub weekly: Day,
    pub monthly: Day,
    pub retained: Day,
}

pub fn boundaries(start: Day, d: &Durations) -> Boundaries {
    let weekly = start.add_days(i64::from(d.daily_weeks) * 7);
    let monthly = weekly.add_months(d.weekly_months as i32);
    let retained = monthly.add_months(d.monthly_years as i32 * 12);
    Boundaries {
        daily: start,
        weekly,
        monthly,
        retained,
    }
}

/// How many reviews (days, weeks, or months) a phase has
pub fn phase_length(bucket: Bucket, d: &Durations, start: Option<Day>) -> u32 {
    match bucket {
        Bucket::Daily => d.daily_weeks * 7,
        Bucket::Monthly => d.monthly_years * 12,
        // Weeks in the weekly phase depend a little on which months it spans
        Bucket::Weekly => {
            let b = boundaries(start.unwrap_or(Day::new(2001, 1, 1).unwrap()), d);
            (b.weekly.days_until(b.monthly) as f64 / 7.0).ceil() as u32
        }
    }
}

/// Where a verse is on a day
#[derive(Clone, Debug, PartialEq)]
pub struct Status {
    pub phase: Phase,
    /// Which review of its phase this is (1-based), 0 when upcoming or retained (or adaptive)
    pub position: u32,
    /// How many reviews its phase has
    pub total: u32,
    /// The latest day on or before today it was scheduled for
    pub scheduled: Option<Day>,
    /// Whether it hasn't been reviewed since it was last scheduled
    pub due: bool,
    /// When it's next scheduled after today
    pub next: Option<Day>,
    /// Under an adaptive algorithm: the days from its last review to its next
    pub interval: Option<u32>,
    /// Under an adaptive algorithm: to be seen again the same day (a learning step, or a drill)
    pub learning: bool,
    /// Under an adaptive algorithm: never reviewed
    pub fresh: bool,
}

/// Where a verse is on `day` in the fixed schedule
pub fn status(verse: &Verse, day: Day, d: &Durations) -> Status {
    let b = boundaries(verse.start, d);
    let reviewed = |scheduled: Day| verse.last.is_some_and(|last| last >= scheduled);
    let make = |phase, position, total, scheduled: Option<Day>, due, next| Status {
        phase,
        position,
        total,
        scheduled,
        due,
        next,
        interval: None,
        learning: false,
        fresh: false,
    };
    if day < b.daily {
        return make(Phase::Upcoming, 0, 0, None, false, Some(b.daily));
    }
    if day < b.weekly {
        let total = phase_length(Bucket::Daily, d, None);
        return make(
            Phase::Daily,
            b.daily.days_until(day) as u32 + 1,
            total,
            Some(day),
            !reviewed(day),
            Some(day.add_days(1)),
        );
    }
    if day < b.monthly {
        let weeks = b.weekly.days_until(day) / 7;
        let scheduled = b.weekly.add_days(weeks * 7);
        let following = scheduled.add_days(7);
        let total = (b.weekly.days_until(b.monthly) as f64 / 7.0).ceil() as u32;
        let next = if following < b.monthly {
            following
        } else {
            b.monthly
        };
        return make(
            Phase::Weekly,
            weeks as u32 + 1,
            total,
            Some(scheduled),
            !reviewed(scheduled),
            Some(next),
        );
    }
    if day < b.retained {
        let months = b.monthly.months_until(day);
        let scheduled = b.monthly.add_months(months);
        let following = b.monthly.add_months(months + 1);
        let total = phase_length(Bucket::Monthly, d, None);
        let next = (following < b.retained).then_some(following);
        return make(
            Phase::Monthly,
            months as u32 + 1,
            total,
            Some(scheduled),
            !reviewed(scheduled),
            next,
        );
    }
    make(Phase::Retained, 0, 0, None, false, None)
}

/// The start day that puts a verse at review `position` (1-based) of `bucket` on `day`
pub fn start_for(bucket: Bucket, position: u32, day: Day, d: &Durations) -> Day {
    let n = i64::from(position.max(1));
    let daily_days = i64::from(d.daily_weeks) * 7;
    match bucket {
        Bucket::Daily => day.add_days(-(n - 1)),
        Bucket::Weekly => day.add_days(-(n - 1) * 7 - daily_days),
        Bucket::Monthly => {
            // Months are uneven, so going back by them can land a day or two off: find the start
            // whose monthly phase begins on the right day
            let monthly = day.add_months(-(n as i32 - 1));
            let guess = monthly
                .add_months(-(d.weekly_months as i32))
                .add_days(-daily_days);
            [0, 1, -1, 2, -2, 3, -3]
                .into_iter()
                .map(|offset| guess.add_days(offset))
                .find(|start| boundaries(*start, d).monthly == monthly)
                .unwrap_or(guess)
        }
    }
}

/// `Day 12 of 49`, `Week 3 of 30`, `Month 5 of 84`, `Upcoming`, `Retained`; under an adaptive
/// algorithm, `New`, `Learning`, `Every 12 days`
pub fn describe_position(s: &Status) -> String {
    if let (Some(interval), true) = (s.interval, s.phase != Phase::Upcoming) {
        return if s.fresh {
            "New".into()
        } else if s.learning {
            "Learning".into()
        } else if interval == 1 {
            "Every day".into()
        } else {
            format!("Every {}", describe_interval(interval))
        };
    }
    match s.phase {
        Phase::Daily => format!("Day {} of {}", s.position, s.total),
        Phase::Weekly => format!("Week {} of {}", s.position, s.total),
        Phase::Monthly => format!("Month {} of {}", s.position, s.total),
        Phase::Upcoming => "Upcoming".into(),
        Phase::Retained => "Retained".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(text: &str) -> Day {
        text.parse().unwrap()
    }

    fn verse(start: &str, last: Option<&str>) -> Verse {
        Verse {
            last: last.map(day),
            ..Verse::new(start, "t", "John 3:16", day(start))
        }
    }

    #[test]
    fn phases_follow_the_start_day() {
        let d = Durations::default();
        let b = boundaries(day("2026-01-01"), &d);
        assert_eq!(
            (b.weekly, b.monthly, b.retained),
            (day("2026-02-19"), day("2026-09-19"), day("2033-09-19"))
        );
        assert_eq!(
            status(&verse("2026-01-01", None), day("2025-12-31"), &d).phase,
            Phase::Upcoming
        );
        let s = status(&verse("2026-01-01", None), day("2026-02-18"), &d);
        assert_eq!(
            (s.phase, s.position, s.total, s.due, s.next),
            (Phase::Daily, 49, 49, true, Some(day("2026-02-19")))
        );
        let w = status(&verse("2026-01-01", None), day("2026-02-25"), &d);
        assert_eq!(
            (w.phase, w.position, w.scheduled, w.next, w.total),
            (
                Phase::Weekly,
                1,
                Some(day("2026-02-19")),
                Some(day("2026-02-26")),
                31
            )
        );
        let m = status(&verse("2026-01-01", None), day("2026-10-19"), &d);
        assert_eq!((m.phase, m.position, m.total), (Phase::Monthly, 2, 84));
        assert_eq!(
            status(&verse("2026-01-01", None), day("2033-09-19"), &d).phase,
            Phase::Retained
        );
        assert!(
            !status(
                &verse("2026-01-01", Some("2026-02-19")),
                day("2026-02-24"),
                &d
            )
            .due
        );
        assert!(
            status(
                &verse("2026-01-01", Some("2026-02-18")),
                day("2026-02-24"),
                &d
            )
            .due
        );
    }

    #[test]
    fn start_for_puts_a_verse_at_its_position() {
        let d = Durations::default();
        for today in [
            "2026-10-14",
            "2026-03-31",
            "2026-02-28",
            "2024-02-29",
            "2026-08-31",
        ] {
            for (bucket, max) in [
                (Bucket::Daily, 49),
                (Bucket::Weekly, 30),
                (Bucket::Monthly, 84),
            ] {
                for n in 1..=max {
                    let s = status(
                        &verse("2000-01-01", None).with_start(start_for(bucket, n, day(today), &d)),
                        day(today),
                        &d,
                    );
                    assert_eq!(
                        (s.phase, s.position),
                        (bucket.into(), n),
                        "{today} {bucket:?} {n}"
                    );
                }
            }
        }
    }

    impl Verse {
        fn with_start(self, start: Day) -> Verse {
            Verse { start, ..self }
        }
    }
}
