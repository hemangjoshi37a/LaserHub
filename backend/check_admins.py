import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models import User

async def check_admins():
    async with async_session_maker() as session:
        result = await session.execute(select(User).where((User.is_admin == True) | (User.role == 'super_admin')))
        admins = result.scalars().all()
        for admin in admins:
            print(f"Email: {admin.email}, Role: {admin.role}, IsAdmin: {admin.is_admin}")

if __name__ == "__main__":
    asyncio.run(check_admins())
