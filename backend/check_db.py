import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models import User, Vendor

async def check_users():
    async with async_session_maker() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        print(f"Found {len(users)} users:")
        for u in users:
            print(f"ID: {u.id}, Email: {u.email}, Role: {u.role}, IsAdmin: {u.is_admin}")
            
            # Check if vendor profile exists
            v_res = await session.execute(select(Vendor).where(Vendor.user_id == u.id))
            v = v_res.scalar_one_or_none()
            if v:
                print(f"  -> Vendor Profile ID: {v.id}, Shop: {v.shop_name}, Slug: {v.slug}")
            else:
                print(f"  -> NO Vendor Profile")

if __name__ == "__main__":
    asyncio.run(check_users())
