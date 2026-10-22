//! A ladder of intervals, one a box: Leitner's boxes, or Pimsleur's graduated intervals.
//! Recalled when due, a verse climbs a box (staying in the last); forgotten, it goes to the first
//! box or back one. Recalled before it's due, it stays where it is.

use super::util::round;
use super::{Base, Grade, LadderOptions, OnMiss};
use crate::dates::Day;

#[derive(Clone, Debug, PartialEq)]
pub struct LadderState {
    pub base: Base,
    /// The box it's in (0 is the first); -1 before it's first reviewed
    pub r#box: i32,
}

fn interval_of(o: &LadderOptions, b: i32) -> u32 {
    let last = o.intervals.len().saturating_sub(1);
    let interval = o
        .intervals
        .get((b.max(0) as usize).min(last))
        .copied()
        .unwrap_or(1.0);
    round(interval).max(1.0) as u32
}

pub fn init() -> LadderState {
    LadderState {
        base: Base::default(),
        r#box: -1,
    }
}

pub fn place(s: &LadderState, day: Day, days: u32, o: &LadderOptions) -> LadderState {
    let b = o
        .intervals
        .iter()
        .rposition(|i| *i <= f64::from(days))
        .unwrap_or(0) as i32;
    LadderState {
        base: Base {
            interval: days,
            due: Some(day.add_days(i64::from(days))),
            last: Some(day),
            ..s.base.clone()
        },
        r#box: b,
    }
}

pub fn review(s: &LadderState, grade: Grade, day: Day, o: &LadderOptions) -> LadderState {
    let last = o.intervals.len().saturating_sub(1) as i32;
    let b = if grade == Grade::Again {
        if o.on_miss == OnMiss::First || s.r#box < 0 {
            0
        } else {
            (s.r#box - 1).max(0)
        }
    } else if s.r#box >= 0 && s.base.due.is_some_and(|due| day < due) {
        let mut out = s.clone();
        out.base.reps += 1;
        out.base.last = Some(day);
        return out;
    } else {
        (s.r#box + 1).min(last)
    };
    let interval = interval_of(o, b);
    LadderState {
        base: Base {
            interval,
            due: Some(day.add_days(i64::from(interval))),
            last: Some(day),
            reps: s.base.reps + 1,
            lapses: s.base.lapses + u32::from(grade == Grade::Again && s.r#box >= 0),
            step_minutes: s.base.step_minutes,
        },
        r#box: b,
    }
}

pub fn memory(s: &LadderState, o: &LadderOptions) -> Vec<(String, String)> {
    if s.r#box < 0 {
        return Vec::new();
    }
    // Boxes past the last (since the ladder was shortened) are in the last
    let shown = (s.r#box as usize).min(o.intervals.len().saturating_sub(1)) + 1;
    vec![("Box".into(), format!("{shown} of {}", o.intervals.len()))]
}
