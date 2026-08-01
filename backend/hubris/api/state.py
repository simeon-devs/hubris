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
        self.distance_mode = MODE_FALLBACK

    def save_scenario(self, scenario_id: str, model: NetworkModel) -> None:
        self.scenarios[scenario_id] = model


state = AppState()
