"""Database engine/session setup.

`DATABASE_URL` comes from the environment — never hard-coded (CLAUDE.md §7).
Falls back to the local dev default so tests can run outside Docker Compose
too, pointed at a Postgres on localhost.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg2://hubris:hubris@localhost:5432/hubris"
)

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass
