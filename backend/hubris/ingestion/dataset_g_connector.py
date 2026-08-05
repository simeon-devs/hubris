"""T-28: the Dataset-G connector — the real event dataset ("AI-Powered
Network Capacity & Cost Intelligence"), mapped to the canonical schema per
DATASET_REPORT.md §6 and Sims' approved decisions (2026-08-05):

- TWO twins, never blended: `network="hub_spoke"` (primary — the 10 active
  hubs + 3 CANDIDATE hubs, CFLP-ready) and `network="qcomm"` (the 10 dark
  stores — the capacity-crisis view). On-Demand is report-only and is
  excluded from both.
- `current_assignments` come from the file's own `serving_hub_or_store_id`
  — REAL provided assignments, so `assignments_provided=True` and T-31's
  baseline label flips to "provided" honestly.
- Cost calibration: `handling_cost` per facility is DERIVED from
  Cost_to_Serve's own variable non-fuel spend ((labour+vehicle)/shipments)
  — calibrated, not assumed. Fuel cost/km comes per vehicle type from
  Fleet_Roster. Fixed cost is the facility's monthly rent (hubs) or
  monthly overhead allocation (dark stores, which carry no rent column),
  normalised to the DAY period.
- Period = one DAY: capacities in the file are daily ceilings
  (max_daily_shipments / max_daily_orders), so demand uses week-13
  `daily_avg` and monthly money is divided by DAYS_PER_MONTH.
- Zone coordinates: joined from the facilities' own zone names (§5.4).
  A zone with no facility coordinate anywhere is a hard error here —
  by Sims' rule we flag unmappable zones, never fake positions. (The two
  On-Demand pseudo-zones never reach this connector.)
"""

import statistics
from typing import Any

import pandas as pd

from hubris.core import assumptions
from hubris.core.contracts import DataConnector
from hubris.core.models import RawTables
from hubris.core.registry import register_data_connector
from hubris.engine.cost_model import derive_od_cost
from hubris.engine.geo import road_distance_km

DAYS_PER_MONTH = assumptions.value("dataset_g_days_per_month")
AVG_SPEED_KMH = assumptions.value("avg_speed_kmh")

FINGERPRINT_SHEETS = {"Hub_Network", "Demand_by_Zone", "Cost_to_Serve"}

# Service-model SLA windows (hours) — registry-labelled (T-32): Standard is
# verified from the file's own README, Express is a stated interpretation.
# QComm zone SLAs come from each store's own target_delivery_min (data).
SLA_HOURS = {
    "Standard": assumptions.value("dataset_g_sla_standard_hours"),
    "Express": assumptions.value("dataset_g_sla_express_hours"),
}

BASELINE_WEEK = 13  # latest week = the current operating state


@register_data_connector
class DatasetGConnector(DataConnector):
    name = "dataset_g"

    def can_handle(self, source: Any) -> float:
        """Fingerprint by sheet names, not filename — the file may arrive
        renamed on the day."""
        try:
            sheets = set(pd.ExcelFile(source).sheet_names)
            return 1.0 if FINGERPRINT_SHEETS <= sheets else 0.0
        except Exception:  # noqa: BLE001 — not an excel file / unreadable
            return 0.0

    def load(self, source: Any, network: str = "hub_spoke", **_: object) -> RawTables:
        if network not in {"hub_spoke", "qcomm"}:
            raise ValueError(
                f"unknown network {network!r} — 'hub_spoke' or 'qcomm' "
                "(On-Demand is report-only by decision and has no twin)"
            )
        xl = pd.ExcelFile(source)
        sheets = {name: xl.parse(name) for name in xl.sheet_names}

        zone_coords = self._zone_coordinates(sheets)
        # Pool-pure calibration (never blend): only this network's cost rows.
        cts_network = "Hub & Spoke" if network == "hub_spoke" else "QComm"
        handling = self._handling_cost_per_shipment(
            sheets["Cost_to_Serve"][sheets["Cost_to_Serve"].network_type == cts_network]
        )

        roster = self._rider_roster(
            sheets["Courier_Capacity"][sheets["Courier_Capacity"].network_type == cts_network]
        )
        if network == "hub_spoke":
            hubs = self._hub_spoke_hubs(
                sheets["Hub_Network"],
                handling,
                sheets["Cost_to_Serve"][sheets["Cost_to_Serve"].network_type == cts_network],
            )
            demand_rows = sheets["Demand_by_Zone"].query(
                "network_type == 'Hub & Spoke' and week_number == @BASELINE_WEEK"
            )
            fleet = self._fleet(sheets["Fleet_Roster"], "Hub & Spoke")
        else:
            hubs = self._qcomm_hubs(sheets["Dark_Store_Network"], sheets["Cost_to_Serve"], handling)
            demand_rows = sheets["Demand_by_Zone"].query(
                "network_type == 'QComm' and week_number == @BASELINE_WEEK"
            )
            fleet = self._fleet(sheets["Fleet_Roster"], "QComm")

        for hub in hubs:
            hub.update(roster.get(hub["id"], {}))  # candidates: no roster -> None fields

        zones, current_assignments = self._zones_and_assignments(
            demand_rows, zone_coords, sheets, network
        )
        od_matrix = self._derive_od_matrix(hubs, zones, fleet)

        return RawTables(
            hubs=hubs,
            zones=zones,
            fleet_types=fleet,
            od_matrix=od_matrix,
            current_assignments=current_assignments,
            assignments_provided=True,  # the file's own serving assignments (T-31)
        )

    # ---- facilities ---------------------------------------------------------
    def _hub_spoke_hubs(
        self, hub_df: pd.DataFrame, handling: dict[str, float], cts: pd.DataFrame
    ) -> list[dict]:
        median_handling = _median(handling)
        # Fixed cost = the file's own per-facility overhead allocation
        # (Cost_to_Serve.overhead_cost_aed), NOT rent: the file defines
        # fully-loaded cost as (fuel+labour+vehicle+overhead)/shipments, and
        # overhead subsumes rent (ratio 0.88–1.14, median ~1.01 across the 10
        # actives). Reconciliation finding, Sims decision 2026-08-05.
        overhead = cts.groupby("hub_or_store_id").overhead_cost_aed.sum()
        rent = hub_df.set_index("hub_id").monthly_rent_aed
        active_ids = [h for h in overhead.index if h in rent.index]
        # Candidates have no Cost_to_Serve rows: uplift their rent by the
        # actives' median overhead/rent ratio (derived from the file itself;
        # full precision — _median's 2dp rounding is for money, not ratios).
        ovh_rent_ratio = statistics.median(
            float(overhead[h]) / float(rent[h]) for h in active_ids if rent[h] > 0
        )
        hubs = []
        for _, r in hub_df.iterrows():
            if r.hub_id in overhead.index:
                fixed_monthly = float(overhead[r.hub_id])
            else:
                fixed_monthly = float(r.monthly_rent_aed) * ovh_rent_ratio
            hubs.append(
                {
                    "id": r.hub_id,
                    "name": r.hub_name,
                    "lat": float(r.lat),
                    "lon": float(r.lng),
                    "emirate": r.emirate,
                    "capacity": float(r.max_daily_shipments),
                    "fixed_cost": round(fixed_monthly / DAYS_PER_MONTH, 2),
                    # Candidates have no Cost_to_Serve rows -> network median
                    # (derived, not assumed — from the file's own hubs).
                    "handling_cost": handling.get(r.hub_id, median_handling),
                    "status": "open" if r.status == "Active" else "candidate",
                    # R1: capability from the file's own columns — Full Hubs
                    # carry Standard+Express, Micro Hubs Standard only.
                    "hub_type": str(r.hub_type),
                    "service_models": [m.strip() for m in str(r.service_models).split(",")],
                }
            )
        return hubs

    def _qcomm_hubs(
        self, ds_df: pd.DataFrame, cts: pd.DataFrame, handling: dict[str, float]
    ) -> list[dict]:
        # Dark stores carry no rent column; their fixed cost is the monthly
        # overhead allocation from Cost_to_Serve (labelled derived).
        overhead = (
            cts[cts.network_type == "QComm"].set_index("hub_or_store_id").overhead_cost_aed
        )
        median_handling = _median(handling)  # already pool-pure
        hubs = []
        for _, r in ds_df.iterrows():
            hubs.append(
                {
                    "id": r.store_id,
                    "name": r.store_name,
                    "lat": float(r.lat),
                    "lon": float(r.lng),
                    "emirate": r.emirate,
                    "capacity": float(r.max_daily_orders),
                    "fixed_cost": round(float(overhead.get(r.store_id, 0.0)) / DAYS_PER_MONTH, 2),
                    "handling_cost": handling.get(r.store_id, median_handling),
                    "status": "open",
                    "hub_type": "Dark Store",
                    "service_models": ["QComm"],
                }
            )
        return hubs

    # ---- rider roster (R2) ---------------------------------------------------
    def _rider_roster(self, cc: pd.DataFrame) -> dict[str, dict]:
        """Per-facility rider layer from Courier_Capacity — REAL counts,
        productivity and weekly labour cost, straight off the sheet:
        capacity/day = sum(courier_count x avg_dpd) across shift waves."""
        roster: dict[str, dict] = {}
        for fac, grp in cc.groupby("hub_or_store_id"):
            entry: dict = {
                "rider_capacity_daily": round(float((grp.courier_count * grp.avg_dpd).sum()), 1),
                "rider_weekly_cost": round(float(grp.total_weekly_labour_cost_aed.sum()), 2),
            }
            for kind, prefix in (("FTE", "fte"), ("FTC", "ftc")):
                sub = grp[grp.employment_type == kind]
                count = int(sub.courier_count.sum())
                entry[f"riders_{prefix}"] = count
                if count:
                    entry[f"{prefix}_avg_dpd"] = round(
                        float((sub.courier_count * sub.avg_dpd).sum()) / count, 2
                    )
                    entry[f"{prefix}_weekly_rate"] = round(
                        float((sub.courier_count * sub.weekly_cost_per_courier_aed).sum()) / count, 2
                    )
            roster[fac] = entry
        return roster

    # ---- zones + provided assignments ---------------------------------------
    def _zones_and_assignments(
        self,
        demand_rows: pd.DataFrame,
        zone_coords: dict[tuple[str, str], tuple[float, float]],
        sheets: dict[str, pd.DataFrame],
        network: str,
    ) -> tuple[list[dict], list[dict]]:
        store_sla = {}
        if network == "qcomm":
            ds = sheets["Dark_Store_Network"]
            store_sla = dict(zip(ds.store_id, ds.target_delivery_min))

        # R1 (service-aware twin): Hub & Spoke zones split PER SERVICE MODEL —
        # "Al Quoz Standard" and "Al Quoz Express" are different demand with
        # different promises, and only Full Hubs may carry Express. QComm
        # zones are single-model and keep their original ids (the crisis
        # twin's identity is load-bearing across alerts/tests/demos).
        zones: dict[str, dict] = {}
        assignments: list[dict] = []
        group_cols = (
            ["emirate", "zone", "service_model"] if network == "hub_spoke" else ["emirate", "zone"]
        )
        for group_key, grp in demand_rows.groupby(group_cols):
            emirate, zone = group_key[0], group_key[1]
            model = group_key[2] if network == "hub_spoke" else "QComm"
            key = (emirate, zone)
            if key not in zone_coords:
                # Sims' rule: unmappable is FLAGGED, never faked.
                raise ValueError(
                    f"zone {emirate}/{zone} has no facility coordinate to join — unmappable"
                )
            lat, lon = zone_coords[key]
            if network == "hub_spoke":
                zone_id = f"{_slug(emirate)}-{_slug(zone)}-{_slug(model)}"
                display = f"{zone} · {model} ({emirate})"
                sla = SLA_HOURS.get(model, 24.0)
            else:
                zone_id = f"{_slug(emirate)}-{_slug(zone)}"
                display = f"{zone} ({emirate})"
                serving = grp.serving_hub_or_store_id.iloc[0]
                sla = float(store_sla.get(serving, 15)) / 60.0
            daily_demand = float(grp.daily_avg.sum())

            zones[zone_id] = {
                "id": zone_id,
                "name": display,
                "lat": lat,
                "lon": lon,
                "emirate": emirate,
                "demand": round(daily_demand, 2),
                "sla_hours": sla,
                "service_model": model,
            }
            for serving_id, sgrp in grp.groupby("serving_hub_or_store_id"):
                assignments.append(
                    {
                        "zone_id": zone_id,
                        "hub_id": serving_id,
                        "volume": round(float(sgrp.daily_avg.sum()), 2),
                    }
                )
        return list(zones.values()), assignments

    def _zone_coordinates(
        self, sheets: dict[str, pd.DataFrame]
    ) -> dict[tuple[str, str], tuple[float, float]]:
        coords: dict[tuple[str, str], tuple[float, float]] = {}
        for _, r in sheets["Hub_Network"].iterrows():
            coords.setdefault((r.emirate, r.zone), (float(r.lat), float(r.lng)))
        for _, r in sheets["Dark_Store_Network"].iterrows():
            coords.setdefault((r.emirate, r.zone), (float(r.lat), float(r.lng)))
        return coords

    # ---- cost calibration ----------------------------------------------------
    def _handling_cost_per_shipment(self, cts: pd.DataFrame) -> dict[str, float]:
        """Per-facility TOTAL VARIABLE cost per shipment from the file's own
        Cost_to_Serve: (fuel + labour + vehicle) / shipments, summed across
        service models. Overhead is excluded — that is the FIXED pool
        (Sims' two-pools rule).

        Fuel is IN here, deliberately (T-29 validation finding): zones
        inherit their serving facility's coordinates, so the point-to-point
        OD distance at the CURRENT assignment is ~0 and a per-km fuel rate
        would silently drop their intra-zone route cost (their
        avg_distance_per_ship_km is multi-stop ROUTE length, 12–32 km for
        hubs). Semantics after this calibration: `handling_cost` carries the
        facility's full variable rate at its current serving structure, and
        the od per-km term prices only the INCREMENTAL distance when a
        what-if serves a zone from a DIFFERENT, farther facility — exactly
        the marginal question our scenarios ask."""
        out: dict[str, float] = {}
        for fac, grp in cts.groupby("hub_or_store_id"):
            shipments = grp.monthly_shipments.sum()
            if shipments > 0:
                out[fac] = round(
                    float(
                        (grp.fuel_cost_aed.sum() + grp.labour_cost_aed.sum() + grp.vehicle_cost_aed.sum())
                        / shipments
                    ),
                    2,
                )
        return out

    # ---- fleet + od ----------------------------------------------------------
    def _fleet(self, fr: pd.DataFrame, network_type: str) -> list[dict]:
        rows = []
        for _, r in fr[fr.network_type == network_type].iterrows():
            rows.append(
                {
                    "id": f"{r.hub_or_store_id}-{_slug(r.vehicle_type)}",
                    "name": r.vehicle_type,
                    "capacity": float(r.avg_capacity_units),
                    "cost_per_km": float(r.fuel_cost_per_km_aed),
                    "fixed_cost": round(float(r.monthly_fleet_cost_per_vehicle_aed) / DAYS_PER_MONTH, 2),
                    "count_available": int(r.vehicle_count),
                    "hub_id": r.hub_or_store_id,
                }
            )
        return rows

    def _derive_od_matrix(
        self, hubs: list[dict], zones: list[dict], fleet: list[dict]
    ) -> list[dict]:
        # Reference cost/km: the customer-delivery workhorse of the network
        # (Van for hub&spoke; the bikes for qcomm) — same convention as
        # engine.cost_model.reference_cost_per_km, resolved on raw rows.
        by_name = {row["name"]: row["cost_per_km"] for row in fleet}
        cost_per_km = by_name.get("Van", next(iter(by_name.values())) if by_name else 1.6)

        od = []
        for hub in hubs:
            capable = hub.get("service_models")
            for zone in zones:
                model = zone.get("service_model")
                # R1: no edge for a service model the facility can't carry
                # (e.g. Express -> Micro Hub). Unknown capability = universal.
                if capable is not None and model is not None and model not in capable:
                    continue
                distance_km = round(
                    road_distance_km(hub["lat"], hub["lon"], zone["lat"], zone["lon"]), 2
                )
                time_min = round(distance_km / AVG_SPEED_KMH * 60, 1)
                cost = derive_od_cost(distance_km, hub["handling_cost"], cost_per_km)
                od.append(
                    {
                        "from_id": hub["id"],
                        "to_id": zone["id"],
                        "distance_km": distance_km,
                        "time_min": time_min,
                        "cost": cost,
                    }
                )
        return od


def _slug(text: str) -> str:
    return str(text).strip().replace(" ", "_").replace("/", "-")


def _median(values: dict[str, float]) -> float:
    vals = sorted(values.values())
    if not vals:
        return 0.0
    mid = len(vals) // 2
    return vals[mid] if len(vals) % 2 else round((vals[mid - 1] + vals[mid]) / 2, 2)
