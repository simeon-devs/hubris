#!/usr/bin/env python3
"""
Ingestion Fire Drill — proves the schema-agnostic pipeline handles a
deliberately messy real-world Excel file without crashing.

Run from backend/:
    python test_ingestion_drill.py
"""

import sys
import pandas as pd

FILENAME = "messy_7x_data.xlsx"


def generate_messy_excel(filename: str = FILENAME) -> None:
    """Write a realistic but deliberately awkward 7X-style Excel workbook.

    Sheet names are plausible logistics labels (not canonical ones).
    Some column names resolve via fuzzy matching; others are completely
    alien and will trigger NeedsConfirmationError — proving the system
    stops and asks the operator rather than silently misloading data.
    OD Matrix and Assignments are intentionally absent; the engine derives them.
    """
    hubs = pd.DataFrame([
        {
            "Depot_Ref":      "H1",
            "Hub_Name":       "Al Quoz Depot",
            "GPS_Lat":        25.1503,
            "GPS_Lon":        55.2348,
            "Emirate":        "Dubai",
            "Max_Capacity":   2500,
            "Depot_Rent_AED": 18000,
            "Sorting_Fee":    3.5,
        },
        {
            "Depot_Ref":      "H2",
            "Hub_Name":       "Mussaffah Hub",
            "GPS_Lat":        24.3506,
            "GPS_Lon":        54.4960,
            "Emirate":        "Abu Dhabi",
            "Max_Capacity":   3000,
            "Depot_Rent_AED": 22000,
            "Sorting_Fee":    4.0,
        },
        {
            "Depot_Ref":      "H3",
            "Hub_Name":       "Sharjah Cross-Dock",
            "GPS_Lat":        25.3377,
            "GPS_Lon":        55.4088,
            "Emirate":        "Sharjah",
            "Max_Capacity":   1800,
            "Depot_Rent_AED": 14000,
            "Sorting_Fee":    3.0,
        },
    ])

    zones = pd.DataFrame([
        {"Zone_Code": "Z1", "Zone_Name": "JLT",        "GPS_Lat": 25.0657, "GPS_Lon": 55.1413, "Emirate": "Dubai",     "Daily_Deliveries": 320, "SLA_Hrs": 24},
        {"Zone_Code": "Z2", "Zone_Name": "DIFC",       "GPS_Lat": 25.2048, "GPS_Lon": 55.2708, "Emirate": "Dubai",     "Daily_Deliveries": 410, "SLA_Hrs": 12},
        {"Zone_Code": "Z3", "Zone_Name": "Khalidiyah", "GPS_Lat": 24.4539, "GPS_Lon": 54.3773, "Emirate": "Abu Dhabi", "Daily_Deliveries": 280, "SLA_Hrs": 24},
        {"Zone_Code": "Z4", "Zone_Name": "Al Majaz",   "GPS_Lat": 25.3377, "GPS_Lon": 55.3908, "Emirate": "Sharjah",  "Daily_Deliveries": 190, "SLA_Hrs": 48},
    ])

    fleet = pd.DataFrame([
        {"Fleet_Code": "F1", "Vehicle_Name": "Motorbike", "Capacity_KG": 10,  "Cost_Per_KM": 0.8, "Daily_Fixed_Cost": 60,  "Avail_Count": 40},
        {"Fleet_Code": "F2", "Vehicle_Name": "Light Van", "Capacity_KG": 50,  "Cost_Per_KM": 1.4, "Daily_Fixed_Cost": 120, "Avail_Count": 25},
        {"Fleet_Code": "F3", "Vehicle_Name": "Box Truck", "Capacity_KG": 200, "Cost_Per_KM": 2.2, "Daily_Fixed_Cost": 250, "Avail_Count": 10},
    ])

    with pd.ExcelWriter(filename, engine="openpyxl") as writer:
        hubs.to_excel(writer,  sheet_name="Depots_List",    index=False)
        zones.to_excel(writer, sheet_name="Customer_Zones", index=False)
        fleet.to_excel(writer, sheet_name="Vehicle_Fleet",  index=False)

    print(f"[1] Created '{filename}'")
    print("    Sheets  : Depots_List | Customer_Zones | Vehicle_Fleet")
    print("    Missing : OD Matrix, Assignments (engine will derive both)\n")


def run_drill(filename: str = FILENAME) -> None:
    from hubris.ingestion.excel_connector import ExcelDataConnector
    from hubris.ingestion.schema_mapper import NeedsConfirmationError

    connector = ExcelDataConnector()

    # ── ATTEMPT 1: blind load ─────────────────────────────────────────────
    print("[2] ATTEMPT 1 — blind load (no LLM, no overrides)…")
    first_error: NeedsConfirmationError | None = None
    try:
        raw = connector.load(filename, use_llm=False)
        # If we somehow get here the fuzzy matcher resolved everything.
        print("    Loaded without errors — fuzzy matcher covered all fields.")
        _print_stats(raw)
        return
    except NeedsConfirmationError as exc:
        first_error = exc
        print(f"    NeedsConfirmationError raised for table='{exc.table}'")
        print("    The system stopped and is asking the operator to confirm:")
        for field, (best_guess, score) in exc.ambiguous_fields.items():
            print(f"      {field:18s}  best guess: {str(best_guess):<28s}  confidence: {score:.2f}")
    except ValueError as exc:
        print(f"    ERROR (sheet not found): {exc}")
        sys.exit(1)

    # ── ATTEMPT 2: with operator-supplied overrides ───────────────────────
    print("\n[3] ATTEMPT 2 — reloading with operator-supplied column overrides…")

    # These mirror what a planner would click through in the confirmation UI
    # (T-18). All three tables need overrides because the connector processes
    # them in sequence and would stop again on the next ambiguous table.
    overrides = {
        "hubs": {
            "id":            "Depot_Ref",       # code-style IDs never fuzzy-match well
            "fixed_cost":    "Depot_Rent_AED",  # "Depot Rent" ≠ "fixed cost"
            "handling_cost": "Sorting_Fee",     # "Sorting Fee" ≠ "handling cost"
        },
        "zones": {
            "id":     "Zone_Code",        # code-style ID
            "demand": "Daily_Deliveries", # "deliveries" ≠ "demand"
        },
        "fleet_types": {
            "id": "Fleet_Code",           # code-style ID
        },
    }

    for table, mapping in overrides.items():
        for canonical, raw_col in mapping.items():
            print(f"    {table}.{canonical:18s} <- '{raw_col}'")

    print()
    raw = connector.load(filename, use_llm=False, column_overrides=overrides)
    print("    Loaded successfully with overrides\n")
    _print_stats(raw)


def _print_stats(raw) -> None:
    print("=" * 60)
    print("  RawTables")
    print("=" * 60)
    print(f"  Hubs       : {len(raw.hubs)}")
    for h in raw.hubs:
        print(f"    {h.get('id', '?'):4s}  {h.get('name', '?'):<22s}"
              f"  cap={h.get('capacity', '?'):>5}  emirate={h.get('emirate', '?')}")
    print(f"  Zones      : {len(raw.zones)}")
    for z in raw.zones:
        print(f"    {z.get('id', '?'):4s}  {z.get('name', '?'):<22s}"
              f"  demand={z.get('demand', '?'):>5}")
    print(f"  Fleet      : {len(raw.fleet_types)}")
    for f in raw.fleet_types:
        print(f"    {f.get('id', '?'):4s}  {f.get('name', '?'):<22s}"
              f"  cost/km={f.get('cost_per_km', '?')}")
    n_hubs  = len(raw.hubs)
    n_zones = len(raw.zones)
    print(f"  OD Matrix  : {len(raw.od_matrix)} pairs"
          f"  (derived: {n_hubs} hubs x {n_zones} zones)")
    print(f"  Assignments: {len(raw.current_assignments)} rows"
          f"  (derived nearest-hub baseline)")
    print("=" * 60)


if __name__ == "__main__":
    generate_messy_excel()
    run_drill()
