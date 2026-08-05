"""Hand-checkable tests for the per-emirate demand metric (dashboard bars).

Tiny fixture: Dubai has Z1 (30) + Z2 (20) = 50; Abu Dhabi has Z3 (10).
"""

from hubris.core.contracts import NetworkModel
from hubris.plugins.metrics.demand_by_emirate import DemandByEmirateMetric
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model() -> NetworkModel:
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES)


def test_sums_zone_demand_per_emirate():
    result = DemandByEmirateMetric().compute(_model(), None)
    assert result.breakdown == {"Dubai": 50.0, "Abu Dhabi": 10.0}
    assert result.value == 60.0
    assert result.unit == "parcels"


def test_registered_so_it_appears_in_the_kpi_dashboard():
    from hubris.agents.tools.get_kpis import GetKpisTool

    kpis = GetKpisTool().run(model=_model())
    assert "demand_by_emirate" in kpis
    assert kpis["demand_by_emirate"]["breakdown"]["Dubai"] == 50.0
