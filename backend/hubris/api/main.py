from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hubris.agents.builder import seed_default_templates
from hubris.api.routers import (
    agents,
    bottleneck,
    ingest,
    kpis,
    network,
    opportunities,
    optimize,
    scenarios,
    simulate,
    threshold,
)
from hubris.core.registry import load_plugins


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_plugins()
    seed_default_templates()
    yield


app = FastAPI(title="Hubris API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
