"""POST /ingest — upload an Excel workbook, map it to canonical tables
(T-06's `ExcelDataConnector`), and replace the current baseline. Schema-
agnostic: never reads a raw column name directly."""

import io

from fastapi import APIRouter, HTTPException, UploadFile

from hubris.api.schemas import IngestResponse
from hubris.api.state import state
from hubris.core.contracts import NetworkModel
from hubris.engine.h3_zoning import DEFAULT_H3_RESOLUTION
from hubris.ingestion.excel_connector import ExcelDataConnector
from hubris.ingestion.schema_mapper import NeedsConfirmationError

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile,
    aggregate_zones_to_h3: bool = False,
    h3_resolution: int = DEFAULT_H3_RESOLUTION,
) -> IngestResponse:
    """T-35: `aggregate_zones_to_h3=true` collapses granular demand points
    onto an H3 hex grid at `h3_resolution` during ingest — previously built
    (T-19) but unreachable from any endpoint. Off by default: clean zone
    data passes through untouched."""
    content = await file.read()
    try:
        raw = ExcelDataConnector().load(
            io.BytesIO(content),
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
            },
        ) from exc

    model = NetworkModel.from_raw_tables(raw)
    state.reset_baseline(model)

    return IngestResponse(
        hubs=len(raw.hubs),
        zones=len(raw.zones),
        fleet_types=len(raw.fleet_types),
        od_matrix=len(raw.od_matrix),
        current_assignments=len(raw.current_assignments),
    )
