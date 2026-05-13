
import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(r'c:\Users\nitya\Desktop\LaserHub\backend')))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models import Design, UploadedFile

async def list_designs():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        stmt = select(Design)
        result = await session.execute(stmt)
        designs = result.scalars().all()
        
        print(f"{'ID':<5} | {'Title':<30} | {'File ID':<10} | {'Thumbnail'}")
        print("-" * 80)
        for d in designs:
            print(f"{d.id:<5} | {d.title:<30} | {str(d.file_id):<10} | {d.thumbnail_url}")

if __name__ == "__main__":
    asyncio.run(list_designs())
