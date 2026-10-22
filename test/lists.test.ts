import { test } from "vitest";
import assert from "node:assert/strict";
import { countByBucket, entryStart, formatList, parseList } from "../src/core/lists.ts";
import { DEFAULT_DURATIONS as D, status } from "../src/core/schedule.ts";

const SAMPLE = `Once a day:

\`#?\` Deuteronomy 29:18-19
\`#before-my-eyes\` Psalm 101:3
\`#faithfulness\` Luke 16:10 
\`#blessing\`  Acts 3:26
\`#keep-yourselves\` Jude 1:20-21

Once a week:

\`#guard-your-heart\` Proverbs 4:23
\`#cost-him-his-life\` Proverbs 7:23
`;

test("parses a list under headings", () => {
  const { entries, errors } = parseList(SAMPLE);
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 7);
  assert.deepEqual(entries[0], { line: 3, tag: "?", ref: "Deuteronomy 29:18-19", bucket: "daily", position: 1 });
  assert.equal(entries[3].ref, "Acts 3:26");
  assert.equal(entries[3].tag, "blessing");
  assert.equal(entries[5].bucket, "weekly");
  assert.deepEqual(countByBucket(entries, "2026-10-14", D).weekly, 2);
});

test("positions, dates, list markers, and errors", () => {
  const { entries, errors } = parseList(`## Weekly
- #a 1 John 5:13 @month 4
- 2 Peter 1:9-10 @2026-01-01
1. #b Song of Solomon 2:7 @w3
#c not a reference
#d Romans 8:13 @soon`);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], { line: 2, tag: "a", ref: "1 John 5:13", bucket: "monthly", position: 4 });
  assert.deepEqual(entries[1], { line: 3, tag: "", ref: "2 Peter 1:9-10", bucket: "weekly", position: 1, start: "2026-01-01" });
  assert.equal(entries[2].ref, "Song of Solomon 2:7");
  assert.equal(entries[2].position, 3);
  assert.deepEqual(errors.map((e) => e.line), [5, 6]);
});

test("an export imports back to the same schedule", () => {
  const day = "2026-10-14";
  const verses = parseList(SAMPLE + "\n`#x` Titus 2:11-14 @month 9\n").entries.map((e, i) => ({ id: String(i), tag: e.tag, ref: e.ref, start: entryStart(e, day, D) }));
  const text = formatList(verses, day, D);
  assert.match(text, /^## Daily\n\n`#\?` Deuteronomy 29:18-19 @2026-10-14\n/);
  const again = parseList(text).entries.map((e, i) => ({ id: String(i), tag: e.tag, ref: e.ref, start: entryStart(e, day, D) }));
  const key = (v: { ref: string; tag: string; start: string }) => `${v.tag} ${v.ref} ${v.start}`;
  assert.deepEqual(again.map(key).sort(), verses.map(key).sort());
  assert.equal(status(again.find((v) => v.ref === "Titus 2:11-14")!, day, D).position, 9);
});
