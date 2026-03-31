"""
Database configuration and session management
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger(__name__)


# Optimized database engine with connection pooling
engine_kwargs = {
    "echo": False,
}

if "sqlite" in settings.DATABASE_URL:
    # SQLite doesn't support connection pooling
    from sqlalchemy.pool import StaticPool
    engine_kwargs["poolclass"] = StaticPool
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = 20
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 3600

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all models"""
    pass


async def get_db() -> AsyncSession:
    """Dependency for getting database session.

    Note on commit behavior: This generator commits after yield as a safety net.
    Many API endpoints already call ``await db.commit()`` explicitly within the
    endpoint body.  The second commit here is a no-op in that case (SQLAlchemy
    treats committing a session with no pending changes as harmless).  This
    pattern ensures that if an endpoint forgets to commit, changes are still
    persisted.  However, endpoints should still commit explicitly for clarity
    and to control exactly when writes are flushed.
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
