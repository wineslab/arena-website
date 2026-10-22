"""
routes/admin.py — Admin panel: manage who can do what.

Pages
-----
GET    /admin                     The permissions management UI (admin only).

API (admin only)
----------------
GET    /api/admin/grants          List all role grants (users + groups).
POST   /api/admin/grants          Upsert a grant {subject_type, subject, role, note}.
DELETE /api/admin/grants/<id>     Remove a grant.

Roles, most → least privileged: admin > editor > viewer.
  viewer — read-only            editor — edit + run tests        admin — full + this panel

Grants stored here take precedence over the static LDAP→role map; see
routes/auth.py for the resolution order.
"""
from flask import Blueprint, jsonify, render_template, request, session
from flask_login import current_user

from models import (
    db, RoleGrant, ROLE_LEVELS,
    list_grants, set_grant, delete_grant, list_directory, get_user_groups,
)
from routes.auth import role_required

admin_bp = Blueprint('admin', __name__)


@admin_bp.after_request
def _no_store(resp):
    """Never cache the admin page or its JSON — the panel must always reflect
    live grants/groups, and a stale cached page was rendering empty."""
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


# ── Page ───────────────────────────────────────────────────────────────────────

@admin_bp.route('/admin')
@role_required('admin')
def admin_page():
    return render_template(
        'admin.html',
        grants=list_grants(),
        roles=sorted(ROLE_LEVELS, key=ROLE_LEVELS.get),  # viewer, editor, admin
    )


# ── API ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/grants', methods=['GET'])
@role_required('admin')
def get_grants():
    return jsonify(list_grants())


@admin_bp.route('/api/admin/directory', methods=['GET'])
@role_required('admin')
def get_directory():
    """Names for the admin panel.

    `users`  — the cached LDAP directory (People autocomplete).
    `groups` — only the signed-in admin's OWN LDAP groups (captured at login,
               stored in the DB; session is a fallback), so the Groups card
               lists just those. Any group that already has a grant is unioned
               in so an existing grant is never hidden.
    """
    groups = set(get_user_groups(current_user.username)
                 or session.get('my_groups', []))
    users = set(list_directory()['users'])

    for g in list_grants():
        if g['subject_type'] == 'user':
            users.add(g['subject'])
        else:
            groups.add(g['subject'])

    return jsonify({'users': sorted(users), 'groups': sorted(groups)})


@admin_bp.route('/api/admin/grants', methods=['POST'])
@role_required('admin')
def post_grant():
    data = request.get_json(silent=True) or {}
    try:
        out = set_grant(
            data.get('subject_type'),
            data.get('subject'),
            data.get('role'),
            (data.get('note') or '').strip() or None,
        )
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    # Self-lockout guard: an admin may not strip their own admin via this route.
    if (out['subject_type'] == 'user'
            and out['subject'] == current_user.username
            and out['role'] != 'admin'):
        # Revert and reject.
        set_grant('user', current_user.username, 'admin', out['note'] or None)
        return jsonify({'error': "You can't remove your own admin access."}), 400

    return jsonify(out)


@admin_bp.route('/api/admin/grants/<int:grant_id>', methods=['DELETE'])
@role_required('admin')
def remove_grant(grant_id):
    row = RoleGrant.query.get(grant_id)
    if row is None:
        return jsonify({'error': 'not found'}), 404
    # Self-lockout guard: don't let an admin delete their own admin grant.
    if (row.subject_type == 'user' and row.subject == current_user.username
            and row.role == 'admin'):
        return jsonify({'error': "You can't remove your own admin access."}), 400
    delete_grant(grant_id)
    return jsonify({'status': 'ok'})
