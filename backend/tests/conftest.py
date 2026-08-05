"""Test-suite ground rules.

The suite's hand-checked figures (cost 57.0949, optimal changes H1/H3/H5/H7,
tiny-fixture maths) are pinned to the SYNTHETIC baseline. When the official
event dataset ships in hubris/data/, booting the app would swap the baseline
and silently invalidate them — so tests always run against synthetic.
Set BEFORE any hubris import: the app state is built at import time.
"""

import os

os.environ.setdefault("HUBRIS_DISABLE_EVENT_DATASET", "1")
