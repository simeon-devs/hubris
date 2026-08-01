"""H3 hex aggregation (T-19; SCHEMA.md §2's ingestion strategy). Real-world
demand data often arrives as many raw, granular customer points rather
than the clean zones this system otherwise assumes — this aggregates them
onto an H3 hex grid instead of trusting whatever granularity a raw dataset
happens to provide."""

import h3

DEFAULT_H3_RESOLUTION = 7  # ~1.2km hex edge length; tune per dataset density


def aggregate_to_h3_zones(points: list[dict], resolution: int = DEFAULT_H3_RESOLUTION) -> list[dict]:
    """Groups raw demand points (each a dict with lat/lon/demand/emirate,
    optionally sla_hours) into H3 hex cells: demand sums, sla_hours takes
    the tightest (most conservative) value seen in the cell, and the
    cell's own centroid becomes the zone's coordinates. Returns
    canonical-shaped zone rows (SCHEMA.md's zones table)."""
    cells: dict[str, dict] = {}

    for point in points:
        cell_id = h3.latlng_to_cell(point["lat"], point["lon"], resolution)
        if cell_id not in cells:
            lat, lon = h3.cell_to_latlng(cell_id)
            cells[cell_id] = {
                "id": f"H3-{cell_id}",
                "name": f"Zone {cell_id}",
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "emirate": point.get("emirate", ""),
                "demand": 0.0,
                "sla_hours": point.get("sla_hours", 24.0),
            }
        cell = cells[cell_id]
        cell["demand"] += point["demand"]
        cell["sla_hours"] = min(cell["sla_hours"], point.get("sla_hours", 24.0))

    return list(cells.values())
