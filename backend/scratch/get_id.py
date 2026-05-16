import asyncio
from app.core.database import async_session_maker
from app.models import UploadedFile
from sqlalchemy import select

async def main():
    async with async_session_maker() as db:
        result = await db.execute(select(UploadedFile).limit(1))
        f = result.scalar()
        if f:
            print(f.file_id)
        else:
            print("None")

if __name__ == "__main__":
    asyncio.run(main())
