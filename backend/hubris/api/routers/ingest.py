"""POST /ingest — upload an Excel workbook, map it to canonical tables
(T-06's `ExcelDataConnector`), and replace the current baseline. Schema-
agnostic: never reads a raw column name directly.

Event-day recovery path: when mapping is ambiguous the 422 lists each
ambiguous field with the best guess — the caller re-submits with
`column_overrides` (JSON, `{table: {canonical_field: raw_column}}`) to
resolve exactly those fields. `aggregate_zones_to_h3=true` collapses raw
customer-point zones onto an H3 hex grid (T-19), now reachable from the API."""

import io
import json

from fastapi import APIRouter, Form, HTTPException, UploadFile

from hubris.agents.monitor import notify_state_changed
from hubris.api.schemas import IngestResponse
from hubris.api.state import state
from hubris.core.contracts import NetworkModel
from hubris.ingestion.excel_connector import ExcelDataConnector
from hubris.ingestion.schema_mapper import NeedsConfirmationError

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile,
    column_overrides: str | None = Form(default=None),
    aggregate_zones_to_h3: bool = Form(default=False),
    h3_resolution: int = Form(default=7),
) -> IngestResponse:
    content = await file.read()

    overrides: dict[str, dict[str, str]] | None = None
    if column_overrides:
        try:
            overrides = json.loads(column_overrides)
        except (TypeError, ValueError) as exc:
            raise HTTPException(400, f"column_overrides is not valid JSON: {exc}") from exc

    try:
        raw = ExcelDataConnector().load(
            io.BytesIO(content),
            column_overrides=overrides,
            aggregate_zones_to_h3=aggregate_zones_to_h3,
            h3_resolution=h3_resolution,
        )
    except NeedsConfirmationError as exc:
        raise HTTPException(
            422,
            {
                "message": "Column mapping needs confirmation",
                "table": exc.table,
                "ambiguous_fields": {
                    field: {"best_guess_column": guess, "confidence": score}
                    for field, (guess, score) in exc.ambiguous_fields.items()
                },
                "how_to_resolve": (
                    "Re-upload with a column_overrides form field, e.g. "
                    '{"hubs": {"fixed_cost": "Depot_Rent_AED"}}'
                ),
            },
        ) from exc

    model = NetworkModel.from_raw_tables(raw)
    state.reset_baseline(model)
    # A new baseline is exactly what monitoring agents exist to look at.
    notify_state_changed(model, trigger="ingest: new baseline dataset")

    return IngestResponse(
        hubs=len(raw.hubs),
        zones=len(raw.zones),
        fleet_types=len(raw.fleet_types),
        od_matrix=len(raw.od_matrix),
        current_assignments=len(raw.current_assignments),
    )
