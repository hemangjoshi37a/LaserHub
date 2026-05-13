import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models import User

async def list_users():
    async with async_session_maker() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        for user in users:
            print(f"Email: {user.email}, Role: {user.role}, IsAdmin: {user.is_admin}")

if __name__ == "__main__":
    asyncio.run(list_users())
