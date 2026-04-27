"""
routes/api.py — REST API blueprint.

All endpoints are prefixed with /api/.
The frontend communicates exclusively through these routes.

Endpoints
---------
GET  /api/mappings        Return all antenna mappings as JSON.
POST /api/mappings        Replace all antenna mappings.
GET  /api/phones          Return the phone marker position.
POST /api/phones          Update the phone marker position.
GET  /api/export/json     Download full config as arena_config.json.
GET  /api/export/csv      Download full config as arena_config.csv.
GET  /api/health          Quick database connectivity check.
"""
import json
from flask import Blueprint, request, jsonify, Response
from models import load_mappings, save_mappings, load_phone, save_phone

api_bp = Blueprint('api', __name__, url_prefix='/api')


# ── Antenna mappings ──────────────────────────────────────────────────────────

@api_bp.route('/mappings', methods=['GET'])
def get_mappings():
    return jsonify(load_mappings())


@api_bp.route('/mappings', methods=['POST'])
def set_mappings():
    data = request.get_json()
    save_mappings(data)
    return jsonify({'status': 'ok', 'saved': len(data)})


# ── Phone position ────────────────────────────────────────────────────────────

@api_bp.route('/phones', methods=['GET'])
def get_phones():
    return jsonify(load_phone())


@api_bp.route('/phones', methods=['POST'])
def set_phones():
    save_phone(request.get_json())
    return jsonify({'status': 'ok'})


# ── Exports ───────────────────────────────────────────────────────────────────

@api_bp.route('/export/json')
def export_json():
    """Download the full antenna configuration as a JSON file."""
    out = {'arena': 'Arena', 'antennas': load_mappings()}
    return Response(
        json.dumps(out, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment; filename=arena_config.json'},
    )


@api_bp.route('/export/csv')
def export_csv():
    """Download the full antenna configuration as a CSV file."""
    mappings = load_mappings()
    rows = [
        'antenna_id,p1_serial,p1_model,p1_chan,p1_port,'
        'p2_serial,p2_model,p2_chan,p2_port,freq_mhz,gain_db,notes'
    ]
    for ant_id, m in mappings.items():
        rows.append(
            f"{ant_id},"
            f"{m.get('p1_serial','')},"
            f"{m.get('p1_model','')},"
            f"{m.get('p1_chan','')},"
            f"{m.get('p1_port','')},"
            f"{m.get('p2_serial','')},"
            f"{m.get('p2_model','')},"
            f"{m.get('p2_chan','')},"
            f"{m.get('p2_port','')},"
            f"{m.get('freq_mhz','')},"
            f"{m.get('gain_db','')},"
            f"{m.get('notes','')}"
        )
    return Response(
        '\n'.join(rows),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=arena_config.csv'},
    )


# ── Health check ──────────────────────────────────────────────────────────────

@api_bp.route('/health')
def health():
    """Returns 200 if the app is running and the database is reachable."""
    try:
        count = load_mappings()
        return jsonify({'status': 'ok', 'antenna_count': len(count)})
    except Exception as e:
        return jsonify({'status': 'error', 'detail': str(e)}), 500
