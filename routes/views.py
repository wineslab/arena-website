"""
routes/views.py — HTML page and static asset routes.

Routes
------
GET /          Main SPA (antenna mapper UI).
GET /floorplan Serves the floor plan SVG image.
GET /db        Read-only database viewer (table + JSON tabs).
"""
import json, os
from flask import Blueprint, render_template, send_from_directory
from models import AntennaMapping, PhonePosition

views_bp = Blueprint('views', __name__)

# Absolute path to the static/img directory
_IMG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'img')


@views_bp.route('/')
def index():
    return render_template('index.html')


@views_bp.route('/floorplan')
def floorplan():
    """Serve the floor plan SVG (referenced as /floorplan in app.js)."""
    return send_from_directory(_IMG_DIR, 'floorplan.svg')


@views_bp.route('/db')
def db_viewer():
    """Read-only view of both database tables (table view + raw JSON view)."""
    mappings = AntennaMapping.query.order_by(AntennaMapping.antenna_id).all()
    phone    = PhonePosition.query.first()

    # Pre-serialise to JSON strings for the JSON tab
    mappings_dict = {r.antenna_id: r.to_dict() for r in mappings}
    phone_dict    = {'left': phone.left, 'top': phone.top} if phone else {}

    return render_template(
        'db.html',
        mappings      = mappings,
        phone         = phone,
        mappings_json = json.dumps(mappings_dict, indent=2),
        phone_json    = json.dumps(phone_dict,    indent=2),
    )
