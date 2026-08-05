"""Boot-time event dataset (item 4 of the event integration).

When `hubris/data/EMX_canonical.xlsx` exists, the app's startup baseline IS
the official event network — a container restart never falls back to the
synthetic demo data. When the file is absent or unreadable, boot silently
uses the synthetic baseline instead: the demo never dies on a bad file.
"""

import io
import os
from pathlib import Path

from hubris.core.contracts import NetworkModel

EVENT_DATASET_PATH = Path(__file__).with_name("EMX_canonical.xlsx")

# The test suite's hand-checked figures are pinned to the SYNTHETIC baseline;
# tests set this so their maths stay valid whatever file ships in data/.
DISABLE_ENV = "HUBRIS_DISABLE_EVENT_DATASET"


def load_event_baseline() -> NetworkModel | None:
    if os.environ.get(DISABLE_ENV):
        return None
    if not EVENT_DATASET_PATH.exists():
        return None
    try:
        # Local import: keeps module import cheap and avoids a boot-time cycle.
        from hubris.ingestion.excel_connector import ExcelDataConnector

        raw = ExcelDataConnector().load(io.BytesIO(EVENT_DATASET_PATH.read_bytes()))
        return NetworkModel.from_raw_tables(raw)
    except Exception:
        return None  # unreadable/miswritten file must never stop the boot
