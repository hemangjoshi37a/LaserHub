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
    """Initialize database tables.

    ``create_all`` only CREATES tables that don't yet exist — it never ALTERs an
    existing table to add columns introduced after that table was first created.
    On the dev SQLite database this silently produces ``OperationalError: no such
    column`` 500s whenever a model gains a new field.  To stop that drift, we run
    a general additive schema-sync after ``create_all`` that diffs every model
    against the live SQLite schema and ``ALTER TABLE ... ADD COLUMN``s anything
    missing.

    NOTE: This auto-sync is SQLite-only (dev). On Postgres/production the correct
    path is real migrations via Alembic — we deliberately do NOT run ad-hoc ALTERs
    there (the guard below short-circuits for non-sqlite dialects).
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Additive, idempotent column sync for the dev SQLite database.
    await sync_sqlite_schema()


def _compile_add_column_ddl(column) -> str:
    """Build a SQLite ``ADD COLUMN`` DDL fragment (column name + type [+ default])
    from a SQLAlchemy ``Column``.

    SQLite restriction: ``ALTER TABLE ... ADD COLUMN`` can only add a ``NOT NULL``
    column when it carries a literal ``DEFAULT``; adding a bare ``NOT NULL`` column
    to a table that already has rows raises
    ``Cannot add a NOT NULL column with default value NULL``.  So when the model
    column is ``NOT NULL`` but renders no ``DEFAULT`` (i.e. it relies on a
    Python-side ``default=`` rather than a ``server_default=``) we:
      1. synthesize a literal ``DEFAULT`` from a simple scalar Python default when
         one is available, otherwise
      2. relax the column to nullable so the ADD can succeed.
    Either way the column gets created; existing rows back-fill with the default
    (or NULL) and the application-level ``default=`` still applies to new inserts.
    """
    from sqlalchemy.schema import CreateColumn

    # CreateColumn renders: "<name> <TYPE> [DEFAULT <server_default>] [NOT NULL]".
    # It includes server_default and NOT NULL, but NOT the Python-side `default=`.
    ddl = str(CreateColumn(column).compile(dialect=engine.dialect)).strip()

    has_default = " DEFAULT " in f" {ddl} "
    is_not_null = ddl.endswith("NOT NULL") or " NOT NULL " in f" {ddl} "

    if is_not_null and not has_default:
        literal = _scalar_default_literal(column)
        if literal is not None:
            # Insert a literal DEFAULT before the trailing NOT NULL so SQLite
            # accepts the ADD on a populated table.
            if ddl.endswith("NOT NULL"):
                head = ddl[: -len("NOT NULL")].rstrip()
                ddl = f"{head} DEFAULT {literal} NOT NULL"
            else:
                ddl = f"{ddl} DEFAULT {literal}"
        else:
            # No usable default — relax NOT NULL so the ADD COLUMN can succeed.
            ddl = ddl.replace(" NOT NULL", "")
    return ddl


def _scalar_default_literal(column):
    """Return a SQL literal string for a column's simple scalar Python ``default``,
    or ``None`` when the default is absent / a callable (e.g. ``datetime.utcnow``)
    / otherwise not safely renderable as a constant."""
    default = column.default
    if default is None or not getattr(default, "is_scalar", False):
        return None
    value = default.arg
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    return None


async def sync_sqlite_schema() -> None:
    """Additively sync the live SQLite schema to ``Base.metadata`` (dev only).

    For every table in the metadata that already exists in the DB, compare model
    columns against ``PRAGMA table_info`` and ``ALTER TABLE ... ADD COLUMN`` for
    any column the DB is missing.  Brand-new tables are handled by ``create_all``
    and skipped here.  Each ALTER is wrapped in try/except and skips are logged,
    so the sync is fully idempotent and never blocks startup.

    Guarded to SQLite only: on Postgres/production, schema changes must go through
    Alembic migrations rather than ad-hoc ALTERs.
    """
    if engine.dialect.name != "sqlite":
        # Non-sqlite (e.g. Postgres prod): real migrations (Alembic) own schema
        # changes. Do not run ad-hoc ALTERs here.
        return

    from sqlalchemy import text

    added: list[str] = []
    async with engine.begin() as conn:
        rows = await conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        )
        existing_tables = {r[0] for r in rows.fetchall()}

        for table_name, table in Base.metadata.tables.items():
            if table_name not in existing_tables:
                # New table — create_all already made it; nothing to add.
                continue

            result = await conn.execute(text(f"PRAGMA table_info({table_name})"))
            existing_cols = {row[1] for row in result.fetchall()}

            for column in table.columns:
                if column.name in existing_cols:
                    continue
                try:
                    col_ddl = _compile_add_column_ddl(column)
                    await conn.execute(
                        text(f'ALTER TABLE "{table_name}" ADD COLUMN {col_ddl}')
                    )
                    added.append(f"{table_name}.{column.name}")
                    logger.info(
                        "schema_sync.added_column",
                        extra={"table": table_name, "column": column.name, "ddl": col_ddl},
                    )
                except Exception as e:  # pragma: no cover - defensive
                    logger.warning(
                        "schema_sync.skip",
                        extra={"table": table_name, "column": column.name, "err": str(e)},
                    )

            # Re-create single-column indexes declared on the model (index=True /
            # explicit Index) that SQLite would otherwise lack for freshly-added
            # columns. CREATE INDEX IF NOT EXISTS is itself idempotent.
            for index in table.indexes:
                idx_cols = list(index.columns)
                if len(idx_cols) != 1:
                    continue
                if idx_cols[0].name not in existing_cols and idx_cols[0].name in {
                    c.name for c in table.columns
                }:
                    col_name = idx_cols[0].name
                    idx_name = index.name or f"ix_{table_name}_{col_name}"
                    try:
                        await conn.execute(
                            text(
                                f'CREATE INDEX IF NOT EXISTS "{idx_name}" '
                                f'ON "{table_name}" ("{col_name}")'
                            )
                        )
                    except Exception as e:  # pragma: no cover - defensive
                        logger.warning(
                            "schema_sync.index_skip",
                            extra={"index": idx_name, "err": str(e)},
                        )

    if added:
        logger.info("schema_sync.complete", extra={"added": added})
    return None
