//! Calendar days, with no time or time zone: reviews are counted in days.

use std::fmt;
use std::str::FromStr;

/// A calendar day, `YYYY-MM-DD`. Days order by date.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Day {
    year: i32,
    month: u8,
    day: u8,
}

/// The days of the week, Sunday first (as [`Day::weekday`] counts them)
pub const WEEKDAYS: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

pub(crate) fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        _ => 31,
    }
}

impl Day {
    /// The day, if it's one the calendar has
    pub fn new(year: i32, month: u8, day: u8) -> Option<Day> {
        ((1..=12).contains(&month) && day >= 1 && day <= days_in_month(year, month))
            .then_some(Day { year, month, day })
    }

    pub fn year(self) -> i32 {
        self.year
    }

    pub fn month(self) -> u8 {
        self.month
    }

    pub fn day(self) -> u8 {
        self.day
    }

    /// Days since 1970-01-01 (negative before it)
    pub fn to_epoch_days(self) -> i64 {
        // Howard Hinnant's days-from-civil
        let y = i64::from(self.year) - i64::from(self.month <= 2);
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let m = i64::from(self.month);
        let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + i64::from(self.day) - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146_097 + doe - 719_468
    }

    /// The day `days` after 1970-01-01
    pub fn from_epoch_days(days: i64) -> Day {
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = (doy - (153 * mp + 2) / 5 + 1) as u8;
        let month = if mp < 10 { mp + 3 } else { mp - 9 } as u8;
        let year = (yoe + era * 400 + i64::from(month <= 2)) as i32;
        Day { year, month, day }
    }

    pub fn add_days(self, days: i64) -> Day {
        Day::from_epoch_days(self.to_epoch_days() + days)
    }

    /// The same day of the month, `months` later (or earlier), the month's last day when it's shorter
    pub fn add_months(self, months: i32) -> Day {
        let index = self.year * 12 + i32::from(self.month) - 1 + months;
        let year = index.div_euclid(12);
        let month = (index.rem_euclid(12) + 1) as u8;
        Day {
            year,
            month,
            day: self.day.min(days_in_month(year, month)),
        }
    }

    /// Days from this day to `to` (negative when `to` is earlier)
    pub fn days_until(self, to: Day) -> i64 {
        to.to_epoch_days() - self.to_epoch_days()
    }

    /// Whole months from this day to `to`: the most that can be added without passing it
    pub fn months_until(self, to: Day) -> i32 {
        let mut months = (to.year - self.year) * 12 + i32::from(to.month) - i32::from(self.month);
        while months > 0 && self.add_months(months) > to {
            months -= 1;
        }
        while self.add_months(months + 1) <= to {
            months += 1;
        }
        months
    }

    /// The day of the week, 0 Sunday to 6 Saturday
    pub fn weekday(self) -> u8 {
        // 1970-01-01 was a Thursday
        (self.to_epoch_days() + 4).rem_euclid(7) as u8
    }
}

impl fmt::Display for Day {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}

/// Why text isn't a day
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParseDayError(pub String);

impl fmt::Display for ParseDayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "not a day (YYYY-MM-DD): {}", self.0)
    }
}

impl std::error::Error for ParseDayError {}

impl FromStr for Day {
    type Err = ParseDayError;

    /// Reads `YYYY-MM-DD`, a day the calendar has
    fn from_str(text: &str) -> Result<Day, ParseDayError> {
        let error = || ParseDayError(text.to_string());
        let b = text.as_bytes();
        if b.len() != 10
            || b[4] != b'-'
            || b[7] != b'-'
            || !b
                .iter()
                .enumerate()
                .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
        {
            return Err(error());
        }
        let year = text[0..4].parse().map_err(|_| error())?;
        let month = text[5..7].parse().map_err(|_| error())?;
        let day = text[8..10].parse().map_err(|_| error())?;
        Day::new(year, month, day).ok_or_else(error)
    }
}

#[cfg(feature = "serde")]
impl serde::Serialize for Day {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for Day {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Day, D::Error> {
        let text = String::deserialize(deserializer)?;
        text.parse().map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(text: &str) -> Day {
        text.parse().unwrap()
    }

    #[test]
    fn days_and_months() {
        assert_eq!(day("2026-12-31").add_days(1), day("2027-01-01"));
        assert_eq!(day("2026-01-31").add_months(1), day("2026-02-28"));
        assert_eq!(day("2026-03-15").add_months(-3), day("2025-12-15"));
        assert_eq!(day("2026-01-31").months_until(day("2026-02-28")), 1);
        assert_eq!(day("2026-01-15").months_until(day("2026-02-14")), 0);
        assert!("2024-02-29".parse::<Day>().is_ok());
        assert!("2026-02-29".parse::<Day>().is_err());
        assert!("2026-2-01".parse::<Day>().is_err());
        assert_eq!(day("2026-10-26").weekday(), 1);
        assert_eq!(day("1969-12-31").to_epoch_days(), -1);
        for n in -800_000..800_000i64 {
            if n % 997 == 0 {
                assert_eq!(Day::from_epoch_days(n).to_epoch_days(), n);
            }
        }
        assert_eq!(day("2026-10-21").to_string(), "2026-10-21");
    }
}
