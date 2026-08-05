from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hubris.agents.builder import seed_default_templates
from hubris.api.routers import (
    event_metrics,
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


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
