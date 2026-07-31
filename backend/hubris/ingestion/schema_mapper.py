"""Schema-agnostic column mapping (SCHEMA.md §2).

We never hard-code raw column names. Each sheet's columns are fuzzy-matched
against the canonical field names for a table; anything left ambiguous can
be escalated to an LLM proposal (the one place an LLM touches ingestion —
it only *proposes* a mapping, with a confidence score, never transforms
data), and anything still ambiguous after that needs a human confirm.
"""

import os
from dataclasses import dataclass, field

from rapidfuzz import fuzz

# Canonical fields per table, per SCHEMA.md §1. Fields not listed in
# REQUIRED_FIELDS are optional / have a sensible default downstream.
CANONICAL_FIELDS: dict[str, list[str]] = {
    "hubs": [
        "id",
        "name",
        "lat",
        "lon",
        "emirate",
        "capacity",
        "fixed_cost",
        "handling_cost",
        "status",
    ],
    "zones": ["id", "name", "lat", "lon", "emirate", "demand", "sla_hours"],
    "fleet_types": [
        "id",
        "name",
        "capacity",
        "cost_per_km",
        "fixed_cost",
        "count_available",
        "hub_id",
    ],
    "od_matrix": ["from_id", "to_id", "distance_km", "time_min", "cost"],
    "current_assignments": ["zone_id", "hub_id", "volume"],
}

REQUIRED_FIELDS: dict[str, list[str]] = {
    "hubs": ["id", "name", "lat", "lon", "emirate", "capacity", "fixed_cost", "handling_cost"],
    "zones": ["id", "name", "lat", "lon", "emirate", "demand"],
    "fleet_types": ["id", "name", "capacity", "cost_per_km", "fixed_cost", "count_available"],
    "od_matrix": ["from_id", "to_id", "distance_km", "cost"],
    "current_assignments": ["zone_id", "hub_id", "volume"],
}

# Sheet-name synonyms per table — used to decide *which sheet* is which
# table before mapping its columns. Real workbooks almost always name sheets
# descriptively; this is a much stronger signal than column overlap, since
# e.g. hubs and zones both have id/name/lat/lon/emirate-shaped columns and
# are easy to confuse on columns alone.
TABLE_SHEET_SYNONYMS: dict[str, list[str]] = {
    "hubs": ["hubs", "hub", "facilities", "facility", "warehouses", "depots"],
    "zones": ["zones", "zone", "demand", "customers", "customer"],
    "fleet_types": ["fleet types", "fleet", "vehicles", "vehicle types", "fleet mix"],
    "od_matrix": ["od matrix", "distances", "routes", "lanes"],
    "current_assignments": ["current assignments", "assignments", "baseline"],
}

DEFAULT_CONFIDENCE_THRESHOLD = 0.6


class NeedsConfirmationError(Exception):
    """Raised when required canonical fields remain ambiguous after fuzzy +
    LLM-assisted matching, and no human-supplied override resolves them.
    `ambiguous_fields` maps canonical field -> (best_guess_column, score)."""

    def __init__(self, table: str, ambiguous_fields: dict[str, tuple[str | None, float]]):
        self.table = table
        self.ambiguous_fields = ambiguous_fields
        super().__init__(
            f"Low-confidence column mapping for table '{table}': {ambiguous_fields}"
        )


@dataclass
class ColumnMapping:
    # canonical field -> raw column name
    mapping: dict[str, str] = field(default_factory=dict)
    # canonical field -> confidence score (0..1)
    confidence: dict[str, float] = field(default_factory=dict)


def _normalize(name: str) -> str:
    return name.strip().lower().replace("_", " ").replace("-", " ")


def fuzzy_score(a: str, b: str) -> float:
    a, b = _normalize(a), _normalize(b)
    # WRatio handles length/substring differences well ("Latitude" vs "lat");
    # token_set_ratio handles reordered/extra tokens well ("Fixed Cost (AED)"
    # vs "fixed cost"). Taking the max of both is more robust than either
    # alone against real-world header naming.
    return max(fuzz.WRatio(a, b), fuzz.token_set_ratio(a, b)) / 100.0


def fuzzy_match_column(raw_columns: list[str], canonical_field: str) -> tuple[str | None, float]:
    """Best raw column for a canonical field, by fuzzy name similarity."""
    if not raw_columns:
        return None, 0.0
    scored = [(col, fuzzy_score(col, canonical_field)) for col in raw_columns]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[0]


def best_sheet_name_score(sheet_name: str, table: str) -> float:
    return max(fuzzy_score(sheet_name, synonym) for synonym in TABLE_SHEET_SYNONYMS[table])


def fuzzy_match_table(
    columns: list[str], canonical_fields: list[str], threshold: float = DEFAULT_CONFIDENCE_THRESHOLD
) -> ColumnMapping:
    """Greedy column assignment: canonical fields are matched in order of
    their own best score, so a strong match claims its column before a
    weaker one can (a raw column is used for at most one field)."""
    candidates = {
        canonical: fuzzy_match_column(columns, canonical) for canonical in canonical_fields
    }
    order = sorted(candidates, key=lambda field_name: candidates[field_name][1], reverse=True)

    result = ColumnMapping()
    used_columns: set[str] = set()
    for canonical in order:
        column, score = candidates[canonical]
        if column in used_columns:
            # Column already claimed by a stronger match — no second-best
            # fallback here; this field stays unmapped (score 0) and will
            # surface as ambiguous if required.
            result.confidence[canonical] = 0.0
            continue
        if score >= threshold:
            result.mapping[canonical] = column
            used_columns.add(column)
        result.confidence[canonical] = score

    return result


def propose_column_mapping_llm(
    columns: list[str],
    sample_values: dict[str, list],
    canonical_fields: list[str],
) -> dict[str, tuple[str, float]]:
    """Ask Claude to propose column mappings for fields fuzzy-matching left
    ambiguous. Proposes only — never transforms data. Returns {} (a pure
    no-op fallback) if there's no API key, the package isn't available, or
    the call fails for any reason; ingestion must never hard-depend on this.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {}

    try:
        import json

        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        prompt = (
            "You are mapping spreadsheet columns to a canonical logistics schema. "
            f"Canonical fields needed: {canonical_fields}. "
            f"Available raw columns with sample values: {sample_values}. "
            "Reply with ONLY a JSON object mapping each canonical field to "
            '{"column": "<raw column name or null>", "confidence": <0..1>}. '
            "No prose, no markdown fences."
        )
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        proposals = json.loads(text)
        return {
            field_name: (proposal["column"], float(proposal["confidence"]))
            for field_name, proposal in proposals.items()
            if proposal.get("column")
        }
    except Exception:
        return {}


def resolve_table_mapping(
    table: str,
    columns: list[str],
    sample_values: dict[str, list],
    column_overrides: dict[str, str] | None = None,
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
    use_llm: bool = True,
) -> ColumnMapping:
    """Full pipeline for one table: fuzzy match -> LLM-assisted proposal for
    ambiguous required fields -> apply human overrides -> raise if required
    fields are still unresolved."""
    canonical_fields = CANONICAL_FIELDS[table]
    required = REQUIRED_FIELDS[table]

    mapping = fuzzy_match_table(columns, canonical_fields, threshold)

    still_ambiguous = [f for f in required if f not in mapping.mapping]
    if still_ambiguous and use_llm:
        llm_proposals = propose_column_mapping_llm(columns, sample_values, still_ambiguous)
        for field_name, (column, score) in llm_proposals.items():
            if score >= threshold and column in columns:
                mapping.mapping[field_name] = column
                mapping.confidence[field_name] = score

    if column_overrides:
        for field_name, column in column_overrides.items():
            mapping.mapping[field_name] = column
            mapping.confidence[field_name] = 1.0

    unresolved = {
        f: (fuzzy_match_column(columns, f)[0], mapping.confidence.get(f, 0.0))
        for f in required
        if f not in mapping.mapping
    }
    if unresolved:
        raise NeedsConfirmationError(table, unresolved)

    return mapping
