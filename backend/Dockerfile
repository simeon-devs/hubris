FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY hubris ./hubris
COPY migrations ./migrations
COPY alembic.ini .

# Render (and most PaaS) inject PORT; compose/local keeps 8000.
CMD ["sh", "-c", "uvicorn hubris.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
