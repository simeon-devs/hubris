"""Agent tool: the full KPI dashboard for a network model — one call
instead of one per metric. Returns computed JSON only (CLAUDE.md's one
rule that never moves: agents orchestrate and explain, never invent a
number)."""

from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import METRIC, register_agent_tool
from hubris.core.registry import registry as global_registry


@register_agent_tool
class GetKpisTool(AgentTool):
    name = "get_kpis"
    description = (
        "Compute the full KPI dashboard for a network model: cost-to-serve "
        "(AED/parcel, with transport_cost_pct/fixed_cost_pct shares already "
        "computed — use those directly, never divide transport/fixed by total "
        "yourself), utilization (%, network + per-hub), coverage (SLA "
        "REACHABILITY % — share of demand whose facility is within its SLA "
        "window; capacity-blind, so it can read 100% while demand goes "
        "unserved), demand_served (% of demand the capacity-constrained flow "
        "ACTUALLY serves, with unmet_by_zone listed — cite THIS one for "
        "'can the network serve it' questions, and never present coverage "
        "as served volume), spare capacity (parcels, network + per-hub), and "
        "network_summary (hub_count, zone_count, emirate_count, total_demand, "
        "baseline_provenance — 'reconstructed_nearest_hub' means the current "
        "assignment is OUR proxy, not EMX's recorded practice; say so when "
        "citing baseline or improvement figures "
        "— use these directly, never count hub/zone/emirate entries in a "
        "breakdown yourself). "
        "Every value is computed by the deterministic engine, not estimated."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "scenario_id": {"type": ["string", "null"], "description": "Optional scenario label"}
        },
    }

    def run(self, *, model: NetworkModel, scenario_id: str | None = None, **_: object) -> dict:
        kpis = {
            metric.name: metric.compute(model, scenario_id).model_dump()
            for metric in global_registry.all(METRIC)
        }
        kpis["network_summary"] = {
            # T-31: never let an agent (or the UI) cite a baseline figure
            # without knowing whether it rests on real assignments or our
            # nearest-hub reconstruction.
            "baseline_provenance": model.baseline_provenance,
            "hub_count": len(model.hubs),
            "open_hub_count": sum(1 for hub in model.hubs if hub.status == "open"),
            "zone_count": len(model.zones),
            "emirate_count": len({hub.emirate for hub in model.hubs} | {zone.emirate for zone in model.zones}),
            "total_demand": round(sum(model.demand.values()), 2),
        }
        return kpis
