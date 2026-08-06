"""Database engine/session setup.

`DATABASE_URL` comes from the environment — never hard-coded (CLAUDE.md §7).
Falls back to the local dev default so tests can run outside Docker Compose
too, pointed at a Postgres on localhost.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def normalize_database_url(url: str) -> str:
    """Managed Postgres (Render, Heroku, …) hands out `postgres://` URLs;
    SQLAlchemy 2 removed that alias. Pin both spellings to the psycopg2
    driver we ship, so ONE env var works locally and deployed."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


DATABASE_URL = normalize_database_url(
    os.environ.get("DATABASE_URL", "postgresql+psycopg2://hubris:hubris@localhost:5432/hubris")
)

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass
