"""add color_hex column to materials table

Revision ID: add_color_hex
Revises: 
Create Date: 2026-03-31

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_color_hex'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add color_hex column
    op.add_column('materials', sa.Column('color_hex', sa.String(length=7), nullable=True))
    
    # Set default color for existing materials based on type
    op.execute("""
        UPDATE materials 
        SET color_hex = CASE 
            WHEN type = 'acrylic' THEN '#e0f2fe'
            WHEN type = 'wood_mdf' THEN '#d4a574'
            WHEN type = 'plywood' THEN '#f5deb3'
            WHEN type = 'leather' THEN '#8b4513'
            WHEN type = 'paper' THEN '#fef3c7'
            WHEN type = 'aluminum' THEN '#94a3b8'
            WHEN type = 'stainless_steel' THEN '#64748b'
            ELSE '#0ea5e9'
        END
        WHERE color_hex IS NULL
    """)


def downgrade() -> None:
    op.drop_column('materials', 'color_hex')
