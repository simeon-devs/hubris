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


# ---- the learning twin (T-38; SCHEMA.md §1a) ----
class MemoryEpisodeORM(Base):
    __tablename__ = "memory_episodes"

    id: Mapped[str] = mapped_column(primary_key=True)
    scenario_id: Mapped[str | None] = mapped_column(nullable=True)
    scenario_name: Mapped[str]
    params: Mapped[dict] = mapped_column(JSONB)
    kpis: Mapped[dict] = mapped_column(JSONB)
    outcome: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    provenance: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MemoryFactORM(Base):
    __tablename__ = "memory_facts"

    id: Mapped[str] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(unique=True)
    content: Mapped[dict] = mapped_column(JSONB)
    confidence: Mapped[float | None] = mapped_column(nullable=True)
    provenance: Mapped[str]
    observed_count: Mapped[int] = mapped_column(server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MemoryHeuristicORM(Base):
    __tablename__ = "memory_heuristics"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    rule: Mapped[dict] = mapped_column(JSONB)
    rationale: Mapped[str | None] = mapped_column(nullable=True)
    author: Mapped[str]
    provenance: Mapped[str]
    active: Mapped[bool] = mapped_column(server_default="true")
    times_applied: Mapped[int] = mapped_column(server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MemoryAlertORM(Base):
    __tablename__ = "memory_alerts"

    id: Mapped[str] = mapped_column(primary_key=True)
    agent_name: Mapped[str]
    severity: Mapped[str]
    finding: Mapped[dict] = mapped_column(JSONB)
    recommended_action: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    brief_id: Mapped[str | None] = mapped_column(nullable=True)
    acknowledged: Mapped[bool] = mapped_column(server_default="false")
    provenance: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
