"""T-39: the twin LEARNS — semantic facts with growing confidence,
agent-written heuristics that are APPLIED in later runs, and the planner's
retire switch. Live-DB tests skip when the compose db is absent (same
convention as test_db.py / test_memory_store.py)."""

import uuid

import pytest
from sqlalchemy import create_engine

from hubris.agents.threshold_finder import find_demand_growth_break
from hubris.agents.tools.memory_tools import RecallMemoryTool, RecordHeuristicTool
from hubris.agents.tools.optimise_network import OptimiseNetworkTool
from hubris.agents.tool_adapter import to_langchain_tool
from hubris.core.contracts import NetworkModel
from hubris.core.registry import load_plugins
from hubris.memory.apply import apply_heuristics
from hubris.memory.store import PostgresMemoryStore, memory, new_provenance
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES)


def _require_db():
    if not memory.available():
        pytest.skip("requires the live compose db (DATABASE_URL)")


def test_fact_upsert_raises_confidence_on_reobservation():
    _require_db()
    key = f"test.fact.{uuid.uuid4().hex[:8]}"

    memory.record_fact(key, {"v": 1.0}, provenance=new_provenance("test"))
    memory.record_fact(key, {"v": 1.1}, provenance=new_provenance("test"))

    try:
        records = memory.recall("semantic", {"key_prefix": key}, limit=1)
        assert len(records) == 1
        rec = records[0]
        assert rec.content["observed_count"] == 2
        assert rec.confidence == 0.6  # 0.5 + 0.1 — the transparent formula
        assert rec.content["v"] == 1.1  # latest observation wins
    finally:
        _delete_fact(key)  # leave no test residue in the demo db


def _delete_fact(key: str) -> None:
    from sqlalchemy.orm import Session
    from hubris.core.orm import MemoryFactORM

    with Session(memory._get_engine()) as session:
        session.query(MemoryFactORM).filter(MemoryFactORM.key == key).delete()
        session.commit()


def test_threshold_finder_records_its_measured_break_as_a_fact():
    _require_db()
    model = _model()

    result = find_demand_growth_break(model, hub_id="H1")
    assert result["threshold_found"] is True

    records = memory.recall("semantic", {"key_prefix": "hub.H1.demand_growth_break"}, limit=1)
    assert records, "engine finding was not memorised"
    fact = records[0]
    # the fact stores EXACTLY the engine's computed threshold — numeric
    # memory is engine-written, with the run's provenance
    assert fact.content["growth_factor_threshold"] == result["growth_factor_threshold"]
    assert fact.provenance.startswith("engine:find_demand_growth_break:")


def test_record_heuristic_tool_rejects_numeric_advice():
    # The fabrication-loophole guard: an agent cannot stash figures in a
    # heuristic that later lands in other runs' evidence.
    result = RecordHeuristicTool().run(
        model=_model(),
        name=f"bad-{uuid.uuid4().hex[:6]}",
        when_tool="optimise_network",
        advice="Expect roughly 29088 AED of annual savings here.",
        rationale="numbers smuggled in",
    )
    assert result["recorded"] is False
    assert 29088.0 in [float(x) for x in [29088]]  # literal for clarity
    assert "number-free" in result["error"]


def test_heuristic_learn_apply_retire_full_loop():
    _require_db()
    model = _model()
    name = f"check-h5-band-{uuid.uuid4().hex[:6]}"

    # LEARN: agent-writable block, number-free advice, auto-stamped provenance
    recorded = RecordHeuristicTool().run(
        model=model,
        name=name,
        when_tool="optimise_network",
        advice="Before accepting a closure recommendation, inspect the most-utilised hub's robustness band first.",
        rationale="Stress runs showed the hottest hub binds first under regional demand growth.",
        author="risk_analyst",
    )
    assert recorded["recorded"] is True

    # APPLY: a LATER optimise run (through the same adapter chokepoint the
    # agents use) carries the annotation — the twin visibly using memory.
    lc_tool = to_langchain_tool(OptimiseNetworkTool(), model)
    result = lc_tool.func()
    applied = {h["name"]: h for h in result.get("applied_heuristics", [])}
    assert name in applied
    assert applied[name]["author"] == "risk_analyst"
    assert applied[name]["provenance"].startswith("agent:record_heuristic:risk_analyst:")

    # audit trail: times_applied moved
    rec = [r for r in memory.recall("procedural", {"tool": "optimise_network"}, 50) if r.key == name]
    assert rec and rec[0].content["times_applied"] >= 1

    # RETIRE: planner switches it off; it stops applying but is not deleted
    assert memory.set_heuristic_active(name, False) is True
    result2 = apply_heuristics("optimise_network", OptimiseNetworkTool().run(model=model))
    assert name not in {h["name"] for h in result2.get("applied_heuristics", [])}
    retired = [
        r for r in memory.recall("procedural", {"active_only": False}, 100) if r.key == name
    ]
    assert retired and retired[0].content["active"] is False


def test_recall_memory_tool_degrades_honestly_when_memory_is_down(monkeypatch):
    monkeypatch.setattr(
        memory, "_engine", create_engine("postgresql+psycopg2://x:x@127.0.0.1:1/void", future=True)
    )
    result = RecallMemoryTool().run(model=_model(), kind="episodic")
    assert result == {"available": False, "kind": "episodic", "records": [], "total_returned": 0}


def test_annotation_never_touches_error_results_or_computation():
    # apply_heuristics on an error dict is a no-op; on success it only
    # APPENDS — every computed key is byte-identical (annotation-only rule).
    _require_db()
    model = _model()
    err = {"error": "boom", "tool": "optimise_network"}
    assert apply_heuristics("optimise_network", dict(err)) == err

    raw = OptimiseNetworkTool().run(model=model)
    annotated = apply_heuristics("optimise_network", {**raw})
    for key, value in raw.items():
        assert annotated[key] == value
