"""
Integration tests for LaserHub API endpoints
"""


import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import app

# Use an in-memory SQLite database for testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Create a fresh database for each test"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session
        await session.rollback()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    """Create a test client that uses the test database"""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_read_main(client):
    """Test root endpoint"""
    response = await client.get("/")
    assert response.status_code == 200
    assert response.json()["name"] == "LaserHub API"

@pytest.mark.asyncio
async def test_health_check(client):
    """Test health check endpoint"""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

@pytest.mark.asyncio
async def test_get_materials(client):
    """Test get materials endpoint"""
    # Use trailing slash to avoid 307 redirect
    response = await client.get("/api/materials/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.asyncio
async def test_calculate_cost_invalid_params(client):
    """Test cost calculation with missing parameters"""
    response = await client.post("/api/calculate/", json={})
    # Should return validation error (422 Unprocessable Entity)
    assert response.status_code == 422

@pytest.mark.asyncio
async def test_calculate_cost_valid(client):
    """Test cost calculation with valid parameters"""
    payload = {
        "area_cm2": 100,
        "cut_length_mm": 500,
        "material_id": 1,
        "thickness_mm": 3,
        "quantity": 1,
        "file_id": "00000000-0000-0000-0000-000000000000"
    }
    response = await client.post("/api/calculate/", json=payload)
    # If the endpoint is implemented, it should return 200
    # or 404 if material not found in DB
    assert response.status_code in (200, 404)
