FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY hubris ./hubris
COPY migrations ./migrations
COPY alembic.ini .

# Migrations belong to the IMAGE, not just the compose command — Render
# runs this CMD directly, and without `alembic upgrade head` the memory
# tables never exist (writes then fail silently by graceful design).
# Idempotent; compose's own command remains a harmless duplicate.
# PORT is injected by Render and most PaaS; compose/local keeps 8000.
CMD ["sh", "-c", "alembic upgrade head && uvicorn hubris.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
