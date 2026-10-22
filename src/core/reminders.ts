import { addDays, today, weekday, type Day } from "./dates.ts";
import { dueFromQueue, type AutoStart, type Queued } from "./queue.ts";
import type { Durations, Verse } from "./schedule.ts";
import { DEFAULT_SRS, dueVerses, verseStatus, type AlgorithmId, type Scheduler, type SrsOptions } from "./srs/index.ts";

/** When to be reminded: to review (each day), and to add a verse (one day a week) */
export interface Reminders {
  review: { enabled: boolean; time: string };
  newVerse: { enabled: boolean; weekday: number; time: string };
}

export const DEFAULT_REMINDERS: Reminders = {
  review: { enabled: false, time: "07:00" },
  newVerse: { enabled: false, weekday: 1, time: "07:00" },
};

/** What reminding needs of the app's state (also kept where the service worker can read it) */
export interface ReminderState {
  verses: Verse[];
  queue: Queued[];
  queueChecked?: Day;
  settings: { algorithm?: AlgorithmId; srs?: SrsOptions; durations: Durations; autoStart: AutoStart; dayStartsAt: number; reminders: Reminders };
}

/** The day each kind of reminder was last sent, so each comes once */
export interface Sent {
  review?: Day;
  newVerse?: Day;
}

export interface Reminder {
  kind: keyof Sent;
  title: string;
  body: string;
  /** Where tapping it goes, relative to the app */
  path: string;
}

/** The day reviews are for at `now`: today, or yesterday before the hour a day begins */
export function reviewDayAt(now: Date, dayStartsAt: number): Day {
  const shifted = new Date(now);
  shifted.setHours(shifted.getHours() - dayStartsAt);
  return today(shifted);
}

const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * The reminders due at `now` and not sent yet: to review, once its time has come on a day with
 * verses due (counting queued verses starting that day); to add a verse, on its weekday once its
 * time has come, when nothing is queued or dated ahead to start next
 */
export function dueReminders(state: ReminderState, now: Date, sent: Sent): Reminder[] {
  const { reminders, durations, autoStart, dayStartsAt } = state.settings;
  const sch: Scheduler = { algorithm: state.settings.algorithm ?? "fixed", durations, srs: state.settings.srs ?? DEFAULT_SRS };
  const day = reviewDayAt(now, dayStartsAt);
  const clock = now.getHours() * 60 + now.getMinutes();
  const { started, waiting } = dueFromQueue(state.queue, state.verses, state.queueChecked, day, autoStart);
  const verses = [...state.verses, ...started];
  const out: Reminder[] = [];

  if (reminders.review.enabled && sent.review !== day && clock >= minutes(reminders.review.time)) {
    const due = dueVerses(verses, day, sch).length;
    if (due > 0) {
      out.push({
        kind: "review",
        title: "Scripture review",
        body: `${due} ${due === 1 ? "verse" : "verses"} today. Say the topic, the reference, and the verse.`,
        path: "./",
      });
    }
  }

  const n = reminders.newVerse;
  if (n.enabled && sent.newVerse !== day && weekday(day) === n.weekday && clock >= minutes(n.time)) {
    const upcoming = verses.some((v) => verseStatus(v, day, sch).phase === "upcoming");
    if (waiting.length === 0 && !upcoming) {
      out.push({ kind: "newVerse", title: "A new verse this week", body: "Nothing is queued to start next: add a verse to memorize.", path: "./?view=verses" });
    }
  }
  return out;
}

/** The next moment a reminder could come due after `now` (its time today or tomorrow), for a timer */
export function nextReminderAt(reminders: Reminders, now: Date): Date | null {
  const times = [reminders.review, reminders.newVerse].filter((r) => r.enabled).map((r) => minutes(r.time));
  if (times.length === 0) return null;
  const at = times
    .flatMap((m) => [0, 1].map((d) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, Math.floor(m / 60), m % 60)))
    .filter((d) => d > now)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return at ?? null;
}

const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * A calendar of the reminders turned on, repeating (each day, and the new-verse weekday) at their
 * times in the device's time zone, each opening the app (`url`): reminders a phone's calendar
 * keeps to the minute, with the app closed
 */
export function remindersCalendar(reminders: Reminders, url: string, from: Day): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const at = (day: Day, time: string) => `${day.replace(/-/g, "")}T${time.replace(":", "")}00`;
  const event = (uid: string, start: string, rule: string, summary: string, description: string, link: string) => [
    "BEGIN:VEVENT",
    `UID:${uid}@scripture-retention`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    "DURATION:PT10M",
    `RRULE:${rule}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description} ${link}`,
    `URL:${link}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
  ];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Scripture Retention//EN", "CALSCALE:GREGORIAN"];
  const { review, newVerse } = reminders;
  if (review.enabled) lines.push(...event("review", at(from, review.time), "FREQ=DAILY", "Scripture review", "Say the topic, the reference, and the verse.", url));
  if (newVerse.enabled) {
    const first = addDays(from, (newVerse.weekday - weekday(from) + 7) % 7);
    const rule = `FREQ=WEEKLY;BYDAY=${ICS_DAYS[newVerse.weekday]}`;
    lines.push(...event("new-verse", at(first, newVerse.time), rule, "Add a verse to memorize", "Queue or start this week's verse.", `${url}?view=verses`));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
