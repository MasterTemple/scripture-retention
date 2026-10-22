//! Anki's SM-2 scheduler (its v3 scheduler without FSRS).

use super::util::{final_interval, round, step_again, step_due, step_good, step_hard};
use super::{AnkiOptions, Base, CardPhase, Grade, SrsOptions};
use crate::dates::Day;

#[derive(Clone, Debug, PartialEq)]
pub struct AnkiState {
    pub base: Base,
    pub phase: CardPhase,
    /// Which learning or relearning step it's on
    pub step: usize,
    pub ease: f64,
    /// Its review interval: in relearning, the one it goes back to
    pub scheduled: u32,
}

/// Where an answer at learning step `index` leads
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum StepAnswer {
    Step { step: usize, minutes: f64 },
    Graduate,
    Easy,
}

pub(crate) fn step_answer(steps: &[f64], index: usize, grade: Grade) -> StepAnswer {
    let minutes = match grade {
        Grade::Easy => return StepAnswer::Easy,
        Grade::Again => step_again(steps),
        Grade::Hard => step_hard(steps, index),
        Grade::Good => step_good(steps, index),
    };
    match minutes {
        None => StepAnswer::Graduate,
        Some(minutes) => StepAnswer::Step {
            step: match grade {
                Grade::Again => 0,
                Grade::Hard => index,
                _ => index + 1,
            },
            minutes,
        },
    }
}

/// A whole-day review interval as Anki sets one: times the interval modifier, at least `minimum`, fuzzed
fn passing(a: &AnkiOptions, interval: f64, minimum: f64, fuzz: f64) -> u32 {
    final_interval(
        interval * a.interval_modifier,
        minimum.max(1.0),
        a.maximum_interval,
        a.fuzz,
        fuzz,
    )
}

/// The intervals Hard, Good, and Easy give a review card, after Anki's v3 scheduler: on time or
/// late, the delay counts toward them; early, the days that did pass do. Each is longer than the
/// one before, and all share one fuzz factor
pub fn review_intervals(
    a: &AnkiOptions,
    scheduled: u32,
    elapsed: i64,
    ease: f64,
    fuzz: f64,
) -> (u32, u32, u32) {
    let scheduled = f64::from(scheduled);
    let elapsed = elapsed as f64;
    let delay = elapsed - scheduled;
    if delay >= 0.0 {
        let hard = passing(
            a,
            scheduled * a.hard_interval,
            if a.hard_interval <= 1.0 {
                0.0
            } else {
                scheduled + 1.0
            },
            fuzz,
        );
        let good_min = if a.hard_interval <= 1.0 {
            scheduled + 1.0
        } else {
            f64::from(hard) + 1.0
        };
        let good = passing(a, (scheduled + delay / 2.0) * ease, good_min, fuzz);
        let easy = passing(
            a,
            (scheduled + delay) * ease * a.easy_bonus,
            f64::from(good) + 1.0,
            fuzz,
        );
        (hard, good, easy)
    } else {
        let hard = passing(
            a,
            (elapsed * a.hard_interval).max(scheduled * a.hard_interval / 2.0),
            1.0,
            fuzz,
        );
        let good = passing(
            a,
            (elapsed * ease).max(scheduled),
            f64::from(hard) + 1.0,
            fuzz,
        );
        let easy = passing(
            a,
            (elapsed * ease).max(scheduled) * (a.easy_bonus - (a.easy_bonus - 1.0) / 2.0),
            f64::from(good) + 1.0,
            fuzz,
        );
        (hard, good, easy)
    }
}

const MIN_EASE: f64 = 1.3;

pub fn init(o: &SrsOptions) -> AnkiState {
    AnkiState {
        base: Base::default(),
        phase: CardPhase::New,
        step: 0,
        ease: o.anki.starting_ease,
        scheduled: 0,
    }
}

pub fn place(s: &AnkiState, day: Day, days: u32, o: &SrsOptions) -> AnkiState {
    AnkiState {
        base: Base {
            interval: days,
            due: Some(day.add_days(i64::from(days))),
            last: Some(day),
            step_minutes: None,
            ..s.base.clone()
        },
        phase: CardPhase::Review,
        step: 0,
        ease: if matches!(s.phase, CardPhase::Review | CardPhase::Relearning) {
            s.ease
        } else {
            o.anki.starting_ease
        },
        scheduled: days,
    }
}

pub fn review(s: &AnkiState, grade: Grade, day: Day, o: &SrsOptions, fuzz: f64) -> AnkiState {
    let a = &o.anki;
    let mut next = s.clone();
    next.base.reps += 1;
    next.base.last = Some(day);
    next.base.step_minutes = None;
    let to_review = |mut card: AnkiState, days: u32| {
        card.phase = CardPhase::Review;
        card.step = 0;
        card.scheduled = days;
        card.base.interval = days;
        card.base.due = Some(day.add_days(i64::from(days)));
        card
    };
    let to_step = |mut card: AnkiState, phase: CardPhase, step: usize, minutes: f64| {
        let due = step_due(day, minutes);
        card.phase = phase;
        card.step = step;
        card.base.due = Some(due.due);
        card.base.interval = due.interval;
        card.base.step_minutes = due.step_minutes;
        card
    };

    match s.phase {
        CardPhase::New | CardPhase::Learning => {
            next.ease = a.starting_ease;
            match step_answer(
                &a.learning_steps,
                if s.phase == CardPhase::New { 0 } else { s.step },
                grade,
            ) {
                StepAnswer::Graduate => {
                    let days = final_interval(
                        a.graduating_interval,
                        1.0,
                        a.maximum_interval,
                        a.fuzz,
                        fuzz,
                    );
                    to_review(next, days)
                }
                StepAnswer::Easy => {
                    let days =
                        final_interval(a.easy_interval, 1.0, a.maximum_interval, a.fuzz, fuzz);
                    to_review(next, days)
                }
                StepAnswer::Step { step, minutes } => {
                    to_step(next, CardPhase::Learning, step, minutes)
                }
            }
        }
        CardPhase::Relearning => match step_answer(&a.relearning_steps, s.step, grade) {
            StepAnswer::Graduate => to_review(next, s.scheduled),
            StepAnswer::Easy => to_review(next, (s.scheduled + 1).min(a.maximum_interval as u32)),
            StepAnswer::Step { step, minutes } => {
                to_step(next, CardPhase::Relearning, step, minutes)
            }
        },
        CardPhase::Review => {
            let elapsed = s
                .base
                .last
                .map_or(i64::from(s.scheduled), |last| last.days_until(day));
            if grade == Grade::Again {
                next.base.lapses += 1;
                next.ease = (s.ease - 0.2).max(MIN_EASE);
                let days = a
                    .minimum_interval
                    .max(round(f64::from(s.scheduled) * a.new_interval))
                    .max(1.0)
                    .min(a.maximum_interval) as u32;
                return match a.relearning_steps.first() {
                    None => to_review(next, days),
                    Some(&first) => {
                        next.scheduled = days;
                        to_step(next, CardPhase::Relearning, 0, first)
                    }
                };
            }
            let (hard, good, easy) = review_intervals(a, s.scheduled, elapsed, s.ease, fuzz);
            match grade {
                Grade::Hard => {
                    next.ease = (s.ease - 0.15).max(MIN_EASE);
                    to_review(next, hard)
                }
                Grade::Easy => {
                    next.ease = s.ease + 0.15;
                    to_review(next, easy)
                }
                _ => to_review(next, good),
            }
        }
    }
}

/// Forgotten as often as Anki's leech threshold: a verse worth a closer look
pub fn is_leech(base: &Base, o: &SrsOptions) -> bool {
    o.anki.leech_threshold > 0 && base.lapses >= o.anki.leech_threshold
}

pub fn memory(s: &AnkiState, o: &SrsOptions) -> Vec<(String, String)> {
    let mut out = Vec::new();
    match s.phase {
        CardPhase::Learning => out.push((
            "Learning step".into(),
            format!("{} of {}", s.step + 1, o.anki.learning_steps.len()),
        )),
        CardPhase::Relearning => out.push((
            "Relearning step".into(),
            format!("{} of {}", s.step + 1, o.anki.relearning_steps.len()),
        )),
        _ => {}
    }
    if s.phase != CardPhase::New {
        out.push(("Ease".into(), format!("{}%", round(s.ease * 100.0))));
    }
    if is_leech(&s.base, o) {
        out.push(("Leech".into(), format!("forgotten {} times", s.base.lapses)));
    }
    out
}
