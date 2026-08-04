# My Contributions — Hubris Build

## Role: UI / Frontend Lead + QA / Environment Setup

---

## Environment Setup

Set up the local development environment from scratch despite the absence of Docker Desktop.

- Identified that the project's Linux-based `venv` was incompatible with the Windows host
- Discovered and activated WSL (Ubuntu 24.04) as the execution environment
- Created a working Python 3.12 virtual environment inside WSL (`/tmp/hubris-test-env`)
- Installed all backend Python dependencies (`pytest`, `scipy`, `pulp`, `numpy`, `pydantic`, `langgraph`, `rapidfuzz`, `h3`, etc.) and confirmed the environment was stable for repeated test runs

---

## Phase 5 Verification — OR Engine Tests (T-21 to T-24)

Ran the full Phase 5 test suite against the live codebase using the WSL environment, bypassing Docker entirely.

**Result: 21/21 tests passed**

| Ticket | Test File | Tests | Outcome |
|--------|-----------|------:|---------|
| T-21 Opportunity Scanner | `test_opportunities.py` | 7 | All passed |
| T-22 Threshold / Break-even Finder | `test_threshold_finder.py` | 7 | All passed |
| T-23 Prescriptive Bottleneck Unlock | `test_bottleneck.py` | 4 | All passed |
| T-24 Auto Decision-Brief | `test_decision_brief.py` | 3 | All passed |

This confirms the four Phase 5 "Signature" features are correct and ready for event-day use.

---

## Event-Day Ingestion Fire Drill

Designed and executed a live test of the schema-agnostic ingestion pipeline to de-risk the event-day data load.

**What was done:**

1. Rewrote `backend/test_ingestion_drill.py` from scratch (the existing file had 6 bugs: wrong method call, wrong canonical field names, wrong table names in overrides, missing fleet sheet, wrong `RawTables` attribute access)

2. Generated `backend/messy_7x_data.xlsx` — a realistic fake 7X logistics Excel file with:
   - 3 sheets with plausible but non-canonical names: `Depots_List`, `Customer_Zones`, `Vehicle_Fleet`
   - Column names designed to stress the fuzzy mapper: some resolve automatically (e.g. `GPS_Lat` → `lat`, `Emirate` → `emirate`, `Max_Capacity` → `capacity`), others are deliberately alien (e.g. `Depot_Rent_AED` for `fixed_cost`, `Daily_Deliveries` for `demand`)
   - No OD Matrix or Assignments sheets — to force the engine to derive both

3. **Attempt 1 — Blind load:** `NeedsConfirmationError` correctly raised for table `hubs`, identifying `fixed_cost` and `handling_cost` as ambiguous. The system stopped gracefully and listed best guesses with confidence scores.

4. **Attempt 2 — With operator overrides:** Provided `column_overrides` mapping the alien column names to canonical fields. Load succeeded.

**Final RawTables output:**
- 3 Hubs (Dubai, Abu Dhabi, Sharjah)
- 4 Zones across 3 emirates
- 3 Fleet types
- 12 OD pairs (derived: 3 × 4)
- 4 Assignment rows (derived: nearest-hub baseline)

**Key finding:** The ingestion layer is robust. It catches ambiguous mappings before silently corrupting data, and resolves them cleanly once the operator provides overrides. The event-day workflow (H0–2 data loading) is bulletproofed.

---

## Next: Frontend Development

Now beginning Phase 3 UI work as the UI/Frontend Lead. Starting with a review of the existing `frontend/` structure (Next.js 16, deck.gl, React 19) to plan enhancements and polish for the event-day demo.
