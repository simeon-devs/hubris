"""POST /ingest — upload an Excel workbook, map it to canonical tables,
and replace the current baseline. Schema-agnostic: never reads a raw
column name directly.

T-28: the connector is chosen through the DataConnector REGISTRY —
`can_handle` scores every registered connector against the uploaded file
and the most specific winner loads it (Dataset G's fingerprint beats the
generic Excel path on its own file). `connector=` forces one explicitly.

Dataset G's approved twin split (Sims, 2026-08-05): `network=hub_spoke`
(default) replaces the BASELINE — the primary twin with the 3 candidate
hubs; `network=qcomm` loads the dark-store network as the saved scenario
`qcomm_twin`, so the two show SIDE BY SIDE in the existing scenario
picker without blending a single cost figure."""

import io

from fastapi import APIRouter, HTTPException, UploadFile

from hubris.api.schemas import IngestResponse
from hubris.api.state import state
from hubris.core.contracts import NetworkModel
from hubris.core.registry import DATA_CONNECTOR
from hubris.core.registry import registry as global_registry
from hubris.engine.h3_zoning import DEFAULT_H3_RESOLUTION
from hubris.ingestion.schema_mapper import NeedsConfirmationError

router = APIRouter()

QCOMM_SCENARIO_ID = "qcomm_twin"
QCOMM_SCENARIO_LABEL = "QComm twin (dark stores)"


def _pick_connector(content: bytes, filename: str, forced: str | None):
    connectors = global_registry.all(DATA_CONNECTOR)
    if forced:
        chosen = next((c for c in connectors if c.name == forced), None)
        if chosen is None:
            raise HTTPException(400, f"Unknown connector: {forced!r}")
        return chosen
    # Connectors sniff differently: the generic excel path scores the
    # FILENAME, Dataset G fingerprints the CONTENT. Offer both, take the max.
    def _score(c) -> float:
        return max(c.can_handle(io.BytesIO(content)), c.can_handle(filename or ""))

    scored = [(_score(c), c) for c in connectors]
    best_score = max((s for s, _ in scored), default=0.0)
    if best_score <= 0.0:
        raise HTTPException(422, "No registered connector can handle this file")
    # Specific connectors outrank the generic excel fallback on ties.
    candidates = [c for s, c in scored if s == best_score]
    return next((c for c in candidates if c.name != "excel"), candidates[0])


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile,
    aggregate_zones_to_h3: bool = False,
    h3_resolution: int = DEFAULT_H3_RESOLUTION,
    connector: str | None = None,
    network: str = "hub_spoke",
) -> IngestResponse:
    """T-35: `aggregate_zones_to_h3=true` collapses granular demand points
    onto an H3 hex grid at `h3_resolution` during ingest (generic excel
    path). Off by default: clean zone data passes through untouched."""
    content = await file.read()
    chosen = _pick_connector(content, file.filename or "", connector)

    kwargs: dict = {}
    if chosen.name == "excel":
        kwargs = {"aggregate_zones_to_h3": aggregate_zones_to_h3, "h3_resolution": h3_resolution}
    elif chosen.name == "dataset_g":
        kwargs = {"network": network}

    try:
        raw = chosen.load(io.BytesIO(content), **kwargs)
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
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    model = NetworkModel.from_raw_tables(raw)
    if chosen.name == "dataset_g" and network == "qcomm":
        # Side-by-side, never blended: QComm rides the scenario picker.
        state.save_scenario(QCOMM_SCENARIO_ID, model, label=QCOMM_SCENARIO_LABEL)
    else:
        state.reset_baseline(model)

    return IngestResponse(
        hubs=len(raw.hubs),
        zones=len(raw.zones),
        fleet_types=len(raw.fleet_types),
        od_matrix=len(raw.od_matrix),
        current_assignments=len(raw.current_assignments),
    )
