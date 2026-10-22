"""
routes/views.py — HTML page and static asset routes.

Routes
------
GET /                   Main SPA (antenna mapper UI).
GET /floorplan          Serves the 6th floor plan (default).
GET /floorplan/<floor>  Serves a specific floor plan (6 or 7).
GET /db                 Read-only database viewer — every table, every row.
"""
import json, os
from flask import Blueprint, abort, render_template, send_from_directory
from models import (
    AntennaMapping, list_phone_positions,
    list_devices, list_antenna_positions, list_test_results,
)
from routes.auth import role_required

views_bp = Blueprint('views', __name__)

# Absolute path to the static/img directory
_IMG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'img')

_FLOOR_FILES = {
    6: 'floorplan.svg',
    7: 'floorplan-7.svg',
}


@views_bp.route('/')
@role_required('viewer')
def index():
    return render_template('index.html')


@views_bp.route('/floorplan')
@views_bp.route('/floorplan/<int:floor>')
@role_required('viewer')
def floorplan(floor=6):
    """Serve a floor plan image. Defaults to the 6th floor."""
    fname = _FLOOR_FILES.get(floor)
    if not fname:
        abort(404)
    return send_from_directory(_IMG_DIR, fname)


@views_bp.route('/db')
@role_required('admin')
def db_viewer():
    """Read-only view of every database table — table view + raw JSON view."""
    mappings = AntennaMapping.query.order_by(AntennaMapping.antenna_id).all()
    phones   = list_phone_positions()
    devices  = list_devices()                  # all floors
    ant_pos  = list_antenna_positions()
    tests    = list_test_results(limit=200)

    # Pre-serialise each table to a JSON string for the JSON tab
    mappings_dict = {r.antenna_id: r.to_dict() for r in mappings}
    phones_list   = [{'id': p.id, 'floor': p.floor, 'left': p.left, 'top': p.top}
                     for p in phones]
    ant_pos_list  = [r.to_dict() for r in ant_pos]
    tests_list    = [t.to_summary() for t in tests]

    return render_template(
        'db.html',
        mappings           = mappings,
        phones             = phones,
        devices            = devices,
        antenna_positions  = ant_pos,
        test_results       = tests,
        mappings_json          = json.dumps(mappings_dict, indent=2),
        phones_json            = json.dumps(phones_list,   indent=2),
        devices_json           = json.dumps(devices,       indent=2),
        antenna_positions_json = json.dumps(ant_pos_list,  indent=2),
        test_results_json      = json.dumps(tests_list,    indent=2),
    )
