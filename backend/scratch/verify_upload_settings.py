from app.core.config import settings
from app.api.upload import ALLOWED_MIME_TYPES

print(f"Allowed Extensions in Config: {settings.ALLOWED_EXTENSIONS}")
print(f"Allowed MIME types keys: {list(ALLOWED_MIME_TYPES.keys())}")

new_exts = ["pdf", "png", "jpg", "jpeg"]
for ext in new_exts:
    if ext in settings.ALLOWED_EXTENSIONS.split(','):
        print(f"PASS: {ext} is in settings.ALLOWED_EXTENSIONS")
    else:
        print(f"FAIL: {ext} is NOT in settings.ALLOWED_EXTENSIONS")
        
    if ext in ALLOWED_MIME_TYPES:
        print(f"PASS: {ext} is in ALLOWED_MIME_TYPES")
    else:
        print(f"FAIL: {ext} is NOT in ALLOWED_MIME_TYPES")
