import { test } from "vitest";
import assert from "node:assert/strict";
import { makeBackup, readBackup } from "../src/core/backup.ts";

const state = {
  verses: [{ id: "a", tag: "t", ref: "John 3:16", start: "2026-01-01", last: "2026-01-02", log: [{ day: "2026-01-01", grade: 3 as const }, { day: "2026-01-02", set: 4 }] }],
  queue: [{ id: "q", tag: "", ref: "Romans 12:1" }],
  settings: { algorithm: "fsrs" },
};

test("a backup reads back the same, history and all", () => {
  const backup = makeBackup(state, new Date("2026-10-21T00:00:00Z"));
  const read = readBackup(JSON.stringify(backup));
  assert.notEqual(typeof read, "string");
  assert.deepEqual(read, backup);
});

test("what isn't a backup says why", () => {
  assert.match(readBackup("nope") as string, /isn't JSON/);
  assert.match(readBackup("{}") as string, /isn't a Scripture Retention backup/);
  const bad = { ...makeBackup(state), verses: [{ ...state.verses[0], log: [{ day: "2026-01-01", grade: 9 }] }] };
  assert.match(readBackup(JSON.stringify(bad)) as string, /verses/);
  assert.match(readBackup(JSON.stringify({ ...makeBackup(state), version: 2 })) as string, /newer/);
});
