//! Ebisu v2: recall `t` days after a review is Beta(α, β) distributed; each quiz updates the
//! model by matching the posterior's first two moments.

use super::util::{round, to_fixed};
use super::{Base, Grade, SrsOptions};
use crate::dates::Day;

/// Ebisu's model: α, β, and the days `t` it's for
pub type EbisuModel = (f64, f64, f64);

// The same digits as the web app's, so both read the same numbers
#[allow(clippy::excessive_precision)]
const LANCZOS: [f64; 9] = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
];

/// ln Γ(x), for x > 0 (Lanczos, g = 7)
pub fn lgamma(x: f64) -> f64 {
    if x < 0.5 {
        return (std::f64::consts::PI / (std::f64::consts::PI * x).sin().abs()).ln()
            - lgamma(1.0 - x);
    }
    let x = x - 1.0;
    let mut a = LANCZOS[0];
    let t = x + 7.5;
    for (i, c) in LANCZOS.iter().enumerate().skip(1) {
        a += c / (x + i as f64);
    }
    0.5 * (2.0 * std::f64::consts::PI).ln() + (x + 0.5) * t.ln() - t + a.ln()
}

fn betaln(a: f64, b: f64) -> f64 {
    lgamma(a) + lgamma(b) - lgamma(a + b)
}

/// ln(e^x − e^y), for x > y
fn logsubexp(x: f64, y: f64) -> f64 {
    x + (-(y - x).exp()).ln_1p()
}

/// The expected chance of recall `tnow` days after the review the model is for
pub fn predict_recall((alpha, beta, t): EbisuModel, tnow: f64) -> f64 {
    (betaln(alpha + tnow / t, beta) - betaln(alpha, beta)).exp()
}

/// The days until expected recall falls to `p` (0.5 for the half-life)
pub fn time_to_recall(model: EbisuModel, p: f64) -> f64 {
    let target = p.ln();
    let f = |x: f64| predict_recall(model, x).ln() - target;
    let mut lo = model.2 / 1024.0;
    let mut hi = model.2;
    while f(hi) > 0.0 && hi < 1e7 {
        hi *= 2.0;
    }
    while f(lo) < 0.0 && lo > 1e-7 {
        lo /= 2.0;
    }
    let mut i = 0;
    while i < 100 && hi / lo > 1.0 + 1e-9 {
        let mid = (lo * hi).sqrt();
        if f(mid) > 0.0 {
            lo = mid;
        } else {
            hi = mid;
        }
        i += 1;
    }
    (lo * hi).sqrt()
}

/// The model after a quiz `tnow` days after the last, recalled or not; with no `tback`, rebalanced
/// to its half-life when α and β drift more than twice apart (as Ebisu does)
pub fn update_recall(
    prior: EbisuModel,
    success: bool,
    tnow: f64,
    tback: Option<f64>,
) -> EbisuModel {
    let updated = posterior(prior, success, tnow, tback.unwrap_or(tnow));
    if tback.is_none() && (updated.0 > 2.0 * updated.1 || updated.1 > 2.0 * updated.0) {
        return posterior(prior, success, tnow, time_to_recall(updated, 0.5));
    }
    updated
}

fn posterior((alpha, beta, t): EbisuModel, success: bool, tnow: f64, tback: f64) -> EbisuModel {
    let dt = tnow / t;
    let delta = tback / t;
    let (m1, m2) = if success {
        let den = betaln(alpha + dt, beta);
        (
            (betaln(alpha + dt + delta, beta) - den).exp(),
            (betaln(alpha + dt + 2.0 * delta, beta) - den).exp(),
        )
    } else {
        let den = logsubexp(betaln(alpha, beta), betaln(alpha + dt, beta));
        (
            (logsubexp(
                betaln(alpha + delta, beta),
                betaln(alpha + dt + delta, beta),
            ) - den)
                .exp(),
            (logsubexp(
                betaln(alpha + 2.0 * delta, beta),
                betaln(alpha + dt + 2.0 * delta, beta),
            ) - den)
                .exp(),
        )
    };
    let variance = m2 - m1 * m1;
    let k = m1 * (1.0 - m1) / variance - 1.0;
    (m1 * k, (1.0 - m1) * k, tback)
}

#[derive(Clone, Debug, PartialEq)]
pub struct EbisuState {
    pub base: Base,
    pub model: EbisuModel,
}

/// A review the same day as the last counts as this many days after it
const SAME_DAY: f64 = 0.1;
const MAX_INTERVAL: f64 = 36500.0;

pub fn init(o: &SrsOptions) -> EbisuState {
    EbisuState {
        base: Base::default(),
        model: (o.ebisu.ab, o.ebisu.ab, o.ebisu.halflife),
    }
}

pub fn place(s: &EbisuState, day: Day, days: u32, o: &SrsOptions) -> EbisuState {
    // The half-life whose recall falls to the target in `days`
    let unit = time_to_recall((o.ebisu.ab, o.ebisu.ab, 1.0), o.ebisu.target_recall);
    EbisuState {
        base: Base {
            interval: days,
            due: Some(day.add_days(i64::from(days))),
            last: Some(day),
            ..s.base.clone()
        },
        model: (o.ebisu.ab, o.ebisu.ab, f64::from(days) / unit),
    }
}

pub fn review(s: &EbisuState, grade: Grade, day: Day, o: &SrsOptions) -> EbisuState {
    let success = grade > Grade::Again;
    // A first review is a quiz just after learning it
    let elapsed = s
        .base
        .last
        .map_or(SAME_DAY, |last| (last.days_until(day) as f64).max(SAME_DAY));
    let model = update_recall(s.model, success, elapsed, None);
    let interval =
        round(time_to_recall(model, o.ebisu.target_recall)).clamp(1.0, MAX_INTERVAL) as u32;
    EbisuState {
        base: Base {
            interval,
            due: Some(day.add_days(i64::from(interval))),
            last: Some(day),
            reps: s.base.reps + 1,
            lapses: s.base.lapses + u32::from(!success && s.base.last.is_some()),
            step_minutes: s.base.step_minutes,
        },
        model,
    }
}

pub fn memory(s: &EbisuState, day: Day) -> Vec<(String, String)> {
    let Some(last) = s.base.last else {
        return Vec::new();
    };
    let elapsed = last.days_until(day).max(0) as f64;
    let halflife = time_to_recall(s.model, 0.5);
    vec![
        (
            "Half-life".into(),
            format!(
                "{} days",
                if halflife < 10.0 {
                    to_fixed(halflife, 1)
                } else {
                    round(halflife).to_string()
                }
            ),
        ),
        (
            "Recall now".into(),
            format!("{}%", round(predict_recall(s.model, elapsed) * 100.0)),
        ),
    ]
}
