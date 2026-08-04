"""The plugin contracts — the keystone of the system (CLAUDE.md §4).

Everything extensible implements one of the ABCs below. Implement the
interface, register it (see `registry.py`), and the rest of the system —
including every agent — can use it.

The one rule that never moves: agents orchestrate and explain, the
deterministic engine computes. `AgentTool.run()` returns COMPUTED JSON only —
never a number an LLM made up.
"""

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel

from hubris.core.models import OD, FleetType, Hub, RawTables, Zone

__all__ = [
    "NetworkModel",
    "MetricResult",
    "Recommendation",
    "DataConnector",
    "Metric",
    "ScenarioModule",
    "OptimizerStrategy",
    "AgentTool",
]


# ---- shared value objects ----
class NetworkModel(BaseModel):
    """The unified twin state. Treated as immutable per scenario."""

    hubs: list[Hub]
    zones: list[Zone]
    fleet_types: list[FleetType]
    demand: dict[str, float]  # zone_id -> demand
    od_matrix: dict[tuple[str, str], OD]
    assignments: dict[str, str] | None = None  # zone_id -> hub_id (dominant hub)
    # Exact hub_id -> zone_id -> volume from the flow solve that produced
    # `assignments` (set by scenario_utils.apply_and_reassign). When present,
    # capacity metrics aggregate these exact split volumes instead of
    # attributing each zone's FULL demand to its dominant hub — the dominant-
    # hub collapse can overcount a hub past 100% utilization when the flow
    # split a zone across hubs. None for models whose assignments came
    # straight from ingested data (their current-state truth is preserved).
    flow_volumes: dict[str, dict[str, float]] | None = None

    @classmethod
    def from_raw_tables(cls, raw: RawTables) -> "NetworkModel":
        """Hydrate a NetworkModel from canonical-shaped raw rows.

        `raw.current_assignments` may carry a zone split across multiple hubs
        (SCHEMA.md's `current_assignments` table allows this via volume per
        zone/hub pair). `NetworkModel.assignments` stays single dominant-hub
        per zone per the contract above — the dominant hub is the one with
        the largest volume for that zone. Split volumes themselves are not
        lost; they belong in the DB/raw layer (see `SCHEMA.md §1`), not here.
        """
        hubs = [Hub(**row) for row in raw.hubs]
        zones = [Zone(**row) for row in raw.zones]
        fleet_types = [FleetType(**row) for row in raw.fleet_types]
        od_matrix = {
            (row["from_id"], row["to_id"]): OD(**row) for row in raw.od_matrix
        }
        demand = {zone.id: zone.demand for zone in zones}

        best_volume: dict[str, float] = {}
        assignments: dict[str, str] = {}
        for row in raw.current_assignments:
            zone_id, hub_id, volume = row["zone_id"], row["hub_id"], row["volume"]
            if volume > best_volume.get(zone_id, float("-inf")):
                best_volume[zone_id] = volume
                assignments[zone_id] = hub_id

        return cls(
            hubs=hubs,
            zones=zones,
            fleet_types=fleet_types,
            demand=demand,
            od_matrix=od_matrix,
            assignments=assignments or None,
        )


class MetricResult(BaseModel):
    name: str
    value: float | dict
    unit: str
    breakdown: dict | None = None  # e.g. per-emirate, per-hub


class Recommendation(BaseModel):
    changes: list[dict]  # e.g. [{"action":"close_hub","hub_id":"H3"}]
    objective_value: float
    delta_vs_baseline: dict  # {"cost_to_serve_pct": -5.2, ...}
    rationale: dict  # drivers, binding constraints, duals


# ---- extension points ----
class DataConnector(ABC):
    name: str

    @abstractmethod
    def can_handle(self, source: Any) -> float: ...  # confidence 0..1

    @abstractmethod
    def load(self, source: Any) -> RawTables: ...  # -> canonical-ready tables


class Metric(ABC):
    name: str
    unit: str

    @abstractmethod
    def compute(self, model: NetworkModel, scenario_id: str | None) -> MetricResult: ...


class ScenarioModule(ABC):
    name: str  # e.g. "move_hub"
    params_schema: dict  # JSON schema for params

    @abstractmethod
    def apply(self, model: NetworkModel, params: dict) -> NetworkModel: ...
    # MUST return a modified COPY; never mutate the input model.


class OptimizerStrategy(ABC):
    name: str  # e.g. "milp_cflp", "greedy"

    @abstractmethod
    def optimize(
        self, model: NetworkModel, objective: dict, constraints: list[dict]
    ) -> Recommendation: ...


class AgentTool(ABC):
    name: str
    description: str  # what the agent sees; be precise
    input_schema: dict

    @abstractmethod
    def run(self, **kwargs) -> dict: ...  # returns COMPUTED JSON only
