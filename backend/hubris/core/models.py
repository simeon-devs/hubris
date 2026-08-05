"""Canonical value objects backing NetworkModel, per SCHEMA.md §1.

These are the Pydantic shapes for hubs/zones/fleet types/OD pairs referenced
(but not spelled out) by the contracts in `contracts.py`. Nothing downstream
should depend on raw source column names — only on these fields.
"""

from pydantic import BaseModel


class Hub(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    emirate: str
    capacity: float
    fixed_cost: float
    handling_cost: float
    status: str = "open"  # open | closed | candidate
    # R1 (service-aware twin): which service models this facility can carry.
    # None = capability unknown/universal (synthetic + generic datasets keep
    # their old behaviour). Dataset G: Full Hub = Standard+Express,
    # Micro Hub = Standard only, dark store = QComm.
    hub_type: str | None = None  # "Full Hub" | "Micro Hub" | "Dark Store" | None
    service_models: list[str] | None = None
    # R2 (rider layer): the real roster, when the dataset carries one.
    riders_fte: int | None = None
    riders_ftc: int | None = None
    rider_capacity_daily: float | None = None  # sum(count x avg deliveries/day)
    rider_weekly_cost: float | None = None  # sum of weekly labour cost, AED
    fte_avg_dpd: float | None = None  # weighted avg deliveries/day per FTE rider
    ftc_avg_dpd: float | None = None
    fte_weekly_rate: float | None = None  # weekly cost per rider, AED
    ftc_weekly_rate: float | None = None


class Zone(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    emirate: str
    demand: float
    sla_hours: float
    # R1: the service model this zone's demand belongs to (None = unspecified).
    service_model: str | None = None


class FleetType(BaseModel):
    id: str
    name: str
    capacity: float
    cost_per_km: float
    fixed_cost: float
    count_available: int
    hub_id: str | None = None


class OD(BaseModel):
    from_id: str  # hub id
    to_id: str  # zone id
    distance_km: float
    time_min: float
    cost: float


class RawTables(BaseModel):
    """Canonical-shaped rows produced by a DataConnector, prior to DB load.

    Each list holds plain dicts keyed by the canonical field names above —
    the connector's job is column mapping, not validation; `NetworkModel`
    hydration is where these get parsed into typed rows.
    """

    hubs: list[dict] = []
    zones: list[dict] = []
    fleet_types: list[dict] = []
    od_matrix: list[dict] = []
    current_assignments: list[dict] = []
    # T-31: True only when the SOURCE supplied real current assignments;
    # False means current_assignments is OUR nearest-hub reconstruction and
    # every improvement claim is measured against a proxy, not EMX practice.
    assignments_provided: bool = False
