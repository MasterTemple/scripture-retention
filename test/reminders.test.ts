import { expect, test } from "vitest";
import { DEFAULT_AUTO_START } from "../src/core/queue.ts";
import { dueReminders, nextReminderAt, remindersCalendar, type ReminderState } from "../src/core/reminders.ts";
import { DEFAULT_DURATIONS } from "../src/core/schedule.ts";

const on = { review: { enabled: true, time: "07:00" }, newVerse: { enabled: true, weekday: 1, time: "08:00" } };
const state = (patch: Partial<ReminderState> = {}): ReminderState => ({
  verses: [{ id: "1", tag: "t", ref: "Psalm 101:3", start: "2026-10-20" }],
  queue: [],
  settings: { durations: DEFAULT_DURATIONS, autoStart: DEFAULT_AUTO_START, dayStartsAt: 0, reminders: on },
  ...patch,
});
// 2026-10-26 is a Monday
const at = (time: string) => new Date(`2026-10-26T${time}:00`);

test("the review reminder comes once its time has come, once a day, when verses are due", () => {
  expect(dueReminders(state(), at("06:59"), {})).toEqual([]);
  expect(dueReminders(state(), at("07:00"), {}).map((r) => r.kind)).toEqual(["review"]);
  expect(dueReminders(state(), at("07:30"), { review: "2026-10-26" })).toEqual([]);
  // Reviewed already
  expect(dueReminders(state({ verses: [{ id: "1", tag: "", ref: "x 1:1", start: "2026-10-20", last: "2026-10-26" }] }), at("07:30"), {})).toEqual([]);
});

test("the new-verse reminder comes on its weekday only when nothing is queued or dated ahead", () => {
  expect(dueReminders(state(), at("08:00"), { review: "2026-10-26" }).map((r) => r.kind)).toEqual(["newVerse"]);
  // Verses queued to start next
  const queued = state({ queue: [{ id: "q", tag: "", ref: "Romans 12:1" }, { id: "r", tag: "", ref: "Romans 12:2" }] });
  expect(dueReminders(queued, at("08:00"), { review: "2026-10-26" })).toEqual([]);
  const ahead = state({ verses: [...state().verses, { id: "2", tag: "", ref: "John 1:1", start: "2026-11-01" }] });
  expect(dueReminders(ahead, at("08:00"), { review: "2026-10-26" })).toEqual([]);
  expect(dueReminders(state(), new Date("2026-10-27T09:00:00"), { review: "2026-10-27" })).toEqual([]);
});

test("the next reminder time, and a calendar of them", () => {
  expect(nextReminderAt(on, at("07:30"))).toEqual(at("08:00"));
  expect(nextReminderAt(on, at("09:00"))).toEqual(new Date("2026-10-27T07:00:00"));
  const ics = remindersCalendar(on, "https://example.org/app/", "2026-10-21");
  expect(ics).toContain("DTSTART:20261021T070000\r\nDURATION:PT10M\r\nRRULE:FREQ=DAILY");
  expect(ics).toContain("DTSTART:20261026T080000\r\nDURATION:PT10M\r\nRRULE:FREQ=WEEKLY;BYDAY=MO");
  expect(ics).toContain("URL:https://example.org/app/?view=verses");
});
