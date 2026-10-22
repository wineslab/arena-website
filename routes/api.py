"""
routes/api.py — REST API blueprint.

All endpoints are prefixed with /api/.
The frontend communicates exclusively through these routes.

Endpoints
---------
GET  /api/mappings        Return all antenna mappings as JSON.
POST /api/mappings        Replace all antenna mappings.
GET  /api/phones/<floor>  Return the phone marker position for a floor.
POST /api/phones/<floor>  Update the phone marker position for a floor.
GET  /api/devices         List devices (?floor=N to filter).
POST /api/devices         Create a device.
PUT  /api/devices/<id>    Update a device (name / position / kind).
DELETE /api/devices/<id>  Remove a device.
GET  /api/antenna_positions          {antenna_id: {left, top}} overrides map.
PUT  /api/antenna_positions/<id>     Upsert one antenna's position override.
DELETE /api/antenna_positions/<id>   Drop the override (revert to default).
GET  /api/export/json     Download full config as arena_config.json.
GET  /api/export/csv      Download full config as arena_config.csv.
GET  /api/health          Quick database connectivity check.
"""
import json
from flask import Blueprint, request, jsonify, Response, abort
from models import (
    load_mappings, save_mappings, load_phone, save_phone,
    list_devices, create_device, update_device, delete_device,
    load_antenna_positions, save_antenna_position, reset_antenna_position,
)
from routes.auth import role_required

api_bp = Blueprint('api', __name__, url_prefix='/api')

# RBAC: read endpoints require `viewer`; mutating endpoints require `editor`.
# /api/health is intentionally left public for uptime checks / load balancers.


# ── Antenna mappings ──────────────────────────────────────────────────────────

@api_bp.route('/mappings', methods=['GET'])
@role_required('viewer')
def get_mappings():
    return jsonify(load_mappings())


@api_bp.route('/mappings', methods=['POST'])
@role_required('editor')
def set_mappings():
    data = request.get_json()
    save_mappings(data)
    return jsonify({'status': 'ok', 'saved': len(data)})


# ── Phone position ────────────────────────────────────────────────────────────

@api_bp.route('/phones', methods=['GET'])
@api_bp.route('/phones/<int:floor>', methods=['GET'])
@role_required('viewer')
def get_phones(floor=6):
    return jsonify(load_phone(floor))


@api_bp.route('/phones', methods=['POST'])
@api_bp.route('/phones/<int:floor>', methods=['POST'])
@role_required('editor')
def set_phones(floor=6):
    save_phone(request.get_json(), floor)
    return jsonify({'status': 'ok'})


# ── Devices (radios / UEs) ────────────────────────────────────────────────────

@api_bp.route('/devices', methods=['GET'])
@role_required('viewer')
def get_devices():
    floor = request.args.get('floor', type=int)
    return jsonify(list_devices(floor))


@api_bp.route('/devices', methods=['POST'])
@role_required('editor')
def post_device():
    data = request.get_json() or {}
    if data.get('kind') not in ('radio', 'ue'):
        return jsonify({'error': "kind must be 'radio' or 'ue'"}), 400
    return jsonify(create_device(data))


@api_bp.route('/devices/<int:device_id>', methods=['PUT'])
@role_required('editor')
def put_device(device_id):
    data = request.get_json() or {}
    out = update_device(device_id, data)
    if out is None:
        abort(404)
    return jsonify(out)


@api_bp.route('/devices/<int:device_id>', methods=['DELETE'])
@role_required('editor')
def remove_device(device_id):
    if not delete_device(device_id):
        abort(404)
    return jsonify({'status': 'ok'})


# ── Antenna position overrides ────────────────────────────────────────────────

@api_bp.route('/antenna_positions', methods=['GET'])
@role_required('viewer')
def get_antenna_positions():
    return jsonify(load_antenna_positions())


@api_bp.route('/antenna_positions/<antenna_id>', methods=['PUT'])
@role_required('editor')
def put_antenna_position(antenna_id):
    data = request.get_json() or {}
    if 'left' not in data or 'top' not in data:
        return jsonify({'error': 'left and top are required'}), 400
    try:
        left = float(data['left'])
        top  = float(data['top'])
    except (TypeError, ValueError):
        return jsonify({'error': 'left/top must be numbers'}), 400
    # Clamp to image bounds (percent)
    left = max(0.0, min(100.0, left))
    top  = max(0.0, min(100.0, top))
    return jsonify(save_antenna_position(antenna_id, left, top))


@api_bp.route('/antenna_positions/<antenna_id>', methods=['DELETE'])
@role_required('editor')
def remove_antenna_position(antenna_id):
    reset_antenna_position(antenna_id)
    return jsonify({'status': 'ok'})


# ── Exports ───────────────────────────────────────────────────────────────────

@api_bp.route('/export/json')
@role_required('viewer')
def export_json():
    """Download the full antenna configuration as a JSON file."""
    out = {'arena': 'Arena', 'antennas': load_mappings()}
    return Response(
        json.dumps(out, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment; filename=arena_config.json'},
    )


@api_bp.route('/export/csv')
@role_required('viewer')
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
