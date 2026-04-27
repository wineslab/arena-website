"""
models.py — SQLAlchemy ORM models and database helper functions.

Tables
------
antenna_mappings  One row per configured antenna (keyed by antenna_id).
phone_positions   Single row storing the phone marker's floor-plan position.
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# ── Models ────────────────────────────────────────────────────────────────────

class AntennaMapping(db.Model):
    """Maps a physical patch antenna to its USRP radio ports."""
    __tablename__ = 'antenna_mappings'

    antenna_id = db.Column(db.String(20), primary_key=True)  # e.g. "AR2_A1"

    # Port 1 — TX / Rx1
    p1_serial = db.Column(db.String(50), nullable=False, default='')  # USRP IP
    p1_model  = db.Column(db.String(20), nullable=False, default='')  # X410, X310 …
    p1_port   = db.Column(db.String(20), nullable=False, default='')  # A:0, B:1 …

    # Port 2 — Rx2
    p2_serial = db.Column(db.String(50), nullable=False, default='')
    p2_model  = db.Column(db.String(20), nullable=False, default='')
    p2_port   = db.Column(db.String(20), nullable=False, default='')

    def to_dict(self):
        """Return a plain dict suitable for JSON serialisation."""
        return {
            'p1_serial': self.p1_serial,
            'p1_model':  self.p1_model,
            'p1_port':   self.p1_port,
            'p2_serial': self.p2_serial,
            'p2_model':  self.p2_model,
            'p2_port':   self.p2_port,
        }


class PhonePosition(db.Model):
    """Stores the draggable phone marker's position on the floor plan.
    Always a single row (id = 1)."""
    __tablename__ = 'phone_positions'

    id   = db.Column(db.Integer, primary_key=True)
    # Percentage offsets over the floor-plan image (0–100)
    left = db.Column(db.Float, nullable=False, default=50.0)
    top  = db.Column(db.Float, nullable=False, default=50.0)


# ── Database helpers ──────────────────────────────────────────────────────────

def load_mappings():
    """Return all antenna mappings as {antenna_id: dict}."""
    return {r.antenna_id: r.to_dict() for r in AntennaMapping.query.all()}


def save_mappings(data):
    """Replace the entire antenna_mappings table with the given dict."""
    AntennaMapping.query.delete()
    for aid, m in data.items():
        db.session.add(AntennaMapping(
            antenna_id=aid,
            p1_serial=m.get('p1_serial', ''),
            p1_model =m.get('p1_model',  ''),
            p1_port  =m.get('p1_port',   ''),
            p2_serial=m.get('p2_serial', ''),
            p2_model =m.get('p2_model',  ''),
            p2_port  =m.get('p2_port',   ''),
        ))
    db.session.commit()


def load_phone():
    """Return the phone position as {left, top}, or {} if not yet set."""
    row = PhonePosition.query.first()
    return {'left': row.left, 'top': row.top} if row else {}


def save_phone(data):
    """Upsert the single phone position row."""
    row = PhonePosition.query.first()
    if row:
        row.left = data.get('left', row.left)
        row.top  = data.get('top',  row.top)
    else:
        db.session.add(PhonePosition(
            left=data.get('left', 50.0),
            top =data.get('top',  50.0),
        ))
    db.session.commit()
