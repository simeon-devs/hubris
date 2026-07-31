"""Integration test: synthetic data persists to Postgres and reloads exactly
(T-05's done-when). Requires a live db reachable via DATABASE_URL — run via
Docker Compose (see TASKS.md's T-05 log for the exact command), not in the
plain unit-test run.
"""

from hubris.core.db import Base, SessionLocal, engine
from hubris.core.db_loader import load_raw_tables, read_raw_tables
from hubris.data.synthetic import generate_synthetic_raw_tables


def _clear_all_tables() -> None:
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


def test_synthetic_data_persists_and_reloads():
    raw = generate_synthetic_raw_tables()

    _clear_all_tables()
    session = SessionLocal()
    try:
        load_raw_tables(session, raw)
        reloaded = read_raw_tables(session)
    finally:
        session.close()

    def _sort_key(table: list[dict], keys: tuple[str, ...]) -> list[dict]:
        return sorted(table, key=lambda row: tuple(row[k] for k in keys))

    assert _sort_key(reloaded.hubs, ("id",)) == _sort_key(raw.hubs, ("id",))
    assert _sort_key(reloaded.zones, ("id",)) == _sort_key(raw.zones, ("id",))
    assert _sort_key(reloaded.fleet_types, ("id",)) == _sort_key(raw.fleet_types, ("id",))
    assert _sort_key(reloaded.od_matrix, ("from_id", "to_id")) == _sort_key(
        raw.od_matrix, ("from_id", "to_id")
    )
    assert _sort_key(reloaded.current_assignments, ("zone_id", "hub_id")) == _sort_key(
        raw.current_assignments, ("zone_id", "hub_id")
    )

    _clear_all_tables()
