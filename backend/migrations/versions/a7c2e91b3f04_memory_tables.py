"""memory tables (T-38; SCHEMA.md §1a) — the learning twin's three tiers
plus monitoring alerts. First revision to make the Postgres layer
load-bearing at runtime.

Revision ID: a7c2e91b3f04
Revises: 61f30020dab4
Create Date: 2026-08-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a7c2e91b3f04'
down_revision: Union[str, None] = '61f30020dab4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'memory_episodes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('scenario_id', sa.String(), nullable=True),
        sa.Column('scenario_name', sa.String(), nullable=False),
        sa.Column('params', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('kpis', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('outcome', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('provenance', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_memory_episodes_name_created', 'memory_episodes',
                    ['scenario_name', sa.text('created_at DESC')])

    op.create_table(
        'memory_facts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('provenance', sa.String(), nullable=False),
        sa.Column('observed_count', sa.Integer(), server_default='1', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )

    op.create_table(
        'memory_heuristics',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('rule', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('rationale', sa.String(), nullable=True),
        sa.Column('author', sa.String(), nullable=False),
        sa.Column('provenance', sa.String(), nullable=False),
        sa.Column('active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('times_applied', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'memory_alerts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('agent_name', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('finding', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('recommended_action', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('brief_id', sa.String(), nullable=True),
        sa.Column('acknowledged', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('provenance', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_memory_alerts_ack_created', 'memory_alerts',
                    ['acknowledged', sa.text('created_at DESC')])


def downgrade() -> None:
    op.drop_index('ix_memory_alerts_ack_created', table_name='memory_alerts')
    op.drop_table('memory_alerts')
    op.drop_table('memory_heuristics')
    op.drop_table('memory_facts')
    op.drop_index('ix_memory_episodes_name_created', table_name='memory_episodes')
    op.drop_table('memory_episodes')
