"""add is_internal and is_demo flags

Revision ID: 003_add_demo_flags
Revises: 002_add_base_currency
Create Date: 2026-05-11

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_add_demo_flags'
down_revision = '002_add_base_currency'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Users
    op.add_column('users', sa.Column('is_internal', sa.Boolean(), server_default='0', nullable=True))
    op.add_column('users', sa.Column('is_demo', sa.Boolean(), server_default='0', nullable=True))
    
    # Materials
    op.add_column('materials', sa.Column('is_internal', sa.Boolean(), server_default='0', nullable=True))
    op.add_column('materials', sa.Column('is_demo', sa.Boolean(), server_default='0', nullable=True))
    
    # Orders
    op.add_column('orders', sa.Column('is_internal', sa.Boolean(), server_default='0', nullable=True))
    op.add_column('orders', sa.Column('is_demo', sa.Boolean(), server_default='0', nullable=True))
    
    # Vendors
    op.add_column('vendors', sa.Column('is_internal', sa.Boolean(), server_default='0', nullable=True))
    op.add_column('vendors', sa.Column('is_demo', sa.Boolean(), server_default='0', nullable=True))

def downgrade() -> None:
    op.drop_column('users', 'is_demo')
    op.drop_column('users', 'is_internal')
    
    op.drop_column('materials', 'is_demo')
    op.drop_column('materials', 'is_internal')
    
    op.drop_column('orders', 'is_demo')
    op.drop_column('orders', 'is_internal')
    
    op.drop_column('vendors', 'is_demo')
    op.drop_column('vendors', 'is_internal')
