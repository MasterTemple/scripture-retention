import { expect, test } from "vitest";
import { dueFromQueue, queueStarts } from "../src/core/queue.ts";

const monday = { enabled: true, weekday: 1 };
const q = (id: string) => ({ id, tag: "", ref: `John ${id}:1` });

test("queued verses start on the next free Mondays", () => {
  // 2026-10-21 is a Wednesday
  expect(queueStarts(3, [], "2026-10-21", monday)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
  // On the day itself
  expect(queueStarts(1, [], "2026-10-26", monday)).toEqual(["2026-10-26"]);
  // A verse begun that week (here on the Tuesday before) takes its Monday
  expect(queueStarts(2, [{ start: "2026-10-20" }], "2026-10-21", monday)).toEqual(["2026-11-02", "2026-11-09"]);
  // So does one dated ahead
  expect(queueStarts(2, [{ start: "2026-10-30" }], "2026-10-21", monday)).toEqual(["2026-10-26", "2026-11-09"]);
  expect(queueStarts(2, [], "2026-10-21", { enabled: false, weekday: 1 })).toEqual([]);
});

test("days the app wasn't opened on still start their verses", () => {
  const { started, waiting } = dueFromQueue([q("1"), q("2"), q("3")], [], "2026-10-21", "2026-11-04", monday);
  expect(started.map((v) => v.start)).toEqual(["2026-10-26", "2026-11-02"]);
  expect(waiting.map((v) => v.id)).toEqual(["3"]);
  // Looked at again the same day, nothing more starts
  const again = dueFromQueue(waiting, started, "2026-11-04", "2026-11-04", monday);
  expect(again.started).toEqual([]);
});
