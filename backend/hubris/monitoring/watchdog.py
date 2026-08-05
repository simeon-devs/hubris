"""T-40: the capacity watchdog's sweep — `monitoring` autonomy made real.

Each sweep, with no user action:
1. Runs a REAL stress simulation of the baseline (demand_scale ×
   `watchdog_stress_factor`, re-solved through the actual flow LP — not a
   threshold check on cached KPIs), and
2. evaluates every saved scenario as-is,
then pushes an alert when a target is infeasible (critical) or its hottest
hub's flow-based utilisation crosses `watchdog_hot_utilization_pct`
(warning). The recommended action is computed too: T-23's bottleneck
unlock on the very model that alarmed, else a pointer at the robustness
band. Every figure in the alert is engine output; provenance names the
sweep run.

Deliberately DETERMINISTIC — no LLM in the background loop. A monitoring
narrative composed by an LLM every N seconds is a demo-fragility machine;
the watchdog's value is that it computes, always, quietly. (The seeded
`capacity_watchdog` agent spec is the identity this sweep runs under;
LLM-composed monitoring prose stays out by design.)

Graceful (Sims' Wave-3 rule): memory down → findings are computed but
alerts are dropped and reported as such in the sweep result; any per-target
failure is caught and listed, never raised.
"""

from hubris.core import assumptions
from hubris.core.contracts import NetworkModel
from hubris.engine.bottleneck import find_cheapest_bottleneck_unlock
from hubris.engine.flow import solve_min_cost_flow
from hubris.memory.store import memory, new_provenance
from hubris.plugins.metrics.utilization import flow_volume_by_hub

WATCHDOG_AGENT = "capacity_watchdog"
STRESS_FACTOR = assumptions.value("watchdog_stress_factor")
HOT_UTILIZATION_PCT = assumptions.value("watchdog_hot_utilization_pct")


def _evaluate(model: NetworkModel, target: str, stress_factor: float | None) -> dict | None:
    """One target's REAL evaluation → an alert payload, or None if healthy."""
    if stress_factor is not None:
        from hubris.agents.scenario_utils import apply_and_reassign

        model, flow = apply_and_reassign(model, "demand_scale", {"factor": stress_factor})
    else:
        flow = solve_min_cost_flow(model)

    volumes = flow_volume_by_hub(model)
    open_hubs = {h.id: h for h in model.hubs if h.status == "open"}
    util = {
        hub_id: round(volumes.get(hub_id, 0.0) / hub.capacity * 100, 2) if hub.capacity else 0.0
        for hub_id, hub in open_hubs.items()
    }
    hottest_id = max(util, key=util.get) if util else None
    hottest_pct = util.get(hottest_id, 0.0)

    infeasible = bool(flow.unmet_demand)
    hot = hottest_pct >= HOT_UTILIZATION_PCT
    if not infeasible and not hot:
        return None

    finding = {
        "target": target,
        "stress_factor": stress_factor,
        "feasible": flow.feasible,
        "unmet_demand": flow.unmet_demand,
        "hottest_hub": hottest_id,
        "hottest_utilization_pct": hottest_pct,
        "hot_threshold_pct": HOT_UTILIZATION_PCT,
    }

    unlock = find_cheapest_bottleneck_unlock(model)
    if unlock.get("bottleneck_found"):
        # `kind` travels with the alert so the card can say "serves N/day
        # now unserved" instead of dressing a feasibility fix up as a
        # saving — the two answers are not interchangeable.
        recommended = {
            "action": "add_capacity",
            "kind": unlock.get("kind", "reduce_cost"),
            "detail": unlock["recommendation"],
            "why": unlock["why"],
            "source_tool": "find_bottleneck_unlock",
        }
    else:
        recommended = {
            "action": "review_robustness",
            # The engine's own verdict when it has one (e.g. "no open
            # facility can reach this zone in time — it needs a new site"),
            # which is far more use than a generic robustness pointer.
            "detail": unlock.get("reason")
            or (
                f"No single capacity unlock verifies a saving; review {hottest_id}'s "
                "robustness band before committing to this load."
            ),
            "source_tool": "find_bottleneck_unlock",
        }

    return {
        "severity": "critical" if infeasible else "warning",
        "finding": finding,
        "recommended_action": recommended,
        "brief_link": f"/brief?scenario_id={target}" if not target.startswith("baseline") else "/brief",
    }


def _already_alerted(target: str) -> bool:
    """Dedup: one UNACKNOWLEDGED alert per target — a 5-minute cadence must
    not turn one condition into a wall of identical cards."""
    for alert in memory.list_alerts(include_acknowledged=False, limit=100):
        if alert["agent_name"] == WATCHDOG_AGENT and alert["finding"].get("target") == target:
            return True
    return False


def run_sweep(state, stress_factor: float | None = None) -> dict:
    """One full watchdog pass over baseline (stressed) + saved scenarios.
    Returns a computed summary; never raises."""
    factor = stress_factor if stress_factor is not None else STRESS_FACTOR
    targets: list[tuple[str, NetworkModel, float | None]] = [
        (f"baseline+{factor}x", state.baseline, factor)
    ]
    for scenario_id in state.scenarios:
        targets.append((scenario_id, state.get_model(scenario_id), None))

    memory_up = memory.available()
    checked, alerts, dropped, errors = [], [], 0, []
    for target, model, stress in targets:
        try:
            payload = _evaluate(model, target, stress)
            checked.append(target)
            if payload is None:
                continue
            if memory_up and _already_alerted(target):
                continue
            if not memory_up:
                dropped += 1
                continue
            alert_id = memory.record_alert(
                agent_name=WATCHDOG_AGENT,
                severity=payload["severity"],
                finding=payload["finding"],
                recommended_action=payload["recommended_action"],
                brief_link=payload["brief_link"],
                provenance=new_provenance("watchdog:sweep"),
            )
            if alert_id:
                alerts.append({"id": alert_id, "target": target, "severity": payload["severity"]})
            else:
                dropped += 1
        except Exception as exc:  # noqa: BLE001 — one bad target never kills the sweep
            errors.append(f"{target}: {type(exc).__name__}: {exc}")

    return {
        "targets_checked": checked,
        "alerts_created": alerts,
        "alerts_dropped_memory_unavailable": dropped,
        "memory_available": memory_up,
        "errors": errors,
    }
