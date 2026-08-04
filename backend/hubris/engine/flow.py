"""Min-cost flow assignment + duals (ARCHITECTURE.md §3, module 3b).

Formulated as a capacitated transportation LP and solved with scipy's HiGHS
backend, which gives the shadow prices (duals) T-23's prescriptive
bottleneck-unlock feature needs for free. An "overflow" slack variable per
zone (heavily penalised, never a real cost) keeps the LP feasible even if
open-hub capacity can't cover total demand — this must always solve, never
hang or raise (CLAUDE.md §7).
"""

from pydantic import BaseModel
from scipy.optimize import linprog

from hubris.core import assumptions
from hubris.core.contracts import NetworkModel

OVERFLOW_PENALTY = assumptions.value("overflow_penalty")  # T-32


class FlowResult(BaseModel):
    flows: dict[str, dict[str, float]]  # hub_id -> zone_id -> volume
    unmet_demand: dict[str, float]  # zone_id -> volume that couldn't be placed
    total_cost: float  # real transport cost only (excludes the overflow penalty)
    zone_duals: dict[str, float]  # zone_id -> shadow price of its demand constraint
    hub_duals: dict[str, float]  # hub_id -> shadow price of its capacity constraint
    feasible: bool  # True iff unmet_demand is empty


def solve_min_cost_flow(model: NetworkModel) -> FlowResult:
    open_hubs = [hub for hub in model.hubs if hub.status == "open"]
    zones = model.zones

    # Only edges within each zone's SLA are usable (BUILD_SPEC §3: x_ij = 0
    # if t_ij > T_max).
    edges: list[tuple[str, str]] = []
    for hub in open_hubs:
        for zone in zones:
            od = model.od_matrix.get((hub.id, zone.id))
            if od is None or od.time_min > zone.sla_hours * 60:
                continue
            edges.append((hub.id, zone.id))

    edge_index = {edge: i for i, edge in enumerate(edges)}
    zone_row = {zone.id: row for row, zone in enumerate(zones)}
    hub_row = {hub.id: row for row, hub in enumerate(open_hubs)}

    n_edges = len(edges)
    n_zones = len(zones)
    n_hubs = len(open_hubs)
    n_vars = n_edges + n_zones  # + one overflow slack var per zone

    c = [0.0] * n_vars
    for (hub_id, zone_id), i in edge_index.items():
        c[i] = model.od_matrix[(hub_id, zone_id)].cost
    for zone in zones:
        c[n_edges + zone_row[zone.id]] = OVERFLOW_PENALTY

    # Demand equality: sum_h x_hz + overflow_z = demand_z, for each zone z.
    A_eq = [[0.0] * n_vars for _ in range(n_zones)]
    b_eq = [0.0] * n_zones
    for zone in zones:
        row = zone_row[zone.id]
        b_eq[row] = zone.demand
        A_eq[row][n_edges + row] = 1.0
    for (hub_id, zone_id), i in edge_index.items():
        A_eq[zone_row[zone_id]][i] = 1.0

    # Capacity inequality: sum_z x_hz <= capacity_h, for each open hub h.
    A_ub = [[0.0] * n_vars for _ in range(n_hubs)]
    b_ub = [0.0] * n_hubs
    for hub in open_hubs:
        b_ub[hub_row[hub.id]] = hub.capacity
    for (hub_id, zone_id), i in edge_index.items():
        A_ub[hub_row[hub_id]][i] = 1.0

    result = linprog(
        c,
        A_ub=A_ub if n_hubs else None,
        b_ub=b_ub if n_hubs else None,
        A_eq=A_eq if n_zones else None,
        b_eq=b_eq if n_zones else None,
        bounds=(0, None),
        method="highs",
    )

    flows: dict[str, dict[str, float]] = {hub.id: {} for hub in open_hubs}
    for (hub_id, zone_id), i in edge_index.items():
        volume = result.x[i]
        if volume > 1e-9:
            flows[hub_id][zone_id] = round(volume, 6)

    unmet_demand: dict[str, float] = {}
    for zone in zones:
        overflow = result.x[n_edges + zone_row[zone.id]]
        if overflow > 1e-6:
            unmet_demand[zone.id] = round(overflow, 6)

    total_cost = sum(result.x[i] * model.od_matrix[edge].cost for edge, i in edge_index.items())

    zone_duals: dict[str, float] = {}
    if result.eqlin is not None:
        for zone in zones:
            zone_duals[zone.id] = round(float(result.eqlin.marginals[zone_row[zone.id]]), 6)

    hub_duals: dict[str, float] = {}
    if result.ineqlin is not None:
        for hub in open_hubs:
            hub_duals[hub.id] = round(float(result.ineqlin.marginals[hub_row[hub.id]]), 6)

    return FlowResult(
        flows=flows,
        unmet_demand=unmet_demand,
        total_cost=round(total_cost, 2),
        zone_duals=zone_duals,
        hub_duals=hub_duals,
        feasible=not unmet_demand,
    )
