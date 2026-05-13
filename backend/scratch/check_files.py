
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
from app.models import UploadedFile

async def list_files():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        stmt = select(UploadedFile)
        result = await session.execute(stmt)
        files = result.scalars().all()
        
        print(f"{'ID':<5} | {'File ID':<40} | {'Filename'}")
        print("-" * 80)
        for f in files:
            print(f"{f.id:<5} | {f.file_id:<40} | {f.filename}")

if __name__ == "__main__":
    asyncio.run(list_files())
