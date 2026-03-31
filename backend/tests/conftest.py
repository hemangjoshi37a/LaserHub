"""
Test configuration and fixtures for LaserHub testing
"""
import json
import uuid
from datetime import timedelta
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import Mock, patch

import ezdxf
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models import Material, UploadedFile, User

# Create test database
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh database for each test"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session = TestSessionLocal()
    try:
        yield session
    finally:
        await session.rollback()
        await session.close()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client that uses the test database"""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def test_materials(db_session: AsyncSession):
    """Create test materials"""
    materials = [
        Material(
            id=1,
            name="Acrylic Clear",
            type="acrylic",
            rate_per_cm2_mm=0.05,
            available_thicknesses="[3, 5, 10]",
            description="Clear acrylic sheet"
        ),
        Material(
            id=2,
            name="MDF Wood",
            type="wood_mdf",
            rate_per_cm2_mm=0.03,
            available_thicknesses="[4, 6, 8]",
            description="Medium Density Fiberboard"
        ),
        Material(
            id=3,
            name="Stainless Steel",
            type="stainless_steel",
            rate_per_cm2_mm=0.15,
            available_thicknesses="[1, 2]",
            description="Stainless steel sheet",
            is_active=False
        )
    ]

    for material in materials:
        db_session.add(material)

    await db_session.commit()
    return materials

@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession):
    """Create a test user"""
    user = User(
        email="test@example.com",
        name="Test User",
        hashed_password=get_password_hash("testpass123"),
        is_verified=True
    )

    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user

@pytest_asyncio.fixture
async def test_admin_user(db_session: AsyncSession):
    """Create a test admin user"""
    user = User(
        email=settings.ADMIN_EMAIL,
        name="Admin User",
        hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
        is_verified=True,
        is_active=True
    )

    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user

@pytest_asyncio.fixture
async def authenticated_client(client: AsyncClient, test_user: User):
    """Create an authenticated test client"""
    token_data = {"sub": test_user.email, "user_id": str(test_user.id)}
    access_token = create_access_token(token_data, expires_delta=timedelta(hours=1))

    client.headers.update({
        "Authorization": f"Bearer {access_token}"
    })

    return client

@pytest_asyncio.fixture
async def admin_client(client: AsyncClient, test_admin_user: User):
    """Create an admin authenticated test client"""
    token_data = {"sub": test_admin_user.email, "role": "admin"}
    access_token = create_access_token(token_data, expires_delta=timedelta(hours=1))

    client.headers.update({
        "Authorization": f"Bearer {access_token}"
    })

    return client

@pytest_asyncio.fixture
async def test_uploaded_file(db_session: AsyncSession, test_user: User):
    """Create a test uploaded file"""
    uploaded_file = UploadedFile(
        file_id=str(uuid.uuid4()),
        filename="test.dxf",
        file_size=1024,
        upload_path="/tmp/test.dxf",
        area_cm2=100.0,
        cut_length_mm=500.0,
        uploaded_by_id=test_user.id,
        metadata=json.dumps({"format": "DXF", "version": "R2010"})
    )

    db_session.add(uploaded_file)
    await db_session.commit()
    await db_session.refresh(uploaded_file)
    return uploaded_file

@pytest.fixture
def sample_dxf_file(tmp_path: Path):
    """Create a sample DXF file for testing"""
    dxf_path = tmp_path / "sample.dxf"
    doc = ezdxf.new('R2010')
    msp = doc.modelspace()

    # Create a 100x100 square with cut path
    msp.add_lwpolyline([(0, 0), (100, 0), (100, 100), (0, 100)], close=True)

    doc.saveas(str(dxf_path))
    return str(dxf_path)

@pytest.fixture
def sample_svg_file(tmp_path: Path):
    """Create a sample SVG file for testing"""
    svg_content = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="100mm" height="100mm" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="80" fill="none" stroke="black"/>
  <circle cx="50" cy="50" r="20" fill="none" stroke="black"/>
</svg>'''

    svg_path = tmp_path / "sample.svg"
    svg_path.write_text(svg_content)
    return str(svg_path)

@pytest.fixture
def mock_stripe():
    """Mock Stripe API"""
    with patch("app.api.payment.stripe") as mock_stripe:
        mock_payment_intent = Mock()
        mock_payment_intent.id = "pi_test_123"
        mock_payment_intent.status = "succeeded"
        mock_payment_intent.amount = 5000
        mock_payment_intent.currency = "usd"

        mock_stripe.PaymentIntent.create.return_value = mock_payment_intent
        mock_stripe.PaymentIntent.retrieve.return_value = mock_payment_intent
        yield mock_stripe

@pytest.fixture
def mock_email_service():
    """Mock email service"""
    with patch("app.services.email_service.send_email") as mock_send:
        mock_send.return_value = True
        yield mock_send
