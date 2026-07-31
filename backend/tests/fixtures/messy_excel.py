"""Builds a small, deliberately messy in-memory Excel workbook for T-06's
ingestion tests: 2 hubs / 3 zones / 1 fleet type, renamed/typo'd columns,
no od_matrix or current_assignments sheets (to exercise the derivation
paths). Coordinates mirror `tests/fixtures/tiny_network.py`.
"""

import io

import pandas as pd

HUBS_ROWS = [
    {
        "Hub ID": "H1",
        "Hub Name": "Hub One",
        "Latitude": 25.2,
        "Longitude": 55.3,
        "Emirate": "Dubai",
        "Max Capacity": 100,
        "Fixed Cost (AED)": 1000,
        "Handling Cost/Parcel": 2.0,
    },
    {
        "Hub ID": "H2",
        "Hub Name": "Hub Two",
        "Latitude": 24.45,
        "Longitude": 54.4,
        "Emirate": "Abu Dhabi",
        "Max Capacity": 100,
        "Fixed Cost (AED)": 900,
        "Handling Cost/Parcel": 2.5,
    },
]

ZONES_ROWS = [
    {
        "Zone ID": "Z1",
        "Zone Name": "Zone One",
        "lat": 25.1,
        "lon": 55.2,
        "Emirate": "Dubai",
        "Parcel Demand": 30,
        "SLA (hrs)": 24,
    },
    {
        "Zone ID": "Z2",
        "Zone Name": "Zone Two",
        "lat": 25.3,
        "lon": 55.4,
        "Emirate": "Dubai",
        "Parcel Demand": 20,
        "SLA (hrs)": 24,
    },
    {
        "Zone ID": "Z3",
        "Zone Name": "Zone Three",
        "lat": 24.5,
        "lon": 54.5,
        "Emirate": "Abu Dhabi",
        "Parcel Demand": 10,
        "SLA (hrs)": 24,
    },
]

# Same 3 zones, but with "id" and "emirate" renamed to columns fuzzy matching
# won't confidently resolve — used to trigger NeedsConfirmationError.
AMBIGUOUS_ZONES_ROWS = [
    {**{k: v for k, v in row.items() if k not in ("Zone ID", "Emirate")}, "Zone Code": row["Zone ID"], "Region": row["Emirate"]}
    for row in ZONES_ROWS
]

FLEET_ROWS = [
    {
        "Fleet ID": "F1",
        "Fleet Name": "Van",
        "Veh Capacity": 50,
        "Cost per KM": 1.5,
        "Fixed Cost": 100,
        "Count Avail": 5,
        "Assigned Hub": "H1",
    },
]


def build_workbook(sheets: dict[str, list[dict]]) -> io.BytesIO:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        for sheet_name, rows in sheets.items():
            pd.DataFrame(rows).to_excel(writer, sheet_name=sheet_name, index=False)
    buffer.seek(0)
    return buffer
