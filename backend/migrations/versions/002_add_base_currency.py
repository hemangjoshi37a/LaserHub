"""add base_currency column to materials, material_configs, and design_listings

Revision ID: 002_add_base_currency
Revises: add_color_hex
Create Date: 2026-05-11

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_add_base_currency'
down_revision = 'add_color_hex'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add base_currency column
    op.add_column('materials', sa.Column('base_currency', sa.String(length=3), nullable=False, server_default='USD'))
    op.add_column('material_configs', sa.Column('base_currency', sa.String(length=3), nullable=False, server_default='USD'))
    op.add_column('design_listings', sa.Column('base_currency', sa.String(length=3), nullable=False, server_default='USD'))

def downgrade() -> None:
    op.drop_column('materials', 'base_currency')
    op.drop_column('material_configs', 'base_currency')
    op.drop_column('design_listings', 'base_currency')
