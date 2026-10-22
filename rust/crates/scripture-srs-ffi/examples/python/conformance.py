"""The web app's conformance cases, through the Python bindings: they give what the web app gives.

Build the wheel first (`npm run pack:python` in the crate), then install it:
`pip install dist/python/wheelhouse/*.whl` and run this file.
"""

import json
import sys
from pathlib import Path

from scripture_srs import ScriptureSrs

cases = json.loads((Path(__file__).resolve().parents[3] / "scripture-srs" / "tests" / "conformance.json").read_text())
srs = ScriptureSrs()
verses = srs.read_verses(json.dumps(cases["verses"]))
phases = ["daily", "weekly", "monthly", "upcoming", "retained"]
schedulers = {}
failures = 0
for i, c in enumerate(cases["cases"]):
    key = (c["options"], c["algorithm"])
    if key not in schedulers:
        settings = {"algorithm": c["algorithm"], "durations": cases["durations"], "srs": cases["options"][c["options"]]}
        schedulers[key] = srs.scheduler_from_json(json.dumps(settings))
    scheduler = schedulers[key]
    verse = verses[c["verse"]]
    s = scheduler.status(verse, c["day"])
    status = [phases[s.phase], s.position, s.total, s.scheduled, s.due, s.next, s.interval, s.learning, s.fresh]
    preview = [[o.grade + 1, o.label, o.days] for o in scheduler.preview(verse, c["day"])]
    memory = [[m.label, m.value] for m in scheduler.memory(verse, c["day"])]
    for what, ours, theirs in (("status", status, c["status"]), ("preview", preview, c["preview"]), ("memory", memory, c["memory"])):
        if ours != theirs:
            failures += 1
            if failures <= 10:
                print(f"case {i} {key} {what}: {ours} != {theirs}", file=sys.stderr)
print(f"All {len(cases['cases'])} cases match the web app." if failures == 0 else f"{failures} differences")
sys.exit(1 if failures else 0)
