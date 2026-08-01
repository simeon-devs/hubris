"""Hand-checkable test for `cost_to_serve_by_hub` (T-16's map tooltip
needs a per-hub cost-to-serve rate, computed server-side).

Hand math on the tiny fixture (assignments: Z1,Z2->H1, Z3->H2):
  H1: fixed=1000, transport = 30*10 (Z1) + 20*14 (Z2) = 580
      -> (1000+580) / 50 assigned = 1580/50 = 31.6
  H2: fixed=900, transport = 10*12 (Z3) = 120
      -> (900+120) / 10 assigned = 1020/10 = 102.0
"""

from hubris.core.contracts import NetworkModel
from hubris.engine.assignment import cost_to_serve_by_hub
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def test_cost_to_serve_by_hub():
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)
    result = cost_to_serve_by_hub(model)
    assert result == {"H1": 31.6, "H2": 102.0}


def test_cost_to_serve_by_hub_is_zero_for_a_hub_with_no_assigned_demand():
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    raw.current_assignments = [
        {"zone_id": "Z1", "hub_id": "H1", "volume": 30.0},
        {"zone_id": "Z2", "hub_id": "H1", "volume": 20.0},
        {"zone_id": "Z3", "hub_id": "H1", "volume": 10.0},
    ]
    model = NetworkModel.from_raw_tables(raw)
    result = cost_to_serve_by_hub(model)
    assert result["H2"] == 0.0
