import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.core.database import async_session_maker
from app.models import Material
from sqlalchemy import select

async def run():
    async with async_session_maker() as db:
        res = await db.execute(select(Material).where(Material.name == 'Sample Pack'))
        m = res.scalars().first()
        print(m.id if m else 'None')


if __name__ == "__main__":
    asyncio.run(run())
