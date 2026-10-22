"""
migrate_sqlite_to_postgres.py — one-shot data copy from the old SQLite file
into the Dockerised PostgreSQL database.

Usage
-----
1. Start Postgres:           docker compose up -d
2. Make sure .env points DATABASE_URL at Postgres (it does by default now).
3. Run:                      python3 migrate_sqlite_to_postgres.py

What it does
------------
- Connects to the destination DB via the app factory (so DATABASE_URL / Config
  are honoured) and creates all tables + runs migrations + seeds bootstrap admins.
- Reads every row from the old SQLite file with the stdlib sqlite3 module and
  re-inserts it through the SQLAlchemy models, converting timestamp strings to
  datetimes. Datetime-aware and idempotent-ish (skips tables already populated).

Safe to re-run: by default it refuses to touch a destination table that already
has rows (pass --force to wipe + recopy those tables).
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.types import DateTime

# Default source = the populated SQLite DB Flask used (instance/arena.db).
DEFAULT_SQLITE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              'instance', 'arena.db')

# Tables to copy, in FK-safe order. role_grants is intentionally NOT copied —
# it's new and seeded by the app (bootstrap admins) / managed in the UI.
TABLES = [
    'antenna_mappings',
    'phone_positions',
    'devices',
    'antenna_positions',
    'test_results',
]


def _parse_dt(val):
    """Best-effort parse of a SQLite datetime string into a datetime."""
    if val is None or isinstance(val, datetime):
        return val
    s = str(val).strip()
    if not s:
        return None
    s = s.replace('Z', '').replace('T', ' ')
    for fmt in ('%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sqlite', default=DEFAULT_SQLITE,
                    help=f'source SQLite file (default: {DEFAULT_SQLITE})')
    ap.add_argument('--force', action='store_true',
                    help='wipe + recopy destination tables that already have rows')
    args = ap.parse_args()

    if not os.path.exists(args.sqlite):
        sys.exit(f'Source SQLite file not found: {args.sqlite}')

    # Import here so DATABASE_URL (Postgres) is read by Config at app creation.
    from app import create_app
    from models import db

    app = create_app()  # creates tables, runs migrations, seeds bootstrap admins

    # Map table name -> ORM model class via SQLAlchemy metadata.
    model_by_table = {m.__tablename__: m for m in db.Model.__subclasses__()}

    src = sqlite3.connect(args.sqlite)
    src.row_factory = sqlite3.Row

    # Which source tables actually exist?
    have = {r[0] for r in src.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}

    totals = {}
    with app.app_context():
        insp = sa_inspect(db.engine)
        for table in TABLES:
            model = model_by_table.get(table)
            if model is None or table not in have:
                print(f'skip {table:<20} (not present)')
                continue

            existing = db.session.query(model).count()
            if existing and not args.force:
                print(f'skip {table:<20} (dest already has {existing} rows; '
                      f'use --force to overwrite)')
                continue
            if existing and args.force:
                db.session.query(model).delete()
                db.session.commit()

            # Datetime columns on the model, for string→datetime conversion.
            dt_cols = {c.name for c in model.__table__.columns
                       if isinstance(c.type, DateTime)}
            model_cols = {c.name for c in model.__table__.columns}

            rows = src.execute(f'SELECT * FROM "{table}"').fetchall()
            n = 0
            for r in rows:
                data = {k: r[k] for k in r.keys() if k in model_cols}
                for k in list(data):
                    if k in dt_cols:
                        data[k] = _parse_dt(data[k])
                db.session.add(model(**data))
                n += 1
            db.session.commit()
            totals[table] = n
            print(f'copied {table:<20} {n} rows')

    src.close()
    print('\nDone. Copied:', ', '.join(f'{k}={v}' for k, v in totals.items()) or 'nothing')


if __name__ == '__main__':
    main()
