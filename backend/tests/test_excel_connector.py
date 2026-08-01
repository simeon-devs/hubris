from hubris.core.contracts import NetworkModel
from hubris.ingestion.excel_connector import ExcelDataConnector
from hubris.ingestion.schema_mapper import NeedsConfirmationError, fuzzy_match_column
from tests.fixtures.messy_excel import (
    AMBIGUOUS_ZONES_ROWS,
    FLEET_ROWS,
    GRANULAR_ZONES_ROWS,
    HUBS_ROWS,
    ZONES_ROWS,
    build_workbook,
)


def test_can_handle_scores_by_extension():
    connector = ExcelDataConnector()
    assert connector.can_handle("data/sheet.xlsx") == 1.0
    assert connector.can_handle("data/sheet.xls") == 1.0
    assert connector.can_handle("data/sheet.csv") == 0.0


def test_fuzzy_match_column_finds_renamed_fields():
    columns = ["Hub ID", "Hub Name", "Max Capacity", "Fixed Cost (AED)"]
    column, score = fuzzy_match_column(columns, "capacity")
    assert column == "Max Capacity"
    assert score >= 0.9


def test_load_maps_messy_columns_and_derives_missing_tables():
    workbook = build_workbook({"Hubs": HUBS_ROWS, "Zones": ZONES_ROWS, "Fleet": FLEET_ROWS})
    raw = ExcelDataConnector().load(workbook, use_llm=False)

    hubs_by_id = {h["id"]: h for h in raw.hubs}
    assert set(hubs_by_id) == {"H1", "H2"}
    assert hubs_by_id["H1"]["capacity"] == 100.0
    assert hubs_by_id["H1"]["fixed_cost"] == 1000.0
    assert hubs_by_id["H1"]["handling_cost"] == 2.0
    assert hubs_by_id["H1"]["emirate"] == "Dubai"
    assert hubs_by_id["H2"]["fixed_cost"] == 900.0

    zones_by_id = {z["id"]: z for z in raw.zones}
    assert set(zones_by_id) == {"Z1", "Z2", "Z3"}
    assert zones_by_id["Z2"]["demand"] == 20.0
    assert zones_by_id["Z3"]["emirate"] == "Abu Dhabi"

    assert len(raw.fleet_types) == 1
    assert raw.fleet_types[0]["cost_per_km"] == 1.5
    assert raw.fleet_types[0]["hub_id"] == "H1"

    # No od_matrix / current_assignments sheets were supplied -> derived.
    assert len(raw.od_matrix) == len(raw.hubs) * len(raw.zones)
    od_by_pair = {(row["from_id"], row["to_id"]): row for row in raw.od_matrix}
    assert od_by_pair[("H1", "Z1")]["cost"] < od_by_pair[("H1", "Z3")]["cost"]  # Z1 is near H1
    assert od_by_pair[("H2", "Z3")]["cost"] < od_by_pair[("H2", "Z1")]["cost"]  # Z3 is near H2
    assert all(row["distance_km"] > 0 for row in raw.od_matrix)

    demand_by_zone = {z["id"]: z["demand"] for z in raw.zones}
    assigned_by_zone: dict[str, float] = {}
    for row in raw.current_assignments:
        assigned_by_zone[row["zone_id"]] = assigned_by_zone.get(row["zone_id"], 0.0) + row["volume"]
    assert assigned_by_zone == demand_by_zone

    # Ample capacity at both hubs -> no splitting needed, and geography puts
    # Z1/Z2 with H1 (both Dubai-side) and Z3 with H2 (Abu Dhabi-side).
    assignment_hub = {row["zone_id"]: row["hub_id"] for row in raw.current_assignments}
    assert assignment_hub == {"Z1": "H1", "Z2": "H1", "Z3": "H2"}

    # Downstream reads only canonical tables — prove the output hydrates.
    model = NetworkModel.from_raw_tables(raw)
    assert len(model.hubs) == 2
    assert len(model.zones) == 3
    assert model.assignments == {"Z1": "H1", "Z2": "H1", "Z3": "H2"}


def test_load_gracefully_skips_llm_without_api_key():
    # Default use_llm=True, but no ANTHROPIC_API_KEY in this test env — the
    # LLM proposer must no-op, not crash or hang on a network call.
    workbook = build_workbook({"Hubs": HUBS_ROWS, "Zones": ZONES_ROWS, "Fleet": FLEET_ROWS})
    raw = ExcelDataConnector().load(workbook)
    assert len(raw.hubs) == 2


def test_ambiguous_required_column_needs_confirmation_then_override_resolves_it():
    workbook = build_workbook({"Hubs": HUBS_ROWS, "Zones": AMBIGUOUS_ZONES_ROWS, "Fleet": FLEET_ROWS})

    raised = False
    try:
        ExcelDataConnector().load(workbook, use_llm=False)
    except NeedsConfirmationError as exc:
        raised = True
        assert exc.table == "zones"
        assert "id" in exc.ambiguous_fields
        assert "emirate" in exc.ambiguous_fields
    assert raised, "expected NeedsConfirmationError for the ambiguous 'Zone Code'/'Region' columns"

    workbook.seek(0)
    raw = ExcelDataConnector().load(
        workbook,
        use_llm=False,
        column_overrides={"zones": {"id": "Zone Code", "emirate": "Region"}},
    )
    assert {z["id"] for z in raw.zones} == {"Z1", "Z2", "Z3"}
    assert {z["emirate"] for z in raw.zones} == {"Dubai", "Abu Dhabi"}


def test_aggregate_zones_to_h3_collapses_granular_points_when_enabled():
    workbook = build_workbook(
        {"Hubs": HUBS_ROWS, "Zones": GRANULAR_ZONES_ROWS, "Fleet": FLEET_ROWS}
    )

    raw = ExcelDataConnector().load(
        workbook, use_llm=False, aggregate_zones_to_h3=True, h3_resolution=5
    )

    # P1 (25.200, 55.300) and P2 (25.201, 55.301) fall in the same H3 res-5
    # cell (see tests/test_h3_zoning.py); P3 is far away -> 2 zones, not 3.
    assert len(raw.zones) == 2
    demands = sorted(z["demand"] for z in raw.zones)
    assert demands == [7.0, 25.0]  # P1+P2 summed to 25, P3 alone at 7

    merged_zone = next(z for z in raw.zones if z["demand"] == 25.0)
    assert merged_zone["id"].startswith("H3-")
    assert merged_zone["sla_hours"] == 12.0  # tightest of P1's 24 and P2's 12

    # Downstream still hydrates cleanly with the collapsed zone set.
    model = NetworkModel.from_raw_tables(raw)
    assert len(model.zones) == 2


def test_aggregate_zones_to_h3_disabled_by_default_keeps_zones_ungrouped():
    workbook = build_workbook(
        {"Hubs": HUBS_ROWS, "Zones": GRANULAR_ZONES_ROWS, "Fleet": FLEET_ROWS}
    )

    raw = ExcelDataConnector().load(workbook, use_llm=False)

    # Without the flag, the near-duplicate points stay as 3 separate zones —
    # proving the default behavior (and every other existing test in this
    # file) is unchanged by the new parameter.
    assert len(raw.zones) == 3
    assert {z["id"] for z in raw.zones} == {"P1", "P2", "P3"}
