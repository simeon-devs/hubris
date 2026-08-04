"""T-38: the learning twin's memory core.

Three properties matter and each gets its own proof:
1. Round-trip — an episode written is an episode recalled, with provenance.
2. Restart survival — a SECOND store with a FRESH engine (a new process,
   as far as Postgres can tell) reads what the first wrote. This is the
   test that the Postgres layer is genuinely load-bearing, not decorative.
3. Graceful degradation — with the DB unreachable, record returns None,
   recall returns [], available() is False, and the /simulate demo path
   still returns 200. Memory can never be a new failure mode (build rule 4).

Live-DB tests follow test_db.py's convention: they need the compose db
(DATABASE_URL) and are run via the documented docker command.
"""

import uuid

import pytest
from sqlalchemy import create_engine

from hubris.core.db import DATABASE_URL
from hubris.memory.store import PostgresMemoryStore, _confidence

UNREACHABLE_DSN = "postgresql+psycopg2://nobody:nothing@127.0.0.1:1/void"


def _live_store() -> PostgresMemoryStore:
    store = PostgresMemoryStore()
    if not store.available():
        pytest.skip("requires the live compose db (DATABASE_URL)")
    return store


def test_episode_roundtrip_with_provenance():
    store = _live_store()
    tag = uuid.uuid4().hex[:8]

    episode_id = store.record_episode(
        scenario_name=f"close_hub_{tag}",
        params={"hub_id": "H1"},
        kpis={"cost_to_serve": 63.0},
        outcome={"feasible": True},
        source="test",
    )
    assert episode_id is not None

    records = store.recall("episodic", {"scenario_name": f"close_hub_{tag}"}, limit=5)
    assert len(records) == 1
    rec = records[0]
    assert rec.kind == "episodic"
    assert rec.content["params"] == {"hub_id": "H1"}
    assert rec.content["kpis"]["cost_to_serve"] == 63.0
    assert rec.provenance.startswith("test:")  # every memory names its run


def test_episode_survives_a_process_restart():
    store_a = _live_store()
    tag = uuid.uuid4().hex[:8]
    store_a.record_episode(
        scenario_name=f"restart_probe_{tag}",
        params={"factor": 1.5},
        kpis={"cost_to_serve": 52.73},
        outcome={"feasible": True},
        source="test-restart",
    )

    # A brand-new store over a brand-new engine — as close to "the process
    # restarted" as an in-suite test can get: no shared pool, no shared
    # session, only the database itself carrying the memory.
    store_b = PostgresMemoryStore(engine=create_engine(DATABASE_URL, future=True))
    records = store_b.recall("episodic", {"scenario_name": f"restart_probe_{tag}"}, limit=5)
    assert len(records) == 1
    assert records[0].content["kpis"]["cost_to_serve"] == 52.73


def test_degraded_store_returns_safe_defaults_never_raises():
    dead = PostgresMemoryStore(engine=create_engine(UNREACHABLE_DSN, future=True))

    assert dead.available() is False
    assert dead.record_episode("x", {}, {}, {}, source="test") is None
    assert dead.recall("episodic") == []
    assert dead.bump_applied(["anything"]) is None
    assert dead.set_heuristic_active("anything", False) is False


def test_recall_rejects_unknown_kind_loudly():
    # Programming errors are NOT swallowed — only infrastructure failures.
    dead = PostgresMemoryStore(engine=create_engine(UNREACHABLE_DSN, future=True))
    with pytest.raises(ValueError):
        dead.recall("nonsense")


def test_provenance_is_mandatory_even_when_db_is_down():
    dead = PostgresMemoryStore(engine=create_engine(UNREACHABLE_DSN, future=True))
    with pytest.raises(ValueError):
        dead.record_fact("k", {}, provenance="")
    with pytest.raises(ValueError):
        dead.record_heuristic("n", {"when": {}, "then": {}}, "r", "a", provenance="")


def test_heuristic_rule_must_be_machine_applicable():
    dead = PostgresMemoryStore(engine=create_engine(UNREACHABLE_DSN, future=True))
    with pytest.raises(ValueError):
        dead.record_heuristic("n", {"prose": "only"}, "r", "a", provenance="p:1")


def test_confidence_formula_is_transparent_and_capped():
    assert _confidence(1) == 0.5
    assert _confidence(3) == 0.7
    assert _confidence(20) == 0.95  # capped
