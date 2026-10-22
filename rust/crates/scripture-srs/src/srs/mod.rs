//! The spaced-repetition algorithms, each a set of pure functions over a verse's review log.

pub mod anki;
pub mod ebisu;
pub mod engine;
pub mod fsrs;
pub mod ladder;
pub mod optimize;
pub mod options;
pub mod sm2;
pub mod util;

pub use engine::*;
pub use options::*;

use crate::dates::Day;

/// How well a verse was recalled
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Grade {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

pub const GRADES: [Grade; 4] = [Grade::Again, Grade::Hard, Grade::Good, Grade::Easy];

impl Grade {
    /// `Again`, `Hard`, `Good`, `Easy`
    pub fn name(self) -> &'static str {
        match self {
            Grade::Again => "Again",
            Grade::Hard => "Hard",
            Grade::Good => "Good",
            Grade::Easy => "Easy",
        }
    }

    /// 1 to 4
    pub fn number(self) -> u8 {
        self as u8
    }

    pub fn from_number(n: u8) -> Option<Grade> {
        GRADES.get(usize::from(n).checked_sub(1)?).copied()
    }

    pub(crate) fn f(self) -> f64 {
        f64::from(self as u8)
    }
}

/// One thing that happened to a verse: a review and how it went, or a placing by hand (last
/// reviewed on `day`, next in `days` days; 0 days forgets it, back to new)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogEntry {
    Review { day: Day, grade: Grade },
    Place { day: Day, days: u32 },
}

impl LogEntry {
    pub fn day(&self) -> Day {
        match self {
            LogEntry::Review { day, .. } | LogEntry::Place { day, .. } => *day,
        }
    }
}

// Saved as the web app saves them: `{ "day": …, "grade": 3 }` or `{ "day": …, "set": 7 }`
#[cfg(feature = "serde")]
mod serde_log {
    use super::*;

    #[derive(serde::Serialize, serde::Deserialize)]
    #[serde(untagged)]
    enum Saved {
        Review { day: Day, grade: u8 },
        Place { day: Day, set: u32 },
    }

    impl serde::Serialize for LogEntry {
        fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
            match *self {
                LogEntry::Review { day, grade } => Saved::Review {
                    day,
                    grade: grade.number(),
                },
                LogEntry::Place { day, days } => Saved::Place { day, set: days },
            }
            .serialize(serializer)
        }
    }

    impl<'de> serde::Deserialize<'de> for LogEntry {
        fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<LogEntry, D::Error> {
            match Saved::deserialize(deserializer)? {
                Saved::Review { day, grade } => Grade::from_number(grade)
                    .map(|grade| LogEntry::Review { day, grade })
                    .ok_or_else(|| serde::de::Error::custom(format!("not a grade: {grade}"))),
                Saved::Place { day, set } => Ok(LogEntry::Place { day, days: set }),
            }
        }
    }
}

/// What every algorithm keeps about a card, besides its own memory model
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Base {
    /// The day it's due next; `None` while it's new (it's due from its start)
    pub due: Option<Day>,
    /// The day it was last reviewed or placed
    pub last: Option<Day>,
    /// Days from its last review to when it's due (0 while it's to be seen again the same day)
    pub interval: u32,
    pub reps: u32,
    pub lapses: u32,
    /// For a step under a day (seen again in this sitting), its length in minutes
    pub step_minutes: Option<f64>,
}

/// Where a card is in Anki's (and FSRS's) learning
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CardPhase {
    New,
    Learning,
    Review,
    Relearning,
}
