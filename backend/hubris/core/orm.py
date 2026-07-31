"""SQLAlchemy ORM models mirroring the canonical schema (SCHEMA.md §1).

Nothing downstream (engine, plugins, agents, UI) depends on raw source
column names — only on this canonical shape.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from hubris.core.db import Base


class HubORM(Base):
    __tablename__ = "hubs"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    lat: Mapped[float]
    lon: Mapped[float]
    emirate: Mapped[str]
    capacity: Mapped[float]
    fixed_cost: Mapped[float]
    handling_cost: Mapped[float]
    status: Mapped[str] = mapped_column(server_default="open")


class ZoneORM(Base):
    __tablename__ = "zones"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    lat: Mapped[float]
    lon: Mapped[float]
    emirate: Mapped[str]
    demand: Mapped[float]
    sla_hours: Mapped[float]


class FleetTypeORM(Base):
    __tablename__ = "fleet_types"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    capacity: Mapped[float]
    cost_per_km: Mapped[float]
    fixed_cost: Mapped[float]
    count_available: Mapped[int]
    hub_id: Mapped[str | None] = mapped_column(ForeignKey("hubs.id"), nullable=True)


class ODMatrixORM(Base):
    __tablename__ = "od_matrix"

    from_id: Mapped[str] = mapped_column(primary_key=True)  # hub id
    to_id: Mapped[str] = mapped_column(primary_key=True)  # zone id
    distance_km: Mapped[float]
    time_min: Mapped[float]
    cost: Mapped[float]  # unit serve cost, derived if absent


class CurrentAssignmentORM(Base):
    __tablename__ = "current_assignments"

    zone_id: Mapped[str] = mapped_column(ForeignKey("zones.id"), primary_key=True)
    hub_id: Mapped[str] = mapped_column(ForeignKey("hubs.id"), primary_key=True)
    volume: Mapped[float]


class ScenarioORM(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    params: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ScenarioResultORM(Base):
    __tablename__ = "scenario_results"

    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id"), primary_key=True)
    kpis: Mapped[dict] = mapped_column(JSONB)
    flows: Mapped[dict] = mapped_column(JSONB)
    duals: Mapped[dict] = mapped_column(JSONB)
