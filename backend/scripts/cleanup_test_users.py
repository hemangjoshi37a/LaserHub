"""
Remove throwaway QA / test *user* accounts that pollute the public platform.

During automated testing, junk user rows get created and then surface in the
admin "System Users" list and "Recent Signups":

  - auto-registration artifacts:  qa.reg.<timestamp>@laserhubqa.com
  - the billing smoke-test user:   billing-test@laserhub.com

These are NOT real users and should not appear anywhere public-facing.

This script DELETES those throwaway accounts. Before deleting a user it first
removes / nulls out everything that references the user via a foreign key, so
the delete can never error on FK integrity. The throwaway accounts in practice
have no real child data, but the FK cleanup is done unconditionally so the
script stays robust and idempotent even if a junk account later acquires some.

INTENTIONALLY PRESERVED (never deleted)
---------------------------------------
The three standing QA *login* accounts used for ongoing testing:
    test.customer@laserhubqa.com
    test.vendor@laserhubqa.com
    test.superadmin@laserhubqa.com

These are matched by an exact allow-list and explicitly excluded from every
delete predicate (belt-and-suspenders).

IDEMPOTENT: re-running after a clean run removes 0 rows.

Run from the backend/ directory:
    python3.13 -m scripts.cleanup_test_users
    python3.13 scripts/cleanup_test_users.py

Add --dry-run to preview without writing.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys

# ---------------------------------------------------------------------------
# Locate the DB. Default to backend/laserhub.db regardless of CWD.
# ---------------------------------------------------------------------------
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(_BACKEND_DIR, "laserhub.db")

# Standing QA login accounts that must keep working. Never delete these.
PROTECTED_QA_LOGINS = (
    "test.customer@laserhubqa.com",
    "test.vendor@laserhubqa.com",
    "test.superadmin@laserhubqa.com",
)

# Throwaway test users to remove. GLOB for the timestamped auto-registrations,
# plus the single billing smoke-test account.
THROWAWAY_USER_PRED = """
    (
        email GLOB 'qa.reg.*@laserhubqa.com'
        OR email = 'billing-test@laserhub.com'
    )
    AND email NOT IN (?, ?, ?)
"""

# Child tables that reference users via a FK column.
#   "delete": rows owned by the user that should be removed with it.
#   "null":   rows that merely attribute an action to the user; keep the row
#             but null the reference so history/audit data survives.
CHILD_DELETE = {
    "orders": "user_id",
    "vendors": "user_id",
    "designs": "creator_id",
    "reviews": "user_id",
    "design_likes": "user_id",
    "push_subscriptions": "user_id",
    "billing_addresses": "user_id",
    "notifications": "user_id",
    "invoices": "customer_id",
    "team_members": "user_id",
}
CHILD_NULL = {
    "activity_logs": "user_id",
    "order_events": "created_by_user_id",
    "team_members": "invited_by_user_id",
}


def _target_user_ids(cur: sqlite3.Cursor) -> list[tuple[int, str, str]]:
    return cur.execute(
        f"SELECT id, email, name FROM users WHERE {THROWAWAY_USER_PRED} ORDER BY id",
        PROTECTED_QA_LOGINS,
    ).fetchall()


def _table_exists(cur: sqlite3.Cursor, table: str) -> bool:
    return (
        cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        is not None
    )


def run(db_path: str, dry_run: bool = False) -> int:
    if not os.path.exists(db_path):
        sys.exit(f"ERROR: database not found at {db_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    print("=" * 64)
    print("LaserHub throwaway test-USER cleanup")
    print(f"  DB: {db_path}")
    print(f"  Mode: {'DRY-RUN (no writes)' if dry_run else 'APPLY'}")
    print("=" * 64)

    targets = _target_user_ids(cur)
    if not targets:
        print("\nNo throwaway test users found. Database already clean (no-op).")
        print(f"\nTotal users: {cur.execute('SELECT COUNT(*) FROM users').fetchone()[0]}")
        conn.close()
        return 0

    ids = [t[0] for t in targets]
    ph = ",".join("?" * len(ids))

    print("\n--- Throwaway users to remove ---")
    for uid, email, name in targets:
        print(f"  user #{uid}  {email!r}  ({name})")

    # ------------------------------------------------------------------
    # 1. FK cleanup so the user DELETE can never error.
    # ------------------------------------------------------------------
    child_deleted: dict[str, int] = {}
    child_nulled: dict[str, int] = {}

    for table, col in CHILD_DELETE.items():
        if not _table_exists(cur, table):
            continue
        n = cur.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {col} IN ({ph})", ids
        ).fetchone()[0]
        if n:
            child_deleted[f"{table}.{col}"] = n
            if not dry_run:
                cur.execute(f"DELETE FROM {table} WHERE {col} IN ({ph})", ids)

    for table, col in CHILD_NULL.items():
        if not _table_exists(cur, table):
            continue
        n = cur.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {col} IN ({ph})", ids
        ).fetchone()[0]
        if n:
            child_nulled[f"{table}.{col}"] = n
            if not dry_run:
                cur.execute(
                    f"UPDATE {table} SET {col} = NULL WHERE {col} IN ({ph})", ids
                )

    # ------------------------------------------------------------------
    # 2. Delete the throwaway users themselves.
    # ------------------------------------------------------------------
    if not dry_run:
        cur.execute(f"DELETE FROM users WHERE id IN ({ph})", ids)
        conn.commit()

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print("\n--- FK child rows (deleted) ---")
    if child_deleted:
        for ref, n in child_deleted.items():
            print(f"  {ref}: {n} row(s)")
    else:
        print("  (none)")

    print("\n--- FK child rows (reference nulled, row kept) ---")
    if child_nulled:
        for ref, n in child_nulled.items():
            print(f"  {ref}: {n} row(s)")
    else:
        print("  (none)")

    print("\n--- PRESERVED (untouched) ---")
    print("  QA login accounts:", ", ".join(PROTECTED_QA_LOGINS))

    removed = len(targets)
    print("\n" + "=" * 64)
    print(f"  {'Would remove' if dry_run else 'Removed'} {removed} throwaway user(s).")
    print(f"  Total users now: {cur.execute('SELECT COUNT(*) FROM users').fetchone()[0]}")
    print("=" * 64)

    conn.close()
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Delete throwaway QA/test user accounts from the LaserHub DB."
    )
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to laserhub.db")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()
    run(args.db, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
