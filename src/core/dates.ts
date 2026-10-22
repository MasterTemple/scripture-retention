/** A calendar day in the device's time zone, `YYYY-MM-DD` */
export type Day = string;

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The day it is now on this device */
export function today(now: Date = new Date()): Day {
  return format(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function isDay(text: string): boolean {
  const match = DAY_PATTERN.exec(text);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function addDays(day: Day, days: number): Day {
  const date = new Date(toUtc(day) + days * DAY_MS);
  return format(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** The same day of the month, `months` later (or earlier), the month's last day when it's shorter */
export function addMonths(day: Day, months: number): Day {
  const [y, m, d] = parts(day);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return format(year, month, Math.min(d, daysInMonth(year, month)));
}

/** Days from `from` to `to` (negative when `to` is earlier) */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Whole months from `from` to `to`: the most months that can be added to `from` without passing `to` */
export function monthsBetween(from: Day, to: Day): number {
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  let months = (ty - fy) * 12 + (tm - fm);
  while (months > 0 && addMonths(from, months) > to) months--;
  while (addMonths(from, months + 1) <= to) months++;
  return months;
}

/** A day as people read it: `Wed, Oct 14, 2026` */
export function describeDay(day: Day): string {
  return new Date(toUtc(day)).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function parts(day: Day): [number, number, number] {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new Error(`Not a day: ${day}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function toUtc(day: Day): number {
  const [y, m, d] = parts(day);
  return Date.UTC(y, m - 1, d);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function format(y: number, m: number, d: number): Day {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
