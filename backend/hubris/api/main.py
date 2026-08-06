import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hubris.agents.builder import seed_default_templates
from hubris.api.routers import (
    event_metrics,
    reports,
    agents,
    assumptions,
    bottleneck,
    brief,
    goal,
    ingest,
    kpis,
    memory,
    monitoring,
    network,
    opportunities,
    optimize,
    scenarios,
    simulate,
    threshold,
)
from hubris.api.state import seed_demo_scenario, state
from hubris.monitoring import scheduler as monitoring_scheduler
from hubris.core.registry import load_plugins


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_plugins()
    seed_default_templates()
    seed_demo_scenario()  # T-30; never raises — see its docstring
    monitoring_scheduler.start(state)  # T-40; boot sweep + self-run loop
    yield
    monitoring_scheduler.stop()


app = FastAPI(title="Hubris API", lifespan=lifespan)

# Deployed origins (e.g. the Render frontend) come from the environment,
# comma-separated; localhost dev origins always work.
_extra_origins = [
    o.strip() for o in os.environ.get("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        *_extra_origins,
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    # Presence flags only — never values. `anthropic_key` diagnoses the
    # deployed chat in one glance (the SDK's "could not resolve
    # authentication" means the process env simply lacks the variable).
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    return {
        "status": "ok",
        "anthropic_key": "present" if key.strip() else "MISSING",
        "anthropic_key_shape_ok": key.strip().startswith("sk-ant-") if key.strip() else False,
    }


app.include_router(kpis.router)
app.include_router(simulate.router)
app.include_router(optimize.router)
app.include_router(scenarios.router)
app.include_router(ingest.router)
app.include_router(agents.router)
app.include_router(network.router)
app.include_router(opportunities.router)
app.include_router(threshold.router)
app.include_router(bottleneck.router)
app.include_router(goal.router)
app.include_router(assumptions.router)
app.include_router(memory.router)
app.include_router(monitoring.router)
app.include_router(brief.router)
app.include_router(event_metrics.router)
app.include_router(reports.router)
