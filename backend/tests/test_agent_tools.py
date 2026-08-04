"""Hand-checkable tests for T-11's named agent tools (plus T-21's
`scan_opportunities`), using the tiny 2-hub/3-zone fixture. No LLM involved
here — these prove each tool's `run()` returns correct COMPUTED JSON on its
own; the live no-fabrication check (which needs a real model in the loop)
is in `test_agent_no_fabrication.py`.
"""

from hubris.core.contracts import NetworkModel
from hubris.core.registry import AGENT_TOOL, load_plugins
from hubris.core.registry import registry as global_registry
from hubris.agents.tools.compare_scenarios import CompareScenariosTool
from hubris.agents.tools.find_spare_capacity import FindSpareCapacityTool
from hubris.agents.tools.get_kpis import GetKpisTool
from hubris.agents.tools.optimise_network import OptimiseNetworkTool
from hubris.agents.tools.simulate_scenario import SimulateScenarioTool
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES)


def test_get_kpis_matches_t07_hand_checked_values():
    result = GetKpisTool().run(model=_model())
    assert result["cost_to_serve"]["value"] == round(2600 / 60, 4)
    assert result["utilization"]["value"] == 30.0
    assert result["coverage"]["value"] == 100.0
    assert result["spare_capacity"]["value"] == 140.0


def test_find_spare_capacity_ranks_hubs_descending():
    result = FindSpareCapacityTool().run(model=_model())
    assert result["total_spare_capacity"] == 140.0
    assert result["hubs_ranked"] == [
        {"hub_id": "H2", "spare_capacity": 90.0},
        {"hub_id": "H1", "spare_capacity": 50.0},
    ]


def test_find_spare_capacity_min_spare_filter():
    result = FindSpareCapacityTool().run(model=_model(), min_spare=60.0)
    assert result["hubs_ranked"] == [{"hub_id": "H2", "spare_capacity": 90.0}]


def test_simulate_scenario_reoptimizes_flow_after_closing_a_hub():
    # Regression test: closing H2 must NOT leave Z3 "assigned" to a hub
    # that's now closed — the tool must re-solve flow so Z3 correctly
    # reroutes to H1 (expensive, but the only open hub left).
    result = SimulateScenarioTool().run(
        model=_model(), scenario_name="close_hub", params={"hub_id": "H2"}
    )
    assert result["scenario_flow_feasible"] is True
    assert result["scenario_kpis"]["cost_to_serve"]["breakdown"]["total_cost"] == 3780.0
    assert result["scenario_kpis"]["cost_to_serve"]["value"] == 63.0
    assert result["baseline_kpis"]["cost_to_serve"]["value"] == round(2600 / 60, 4)
    assert result["delta"]["cost_to_serve"] == round(63.0 - 2600 / 60, 4)


def test_optimise_network_matches_t09_hand_checked_result():
    result = OptimiseNetworkTool().run(model=_model(), optimizer_name="milp_cflp")
    assert result["changes"] == []
    assert result["objective_value"] == 2600.0


def test_optimise_network_ships_a_robustness_band_by_default():
    # T-20: every recommendation carries a Monte Carlo robustness band
    # computed on the RESULTING network. Here changes == [] (both hubs
    # stay open, ample capacity: 200 total vs 60 demand), so even +/-20%
    # demand swings can never overflow either hub.
    result = OptimiseNetworkTool().run(model=_model(), optimizer_name="milp_cflp")

    robustness = result["robustness"]
    assert robustness["demand_variation_pct"] == 20.0
    assert robustness["trials"] == 50
    assert robustness["holds_under_variation"] is True
    assert robustness["feasible_pct"] == 100.0
    assert robustness["cost_to_serve_p10"] <= robustness["cost_to_serve_p50"] <= robustness["cost_to_serve_p90"]


def test_optimise_network_respects_a_custom_demand_variation_pct():
    result = OptimiseNetworkTool().run(
        model=_model(), optimizer_name="milp_cflp", demand_variation_pct=5.0
    )
    assert result["robustness"]["demand_variation_pct"] == 5.0


def test_compare_scenarios_against_baseline():
    result = CompareScenariosTool().run(
        model=_model(),
        scenario_a_name="close_hub",
        scenario_a_params={"hub_id": "H2"},
    )
    assert result["scenario_a"]["kpis"]["cost_to_serve"]["value"] == 63.0
    assert result["scenario_b"]["name"] == "baseline"
    assert result["scenario_b"]["kpis"]["cost_to_serve"]["value"] == round(2600 / 60, 4)
    assert result["delta_a_minus_b"]["cost_to_serve"] == round(63.0 - 2600 / 60, 4)


def test_adapter_returns_bad_llm_arguments_as_correctable_error_not_a_crash():
    # Live-observed during T-33's 5x runs: the LLM passed
    # optimizer_name="MILP" (its own spelling) and the KeyError crashed the
    # entire query via LangGraph's tool node. Build rule 4: the error must
    # come back as a tool RESULT the agent can read and correct.
    from hubris.agents.tool_adapter import to_langchain_tool

    lc_tool = to_langchain_tool(OptimiseNetworkTool(), _model())

    result = lc_tool.func(optimizer_name="MILP")

    assert isinstance(result, dict)
    assert "MILP" in result["error"]
    assert result["tool"] == "optimise_network"
    assert "call it again" in result["hint"]


def test_all_registered_tools_are_agent_usable():
    load_plugins()
    registered_names = {t.name for t in global_registry.all(AGENT_TOOL)}
    assert registered_names == {
        "get_kpis",
        "find_spare_capacity",
        "simulate_scenario",
        "optimise_network",
        "compare_scenarios",
        "scan_opportunities",
        "find_demand_growth_break",
        "find_customer_count_break",
        "find_bottleneck_unlock",
        "generate_decision_brief",
        "run_goal_loop",
    }

    tools = global_registry.as_agent_tools()
    names = {t.name for t in tools}
    assert registered_names <= names
