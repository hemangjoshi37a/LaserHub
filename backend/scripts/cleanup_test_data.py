"""
Cleanup of QA / test-data pollution from the LaserHub database.

During QA, throwaway records were created (junk designs, materials, vendors and
orders). This script removes the *pure orphan* junk and flags the rest as
internal so the marketplace-filter layer hides them, while being extremely
conservative about real seed data and foreign-key integrity.

Strategy
--------
1. DELETE pure-junk orphans that nothing real references:
   - Junk designs ("QA Design", "QA Op Design", "SA Design*", "SA D", "DelMe")
     -> only kept after verifying no design_listing / design_like points at them.
   - Junk materials ("Validation Test", "QA Material", "DelMat") -> only their own
     orphan material_configs reference them; those configs are removed first.
2. FLAG as is_internal=1 (preferred for anything referenced by real data):
   - Junk vendors ("QA Shop", "Test SuperAdmin Shop") -> kept for referential
     integrity (user link + vendor_materials), just hidden.
   - Test orders (order_number "TEST-%" or a @laserhubqa.com customer email).
   - Abandoned QA registration user accounts ("qa.reg.*@laserhubqa.com").
3. REPAIR a real seed material whose name was clobbered during QA:
   - Material #1 is the seeded "Acrylic (Clear)" (it is referenced by real orders
     and dozens of listings). Its name was overwritten to "QA Mat Upd" during a
     QA "update material" test. We restore the seed name rather than delete/flag,
     since it is a genuine catalogue item that must stay visible.

What is intentionally PRESERVED
-------------------------------
- The 3 QA *login* accounts (test.customer / test.vendor / test.superadmin
  @laserhubqa.com) -- left fully untouched (login must keep working).
- All real seed data: the 8 seeded materials, the real vendors
  (Precision Laser Co., Artisan Cuts Studio, SpeedCut Industries,
  EcoLaser Workshop, plus the owner/admin shops), and the ~16 real seeded
  designs (Mandala Circle Earrings, City Skyline Wall Art, ...).

The script is IDEMPOTENT: re-running it makes no further changes once clean.
It only ever touches rows that still match the junk criteria, and the schema
``is_internal`` flag is set with an idempotent UPDATE.

Run with (from the backend/ directory):
    python3.13 -m scripts.cleanup_test_data
or:
    python3.13 scripts/cleanup_test_data.py

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

# QA accounts we must keep working (never delete / never flag these).
PROTECTED_QA_LOGINS = (
    "test.customer@laserhubqa.com",
    "test.vendor@laserhubqa.com",
    "test.superadmin@laserhubqa.com",
)

# ---------------------------------------------------------------------------
# Junk-matching SQL predicates. Deliberately narrow so real seed data is never
# caught. Each predicate is written so it can be applied repeatedly (idempotent)
# against whatever rows still match.
# ---------------------------------------------------------------------------

# Designs that are pure junk (verified to have no referencing listings/likes).
JUNK_DESIGN_PRED = """
    title = 'QA Design'
    OR title = 'QA Op Design'
    OR title = 'DelMe'
    OR title GLOB 'SA Design*'
    OR title = 'SA D'
"""

# Materials that are pure junk (only their own orphan configs reference them).
JUNK_MATERIAL_PRED = """
    name = 'Validation Test'
    OR name = 'QA Material'
    OR name = 'QA Mat'
    OR name = 'DelMat'
"""

# Vendors that are junk but flagged (not deleted) to preserve referential links.
JUNK_VENDOR_PRED = """
    shop_name = 'QA Shop'
    OR shop_name = 'Test SuperAdmin Shop'
"""

# Test orders: explicit TEST-* order numbers or QA-domain customer emails.
JUNK_ORDER_PRED = """
    order_number GLOB 'TEST-*'
    OR customer_email LIKE '%@laserhubqa.com'
"""

# Abandoned QA registration users (NOT the 3 protected QA logins).
JUNK_USER_PRED = """
    email GLOB 'qa.reg.*@laserhubqa.com'
"""

# Seed material whose name got clobbered during QA: restore it.
CLOBBERED_MATERIAL_FROM = "QA Mat Upd"
CLOBBERED_MATERIAL_TO = "Acrylic (Clear)"
CLOBBERED_MATERIAL_ID = 1  # the seeded clear-acrylic row


def _rows(cur: sqlite3.Cursor, sql: str, params: tuple = ()) -> list:
    return cur.execute(sql, params).fetchall()


def _referenced_design_ids(cur: sqlite3.Cursor, ids: list[int]) -> set[int]:
    """Return the subset of design ids that are referenced by real child rows."""
    if not ids:
        return set()
    placeholders = ",".join("?" * len(ids))
    refs: set[int] = set()
    for table in ("design_listings", "design_likes"):
        refs.update(
            r[0]
            for r in cur.execute(
                f"SELECT DISTINCT design_id FROM {table} WHERE design_id IN ({placeholders})",
                ids,
            ).fetchall()
        )
    return refs


def _referenced_material_ids(cur: sqlite3.Cursor, ids: list[int]) -> set[int]:
    """Return material ids referenced by REAL data (anything but their own configs)."""
    if not ids:
        return set()
    placeholders = ",".join("?" * len(ids))
    refs: set[int] = set()
    # material_configs are owned children of the material and are deleted with it,
    # so they do NOT count as a blocking reference.
    for table in ("orders", "design_listings", "vendor_materials", "material_stock"):
        refs.update(
            r[0]
            for r in cur.execute(
                f"SELECT DISTINCT material_id FROM {table} WHERE material_id IN ({placeholders})",
                ids,
            ).fetchall()
        )
    return refs


def run(db_path: str, dry_run: bool = False) -> None:
    if not os.path.exists(db_path):
        sys.exit(f"ERROR: database not found at {db_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    print("=" * 64)
    print("LaserHub test/QA data cleanup")
    print(f"  DB: {db_path}")
    print(f"  Mode: {'DRY-RUN (no writes)' if dry_run else 'APPLY'}")
    print("=" * 64)

    deleted: dict[str, list] = {
        "designs": [],
        "materials": [],
        "material_configs": [],
        "team_members": [],
    }
    flagged: dict[str, list] = {"vendors": [], "orders": [], "users": []}
    repaired: list = []

    # ------------------------------------------------------------------
    # 1. Repair the clobbered seed material name (Acrylic (Clear)).
    # ------------------------------------------------------------------
    clobbered = _rows(
        cur,
        "SELECT id, name FROM materials WHERE id = ? AND name = ?",
        (CLOBBERED_MATERIAL_ID, CLOBBERED_MATERIAL_FROM),
    )
    if clobbered:
        repaired.append((CLOBBERED_MATERIAL_ID, CLOBBERED_MATERIAL_FROM, CLOBBERED_MATERIAL_TO))
        if not dry_run:
            cur.execute(
                "UPDATE materials SET name = ? WHERE id = ? AND name = ?",
                (CLOBBERED_MATERIAL_TO, CLOBBERED_MATERIAL_ID, CLOBBERED_MATERIAL_FROM),
            )

    # ------------------------------------------------------------------
    # 2. Delete pure-junk designs (only those with no real references).
    # ------------------------------------------------------------------
    junk_designs = _rows(cur, f"SELECT id, title FROM designs WHERE {JUNK_DESIGN_PRED}")
    junk_design_ids = [r[0] for r in junk_designs]
    referenced = _referenced_design_ids(cur, junk_design_ids)
    for did, title in junk_designs:
        if did in referenced:
            # Should not happen for these titles, but stay safe: flag instead.
            print(f"  ! design #{did} '{title}' is referenced -> SKIP delete (left as-is)")
            continue
        deleted["designs"].append((did, title))
        if not dry_run:
            cur.execute("DELETE FROM designs WHERE id = ?", (did,))

    # ------------------------------------------------------------------
    # 3. Delete pure-junk materials (+ their orphan configs). Flag if a real
    #    row references them (defensive; not expected for these names).
    # ------------------------------------------------------------------
    junk_materials = _rows(cur, f"SELECT id, name FROM materials WHERE {JUNK_MATERIAL_PRED}")
    junk_material_ids = [r[0] for r in junk_materials]
    blocked = _referenced_material_ids(cur, junk_material_ids)
    for mid, name in junk_materials:
        if mid in blocked:
            flagged.setdefault("materials", []).append((mid, name))
            print(f"  ! material #{mid} '{name}' referenced by real data -> FLAG is_internal instead of delete")
            if not dry_run:
                cur.execute("UPDATE materials SET is_internal = 1 WHERE id = ?", (mid,))
            continue
        child_cfgs = _rows(cur, "SELECT id FROM material_configs WHERE material_id = ?", (mid,))
        for (cfg_id,) in child_cfgs:
            deleted["material_configs"].append((cfg_id, mid))
            if not dry_run:
                cur.execute("DELETE FROM material_configs WHERE id = ?", (cfg_id,))
        deleted["materials"].append((mid, name))
        if not dry_run:
            cur.execute("DELETE FROM materials WHERE id = ?", (mid,))

    # ------------------------------------------------------------------
    # 4. Flag junk vendors as internal (keep referential integrity).
    # ------------------------------------------------------------------
    junk_vendors = _rows(
        cur,
        f"SELECT id, shop_name FROM vendors WHERE ({JUNK_VENDOR_PRED}) AND COALESCE(is_internal,0)=0",
    )
    for vid, shop in junk_vendors:
        flagged["vendors"].append((vid, shop))
        if not dry_run:
            cur.execute("UPDATE vendors SET is_internal = 1 WHERE id = ?", (vid,))

    # ------------------------------------------------------------------
    # 5. Flag test orders as internal.
    # ------------------------------------------------------------------
    junk_orders = _rows(
        cur,
        f"SELECT id, order_number, customer_email FROM orders "
        f"WHERE ({JUNK_ORDER_PRED}) AND COALESCE(is_internal,0)=0",
    )
    for oid, onum, email in junk_orders:
        flagged["orders"].append((oid, onum, email))
        if not dry_run:
            cur.execute("UPDATE orders SET is_internal = 1 WHERE id = ?", (oid,))

    # ------------------------------------------------------------------
    # 6. Flag abandoned QA registration users (never the protected logins).
    # ------------------------------------------------------------------
    junk_users = _rows(
        cur,
        f"SELECT id, email FROM users "
        f"WHERE ({JUNK_USER_PRED}) AND COALESCE(is_internal,0)=0",
    )
    for uid, email in junk_users:
        if email in PROTECTED_QA_LOGINS:
            continue  # belt-and-suspenders: never touch the protected QA logins
        flagged["users"].append((uid, email))
        if not dry_run:
            cur.execute("UPDATE users SET is_internal = 1 WHERE id = ?", (uid,))

    # ------------------------------------------------------------------
    # 7. Delete orphan QA team-member invites (broken FK placeholder rows for
    #    @laserhubqa.com invitees). These belong to the flagged QA vendors and
    #    carry an invalid user_id=0, so they are pure junk with no real owner.
    # ------------------------------------------------------------------
    junk_team = _rows(
        cur,
        "SELECT id, vendor_id, email FROM team_members "
        "WHERE email LIKE '%@laserhubqa.com' "
        "OR user_id NOT IN (SELECT id FROM users)",
    )
    for tmid, vendor_id, email in junk_team:
        deleted["team_members"].append((tmid, vendor_id, email))
        if not dry_run:
            cur.execute("DELETE FROM team_members WHERE id = ?", (tmid,))

    if not dry_run:
        conn.commit()

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print("\n--- REPAIRED ---")
    if repaired:
        for mid, old, new in repaired:
            print(f"  material #{mid}: name {old!r} -> {new!r}")
    else:
        print("  (none)")

    print("\n--- DELETED ---")
    if deleted["designs"]:
        for did, title in deleted["designs"]:
            print(f"  design   #{did}  {title!r}")
    if deleted["materials"]:
        for mid, name in deleted["materials"]:
            print(f"  material #{mid}  {name!r}")
    if deleted["material_configs"]:
        print(f"  material_configs: {len(deleted['material_configs'])} orphan config row(s) "
              f"-> {[c[0] for c in deleted['material_configs']]}")
    if deleted["team_members"]:
        for tmid, vendor_id, email in deleted["team_members"]:
            print(f"  team_member #{tmid}  vendor#{vendor_id}  {email!r} (orphan invite)")
    if not any(deleted.values()):
        print("  (none)")

    print("\n--- FLAGGED is_internal=1 ---")
    if flagged.get("materials"):
        for mid, name in flagged["materials"]:
            print(f"  material #{mid}  {name!r}")
    if flagged["vendors"]:
        for vid, shop in flagged["vendors"]:
            print(f"  vendor   #{vid}  {shop!r}")
    if flagged["orders"]:
        for oid, onum, email in flagged["orders"]:
            print(f"  order    #{oid}  {onum!r}  ({email})")
    if flagged["users"]:
        for uid, email in flagged["users"]:
            print(f"  user     #{uid}  {email!r}")
    if not any(flagged.values()):
        print("  (none)")

    print("\n--- PRESERVED (untouched) ---")
    print("  QA login accounts:", ", ".join(PROTECTED_QA_LOGINS))

    total_changes = (
        len(repaired)
        + sum(len(v) for v in deleted.values())
        + sum(len(v) for v in flagged.values())
    )
    print("\n" + "=" * 64)
    print(f"  {'Would change' if dry_run else 'Changed'} {total_changes} row group(s).")
    if total_changes == 0:
        print("  Database already clean (idempotent no-op).")
    print("=" * 64)

    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean QA/test data from LaserHub DB.")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to laserhub.db")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()
    run(args.db, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
