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
