"""Persist `RawTables` to the canonical Postgres tables and read them back
out, proving the schema round-trips (T-05's done-when)."""

from sqlalchemy.orm import Session

from hubris.core.models import RawTables
from hubris.core.orm import (
    CurrentAssignmentORM,
    FleetTypeORM,
    HubORM,
    ODMatrixORM,
    ZoneORM,
)


def load_raw_tables(session: Session, raw: RawTables) -> None:
    # Flush hubs/zones before anything with a FK to them — the unit of work
    # has no relationship() between these mappers to infer that ordering on
    # its own.
    session.add_all(HubORM(**row) for row in raw.hubs)
    session.add_all(ZoneORM(**row) for row in raw.zones)
    session.flush()

    session.add_all(FleetTypeORM(**row) for row in raw.fleet_types)
    session.add_all(ODMatrixORM(**row) for row in raw.od_matrix)
    session.add_all(CurrentAssignmentORM(**row) for row in raw.current_assignments)
    session.commit()


def _as_dict(row: object) -> dict:
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}  # type: ignore[attr-defined]


def read_raw_tables(session: Session) -> RawTables:
    return RawTables(
        hubs=[_as_dict(r) for r in session.query(HubORM).order_by(HubORM.id).all()],
        zones=[_as_dict(r) for r in session.query(ZoneORM).order_by(ZoneORM.id).all()],
        fleet_types=[
            _as_dict(r) for r in session.query(FleetTypeORM).order_by(FleetTypeORM.id).all()
        ],
        od_matrix=[
            _as_dict(r)
            for r in session.query(ODMatrixORM)
            .order_by(ODMatrixORM.from_id, ODMatrixORM.to_id)
            .all()
        ],
        current_assignments=[
            _as_dict(r)
            for r in session.query(CurrentAssignmentORM)
            .order_by(CurrentAssignmentORM.zone_id, CurrentAssignmentORM.hub_id)
            .all()
        ],
    )
