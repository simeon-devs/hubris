"""Excel -> canonical `RawTables` (SCHEMA.md §2). Schema-agnostic: never
reads a raw column name directly — everything goes through the fuzzy/LLM
column mapper in `schema_mapper.py`. Missing optional tables are derived
(od_matrix via haversine + cost formula, current_assignments via the
nearest-hub-with-capacity baseline) rather than failing.
"""

from typing import Any

import pandas as pd

from hubris.core.contracts import DataConnector
from hubris.core.models import RawTables
from hubris.core.registry import register_data_connector
from hubris.engine.baseline import build_nearest_hub_baseline
from hubris.engine.geo import road_distance_km
from hubris.engine.h3_zoning import DEFAULT_H3_RESOLUTION, aggregate_to_h3_zones
from hubris.ingestion.schema_mapper import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    best_sheet_name_score,
    resolve_table_mapping,
)

AVG_SPEED_KMH = 40.0

NUMERIC_FIELDS = {
    "lat",
    "lon",
    "capacity",
    "fixed_cost",
    "handling_cost",
    "demand",
    "sla_hours",
    "cost_per_km",
    "distance_km",
    "time_min",
    "cost",
    "volume",
}
INT_FIELDS = {"count_available"}


def _coerce_value(field_name: str, value: Any) -> Any:
    if field_name in NUMERIC_FIELDS:
        return float(value)
    if field_name in INT_FIELDS:
        return int(value)
    if pd.isna(value):
        return None
    return str(value)


@register_data_connector
class ExcelDataConnector(DataConnector):
    name = "excel"

    def can_handle(self, source: Any) -> float:
        return 1.0 if str(source).lower().endswith((".xlsx", ".xls")) else 0.0

    def load(
        self,
        source: Any,
        sheet_map: dict[str, str] | None = None,
        column_overrides: dict[str, dict[str, str]] | None = None,
        threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
        use_llm: bool = True,
        aggregate_zones_to_h3: bool = False,
        h3_resolution: int = DEFAULT_H3_RESOLUTION,
    ) -> RawTables:
        sheets = pd.read_excel(source, sheet_name=None)
        sheet_map = sheet_map or {}
        column_overrides = column_overrides or {}

        hubs = self._load_table(
            "hubs", sheets, sheet_map, column_overrides, threshold, use_llm
        )
        zones = self._load_table(
            "zones", sheets, sheet_map, column_overrides, threshold, use_llm
        )
        if aggregate_zones_to_h3:
            # Real demand data often arrives as many raw customer points
            # rather than clean zones — collapse it onto an H3 hex grid
            # instead of trusting whatever granularity the sheet happens
            # to provide (SCHEMA.md §2).
            zones = aggregate_to_h3_zones(zones, resolution=h3_resolution)
        fleet_types = self._load_table(
            "fleet_types", sheets, sheet_map, column_overrides, threshold, use_llm
        )

        distances: dict[tuple[str, str], float] = {}
        od_sheet_name = self._find_best_sheet("od_matrix", sheets, sheet_map)
        if od_sheet_name is not None:
            od_matrix = self._load_table(
                "od_matrix", sheets, sheet_map, column_overrides, threshold, use_llm
            )
            for row in od_matrix:
                distances[(row["from_id"], row["to_id"])] = row["distance_km"]
        else:
            # No od_matrix sheet -> derive it (SCHEMA.md §2: "no distances ->
            # compute from coordinates: haversine x ~1.3 fallback"; "no cost
            # model -> cost = distance x cost_per_km + handling_cost").
            reference_cost_per_km = (
                fleet_types[0]["cost_per_km"] if fleet_types else 1.5
            )
            od_matrix = []
            for hub in hubs:
                for zone in zones:
                    distance_km = round(
                        road_distance_km(hub["lat"], hub["lon"], zone["lat"], zone["lon"]), 2
                    )
                    time_min = round(distance_km / AVG_SPEED_KMH * 60, 1)
                    cost = round(distance_km * reference_cost_per_km + hub["handling_cost"], 2)
                    distances[(hub["id"], zone["id"])] = distance_km
                    od_matrix.append(
                        {
                            "from_id": hub["id"],
                            "to_id": zone["id"],
                            "distance_km": distance_km,
                            "time_min": time_min,
                            "cost": cost,
                        }
                    )

        ca_sheet_name = self._find_best_sheet("current_assignments", sheets, sheet_map)
        if ca_sheet_name is not None:
            current_assignments = self._load_table(
                "current_assignments", sheets, sheet_map, column_overrides, threshold, use_llm
            )
        else:
            # No current_assignments sheet -> reconstruct the status-quo
            # proxy (SCHEMA.md §2).
            current_assignments = build_nearest_hub_baseline(hubs, zones, distances)

        return RawTables(
            hubs=hubs,
            zones=zones,
            fleet_types=fleet_types,
            od_matrix=od_matrix,
            current_assignments=current_assignments,
        )

    def _find_best_sheet(
        self,
        table: str,
        sheets: dict[str, pd.DataFrame],
        sheet_map: dict[str, str],
        min_score: float = 0.8,
    ) -> str | None:
        """Which sheet is this table? Matched primarily by sheet NAME against
        `TABLE_SHEET_SYNONYMS` — a much stronger signal than column overlap,
        since e.g. hubs and zones both have id/name/lat/lon/emirate-shaped
        columns and are easy to confuse on columns alone."""
        if table in sheet_map:
            return sheet_map[table]

        best_name, best_score = None, -1.0
        for sheet_name in sheets:
            score = best_sheet_name_score(str(sheet_name), table)
            if score > best_score:
                best_name, best_score = sheet_name, score

        return best_name if best_score >= min_score else None

    def _load_table(
        self,
        table: str,
        sheets: dict[str, pd.DataFrame],
        sheet_map: dict[str, str],
        column_overrides: dict[str, dict[str, str]],
        threshold: float,
        use_llm: bool,
    ) -> list[dict]:
        sheet_name = self._find_best_sheet(table, sheets, sheet_map)
        if sheet_name is None:
            raise ValueError(f"No sheet found for required table '{table}'")

        df = sheets[sheet_name]
        columns = list(df.columns)
        sample_values = {col: df[col].dropna().head(3).tolist() for col in columns}

        col_mapping = resolve_table_mapping(
            table,
            columns,
            sample_values,
            column_overrides.get(table),
            threshold,
            use_llm,
        )

        rows = []
        for _, row in df.iterrows():
            rows.append(
                {
                    canonical_field: _coerce_value(canonical_field, row[raw_col])
                    for canonical_field, raw_col in col_mapping.mapping.items()
                }
            )
        return rows
