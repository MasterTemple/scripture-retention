//! FSRS, Anki's modern scheduler: FSRS-4.5, FSRS-5, and FSRS-6, chosen by how many parameters
//! are given (17, 19, or 21), with Anki's learning steps.

use super::anki::{StepAnswer, is_leech, step_answer};
use super::util::{clamp, final_interval, round, step_due, to_fixed};
use super::{Base, CardPhase, Grade, SrsOptions};
use crate::dates::Day;

/// FSRS-6's default parameters (Anki's since 25.07)
pub const FSRS6_DEFAULTS: [f64; 21] = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
    0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];
pub const FSRS5_DEFAULTS: [f64; 19] = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
    1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
pub const FSRS45_DEFAULTS: [f64; 17] = [
    0.5701, 1.4436, 4.1386, 10.9355, 5.1443, 1.2006, 0.8627, 0.0362, 1.629, 0.1342, 1.0166, 2.1174,
    0.0839, 0.3204, 1.4676, 0.219, 2.8237,
];

const S_MIN: f64 = 0.001;
const S_MAX: f64 = 36500.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FsrsVersion {
    V4_5,
    V5,
    V6,
}

impl FsrsVersion {
    /// `4.5`, `5`, `6`
    pub fn label(self) -> &'static str {
        match self {
            FsrsVersion::V4_5 => "4.5",
            FsrsVersion::V5 => "5",
            FsrsVersion::V6 => "6",
        }
    }
}

/// The FSRS version a set of parameters is for, by how many there are; `None` for a count FSRS doesn't use
pub fn fsrs_version(params: &[f64]) -> Option<FsrsVersion> {
    match params.len() {
        0 | 21 => Some(FsrsVersion::V6),
        19 => Some(FsrsVersion::V5),
        17 => Some(FsrsVersion::V4_5),
        _ => None,
    }
}

/// Parameters as Anki shows them (`0.212, 1.2931, …`); `None` when they aren't 17, 19, or 21 numbers
pub fn parse_params(text: &str) -> Option<Vec<f64>> {
    let params = text
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .map(|p| p.parse::<f64>().ok().filter(|n| n.is_finite()))
        .collect::<Option<Vec<f64>>>()?;
    fsrs_version(&params).map(|_| params)
}

/// FSRS's memory model for a set of parameters: how recall falls off, and how each review changes stability and difficulty
#[derive(Clone, Debug, PartialEq)]
pub struct FsrsModel {
    pub version: FsrsVersion,
    w: Vec<f64>,
    decay: f64,
    factor: f64,
}

impl FsrsModel {
    /// The model for `params` (FSRS-6's defaults when empty or a count FSRS doesn't use)
    pub fn new(params: &[f64]) -> FsrsModel {
        let (version, w) = match fsrs_version(params) {
            Some(version) if !params.is_empty() => (version, params.to_vec()),
            _ => (FsrsVersion::V6, FSRS6_DEFAULTS.to_vec()),
        };
        let decay = if version == FsrsVersion::V6 {
            -w[20]
        } else {
            -0.5
        };
        let factor = 0.9f64.powf(1.0 / decay) - 1.0;
        FsrsModel {
            version,
            w,
            decay,
            factor,
        }
    }

    fn p(&self, i: usize) -> f64 {
        self.w[i]
    }

    fn raw_init_difficulty(&self, g: Grade) -> f64 {
        if self.version == FsrsVersion::V4_5 {
            self.p(4) - (g.f() - 3.0) * self.p(5)
        } else {
            self.p(4) - (self.p(5) * (g.f() - 1.0)).exp() + 1.0
        }
    }

    /// The chance of recall `t` days after a review, at stability `s`
    pub fn retrievability(&self, t: f64, s: f64) -> f64 {
        (1.0 + self.factor * t / s).powf(self.decay)
    }

    /// The days until recall falls to `r`
    pub fn interval(&self, s: f64, r: f64) -> f64 {
        s / self.factor * (r.powf(1.0 / self.decay) - 1.0)
    }

    /// The stability that falls to `r` in `days`
    pub fn stability_for(&self, days: f64, r: f64) -> f64 {
        clamp(
            days * self.factor / (r.powf(1.0 / self.decay) - 1.0),
            S_MIN,
            S_MAX,
        )
    }

    pub fn init_stability(&self, g: Grade) -> f64 {
        self.p(g as usize - 1).max(S_MIN)
    }

    pub fn init_difficulty(&self, g: Grade) -> f64 {
        clamp(self.raw_init_difficulty(g), 1.0, 10.0)
    }

    pub fn next_difficulty(&self, d: f64, g: Grade) -> f64 {
        if self.version == FsrsVersion::V4_5 {
            return clamp(
                self.p(7) * self.p(4) + (1.0 - self.p(7)) * (d - self.p(6) * (g.f() - 3.0)),
                1.0,
                10.0,
            );
        }
        let damped = d + (-self.p(6) * (g.f() - 3.0) * (10.0 - d)) / 9.0;
        clamp(
            self.p(7) * self.raw_init_difficulty(Grade::Easy) + (1.0 - self.p(7)) * damped,
            1.0,
            10.0,
        )
    }

    pub fn recall_stability(&self, d: f64, s: f64, r: f64, g: Grade) -> f64 {
        let hard = if g == Grade::Hard { self.p(15) } else { 1.0 };
        let easy = if g == Grade::Easy { self.p(16) } else { 1.0 };
        clamp(
            s * (1.0
                + self.p(8).exp()
                    * (11.0 - d)
                    * s.powf(-self.p(9))
                    * (((1.0 - r) * self.p(10)).exp() - 1.0)
                    * hard
                    * easy),
            S_MIN,
            S_MAX,
        )
    }

    pub fn forget_stability(&self, d: f64, s: f64, r: f64) -> f64 {
        let forgotten = self.p(11)
            * d.powf(-self.p(12))
            * ((s + 1.0).powf(self.p(13)) - 1.0)
            * ((1.0 - r) * self.p(14)).exp();
        // Since FSRS-5, a lapse never leaves it more stable than a same-day Again would
        let ceiling = if self.version == FsrsVersion::V4_5 {
            forgotten
        } else {
            forgotten.min(s / (self.p(17) * self.p(18)).exp())
        };
        clamp(ceiling, S_MIN, S_MAX)
    }

    /// A review the same day as the last (FSRS-5 on; FSRS-4.5 leaves stability as it was)
    pub fn short_term_stability(&self, s: f64, g: Grade) -> f64 {
        if self.version == FsrsVersion::V4_5 {
            return s;
        }
        let mut increase = (self.p(17) * (g.f() - 3.0 + self.p(18))).exp();
        if self.version == FsrsVersion::V6 {
            increase *= s.powf(-self.p(19));
            // Only Again lowers it
            if g >= Grade::Hard {
                increase = increase.max(1.0);
            }
        }
        clamp(s * increase, S_MIN, S_MAX)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FsrsState {
    pub base: Base,
    pub phase: CardPhase,
    pub step: usize,
    pub stability: f64,
    pub difficulty: f64,
}

/// Stability and difficulty after a review graded `g` on `day`
pub fn next_memory(m: &FsrsModel, s: &FsrsState, g: Grade, day: Day) -> (f64, f64) {
    let Some(last) = s.base.last.filter(|_| s.phase != CardPhase::New) else {
        return (m.init_stability(g), m.init_difficulty(g));
    };
    let elapsed = last.days_until(day);
    if elapsed <= 0 {
        if m.version == FsrsVersion::V4_5 {
            return (s.stability, s.difficulty);
        }
        return (
            m.short_term_stability(s.stability, g),
            m.next_difficulty(s.difficulty, g),
        );
    }
    let r = m.retrievability(elapsed as f64, s.stability);
    let stability = if g == Grade::Again {
        m.forget_stability(s.difficulty, s.stability, r)
    } else {
        m.recall_stability(s.difficulty, s.stability, r, g)
    };
    (stability, m.next_difficulty(s.difficulty, g))
}

pub fn init() -> FsrsState {
    FsrsState {
        base: Base::default(),
        phase: CardPhase::New,
        step: 0,
        stability: 0.0,
        difficulty: 0.0,
    }
}

pub fn place(m: &FsrsModel, s: &FsrsState, day: Day, days: u32, o: &SrsOptions) -> FsrsState {
    FsrsState {
        base: Base {
            interval: days,
            due: Some(day.add_days(i64::from(days))),
            last: Some(day),
            step_minutes: None,
            ..s.base.clone()
        },
        phase: CardPhase::Review,
        step: 0,
        stability: m.stability_for(f64::from(days), o.fsrs.desired_retention),
        difficulty: if s.phase == CardPhase::New {
            m.init_difficulty(Grade::Good)
        } else {
            s.difficulty
        },
    }
}

pub fn review(
    m: &FsrsModel,
    s: &FsrsState,
    grade: Grade,
    day: Day,
    o: &SrsOptions,
    fuzz: f64,
) -> FsrsState {
    let a = &o.anki;
    let (stability, difficulty) = next_memory(m, s, grade, day);
    let mut next = FsrsState {
        stability,
        difficulty,
        ..s.clone()
    };
    next.base.reps += 1;
    next.base.last = Some(day);
    next.base.step_minutes = None;
    let days = |stability: f64| {
        final_interval(
            m.interval(stability, o.fsrs.desired_retention),
            1.0,
            a.maximum_interval,
            a.fuzz,
            fuzz,
        )
    };
    let to_review = |mut card: FsrsState, interval: u32| {
        card.phase = CardPhase::Review;
        card.step = 0;
        card.base.interval = interval;
        card.base.due = Some(day.add_days(i64::from(interval)));
        card
    };
    let to_step = |mut card: FsrsState, phase: CardPhase, step: usize, minutes: f64| {
        let due = step_due(day, minutes);
        card.phase = phase;
        card.step = step;
        card.base.due = Some(due.due);
        card.base.interval = due.interval;
        card.base.step_minutes = due.step_minutes;
        card
    };

    if s.phase != CardPhase::Review {
        let steps = if s.phase == CardPhase::Relearning {
            &a.relearning_steps
        } else {
            &a.learning_steps
        };
        return match step_answer(
            steps,
            if s.phase == CardPhase::New { 0 } else { s.step },
            grade,
        ) {
            StepAnswer::Graduate | StepAnswer::Easy => {
                let interval = days(next.stability);
                to_review(next, interval)
            }
            StepAnswer::Step { step, minutes } => {
                let phase = if s.phase == CardPhase::New {
                    CardPhase::Learning
                } else {
                    s.phase
                };
                to_step(next, phase, step, minutes)
            }
        };
    }

    if grade == Grade::Again {
        next.base.lapses += 1;
        return match a.relearning_steps.first() {
            None => {
                let interval = days(next.stability);
                to_review(next, interval)
            }
            Some(&first) => to_step(next, CardPhase::Relearning, 0, first),
        };
    }
    // Hard, Good, and Easy in order, each longer than the one before, as Anki keeps them
    let raw = [Grade::Hard, Grade::Good, Grade::Easy]
        .map(|g| m.interval(next_memory(m, s, g, day).0, o.fsrs.desired_retention));
    let fit = |interval: f64, minimum: f64| {
        final_interval(interval, minimum, a.maximum_interval, a.fuzz, fuzz)
    };
    let hard = fit(raw[0].min(raw[1]), 1.0);
    let good = fit(raw[1].max(f64::from(hard) + 1.0), f64::from(hard) + 1.0);
    let easy = fit(raw[2].max(f64::from(good) + 1.0), f64::from(good) + 1.0);
    to_review(
        next,
        match grade {
            Grade::Hard => hard,
            Grade::Easy => easy,
            _ => good,
        },
    )
}

pub fn memory(m: &FsrsModel, s: &FsrsState, day: Day, o: &SrsOptions) -> Vec<(String, String)> {
    if s.phase == CardPhase::New {
        return Vec::new();
    }
    let elapsed = s.base.last.map_or(0, |last| last.days_until(day).max(0));
    let mut out = vec![
        (
            "Stability".to_string(),
            format!(
                "{} days",
                if s.stability < 10.0 {
                    to_fixed(s.stability, 1)
                } else {
                    round(s.stability).to_string()
                }
            ),
        ),
        (
            "Difficulty".to_string(),
            format!("{}%", round((s.difficulty - 1.0) / 9.0 * 100.0)),
        ),
        (
            "Retrievability".to_string(),
            format!(
                "{}%",
                round(m.retrievability(elapsed as f64, s.stability) * 100.0)
            ),
        ),
    ];
    if matches!(s.phase, CardPhase::Learning | CardPhase::Relearning) {
        let label = if s.phase == CardPhase::Learning {
            "Learning step"
        } else {
            "Relearning step"
        };
        out.insert(0, (label.to_string(), (s.step + 1).to_string()));
    }
    if is_leech(&s.base, o) {
        out.push(("Leech".into(), format!("forgotten {} times", s.base.lapses)));
    }
    out
}
