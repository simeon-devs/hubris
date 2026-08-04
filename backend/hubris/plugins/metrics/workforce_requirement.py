"""Workforce requirement — the Forecast-to-Workforce translation.

Converts each hub's *assigned parcel volume* (a real engine output, see
`engine/assignment.py`) into the courier headcount needed to move it, and
compares that against the headcount the hub's own capacity can sustain.
The difference is the structural staffing gap the map renders as pillars.

Why this lives in the engine and not the browser
------------------------------------------------
CLAUDE.md §2: the deterministic engine computes, nothing else invents a
number. `lib/api.ts` repeats it for the frontend ("no client-side
computation of any figure the UI displays"). Headcount is a figure the UI
displays, so it is computed here, from engine state, and shipped as JSON.

Every conversion factor below is an explicit, named assumption and is
returned in `breakdown["assumptions"]` so the UI (and any agent) can show
its working. Change a factor and every number downstream moves with it —
there is no second, hidden copy of these constants anywhere.
"""

import math

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric
from hubris.engine.assignment import assigned_volume_by_hub

# ---- planning assumptions (the only place these exist) ----------------------
# Parcels a single courier handles per productive hour.
PARCELS_PER_COURIER_HOUR = 18.0
# Productive hours in one shift, after briefing/breaks/returns.
PRODUCTIVE_HOURS_PER_SHIFT = 7.5
# Target permanent share of headcount (the 60/40 permanent:outsourced policy).
PERMANENT_SHARE = 0.60
# Calendar days from "start the paperwork" to "courier is on the road".
PERMANENT_LEAD_TIME_DAYS = 45
OUTSOURCED_LEAD_TIME_DAYS = 7
# A hub within this many couriers of its requirement counts as balanced.
BALANCED_TOLERANCE_COURIERS = 1

PARCELS_PER_COURIER_SHIFT = PARCELS_PER_COURIER_HOUR * PRODUCTIVE_HOURS_PER_SHIFT


def _headcount_for(parcels: float) -> int:
    """Couriers needed to clear `parcels` in one shift. Ceil — you cannot
    roster a fraction of a courier, and rounding down leaves parcels undelivered."""
    if parcels <= 0:
        return 0
    return math.ceil(parcels / PARCELS_PER_COURIER_SHIFT)


def _sustainable_headcount(capacity: float) -> int:
    """Couriers a hub's capacity can actually sustain. Floor — capacity the
    hub cannot fully staff is not capacity you can promise a customer."""
    if capacity <= 0:
        return 0
    return math.floor(capacity / PARCELS_PER_COURIER_SHIFT)


def _classify(gap: int) -> str:
    if gap > BALANCED_TOLERANCE_COURIERS:
        return "understaffed"
    if gap < -BALANCED_TOLERANCE_COURIERS:
        return "overstaffed"
    return "balanced"


@register_metric
class WorkforceRequirementMetric(Metric):
    name = "workforce_requirement"
    unit = "couriers"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        assigned = assigned_volume_by_hub(model)

        per_hub: dict[str, dict] = {}
        total_required = 0
        total_sustainable = 0
        understaffed_hubs: list[str] = []

        for hub in model.hubs:
            volume = assigned.get(hub.id, 0.0)
            required = _headcount_for(volume)
            # A closed hub sustains nobody — it has no roster to draw on.
            sustainable = _sustainable_headcount(hub.capacity) if hub.status == "open" else 0
            gap = required - sustainable
            direction = _classify(gap)

            # Split the requirement toward the 60/40 policy target. Permanent
            # is rounded first so permanent + outsourced == required exactly.
            required_permanent = round(required * PERMANENT_SHARE)
            required_outsourced = required - required_permanent

            per_hub[hub.id] = {
                "assigned_parcels": round(volume, 2),
                "required_courier_hours": round(volume / PARCELS_PER_COURIER_HOUR, 2),
                "required_headcount": required,
                "sustainable_headcount": sustainable,
                "gap": gap,
                "gap_direction": direction,
                "required_permanent": required_permanent,
                "required_outsourced": required_outsourced,
            }

            total_required += required
            total_sustainable += sustainable
            if direction == "understaffed":
                understaffed_hubs.append(hub.id)

        total_permanent = round(total_required * PERMANENT_SHARE)

        return MetricResult(
            name=self.name,
            value=total_required,
            unit=self.unit,
            breakdown={
                "per_hub": per_hub,
                "network": {
                    "required_headcount": total_required,
                    "sustainable_headcount": total_sustainable,
                    "gap": total_required - total_sustainable,
                    "gap_direction": _classify(total_required - total_sustainable),
                    "required_permanent": total_permanent,
                    "required_outsourced": total_required - total_permanent,
                    "understaffed_hubs": understaffed_hubs,
                },
                "assumptions": {
                    "parcels_per_courier_hour": PARCELS_PER_COURIER_HOUR,
                    "productive_hours_per_shift": PRODUCTIVE_HOURS_PER_SHIFT,
                    "parcels_per_courier_shift": PARCELS_PER_COURIER_SHIFT,
                    "permanent_share": PERMANENT_SHARE,
                    "permanent_lead_time_days": PERMANENT_LEAD_TIME_DAYS,
                    "outsourced_lead_time_days": OUTSOURCED_LEAD_TIME_DAYS,
                    "balanced_tolerance_couriers": BALANCED_TOLERANCE_COURIERS,
                },
            },
        )
