"""T-38: the learning twin's Postgres-backed `MemoryStore` — the first
real runtime consumer of the DB layer the audit found dead.

Graceful by construction (build rule 4 / Sims' Wave-2 note): every public
method catches ALL database failures and returns its safe default
(None / False / []) — with memory empty or the DB unreachable, the rest of
the system behaves exactly as it did before memory existed. No new failure
mode can reach the demo path from here.

Provenance is mandatory at this boundary (CLAUDE.md §4: memory is
evidence, not a fabrication loophole): a record without it is rejected
with ValueError — deliberately NOT swallowed, because a missing-provenance
write is a programming error, not an infrastructure failure.
"""

import uuid

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from hubris.core.contracts import MemoryRecord, MemoryStore
from hubris.core.db import DATABASE_URL
from hubris.core.orm import (
    MemoryEpisodeORM,
    MemoryFactORM,
    MemoryHeuristicORM,
)

_KINDS = {"episodic", "semantic", "procedural"}


def _new_id() -> str:
    return uuid.uuid4().hex


def new_provenance(source: str) -> str:
    """One run id, e.g. 'simulate_scenario:3f2a...' — stamped on everything
    that run records so a memory always names the computation behind it."""
    return f"{source}:{uuid.uuid4().hex[:12]}"


class PostgresMemoryStore(MemoryStore):
    def __init__(self, engine=None):
        # Lazy: no connection is attempted at import/startup — the app must
        # boot fine with no database at all.
        self._engine = engine

    def _get_engine(self):
        if self._engine is None:
            self._engine = create_engine(DATABASE_URL, future=True, pool_pre_ping=True)
        return self._engine

    def available(self) -> bool:
        try:
            with self._get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:  # noqa: BLE001 — any failure means "not available"
            return False

    # ---- writes -------------------------------------------------------------
    def record_episode(
        self,
        scenario_name: str,
        params: dict,
        kpis: dict,
        outcome: dict,
        scenario_id: str | None = None,
        source: str = "api",
    ) -> str | None:
        provenance = new_provenance(source)
        try:
            with Session(self._get_engine()) as session:
                episode_id = _new_id()
                session.add(
                    MemoryEpisodeORM(
                        id=episode_id,
                        scenario_id=scenario_id,
                        scenario_name=scenario_name,
                        params=params,
                        kpis=kpis,
                        outcome=outcome,
                        provenance=provenance,
                    )
                )
                session.commit()
                return episode_id
        except Exception:  # noqa: BLE001 — graceful: recording is best-effort
            return None

    def record_fact(self, key: str, content: dict, provenance: str) -> str | None:
        if not provenance:
            raise ValueError("a fact without provenance is fabrication — refused")
        try:
            with Session(self._get_engine()) as session:
                existing = session.execute(
                    select(MemoryFactORM).where(MemoryFactORM.key == key)
                ).scalar_one_or_none()
                if existing is not None:
                    # Re-observation: upsert + confidence grows. A fact seen
                    # N times is not the same as one seen once (SCHEMA.md §1a).
                    existing.content = content
                    existing.provenance = provenance
                    existing.observed_count += 1
                    existing.confidence = _confidence(existing.observed_count)
                    existing.updated_at = text("now()")
                    session.commit()
                    return existing.id
                fact_id = _new_id()
                session.add(
                    MemoryFactORM(
                        id=fact_id,
                        key=key,
                        content=content,
                        provenance=provenance,
                        observed_count=1,
                        confidence=_confidence(1),
                    )
                )
                session.commit()
                return fact_id
        except ValueError:
            raise
        except Exception:  # noqa: BLE001
            return None

    def record_heuristic(
        self, name: str, rule: dict, rationale: str, author: str, provenance: str
    ) -> str | None:
        if not provenance:
            raise ValueError("a heuristic without provenance is fabrication — refused")
        if not isinstance(rule, dict) or "when" not in rule or "then" not in rule:
            raise ValueError("rule must be machine-applicable JSON: {'when': ..., 'then': ...}")
        try:
            with Session(self._get_engine()) as session:
                existing = session.execute(
                    select(MemoryHeuristicORM).where(MemoryHeuristicORM.name == name)
                ).scalar_one_or_none()
                if existing is not None:
                    existing.rule = rule
                    existing.rationale = rationale
                    existing.author = author
                    existing.provenance = provenance
                    session.commit()
                    return existing.id
                heuristic_id = _new_id()
                session.add(
                    MemoryHeuristicORM(
                        id=heuristic_id,
                        name=name,
                        rule=rule,
                        rationale=rationale,
                        author=author,
                        provenance=provenance,
                    )
                )
                session.commit()
                return heuristic_id
        except ValueError:
            raise
        except Exception:  # noqa: BLE001
            return None

    # ---- reads --------------------------------------------------------------
    def recall(self, kind: str, query: dict | None = None, limit: int = 10) -> list[MemoryRecord]:
        if kind not in _KINDS:
            raise ValueError(f"unknown memory kind: {kind!r} (one of {sorted(_KINDS)})")
        query = query or {}
        try:
            if kind == "episodic":
                return self._recall_episodes(query, limit)
            if kind == "semantic":
                return self._recall_facts(query, limit)
            return self._recall_heuristics(query, limit)
        except ValueError:
            raise
        except Exception:  # noqa: BLE001 — graceful: empty memory, not an error
            return []

    def _recall_episodes(self, query: dict, limit: int) -> list[MemoryRecord]:
        with Session(self._get_engine()) as session:
            stmt = select(MemoryEpisodeORM).order_by(MemoryEpisodeORM.created_at.desc())
            if query.get("scenario_name"):
                stmt = stmt.where(MemoryEpisodeORM.scenario_name == query["scenario_name"])
            rows = session.execute(stmt.limit(limit)).scalars().all()
            return [
                MemoryRecord(
                    kind="episodic",
                    key=row.id,
                    content={
                        "scenario_name": row.scenario_name,
                        "scenario_id": row.scenario_id,
                        "params": row.params,
                        "kpis": row.kpis,
                        "outcome": row.outcome,
                    },
                    provenance=row.provenance,
                    created_at=row.created_at.isoformat() if row.created_at else None,
                )
                for row in rows
            ]

    def _recall_facts(self, query: dict, limit: int) -> list[MemoryRecord]:
        with Session(self._get_engine()) as session:
            stmt = select(MemoryFactORM).order_by(MemoryFactORM.updated_at.desc())
            if query.get("key_prefix"):
                stmt = stmt.where(MemoryFactORM.key.startswith(query["key_prefix"]))
            rows = session.execute(stmt.limit(limit)).scalars().all()
            return [
                MemoryRecord(
                    kind="semantic",
                    key=row.key,
                    content={**row.content, "observed_count": row.observed_count},
                    provenance=row.provenance,
                    confidence=row.confidence,
                    created_at=row.updated_at.isoformat() if row.updated_at else None,
                )
                for row in rows
            ]

    def _recall_heuristics(self, query: dict, limit: int) -> list[MemoryRecord]:
        with Session(self._get_engine()) as session:
            stmt = select(MemoryHeuristicORM).order_by(MemoryHeuristicORM.created_at.desc())
            if query.get("active_only", True):
                stmt = stmt.where(MemoryHeuristicORM.active.is_(True))
            if query.get("tool"):
                # v1 rule matching: {"when": {"tool": "<name>"}}
                stmt = stmt.where(MemoryHeuristicORM.rule["when"]["tool"].astext == query["tool"])
            rows = session.execute(stmt.limit(limit)).scalars().all()
            return [
                MemoryRecord(
                    kind="procedural",
                    key=row.name,
                    content={
                        "rule": row.rule,
                        "rationale": row.rationale,
                        "author": row.author,
                        "active": row.active,
                        "times_applied": row.times_applied,
                    },
                    provenance=row.provenance,
                    created_at=row.created_at.isoformat() if row.created_at else None,
                )
                for row in rows
            ]

    def bump_applied(self, names: list[str]) -> None:
        """Best-effort counter so a planner can see which heuristics are
        actually influencing runs (SCHEMA.md §1a auditability)."""
        if not names:
            return
        try:
            with Session(self._get_engine()) as session:
                for row in session.execute(
                    select(MemoryHeuristicORM).where(MemoryHeuristicORM.name.in_(names))
                ).scalars():
                    row.times_applied += 1
                session.commit()
        except Exception:  # noqa: BLE001
            return

    def set_heuristic_active(self, name: str, active: bool) -> bool:
        try:
            with Session(self._get_engine()) as session:
                row = session.execute(
                    select(MemoryHeuristicORM).where(MemoryHeuristicORM.name == name)
                ).scalar_one_or_none()
                if row is None:
                    return False
                row.active = active
                session.commit()
                return True
        except Exception:  # noqa: BLE001
            return False


def _confidence(observed_count: int) -> float:
    """Transparent, monotone, capped: 0.5 on first observation, +0.1 per
    corroborating re-observation, ceiling 0.95. A stated formula, not a
    learned score — anyone can recompute it."""
    return round(min(0.95, 0.5 + 0.1 * (observed_count - 1)), 2)


memory = PostgresMemoryStore()
