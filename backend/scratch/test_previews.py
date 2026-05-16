import asyncio
from app.api.upload import get_file_as_svg
from app.models import UploadedFile
from sqlalchemy import select
from app.core.database import async_session_maker
from fastapi import Response

async def test_preview():
    async with async_session_maker() as db:
        # Check if there are any files
        result = await db.execute(select(UploadedFile))
        files = result.scalars().all()
        if not files:
            print("No files in DB to test.")
            return

        for f in files:
            print(f"Testing preview for: {f.filename} ({f.file_type})")
            try:
                response = await get_file_as_svg(f.file_id, db)
                if isinstance(response, Response):
                    print(f"  Response Content Type: {response.media_type}")
                    if b"svg" in response.content:
                        print("  SUCCESS: SVG content returned")
                    else:
                        print(f"  INFO: Non-SVG content returned (likely image fallback)")
                else:
                    print(f"  Response type: {type(response)}")
            except Exception as e:
                print(f"  ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_preview())
