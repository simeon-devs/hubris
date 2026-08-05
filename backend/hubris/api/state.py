"""In-memory application state: the current baseline `NetworkModel` plus
any named scenario variants created via `/simulate?save_as=...`. A single
global instance is the right scope for this demo-scale API (BUILD_SPEC §12:
"one always-renders demo scenario") — swap for per-session/DB-backed state
if this ever needs multiple concurrent users.
"""

from hubris.core.contracts import NetworkModel
from hubris.data.synthetic import generate_synthetic_raw_tables
from hubris.engine.routing import MODE_FALLBACK


class AppState:
    def __init__(self) -> None:
        self.baseline: NetworkModel = NetworkModel.from_raw_tables(generate_synthetic_raw_tables())
        self.scenarios: dict[str, NetworkModel] = {}
        # Human-readable label per saved scenario, for the frontend's
        # scenario picker (T-30). Falls back to the id when unset.
        self.scenario_labels: dict[str, str] = {}
        # T-19: the synthetic baseline's od_matrix is built with the same
        # haversine formula as the fallback path, so it starts flagged as
        # fallback — never silently implied to be real road distances
        # until /network/refresh-distances actually calls OSRM.
        self.distance_mode: str = MODE_FALLBACK

    def get_model(self, scenario_id: str | None = None) -> NetworkModel:
        if scenario_id is None:
            return self.baseline
        return self.scenarios[scenario_id]  # raises KeyError if unknown

    def reset_baseline(self, model: NetworkModel) -> None:
        self.baseline = model
        self.scenarios = {}
        self.scenario_labels = {}
        self.distance_mode = MODE_FALLBACK

    def save_scenario(
        self, scenario_id: str, model: NetworkModel, label: str | None = None
    ) -> None:
        self.scenarios[scenario_id] = model
        self.scenario_labels[scenario_id] = label or scenario_id


state = AppState()


def seed_demo_scenario(app_state: AppState | None = None) -> str | None:
    """Seed the demo from the REAL twin (Sims decision, 2026-08-05): the
    Dataset G workbook ships inside the package, so boot loads Hub & Spoke
    as the baseline and the QComm dark-store network as the `qcomm_twin`
    saved scenario. The QComm twin is the seeded demo: genuinely
    infeasible, with real unmet demand in Abu Dhabi — the crisis IS the
    story, so (unlike the retired synthetic surge) an infeasible flow here
    is the point, not a defect.

    Called at startup. Swallows any failure and returns None rather than
    raising — on any problem the synthetic baseline from __init__ stands
    and everything still renders (BUILD_SPEC §13: the demo never hangs).
    Imports are local to avoid a circular dependency on the ingest router.
    """
    from pathlib import Path

    from hubris.api.routers.ingest import QCOMM_SCENARIO_ID, QCOMM_SCENARIO_LABEL
    from hubris.ingestion.dataset_g_connector import DatasetGConnector

    target = app_state or state
    dataset = Path(__file__).resolve().parents[1] / "data" / "dataset_g.xlsx"
    try:
        connector = DatasetGConnector()
        baseline = NetworkModel.from_raw_tables(connector.load(str(dataset), network="hub_spoke"))
        qcomm = NetworkModel.from_raw_tables(connector.load(str(dataset), network="qcomm"))
        target.reset_baseline(baseline)
        target.save_scenario(QCOMM_SCENARIO_ID, qcomm, label=QCOMM_SCENARIO_LABEL)
        return QCOMM_SCENARIO_ID
    except Exception:
        return None
