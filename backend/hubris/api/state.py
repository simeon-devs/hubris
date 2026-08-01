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
    """Seed the one always-renders demo scenario (T-30) into state.

    Called at startup. Swallows any failure and returns None rather than
    raising: a broken demo seed must never stop the app from booting
    (BUILD_SPEC §13 — the demo never hangs). Imports are local to keep
    this module free of a circular dependency on the scenario registry.
    """
    from hubris.agents.scenario_utils import apply_and_reassign
    from hubris.data.demo_scenario import (
        DEMO_SCENARIO_ID,
        DEMO_SCENARIO_LABEL,
        demo_scenario_params,
    )

    target = app_state or state
    try:
        emirates = {zone.emirate for zone in target.baseline.zones}
        params = demo_scenario_params(emirates)
        model, flow = apply_and_reassign(target.baseline, "demand_scale", params)
        if not flow.feasible:
            # An infeasible seed would render as unmet demand mid-demo —
            # better to have no seeded scenario than a broken one.
            return None
        target.save_scenario(DEMO_SCENARIO_ID, model, label=DEMO_SCENARIO_LABEL)
        return DEMO_SCENARIO_ID
    except Exception:
        return None
