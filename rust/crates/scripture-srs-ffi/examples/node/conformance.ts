// The web app's conformance cases, through the WebAssembly build: the bindings give what the
// web app gives. Run `npm run pack:wasm` in the crate first.
import { readFileSync } from "node:fs";
import { ScriptureSrs, type VerseRecord } from "scripture-srs";

const cases = JSON.parse(readFileSync(new URL("../../../scripture-srs/tests/conformance.json", import.meta.url), "utf8"));
const srs = ScriptureSrs.new();
const verses: VerseRecord[] = cases.verses.map((v: any) => ({ id: v.id, tag: v.tag, reference: v.ref, start: v.start, last: v.last ?? null, log: [], deck: null, passage: null }));
// The log goes through readVerses, which reads the web app's JSON
const logged = srs.readVerses(JSON.stringify(cases.verses));
const phases = ["daily", "weekly", "monthly", "upcoming", "retained"];
const schedulers = new Map<string, ReturnType<typeof srs.scheduler>>();

let failures = 0;
for (const [i, c] of cases.cases.entries()) {
  const key = `${c.options} ${c.algorithm}`;
  if (!schedulers.has(key)) schedulers.set(key, srs.schedulerFromJson(JSON.stringify({ algorithm: c.algorithm, durations: cases.durations, srs: cases.options[c.options] })));
  const scheduler = schedulers.get(key)!;
  const verse = { ...verses[c.verse]!, log: logged[c.verse]!.log };
  const s = scheduler.status(verse, c.day);
  const status = [phases[s.phase], s.position, s.total, s.scheduled, s.due, s.next, s.interval, s.learning, s.fresh];
  const preview = scheduler.preview(verse, c.day).map((p) => [p.grade + 1, p.label, p.days]);
  const memory = scheduler.memory(verse, c.day).map((m) => [m.label, m.value]);
  for (const [what, ours, theirs] of [["status", status, c.status], ["preview", preview, c.preview], ["memory", memory, c.memory]] as const) {
    if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
      if (++failures <= 10) console.error(`case ${i} (${key}) ${what}: ${JSON.stringify(ours)} ≠ ${JSON.stringify(theirs)}`);
    }
  }
}
console.log(failures === 0 ? `All ${cases.cases.length} cases match the web app.` : `${failures} differences`);
process.exit(failures === 0 ? 0 : 1);
