//! What the algorithms share: seeded randomness for fuzz, Anki's fuzz ranges and learning
//! steps, and intervals as people read them. Rounding follows JavaScript's (`Math.round`,
//! `toFixed`), so the web app and this crate give the same days and the same text.

use crate::dates::Day;

pub(crate) const DAY_MINUTES: f64 = 1440.0;

/// `Math.round`: halves round up
pub(crate) fn round(n: f64) -> f64 {
    (n + 0.5).floor()
}

/// `Number.prototype.toFixed`: the nearest decimal with `places` digits, ties away from zero for
/// the value as it's stored
pub(crate) fn to_fixed(n: f64, places: usize) -> String {
    // The stored value's exact digits, well past where they're cut
    let exact = format!("{:.*}", places + 60, n.abs());
    let point = exact.find('.').unwrap_or(exact.len());
    let mut digits: Vec<u8> = exact
        .bytes()
        .filter(|c| *c != b'.')
        .map(|c| c - b'0')
        .collect();
    let keep = point + places;
    let up = digits[keep] >= 5;
    digits.truncate(keep);
    if up {
        let mut i = digits.len();
        loop {
            if i == 0 {
                digits.insert(0, 1);
                break;
            }
            i -= 1;
            if digits[i] == 9 {
                digits[i] = 0;
            } else {
                digits[i] += 1;
                break;
            }
        }
    }
    let whole = digits.len() - places;
    let mut out = String::new();
    if n < 0.0 && digits.iter().any(|d| *d != 0) {
        out.push('-');
    }
    out.extend(digits[..whole].iter().map(|d| char::from(b'0' + d)));
    if places > 0 {
        out.push('.');
        out.extend(digits[whole..].iter().map(|d| char::from(b'0' + d)));
    }
    out
}

/// A number to one decimal, without a trailing `.0`: `2.5`, `3`
pub(crate) fn trim(n: f64) -> String {
    let rounded = round(n * 10.0) / 10.0;
    if rounded.fract() == 0.0 {
        format!("{}", rounded as i64)
    } else {
        format!("{rounded}")
    }
}

pub(crate) fn clamp(n: f64, min: f64, max: f64) -> f64 {
    n.max(min).min(max)
}

/// A small seeded generator (mulberry32): the same seed gives the same numbers
#[derive(Clone, Debug)]
pub struct Seeded(u32);

impl Seeded {
    pub fn new(seed: u32) -> Seeded {
        Seeded(seed)
    }

    /// The next number in [0, 1)
    pub fn next_f64(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b_79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        f64::from(t ^ (t >> 14)) / 4_294_967_296.0
    }
}

/// FNV-1a over UTF-16 code units, as the web app hashes a verse's id
pub fn hash(text: &str) -> u32 {
    text.encode_utf16().fold(2_166_136_261u32, |h, unit| {
        (h ^ u32::from(unit)).wrapping_mul(16_777_619)
    })
}

/// The fuzz for a verse's review at `index` in its history: the same for a replay and a preview
pub fn fuzz_for(id: &str, index: usize) -> f64 {
    let seed = (u64::from(hash(id)) + index as u64 * 7919) as u32;
    Seeded::new(seed).next_f64()
}

const FUZZ_RANGES: [(f64, f64, f64); 3] = [
    (2.5, 7.0, 0.15),
    (7.0, 20.0, 0.1),
    (20.0, f64::INFINITY, 0.05),
];

/// The days an interval may be fuzzed to, as Anki does: none under 2.5 days, then 15%, 10%, 5% of each stretch
pub fn fuzz_bounds(interval: f64, minimum: f64, maximum: f64) -> (f64, f64) {
    let minimum = minimum.min(maximum);
    let interval = clamp(interval, minimum, maximum);
    let delta = if interval < 2.5 {
        0.0
    } else {
        FUZZ_RANGES.iter().fold(1.0, |d, (start, end, factor)| {
            d + factor * (interval.min(*end) - start).max(0.0)
        })
    };
    let lower = clamp(round(interval - delta), minimum, maximum);
    let mut upper = clamp(round(interval + delta), minimum, maximum);
    if upper == lower && upper > 2.0 && upper < maximum {
        upper = lower + 1.0;
    }
    (lower, upper)
}

/// A whole number of days for `interval` between `minimum` and `maximum`, fuzzed by `fuzz` (in [0, 1)) when `fuzzing`
pub fn final_interval(interval: f64, minimum: f64, maximum: f64, fuzzing: bool, fuzz: f64) -> u32 {
    if !fuzzing {
        return clamp(round(interval), minimum, maximum) as u32;
    }
    let (lower, upper) = fuzz_bounds(interval, minimum, maximum);
    (lower + fuzz * (1.0 + upper - lower)).floor() as u32
}

/// The delays of Anki's learning steps (minutes) for an answer at step `index`; `None` graduates
pub(crate) fn step_again(steps: &[f64]) -> Option<f64> {
    steps.first().copied()
}

pub(crate) fn step_hard(steps: &[f64], index: usize) -> Option<f64> {
    let current = *steps.get(index)?;
    if index > 0 {
        return Some(current);
    }
    Some(match steps.get(1) {
        Some(next) => (current + next) / 2.0,
        None => (current * 1.5).min(current + DAY_MINUTES),
    })
}

pub(crate) fn step_good(steps: &[f64], index: usize) -> Option<f64> {
    steps.get(index + 1).copied()
}

/// When a step of `minutes` from `day` comes due: the same day under a day, else that many days on
pub(crate) struct StepDue {
    pub due: Day,
    pub interval: u32,
    pub step_minutes: Option<f64>,
}

pub(crate) fn step_due(day: Day, minutes: f64) -> StepDue {
    if minutes < DAY_MINUTES {
        return StepDue {
            due: day,
            interval: 0,
            step_minutes: Some(minutes),
        };
    }
    let days = round(minutes / DAY_MINUTES);
    StepDue {
        due: day.add_days(days as i64),
        interval: days as u32,
        step_minutes: None,
    }
}

/// An interval as a grade button shows it: `<10m`, `3d`, `2.5mo`, `1.2y`
pub fn format_interval(days: u32, step_minutes: Option<f64>) -> String {
    if let Some(minutes) = step_minutes {
        return if minutes < 60.0 {
            format!("<{}m", round(minutes).max(1.0))
        } else {
            format!("<{}h", trim(minutes / 60.0))
        };
    }
    let d = f64::from(days);
    if days < 1 {
        "Today".into()
    } else if days < 30 {
        format!("{days}d")
    } else if days < 365 {
        format!("{}mo", trim(d / 30.4))
    } else {
        format!("{}y", trim(d / 365.25))
    }
}

/// An interval in words: `12 days`, `3 months`, `1.5 years`
pub fn describe_interval(days: u32) -> String {
    let d = f64::from(days);
    if days < 60 {
        format!("{days} {}", if days == 1 { "day" } else { "days" })
    } else if days < 730 {
        format!("{} months", trim(d / 30.4))
    } else {
        format!("{} years", trim(d / 365.25))
    }
}

/// Steps as Anki writes them (`1m 10m 1h 1d`, minutes when no unit), in minutes; `None` when one isn't a length of time
pub fn parse_steps(text: &str) -> Option<Vec<f64>> {
    text.split(|c: char| c.is_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .map(|part| {
            let (number, unit) = match part.char_indices().last() {
                Some((i, c)) if c.is_ascii_alphabetic() => (&part[..i], c.to_ascii_lowercase()),
                _ => (part, 'm'),
            };
            if number.is_empty() || !number.bytes().all(|c| c.is_ascii_digit() || c == b'.') {
                return None;
            }
            let n: f64 = number.parse().ok()?;
            let minutes = n * match unit {
                's' => 1.0 / 60.0,
                'm' => 1.0,
                'h' => 60.0,
                'd' => DAY_MINUTES,
                _ => return None,
            };
            (minutes > 0.0).then_some(minutes)
        })
        .collect()
}

/// Steps in minutes as Anki writes them: `1m 10m 1d`
pub fn format_steps(steps: &[f64]) -> String {
    steps
        .iter()
        .map(|&m| {
            if m % DAY_MINUTES == 0.0 {
                format!("{}d", m / DAY_MINUTES)
            } else if m % 60.0 == 0.0 {
                format!("{}h", m / 60.0)
            } else if m < 1.0 {
                format!("{}s", round(m * 60.0))
            } else {
                format!("{}m", trim(m))
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn javascript_rounding() {
        assert_eq!(round(2.5), 3.0);
        assert_eq!(round(-2.5), -2.0);
        assert_eq!(to_fixed(0.25, 1), "0.3");
        assert_eq!(to_fixed(1.005, 2), "1.00");
        assert_eq!(to_fixed(9.96, 1), "10.0");
        assert_eq!(to_fixed(2.5, 2), "2.50");
        assert_eq!(trim(2.0), "2");
        assert_eq!(trim(1.25), "1.3");
    }

    #[test]
    fn seeded_like_the_web_app() {
        // mulberry32(1)'s first number, and FNV-1a of "a"
        assert_eq!(Seeded::new(1).next_f64(), 0.6270739405881613);
        assert_eq!(hash("a"), 0xe40c292c);
    }

    #[test]
    fn fuzz_ranges() {
        assert_eq!(fuzz_bounds(2.0, 1.0, 100.0), (2.0, 2.0));
        assert_eq!(fuzz_bounds(10.0, 1.0, 100.0), (8.0, 12.0));
        assert_eq!(fuzz_bounds(100.0, 1.0, 100.0), (93.0, 100.0));
    }

    #[test]
    fn steps() {
        assert_eq!(
            parse_steps("1m 10m 1d 2h"),
            Some(vec![1.0, 10.0, 1440.0, 120.0])
        );
        assert_eq!(parse_steps("5"), Some(vec![5.0]));
        assert_eq!(parse_steps("x"), None);
        assert_eq!(format_steps(&[1.0, 10.0, 1440.0, 120.0]), "1m 10m 1d 2h");
        assert_eq!(format_interval(0, Some(5.5)), "<6m");
        assert_eq!(format_interval(45, None), "1.5mo");
    }
}
