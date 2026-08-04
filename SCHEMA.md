# SCHEMA — Hubris

> The canonical data model everything maps onto, and how we absorb an unknown Excel at event start.
> The real dataset is revealed only on the day — so **nothing downstream may depend on raw column names.** Everything depends on this canonical schema.

---

## 1. Canonical tables (PostgreSQL)

```sql
-- Hubs / facilities
hubs (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  lat           DOUBLE PRECISION,
  lon           DOUBLE PRECISION,
  emirate       TEXT,
  capacity      DOUBLE PRECISION,   -- parcels/day (throughput)
  fixed_cost    DOUBLE PRECISION,   -- per period
  handling_cost DOUBLE PRECISION,   -- per parcel
  status        TEXT DEFAULT 'open' -- open | closed | candidate
)

-- Demand zones (or customers aggregated)
zones (
  id       TEXT PRIMARY KEY,
  name     TEXT,
  lat      DOUBLE PRECISION,
  lon      DOUBLE PRECISION,
  emirate  TEXT,
  demand   DOUBLE PRECISION,   -- parcels/period
  sla_hours DOUBLE PRECISION
)

-- Fleet / vehicle types
fleet_types (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  capacity      DOUBLE PRECISION,  -- parcels per vehicle/period
  cost_per_km   DOUBLE PRECISION,
  fixed_cost    DOUBLE PRECISION,  -- per vehicle/period (driver+depreciation)
  count_available INTEGER,
  hub_id        TEXT REFERENCES hubs(id)  -- nullable
)

-- Origin–destination matrix (derived or provided)
od_matrix (
  from_id   TEXT,   -- hub id
  to_id     TEXT,   -- zone id
  distance_km DOUBLE PRECISION,
  time_min  DOUBLE PRECISION,
  cost      DOUBLE PRECISION,  -- unit serve cost, derived if absent
  PRIMARY KEY (from_id, to_id)
)

-- Current assignment (GOLD if present → direct baseline)
current_assignments (
  zone_id TEXT REFERENCES zones(id),
  hub_id  TEXT REFERENCES hubs(id),
  volume  DOUBLE PRECISION,
  PRIMARY KEY (zone_id, hub_id)
)

-- Scenarios & results
scenarios (
  id        TEXT PRIMARY KEY,
  name      TEXT,
  params    JSONB,        -- the diff applied to baseline
  created_at TIMESTAMPTZ DEFAULT now()
)

scenario_results (
  scenario_id TEXT REFERENCES scenarios(id),
  kpis        JSONB,      -- cost-to-serve, utilisation, coverage, ...
  flows       JSONB,      -- assignment x_ij
  duals       JSONB,      -- shadow prices (from flow LP)
  PRIMARY KEY (scenario_id)
)
```

## 1a. Memory tables — the learning twin (W2)

The twin improves the longer EMX uses it. Three tiers, one store
(`MemoryStore` in `CLAUDE.md §4`). **Every numeric field carries `provenance`** naming the
tool run that produced it — memory is evidence, not a fabrication loophole.

```sql
-- EPISODIC — what happened. One row per scenario run + its outcome.
-- Feeds the Time Machine's "past" (W3) and answers "have we tried this before?"
memory_episodes (
  id            TEXT PRIMARY KEY,
  scenario_id   TEXT,                -- nullable: ad-hoc runs have no saved scenario
  scenario_name TEXT,                -- e.g. "close_hub", "demand_scale"
  params        JSONB NOT NULL,      -- what was applied
  kpis          JSONB NOT NULL,      -- computed result (cost_to_serve, utilisation, ...)
  outcome       JSONB,               -- feasible?, unmet demand, recommendation taken?
  provenance    TEXT NOT NULL,       -- tool/run id that produced the kpis
  created_at    TIMESTAMPTZ DEFAULT now()
)
CREATE INDEX ON memory_episodes (scenario_name, created_at DESC);

-- SEMANTIC — facts learned about THIS network, accumulated from real runs.
-- e.g. key="hub.H5.binds_first", content={"under":"sharjah_growth","factor":2.73}
memory_facts (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL,         -- stable dotted key, upserted on re-observation
  content     JSONB NOT NULL,
  confidence  DOUBLE PRECISION,      -- grows with corroborating observations
  provenance  TEXT NOT NULL,         -- tool/run id — never an LLM assertion
  observed_count INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (key)
)

-- PROCEDURAL — decision patterns and agent-written heuristics applied in later sessions.
-- The agent-writable block: an agent records a heuristic via a tool that stamps provenance.
memory_heuristics (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  rule        JSONB NOT NULL,        -- {"when": {...}, "then": {...}} — machine-applicable
  rationale   TEXT,                  -- plain-English why, for the planner
  author      TEXT NOT NULL,         -- agent name, or "human"
  provenance  TEXT NOT NULL,         -- the run that justified it
  active      BOOLEAN DEFAULT true,  -- a planner can retire a heuristic without deleting it
  times_applied INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (name)
)

-- Alerts pushed by monitoring agents (W4). Kept with memory: an alert is an episode
-- the twin generated on its own initiative.
memory_alerts (
  id           TEXT PRIMARY KEY,
  agent_name   TEXT NOT NULL,
  severity     TEXT NOT NULL,        -- info | warning | critical
  finding      JSONB NOT NULL,       -- computed figures behind the alert
  recommended_action JSONB,
  brief_id     TEXT,                 -- link to the generated decision brief
  acknowledged BOOLEAN DEFAULT false,
  provenance   TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
)
CREATE INDEX ON memory_alerts (acknowledged, created_at DESC);
```

**Design notes**
- `memory_facts.key` is a stable dotted key so re-observing a fact **upserts and raises `confidence`** rather than duplicating. A fact observed once is not the same as one observed twenty times, and the UI should be able to say which.
- `memory_heuristics.rule` is JSON, not prose, precisely so it can be *applied* automatically, not just displayed. Prose goes in `rationale`.
- `active` + `times_applied` make the procedural tier auditable: a planner can see which agent-written rule is influencing recommendations, and switch it off.
- These tables are the **first real consumer of the Postgres layer**, which the audit found was dead at runtime (migrations ran; nothing read or wrote). W2 is what makes `orm.py`/`db_loader.py` load-bearing.

Optional if the data supports it:

```sql
demand_history (zone_id, date, volume)          -- enables the forecast stretch
service_models (id, name, cost_multiplier, max_transit_hours)
```

## 2. Schema-agnostic ingestion strategy

The dataset schema is unknown until the event. We never hard-code column names. The mapping pipeline:

1. **Profile** — `pandas.read_excel` every sheet; capture column names, dtypes, sample values, row counts.
2. **Fuzzy match** — `thefuzz` / rapidfuzz maps each raw column to a canonical field by name similarity (e.g. `hub_util_pct` → `capacity`-related; `Shrajah` typos handled at value level).
3. **LLM-assisted proposal** — for ambiguous columns, an agent proposes a mapping *with a confidence score* using the profile (names + samples). This is the one place the LLM touches ingestion — and it only *proposes*; it doesn't transform data.
4. **Human confirm** — anything below a confidence threshold surfaces a quick confirm UI (dropdown per column). Target < 10 minutes of confirmation.
5. **Load** — write to canonical tables; validate with pydantic/pandera.

**Derivations when fields are missing:**
- No coordinates → geocode region names (cache results); or aggregate to emirate centroids.
- No cost model → `cost = distance_km × fleet.cost_per_km + hub.handling_cost` per unit.
- No distances → compute from coordinates: real road distance (OSRM/Valhalla) or haversine × ~1.3 fallback.
- No current assignment → reconstruct a nearest-open-hub-with-capacity baseline (the status-quo proxy).

**Golden rule:** everything downstream (engine, plugins, agents, UI) reads only the canonical tables / `NetworkModel`. If the Excel is radically different, we adjust *only* the mapping layer — the rest is insulated.

## 3. Assumed synthetic dataset (for pre-build)

Before the event, generate synthetic EMX-shaped data that fills every canonical table: ~7–10 hubs across the emirates, ~50–150 zones, 3–4 fleet types, a demand distribution, and a plausible current assignment. Build and test the entire system against it so that on the day only the mapping + calibration changes.
