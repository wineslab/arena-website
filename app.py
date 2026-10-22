"""
app.py — Application entry point.

Creates the Flask app, registers blueprints, and initialises the database.
Run directly with: python3 app.py
"""
from flask import Flask
from sqlalchemy import inspect, text

from config import Config
from models import db


def create_app():
    """Flask application factory."""
    app = Flask(__name__)
    app.config.from_object(Config)

    # TODO: USRP_unittest sys.path injection removed. If a new test runner
    # needs to import modules from another checkout, set that up here.

    # Bind SQLAlchemy to this app
    db.init_app(app)

    # Wire LDAP authentication + RBAC (Flask-Login).
    from routes.auth import init_auth
    init_auth(app)                     # /login, /logout

    from routes.api   import api_bp
    from routes.views import views_bp
    from routes.tests import tests_bp
    from routes.admin import admin_bp
    from routes.reservations import reservations_bp

    app.register_blueprint(api_bp)     # /api/*
    app.register_blueprint(views_bp)   # /, /floorplan, /db
    app.register_blueprint(tests_bp)   # /api/test/*
    app.register_blueprint(admin_bp)   # /admin, /api/admin/*
    app.register_blueprint(reservations_bp)  # /api/reservations/*

    # Create tables if they don't exist yet, then run lightweight migrations
    with app.app_context():
        db.create_all()
        _migrate_phone_positions()
        _migrate_devices_mapped()
        _seed_bootstrap_admins(app)
        _clear_orphan_test_runs(app)

    return app


def _clear_orphan_test_runs(app):
    """Mark any test left 'running' or 'queued' as interrupted. A server restart
    kills every test worker thread and drops the run-all queue, so such a row
    can never finish on its own — otherwise it shows 'Testing…' forever and
    blocks new runs. Idempotent."""
    from datetime import datetime
    from models import TestResult
    insp = inspect(db.engine)
    if 'test_results' not in insp.get_table_names():
        return
    stuck = TestResult.query.filter(
        TestResult.status.in_(['running', 'queued'])).all()
    for r in stuck:
        r.status = 'cancelled'
        r.error = 'interrupted (server restarted while running)'
        r.finished_at = datetime.utcnow()
    if stuck:
        db.session.commit()
        app.logger.info('Cleared %d orphaned test run(s): %s',
                        len(stuck), ', '.join(str(r.id) for r in stuck))


def _seed_bootstrap_admins(app):
    """Seed the configured bootstrap admin(s) as DB admin grants so the first
    admin can sign in and manage everyone else. Idempotent — only seeds users
    who have no grant yet (see models.seed_admin_grants)."""
    from models import seed_admin_grants
    created = seed_admin_grants(app.config.get('BOOTSTRAP_ADMINS', []))
    if created:
        app.logger.info('Seeded bootstrap admin grant(s): %s', ', '.join(created))


def _migrate_devices_mapped():
    """Add `mapped` column to devices if missing. Idempotent."""
    insp = inspect(db.engine)
    if 'devices' not in insp.get_table_names():
        return
    cols = {c['name'] for c in insp.get_columns('devices')}
    if 'mapped' in cols:
        return
    db.session.execute(text(
        "ALTER TABLE devices ADD COLUMN mapped BOOLEAN NOT NULL DEFAULT 0"
    ))
    db.session.commit()


def _migrate_phone_positions():
    """Add `floor` column + unique index to phone_positions if missing.
    Idempotent — safe to run on every startup."""
    insp = inspect(db.engine)
    if 'phone_positions' not in insp.get_table_names():
        return
    cols = {c['name'] for c in insp.get_columns('phone_positions')}
    if 'floor' in cols:
        return
    db.session.execute(text(
        "ALTER TABLE phone_positions ADD COLUMN floor INTEGER NOT NULL DEFAULT 6"
    ))
    db.session.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS phone_positions_floor_key "
        "ON phone_positions (floor)"
    ))
    db.session.commit()


if __name__ == '__main__':
    app = create_app()
    print('Arena Antenna Mapper  →  http://localhost:8080')
    print('Database viewer       →  http://localhost:8080/db')
    print('Health check          →  http://localhost:8080/api/health')
    app.run(host='0.0.0.0', port=8080, debug=True)
