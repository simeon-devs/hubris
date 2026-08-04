"""T-32: the assumption registry is complete, labelled, and LOAD-BEARING —
module constants ARE registry values, so the registry can never drift from
the code it describes."""

from hubris.core.assumptions import all_assumptions, value


def test_every_entry_is_fully_labelled():
    entries = all_assumptions()
    assert len(entries) >= 20
    for a in entries:
        assert a.status in {"verified", "derived", "assumed"}
        assert len(a.source) > 20, f"{a.name}: source must explain itself, not just exist"
        assert a.used_by, f"{a.name}: must name its consumers"


def test_module_constants_are_registry_values_not_copies():
    # Spot-check across layers: if someone re-hardcodes a constant, this
    # breaks — the registry is the single source, not a parallel catalogue.
    from hubris.agents import threshold_finder
    from hubris.data import demo_scenario
    from hubris.engine import flow, geo, h3_zoning, monte_carlo, opportunities

    assert geo.ROAD_FACTOR == value("road_factor")
    assert flow.OVERFLOW_PENALTY == value("overflow_penalty")
    assert opportunities.PRIMARY_COST_RATIO == value("scanner_primary_cost_ratio")
    assert opportunities.NEARBY_KM == value("scanner_nearby_km")
    assert monte_carlo.DEFAULT_TRIALS == value("mc_trials")
    assert monte_carlo.DEFAULT_SEED == value("mc_seed")
    assert threshold_finder.DEFAULT_MAX_CUSTOMER_COUNT == value("threshold_max_customer_count")
    assert h3_zoning.DEFAULT_H3_RESOLUTION == value("h3_default_resolution")
    assert demo_scenario.DEMO_DEMAND_FACTOR == value("demo_demand_factor")


def test_verified_entries_cite_a_document():
    for a in all_assumptions():
        if a.status == "verified":
            assert any(doc in a.source for doc in ("BUILD_SPEC", "SCHEMA.md", "CLAUDE.md", "brief")), (
                f"{a.name} claims 'verified' without citing a document"
            )
