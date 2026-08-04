"""GET /assumptions — T-32's evidence-labelled input registry. Every
numeric engine input parameter, its value, its status (verified / derived
/ assumed), and its source — so "what does this number rest on?" is an API
call, not an archaeology dig. The `assumed` count is the honest measure of
how much must be replaced when the real dataset lands (T-28)."""

from fastapi import APIRouter

from hubris.core.assumptions import all_assumptions

router = APIRouter()


@router.get("/assumptions")
def get_assumptions() -> dict:
    entries = [a.model_dump() for a in all_assumptions()]
    by_status: dict[str, int] = {}
    for entry in entries:
        by_status[entry["status"]] = by_status.get(entry["status"], 0) + 1
    return {"assumptions": entries, "counts_by_status": by_status, "total": len(entries)}
