from collections import defaultdict

from hubris.core.contracts import NetworkModel
from hubris.data.synthetic import generate_synthetic_raw_tables


def test_counts_within_spec():
    raw = generate_synthetic_raw_tables()

    assert 7 <= len(raw.hubs) <= 10
    assert 50 <= len(raw.zones) <= 150
    assert 3 <= len(raw.fleet_types) <= 4

    emirates = {h["emirate"] for h in raw.hubs}
    assert emirates == {
        "Abu Dhabi",
        "Dubai",
        "Sharjah",
        "Ajman",
        "Umm Al Quwain",
        "Ras Al Khaimah",
        "Fujairah",
    }


def test_hydrates_into_network_model():
    raw = generate_synthetic_raw_tables()
    model = NetworkModel.from_raw_tables(raw)

    assert len(model.hubs) == len(raw.hubs)
    assert len(model.zones) == len(raw.zones)
    assert len(model.demand) == len(raw.zones)
    assert model.assignments is not None
    assert set(model.assignments.keys()) == {z.id for z in model.zones}


def test_deterministic_with_same_seed():
    a = generate_synthetic_raw_tables(seed=42)
    b = generate_synthetic_raw_tables(seed=42)
    assert a.model_dump() == b.model_dump()

    c = generate_synthetic_raw_tables(seed=7)
    assert a.model_dump() != c.model_dump()


def test_all_zone_demand_is_assigned():
    raw = generate_synthetic_raw_tables()
    demand_by_zone = {z["id"]: z["demand"] for z in raw.zones}

    assigned_by_zone: dict[str, float] = defaultdict(float)
    for row in raw.current_assignments:
        assigned_by_zone[row["zone_id"]] += row["volume"]

    for zone_id, demand in demand_by_zone.items():
        assert assigned_by_zone[zone_id] == demand


def test_hub_capacity_not_exceeded():
    raw = generate_synthetic_raw_tables()
    capacity_by_hub = {h["id"]: h["capacity"] for h in raw.hubs}

    assigned_by_hub: dict[str, float] = defaultdict(float)
    for row in raw.current_assignments:
        assigned_by_hub[row["hub_id"]] += row["volume"]

    for hub_id, assigned in assigned_by_hub.items():
        assert assigned <= capacity_by_hub[hub_id] + 1e-6


def test_od_matrix_covers_every_hub_zone_pair():
    raw = generate_synthetic_raw_tables()
    assert len(raw.od_matrix) == len(raw.hubs) * len(raw.zones)
