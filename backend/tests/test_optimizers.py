"""Hand-checkable tests for T-09's MILP recommender + greedy fallback.

tiny_network fixture (2 hubs/3 zones, ample capacity): keeping both hubs
open is already optimal (700 transport + 1900 fixed = 2600) — neither
optimiser should recommend a change.

close_hub_fixture (2 hubs/3 zones, H2's fixed cost of 5000 dwarfs its
per-unit transport advantage): closing H2 and running everything through
the cheap-fixed-cost H1 is optimal (150 transport + 500 fixed = 650) even
though every zone then routes at a worse unit cost — both optimisers must
find this, not just "cheapest hub to drop by fixed cost alone" (that trap
is exactly what an earlier, first-improvement version of the greedy search
fell into; see its docstring).
"""

from hubris.core.contracts import NetworkModel
from hubris.plugins.optimizers.greedy import GreedyOptimizer
from hubris.plugins.optimizers.milp import MILPOptimizer
from tests.fixtures.close_hub_fixture import CLOSE_HUB_RAW_TABLES
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def test_both_optimizers_keep_both_hubs_open_when_thats_optimal():
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)

    for optimizer in (GreedyOptimizer(), MILPOptimizer()):
        rec = optimizer.optimize(model, {}, [])
        assert rec.changes == []
        assert rec.objective_value == 2600.0
        assert rec.delta_vs_baseline["cost_to_serve_pct"] == 0.0


def test_both_optimizers_close_the_hub_with_the_dominant_fixed_cost():
    model = NetworkModel.from_raw_tables(CLOSE_HUB_RAW_TABLES)

    for optimizer in (GreedyOptimizer(), MILPOptimizer()):
        rec = optimizer.optimize(model, {}, [])
        assert rec.changes == [{"action": "close_hub", "hub_id": "H2"}]
        assert rec.objective_value == 650.0
        assert rec.delta_vs_baseline["cost_to_serve_pct"] < 0  # cheaper than baseline


def test_milp_reports_its_own_solver_in_rationale():
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)
    rec = MILPOptimizer().optimize(model, {}, [])
    assert rec.rationale["solver"] == "milp_cflp"
    assert rec.rationale["solver_status"] == "Optimal"


def test_milp_falls_back_to_greedy_when_it_cannot_solve():
    # A zero time limit makes CBC bail out without an optimal solution,
    # forcing the wired-in fallback path — the recommendation must still
    # come back (never hang, never raise), just labelled as greedy.
    model = NetworkModel.from_raw_tables(CLOSE_HUB_RAW_TABLES)
    rec = MILPOptimizer(time_limit_seconds=0.0).optimize(model, {}, [])

    assert rec.rationale["solver"] == "greedy"
    assert "fallback_reason" in rec.rationale
    assert rec.changes == [{"action": "close_hub", "hub_id": "H2"}]  # greedy finds it too
    assert rec.objective_value == 650.0


def test_both_optimizers_are_registered_and_agent_usable():
    from hubris.core.registry import OPTIMIZER, load_plugins
    from hubris.core.registry import registry as global_registry

    load_plugins()
    registered_names = {o.name for o in global_registry.all(OPTIMIZER)}
    assert {"greedy", "milp_cflp"} <= registered_names

    tools = global_registry.as_agent_tools()
    tool = next(t for t in tools if t.name == "optimize_milp_cflp")
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)
    result = tool.run(model=model, objective={}, constraints=[])
    assert result["objective_value"] == 2600.0
