"""
routes/reservations.py — Reservation API (the LibreBooking replacement).

Endpoints (all under /api/reservations, signed-in users):

GET    /                  ?from=<iso>&to=<iso>[&resource=<key>]
                          Reservations overlapping the window.
GET    /now               Reservations active right now (drives the "in use"
                          highlight and the availability counts).
POST   /                  {resource_key, resource_name, resource_kind,
                           starts_at, ends_at, comment?}
                          Book for the signed-in user. 409 on overlap.
DELETE /<id>              Cancel. Owner or admin only.

Times are ISO-8601; anything with an offset (or a trailing Z) is converted to
naive UTC for storage.
"""
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user

from models import Reservation, db, reservation_conflicts, reservations_between
from routes.auth import ROLE_LEVELS, role_required

reservations_bp = Blueprint('reservations', __name__, url_prefix='/api/reservations')

MIN_LENGTH = timedelta(minutes=15)
MAX_LENGTH = timedelta(days=14)
GRACE      = timedelta(minutes=30)    # allow booking a slot that started just now


def _parse(value, field):
    if not value:
        raise ValueError(f'{field} is required')
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        raise ValueError(f'{field} is not an ISO date-time')
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _me():
    return current_user.username if current_user.is_authenticated else None


@reservations_bp.route('', methods=['GET'])
@role_required('viewer')
def list_reservations():
    now = datetime.utcnow()
    try:
        start = _parse(request.args.get('from'), 'from') if request.args.get('from') else now - timedelta(days=1)
        end   = _parse(request.args.get('to'), 'to') if request.args.get('to') else now + timedelta(days=14)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    rows = reservations_between(start, end, request.args.get('resource') or None)
    return jsonify([r.to_dict(_me()) for r in rows])


@reservations_bp.route('/now', methods=['GET'])
@role_required('viewer')
def active_now():
    now = datetime.utcnow()
    rows = reservations_between(now, now + timedelta(seconds=1))
    return jsonify([r.to_dict(_me()) for r in rows])


@reservations_bp.route('', methods=['POST'])
@role_required('viewer')
def create_reservation():
    data = request.get_json(silent=True) or {}
    key  = str(data.get('resource_key') or '').strip()
    name = str(data.get('resource_name') or '').strip() or key
    kind = 'radio' if data.get('resource_kind') == 'radio' else 'device'
    if not key or ':' not in key or len(key) > 80:
        return jsonify({'error': 'resource_key is required'}), 400
    try:
        start = _parse(data.get('starts_at'), 'starts_at')
        end   = _parse(data.get('ends_at'), 'ends_at')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if end - start < MIN_LENGTH:
        return jsonify({'error': 'A reservation must be at least 15 minutes'}), 400
    if end - start > MAX_LENGTH:
        return jsonify({'error': 'A reservation can be at most 14 days'}), 400
    if end < datetime.utcnow() - GRACE:
        return jsonify({'error': 'That time is already in the past'}), 400

    clash = reservation_conflicts(key, start, end)
    if clash:
        return jsonify({'error': 'Already reserved for part of that time',
                        'conflicts': [c.to_dict(_me()) for c in clash]}), 409

    r = Reservation(resource_key=key, resource_name=name[:120], resource_kind=kind,
                    username=_me(), comment=(str(data.get('comment') or '').strip() or None),
                    starts_at=start, ends_at=end)
    db.session.add(r)
    db.session.commit()
    return jsonify(r.to_dict(_me())), 201


@reservations_bp.route('/<int:res_id>', methods=['DELETE'])
@role_required('viewer')
def cancel_reservation(res_id):
    r = Reservation.query.get(res_id)
    if not r:
        return jsonify({'error': 'not found'}), 404
    is_admin = ROLE_LEVELS.get(getattr(current_user, 'role', None), 0) >= ROLE_LEVELS['admin']
    if r.username != _me() and not is_admin:
        return jsonify({'error': 'Only the owner or an admin can cancel this'}), 403
    db.session.delete(r)
    db.session.commit()
    return jsonify({'ok': True})
