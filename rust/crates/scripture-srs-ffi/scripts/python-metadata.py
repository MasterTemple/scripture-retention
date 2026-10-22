"""Adds PyPI metadata to the Python package that `boltffi pack python` generates.

Run after generating (`boltffi generate python`) and before building
(`boltffi pack python --regenerate false`); setuptools merges setup.cfg with the generated
setup.py.
"""

import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
package = root / "dist" / "python"
if not (package / "setup.py").is_file():
    sys.exit(f"{package} has no setup.py; run `boltffi generate python` first")

shutil.copy(root / "README.md", package / "README.md")
shutil.copy(root.parent.parent.parent / "LICENSE", package / "LICENSE")
(package / "setup.cfg").write_text(
    """[metadata]
description = Spaced repetition for memorized Scripture: FSRS, Anki's SM-2, SuperMemo SM-2, Leitner, Pimsleur, Ebisu, and a fixed daily-weekly-monthly schedule
long_description = file: README.md
long_description_content_type = text/markdown
license_expression = MIT
license_files = LICENSE
url = https://github.com/MasterTemple/scripture-retention
project_urls =
    Source = https://github.com/MasterTemple/scripture-retention
    Issues = https://github.com/MasterTemple/scripture-retention/issues
keywords = spaced repetition, fsrs, anki, sm2, leitner, ebisu, scripture, memorization
classifiers =
    Development Status :: 3 - Alpha
    Intended Audience :: Developers
    Programming Language :: Python :: 3
    Programming Language :: Rust
    Topic :: Religion
    Topic :: Education
"""
)
print(f"added metadata to {package}")
