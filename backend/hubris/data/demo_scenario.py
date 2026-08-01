"""The one always-renders demo scenario (T-30; BUILD_SPEC §12 pre-build
item, §13 "Demo fragility -> one pre-seeded scenario that always renders;
never debug live").

Seeded into `AppState` at startup so the demo path never depends on
clicking through a live simulate and hoping it solves. Deliberately a
STRESS scenario rather than the pristine baseline: on the untouched
baseline the network has headroom everywhere, so `find_bottleneck_unlock`
honestly reports "nothing binding" and the scanner's far-hub-service
finder is empty — truthful, but it shows the signature features at their
least interesting. Under this surge all three inefficiency types fire AND
the bottleneck unlock returns a real, verified recommendation, while the
flow stays feasible so nothing ever renders blank.

Resilient by design (the whole point is that it cannot fail mid-demo):
the target emirate is only used if it actually exists in the loaded data,
otherwise the surge applies network-wide — so this still seeds against the
real event-day dataset, not just the synthetic fixture.
"""

DEMO_SCENARIO_ID = "demo_surge"
DEMO_SCENARIO_LABEL = "Demo: Sharjah peak surge (5x)"

# Chosen empirically against the T-04 synthetic dataset: the smallest
# surge at which every signature feature has something real to say
# (all 3 inefficiency types + a binding hub with a verified unlock) while
# min-cost flow still fully serves demand.
DEMO_TARGET_EMIRATE = "Sharjah"
DEMO_DEMAND_FACTOR = 5.0


def demo_scenario_params(available_emirates: set[str]) -> dict:
    """`demand_scale` params for the demo surge. Scoped to
    `DEMO_TARGET_EMIRATE` when that emirate is present in the loaded data,
    otherwise network-wide — never referencing an emirate that doesn't
    exist, which would raise mid-demo."""
    emirate = DEMO_TARGET_EMIRATE if DEMO_TARGET_EMIRATE in available_emirates else None
    return {"factor": DEMO_DEMAND_FACTOR, "emirate": emirate}
