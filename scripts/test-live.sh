#!/usr/bin/env bash
# T-44: the live-agent gate — the one-command run of the FULL suite
# including the 9 live LLM tests (the no-fabrication guardrail's only
# live-fire regression). Required for every ticket's REVIEW from T-44
# onward: attach this script's green output to the ticket log.
#
# Policy (build rule 5): a fabrication failure is a REAL failure. This
# script contains no retry logic on purpose — never re-run it to green;
# a red run goes in the ticket log as a red run.
#
# CI note: the same command works in CI with ANTHROPIC_API_KEY provided as
# a secret; the fail-fast preflight below makes a dead/unfunded key a
# clear 10-second failure instead of 9 confusing test errors.

set -euo pipefail
cd "$(dirname "$0")/.."

# --- key: env var wins, .env fallback ---------------------------------------
KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$KEY" ] && [ -f .env ]; then
  KEY="$(grep '^ANTHROPIC_API_KEY=' .env | cut -d= -f2- || true)"
fi
if [ -z "$KEY" ]; then
  echo "FAIL(2): no ANTHROPIC_API_KEY in the environment or .env — the live gate cannot run without it." >&2
  exit 2
fi

# --- preflight: the key must actually work (dead key / exhausted credits) ---
ping_body=$(mktemp)
code=$(curl -s -o "$ping_body" -w '%{http_code}' https://api.anthropic.com/v1/messages \
  -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"ping"}]}')
if [ "$code" != "200" ]; then
  echo "FAIL(3): ANTHROPIC_API_KEY is present but the API returned HTTP $code — fix the key/credits, then rerun:" >&2
  cat "$ping_body" >&2; echo >&2
  exit 3
fi

# --- preconditions: compose db up (test_db.py needs it) ---------------------
if ! docker network inspect hubris_default >/dev/null 2>&1; then
  echo "FAIL(5): compose network 'hubris_default' not found — run 'docker compose up -d' first." >&2
  exit 5
fi

docker build -q -t hubris-backend-test ./backend >/dev/null

# --- the run (no retries; -rs so skips are visible and checkable) -----------
out=$(mktemp)
docker run --rm --network hubris_default \
  -e DATABASE_URL="postgresql+psycopg2://hubris:hubris@db:5432/hubris" \
  -e ANTHROPIC_API_KEY="$KEY" \
  -v "$(pwd)/backend:/app" -w /app hubris-backend-test \
  python -m pytest tests/ -q -rs 2>&1 | tee "$out"

# --- the live tests must have RUN, not skipped ------------------------------
if grep -q "requires a live ANTHROPIC_API_KEY" "$out"; then
  echo "FAIL(4): live agent tests were SKIPPED — the key did not reach the test container." >&2
  exit 4
fi

echo
echo "LIVE GATE GREEN — paste the summary line above into the ticket's REVIEW note."
