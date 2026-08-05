"""Shift same-day to next-day (batching) — R3, needs the R1 service-aware
zones. Moves a percentage of each Express zone's demand onto its Standard
sibling zone (same place, next-day promise): the real business lever of
offering customers a delivery-slot trade-down. Express pressure leaves the
Full Hubs, batched Standard volume can ride any hub — every downstream
effect (cost, utilisation, feasibility) comes from the ordinary re-solve.

Zones without a Standard sibling are left untouched (documented; in
Dataset G every Express zone has one)."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario


@register_scenario
class ShiftServiceMixScenario(ScenarioModule):
    name = "shift_service_mix"
    params_schema = {
        "type": "object",
        "properties": {
            "pct": {
                "type": "number",
                "description": "Share of same-day (Express) demand shifted to next-day, 0-100.",
            },
        },
        "required": ["pct"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        pct = float(params["pct"])
        if not 0 <= pct <= 100:
            raise ValueError("pct must be between 0 and 100")
        fraction = pct / 100.0

        copy = model.model_copy(deep=True)
        standard_by_place = {
            (z.emirate, z.name.split(" · ")[0]): z
            for z in copy.zones
            if z.service_model == "Standard"
        }
        for zone in copy.zones:
            if zone.service_model != "Express" or zone.demand <= 0:
                continue
            sibling = standard_by_place.get((zone.emirate, zone.name.split(" · ")[0]))
            if sibling is None:
                continue
            moved = round(zone.demand * fraction, 2)
            zone.demand = round(zone.demand - moved, 2)
            sibling.demand = round(sibling.demand + moved, 2)
            copy.demand[zone.id] = zone.demand
            copy.demand[sibling.id] = sibling.demand
        return copy
