"""Runs the README's Python examples as one program and checks each `# → value` (the value as JSON).

Install the wheel first (`npm run pack:python`, then `pip install dist/python/wheelhouse/*.whl`).
"""

import json
import re
import sys
from pathlib import Path

readme = (Path(__file__).resolve().parents[2] / "README.md").read_text()
blocks = re.findall(r"```python\n(.*?)```", readme, re.S)
lines = []
for line in "\n".join(blocks).split("\n"):
    check = re.match(r"^(\s*)(.*?)\s*# → (.*)$", line)
    lines.append(f"{check[1]}__check({check[2]}, {check[3]!r})" if check else line)

failed = checked = 0


def __check(value, expected):
    global failed, checked
    checked += 1
    got = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    if got != expected:
        failed += 1
        print(f"expected {expected}, got {got}", file=sys.stderr)


exec("\n".join(lines), {"__check": __check})
print(f"{failed} of {checked} README examples differ" if failed else f"All {checked} README examples hold.")
sys.exit(1 if failed else 0)
