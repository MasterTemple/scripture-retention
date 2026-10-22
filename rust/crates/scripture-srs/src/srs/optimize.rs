//! Fitting FSRS's parameters to the reviews logged, with fsrs-rs (FSRS's reference optimizer,
//! the one Anki runs), behind the `optimizer` feature.
//!
//! A verse's history counts from its first review as a new verse: from the start of its log, or
//! after it was last started over as new. A verse whose log begins with a placing (a verse from
//! before grading, or added partway into the fixed schedule) has no such start until it's started
//! over, so it's left out, as Anki leaves out cards whose first learning isn't in their log.
//! Placings by hand in the middle of a history are passed over, as Anki passes over "set due date".

use crate::schedule::Verse;
use crate::srs::{Grade, LogEntry};

/// One verse's reviews from new: each grade and the days since the review before (0 the first)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct History {
    pub verse: usize,
    pub reviews: Vec<(Grade, u32)>,
}

/// The verses' histories FSRS can learn from
pub fn histories(verses: &[Verse]) -> Vec<History> {
    verses
        .iter()
        .enumerate()
        .filter_map(|(index, verse)| {
            // From after the last start over, or the whole log if it begins with a review
            let from = match verse
                .log
                .iter()
                .rposition(|e| matches!(e, LogEntry::Place { days: 0, .. }))
            {
                Some(reset) => reset + 1,
                None if matches!(verse.log.first(), Some(LogEntry::Review { .. })) => 0,
                None => return None,
            };
            let mut reviews = Vec::new();
            let mut previous = None;
            for entry in &verse.log[from..] {
                if let LogEntry::Review { day, grade } = *entry {
                    let delta = previous.map_or(0, |p: crate::Day| p.days_until(day).max(0) as u32);
                    reviews.push((grade, delta));
                    previous = Some(day);
                }
            }
            (!reviews.is_empty()).then_some(History {
                verse: index,
                reviews,
            })
        })
        .collect()
}

/// How much there is to learn from: reviews on a later day than the one before (what FSRS
/// predicts), in how many verses
pub fn training_size(histories: &[History]) -> (usize, usize) {
    let reviews = histories
        .iter()
        .map(|h| h.reviews.iter().skip(1).filter(|(_, d)| *d > 0).count())
        .sum();
    let verses = histories
        .iter()
        .filter(|h| h.reviews.iter().skip(1).any(|(_, d)| *d > 0))
        .count();
    (reviews, verses)
}

/// What fitting found
#[derive(Clone, Debug, PartialEq)]
pub struct Optimized {
    /// FSRS-6's 21 parameters
    pub params: Vec<f64>,
    /// Reviews learned from (each on a later day than the one before)
    pub reviews: usize,
    /// Verses they came from
    pub verses: usize,
}

/// FSRS-6's parameters fitted to the verses' reviews. With few reviews they stay near the
/// defaults (fsrs-rs keeps the defaults under 8 reviews, and fits only the first stabilities
/// under 64). Taking a few seconds for a few thousand reviews, it's for a worker thread
#[cfg(feature = "optimizer")]
pub fn optimize(verses: &[Verse]) -> Result<Optimized, String> {
    use fsrs::{ComputeParametersInput, FSRSItem, FSRSReview, compute_parameters};
    let histories = histories(verses);
    let (reviews, used) = training_size(&histories);
    let mut train_set = Vec::new();
    let mut card_ids = Vec::new();
    for h in &histories {
        let all: Vec<FSRSReview> = h
            .reviews
            .iter()
            .map(|(g, d)| FSRSReview {
                rating: u32::from(g.number()),
                delta_t: *d,
            })
            .collect();
        // An item for each review on a later day: the history up to it, and it
        for end in 1..all.len() {
            if all[end].delta_t > 0 {
                train_set.push(FSRSItem {
                    reviews: all[..=end].to_vec(),
                });
                card_ids.push(h.verse as i64);
            }
        }
    }
    let params = if train_set.is_empty() {
        fsrs::DEFAULT_PARAMETERS.to_vec()
    } else {
        compute_parameters(ComputeParametersInput {
            train_set,
            card_ids: Some(card_ids),
            enable_short_term: true,
            ..ComputeParametersInput::default()
        })
        .map_err(|e| e.to_string())?
    };
    Ok(Optimized {
        params: params
            .into_iter()
            .map(|p| (f64::from(p) * 10_000.0).round() / 10_000.0)
            .collect(),
        reviews,
        verses: used,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Day;

    fn day(text: &str) -> Day {
        text.parse().unwrap()
    }

    fn verse(log: Vec<LogEntry>) -> Verse {
        Verse {
            log,
            ..Verse::new("v", "", "John 3:16", day("2026-01-01"))
        }
    }

    fn review(d: &str, g: Grade) -> LogEntry {
        LogEntry::Review {
            day: day(d),
            grade: g,
        }
    }

    #[test]
    fn histories_from_new() {
        let from_new = verse(vec![
            review("2026-01-01", Grade::Good),
            review("2026-01-01", Grade::Good),
            LogEntry::Place {
                day: day("2026-01-02"),
                days: 9,
            },
            review("2026-01-05", Grade::Again),
        ]);
        let placed = verse(vec![
            LogEntry::Place {
                day: day("2026-01-01"),
                days: 7,
            },
            review("2026-01-08", Grade::Good),
        ]);
        let restarted = verse(vec![
            LogEntry::Place {
                day: day("2026-01-01"),
                days: 7,
            },
            review("2026-01-08", Grade::Good),
            LogEntry::Place {
                day: day("2026-01-09"),
                days: 0,
            },
            review("2026-01-10", Grade::Hard),
            review("2026-01-12", Grade::Good),
        ]);
        let found = histories(&[from_new, placed, restarted]);
        assert_eq!(
            found,
            [
                History {
                    verse: 0,
                    reviews: vec![(Grade::Good, 0), (Grade::Good, 0), (Grade::Again, 4)]
                },
                History {
                    verse: 2,
                    reviews: vec![(Grade::Hard, 0), (Grade::Good, 2)]
                },
            ]
        );
        assert_eq!(training_size(&found), (2, 2));
    }

    #[cfg(feature = "optimizer")]
    #[test]
    fn fitting_moves_the_parameters_toward_what_was_logged() {
        // 60 verses, each reviewed from new and always recalled, on a schedule that grows
        let verses: Vec<Verse> = (0..60)
            .map(|i| {
                let start = day("2025-01-01").add_days(i);
                let mut log = vec![LogEntry::Review {
                    day: start,
                    grade: Grade::Good,
                }];
                let mut at = start;
                for gap in [1, 3, 7, 15, 30, 60] {
                    at = at.add_days(gap);
                    log.push(LogEntry::Review {
                        day: at,
                        grade: if (i + gap) % 9 == 0 {
                            Grade::Again
                        } else {
                            Grade::Good
                        },
                    });
                }
                Verse {
                    id: i.to_string(),
                    log,
                    ..verse(Vec::new())
                }
            })
            .collect();
        let fitted = optimize(&verses).unwrap();
        assert_eq!(fitted.params.len(), 21);
        assert_eq!((fitted.reviews, fitted.verses), (360, 60));
        let defaults: Vec<f64> = fsrs::DEFAULT_PARAMETERS
            .iter()
            .map(|p| f64::from(*p))
            .collect();
        assert!(
            fitted
                .params
                .iter()
                .zip(&defaults)
                .any(|(a, b)| (a - b).abs() > 0.01),
            "{:?}",
            fitted.params
        );
        // Too little to learn from: the defaults
        assert_eq!(optimize(&verses[..1]).unwrap().params.len(), 21);
    }
}
