"""Nearest-open-hub-with-capacity baseline assignment (SCHEMA.md §2): the
status-quo proxy used whenever no `current_assignments` are given/found.
Splits a zone's demand across hubs if the nearest one doesn't have enough
capacity left — same shape as a real `current_assignments` table.
"""


def build_nearest_hub_baseline(
    hubs: list[dict], zones: list[dict], distance_km: dict[tuple[str, str], float]
) -> list[dict]:
    open_hub_ids = [h["id"] for h in hubs if h.get("status", "open") == "open"]
    remaining_capacity = {h["id"]: h["capacity"] for h in hubs if h["id"] in open_hub_ids}

    assignments: list[dict] = []
    for zone in zones:
        nearest_hub_ids = sorted(
            open_hub_ids, key=lambda hub_id: distance_km[(hub_id, zone["id"])]
        )
        remaining_demand = zone["demand"]
        for hub_id in nearest_hub_ids:
            if remaining_demand <= 0:
                break
            available = remaining_capacity[hub_id]
            if available <= 0:
                continue
            volume = min(available, remaining_demand)
            assignments.append({"zone_id": zone["id"], "hub_id": hub_id, "volume": volume})
            remaining_capacity[hub_id] -= volume
            remaining_demand -= volume
        if remaining_demand > 0:
            raise RuntimeError(
                f"Network under-capacity: zone {zone['id']} has {remaining_demand} "
                "unplaced demand. Total open-hub capacity is below total demand."
            )

    return assignments
