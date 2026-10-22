//! SuperMemo SM-2 (Woźniak, 1987): I(1) = 1, I(2) = 6, then I(n) = I(n-1) × EF; EF moves by
//! 0.1 − (5−q)(0.08 + (5−q)·0.02), never under 1.3; q < 3 starts the repetitions over with EF as
//! it was; and items under 4 are repeated the same day until they reach 4. A review before the
//! item is due (SM-2 has no rule for one) leaves its schedule as it was, unless it's forgotten.

use super::util::{round, to_fixed};
use super::{Base, Grade, SrsOptions};
use crate::dates::Day;

#[derive(Clone, Debug, PartialEq)]
pub struct Sm2State {
    pub base: Base,
    /// The E-Factor
    pub ef: f64,
    /// Repetitions in a row recalled (n in SM-2)
    pub n: u32,
    /// The day it's next due by its interval (`due` is today while it's drilled)
    pub next: Option<Day>,
    /// Scored below 4 today: drilled again until it's 4 or more, without changing its schedule
    pub drill: bool,
}

/// SM-2's quality (0–5) for a grade: Again 2, Hard 3, Good 4, Easy 5
pub fn quality(g: Grade) -> u8 {
    g.number() + 1
}

pub fn init(o: &SrsOptions) -> Sm2State {
    Sm2State {
        base: Base::default(),
        ef: o.sm2.starting_ease,
        n: 0,
        next: None,
        drill: false,
    }
}

pub fn place(s: &Sm2State, day: Day, days: u32) -> Sm2State {
    let next = day.add_days(i64::from(days));
    Sm2State {
        base: Base {
            interval: days,
            due: Some(next),
            last: Some(day),
            ..s.base.clone()
        },
        n: if days >= 6 { 2 } else { 1 },
        next: Some(next),
        drill: false,
        ..s.clone()
    }
}

pub fn review(s: &Sm2State, grade: Grade, day: Day) -> Sm2State {
    let q = quality(grade);
    let mut out = s.clone();
    out.base.reps += 1;
    out.base.last = Some(day);
    let same_day = s.base.last == Some(day);
    let early = s.next.is_some_and(|next| day < next);
    if same_day && s.drill {
        // Drilling doesn't change the schedule: it goes on until it scores 4 or more
        out.drill = q < 4;
        out.base.due = if out.drill { Some(day) } else { s.next };
        return out;
    }
    if q >= 3 && (same_day || early) {
        // An early review recalled: the schedule stands
        out.drill = q < 4;
        out.base.due = if out.drill { Some(day) } else { s.next };
        return out;
    }
    if q < 3 {
        if s.n > 0 {
            out.base.lapses += 1;
        }
        out.n = 0;
        out.base.interval = 1;
    } else {
        let d = f64::from(5 - q);
        out.ef = (s.ef + (0.1 - d * (0.08 + d * 0.02))).max(1.3);
        out.n = s.n + 1;
        out.base.interval = match out.n {
            1 => 1,
            2 => 6,
            _ => round(f64::from(s.base.interval) * out.ef) as u32,
        };
    }
    let next = day.add_days(i64::from(out.base.interval));
    out.next = Some(next);
    out.drill = q < 4;
    out.base.due = Some(if out.drill { day } else { next });
    out
}

pub fn memory(s: &Sm2State) -> Vec<(String, String)> {
    if s.base.reps == 0 && s.n == 0 {
        return Vec::new();
    }
    let mut out = vec![
        ("E-Factor".to_string(), to_fixed(s.ef, 2)),
        ("Repetition".to_string(), s.n.to_string()),
    ];
    if s.drill {
        out.push(("Drill".into(), "again today".into()));
    }
    out
}
