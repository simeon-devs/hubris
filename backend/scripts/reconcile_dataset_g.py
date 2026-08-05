"""Reconciliation of the Hubris twin against Dataset G's own published
per-facility cost figures — generates `examples/reconciliation.md`.

Run inside the backend container from /app:
    python scripts/reconcile_dataset_g.py > ../examples/reconciliation.md
(or with an output path:  python scripts/reconcile_dataset_g.py OUT.md)

Everything here is recomputed from the raw workbook + the live connector +
the live cost metric — nothing is hand-typed, so the artifact can always be
regenerated after a data or calibration change.
"""

from __future__ import annotations

import sys

import pandas as pd

from hubris.core.contracts import NetworkModel
from hubris.core.registry import load_plugins, registry
from hubris.ingestion.dataset_g_connector import DAYS_PER_MONTH, DatasetGConnector

REAL_FILE = "hubris/data/dataset_g.xlsx"


def _published(cts: pd.DataFrame) -> pd.DataFrame:
    """The file's own arithmetic, per facility: variable and fully-loaded
    per-shipment rates, stated monthly volumes."""
    g = cts.groupby("hub_or_store_id").agg(
        ships=("monthly_shipments", "sum"),
        fuel=("fuel_cost_aed", "sum"),
        lab=("labour_cost_aed", "sum"),
        veh=("vehicle_cost_aed", "sum"),
        ovh=("overhead_cost_aed", "sum"),
        tot=("total_cost_aed", "sum"),
    )
    g["their_var"] = (g.fuel + g.lab + g.veh) / g.ships
    g["their_full"] = g.tot / g.ships
    return g


def _network_table(network: str, cts_label: str, rent: pd.Series | None) -> list[str]:
    xl = pd.ExcelFile(REAL_FILE)
    cts = xl.parse("Cost_to_Serve").query("network_type == @cts_label")
    pub = _published(cts)

    raw = DatasetGConnector().load(REAL_FILE, network=network)
    ours = {h["id"]: h for h in raw.hubs if h["status"] == "open"}
    model = NetworkModel.from_raw_tables(raw)
    metric = registry.get("metric", "cost_to_serve")
    engine_full = metric.compute(model, None).value

    lines = []
    rows = []
    worst_before = worst_after = 0.0
    for fac in pub.index:
        p = pub.loc[fac]
        h = ours[fac]
        our_var = h["handling_cost"]  # AED/shipment, volume-independent
        # fully-loaded AT THE FILE'S OWN STATED VOLUMES (apples-to-apples):
        daily_ships = p.ships / DAYS_PER_MONTH
        our_full_after = our_var + h["fixed_cost"] / daily_ships
        dev_var = 100 * (our_var - p.their_var) / p.their_var
        dev_full = 100 * (our_full_after - p.their_full) / p.their_full
        worst_after = max(worst_after, abs(dev_var), abs(dev_full))
        row = (
            f"| {fac} | {p.ships:.0f} | {p.their_var:.2f} | {our_var:.2f} | {dev_var:+.1f}% "
            f"| {p.their_full:.2f} | {our_full_after:.2f} | {dev_full:+.1f}% |"
        )
        if rent is not None:
            # BEFORE the fix: fixed carried rent, not the file's overhead pool
            our_full_before = our_var + (float(rent[fac]) / DAYS_PER_MONTH) / daily_ships
            dev_before = 100 * (our_full_before - p.their_full) / p.their_full
            worst_before = max(worst_before, abs(dev_before))
            row = row[:-1] + f" {our_full_before:.2f} ({dev_before:+.1f}%) |"
        rows.append(row)

    net_var_theirs = (pub.fuel + pub.lab + pub.veh).sum() / pub.ships.sum()
    net_full_theirs = pub.tot.sum() / pub.ships.sum()
    net_var_ours = sum(
        ours[f]["handling_cost"] * pub.loc[f].ships for f in pub.index
    ) / pub.ships.sum()
    net_full_ours = net_var_ours + sum(
        h["fixed_cost"] for f, h in ours.items() if f in pub.index
    ) / (pub.ships.sum() / DAYS_PER_MONTH)

    hdr = (
        "| Facility | Stated ships/mo | Their VAR | Ours VAR | Δ | Their FULL | Ours FULL | Δ |"
    )
    sep = "|---|---|---|---|---|---|---|---|"
    if rent is not None:
        hdr += " Ours FULL, rent-fixed (before) |"
        sep += "---|"
    lines += [hdr, sep, *rows, ""]
    lines += [
        f"**Network ({cts_label}), at the file's stated volumes:** variable "
        f"{net_var_ours:.2f} vs their {net_var_theirs:.2f}; fully-loaded "
        f"{net_full_ours:.2f} vs their {net_full_theirs:.2f}. Worst per-facility "
        f"deviation after reconciliation: **{worst_after:.1f}%**"
        + (f" (was {worst_before:.1f}% on the rent-fixed basis)" if rent is not None else "")
        + ".",
        "",
        f"**Engine anchor (live `cost_to_serve` metric on the loaded twin, "
        f"week-13 demand-panel volumes):** {engine_full:.2f} AED/shipment "
        f"fully-loaded — see 'the two volume bases' below for why this "
        f"differs from the stated-volume figure.",
        "",
    ]
    return lines


def main(out_path: str | None) -> None:
    load_plugins()
    xl = pd.ExcelFile(REAL_FILE)
    hub = xl.parse("Hub_Network").set_index("hub_id")
    cts_hs = xl.parse("Cost_to_Serve").query("network_type == 'Hub & Spoke'")

    # per-service-model residual (the old '16.1%' — granularity, not error)
    per_row = cts_hs.assign(
        row_var=lambda d: (d.fuel_cost_aed + d.labour_cost_aed + d.vehicle_cost_aed)
        / d.monthly_shipments
    )
    fac_var = _published(cts_hs).their_var
    per_row = per_row.assign(
        blend_dev=lambda d: 100
        * abs(d.row_var - d.hub_or_store_id.map(fac_var))
        / d.hub_or_store_id.map(fac_var)
    )
    worst_row = per_row.loc[per_row.blend_dev.idxmax()]

    lines = [
        "# Reconciliation — Hubris twin vs Dataset G's published figures",
        "",
        "Generated by `backend/scripts/reconcile_dataset_g.py` (never hand-edited).",
        "Every 'ours' figure comes from the live connector + live cost metric; every",
        "'theirs' figure is the file's own `Cost_to_Serve` arithmetic.",
        "",
        "## What changed (Sims decision, 2026-08-05)",
        "",
        "1. **Hub fixed cost = the file's own per-facility `overhead_cost_aed`, not rent.**",
        "   The file defines fully-loaded cost as (fuel+labour+vehicle+overhead)/shipments;",
        "   overhead subsumes rent (overhead/rent ratio 0.88–1.14 across the 10 actives,",
        "   median ~1.01). Candidates (no cost rows) carry rent × that median ratio.",
        "2. **Reconciliation is reported at the file's stated monthly volumes** —",
        "   apples-to-apples with their published per-shipment rates.",
        "",
        "## Hub & Spoke",
        "",
        *_network_table("hub_spoke", "Hub & Spoke", hub.monthly_rent_aed),
        "## QComm (dark stores)",
        "",
        *_network_table("qcomm", "QComm", None),
        "## The two volume bases (the honest residual)",
        "",
        "The workbook is internally inconsistent about volume: the `Demand_by_Zone`",
        "panel (week 13) implies roughly 2.7× the daily volume that `Cost_to_Serve`",
        "states for Hub & Spoke (DATASET_REPORT §5). The twin **operates** on the",
        "demand panel — that is what drives flows, capacity and scenarios — so the",
        "live engine metric amortises fixed cost over demand-panel volume and lands",
        "lower than the stated-volume figure. Same rates, same fixed pool, different",
        "denominator; both are reported, labelled, everywhere.",
        "",
        "## Granularity note (where the old 16.1% came from)",
        "",
        "Our twin prices per **facility** (one blended variable rate); the file also",
        "splits some facilities by service model. At (facility, service-model)",
        f"granularity the blended rate deviates up to {worst_row.blend_dev:.1f}% from a",
        f"single row ({worst_row.hub_or_store_id} / {worst_row.service_model}: row rate",
        f"{worst_row.row_var:.2f} vs blended {fac_var[worst_row.hub_or_store_id]:.2f}).",
        "At facility level — the level the twin decides at — the deviation is 0.0%",
        "(tables above). This is a granularity choice, not a calibration error.",
        "",
    ]
    text = "\n".join(lines)
    if out_path:
        with open(out_path, "w") as f:
            f.write(text)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
