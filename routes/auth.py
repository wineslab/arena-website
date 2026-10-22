"""
routes/auth.py — LDAP authentication + role-based access control (RBAC).

Authentication flow ("search + bind")
--------------------------------------
1. Connect to the LDAP server (LDAPS by default).
2. Bind for searching — with a service account if configured, else anonymously —
   and look up the user's full DN by their username attribute (e.g. uid).
3. Re-bind as that DN using the password the user typed. A successful bind
   proves the credentials.
4. Search the group tree for groups the user belongs to and map those group
   names (cn) to an application role via Config.ROLE_MAP.

Roles (most → least privileged): admin > editor > viewer.

Exports
-------
login_manager        Flask-Login manager (init with init_auth(app)).
init_auth(app)       Wire Flask-Login + register this blueprint.
login_required       Re-exported from flask_login.
role_required(role)  Decorator gating a route on a minimum role.
current_role()       Convenience accessor for the logged-in user's role.
"""
from functools import wraps

from flask import (
    Blueprint, current_app, flash, jsonify, redirect,
    render_template, request, session, url_for,
)
from flask_login import (
    LoginManager, UserMixin, current_user,
    login_required, login_user, logout_user,
)
from ldap3 import ALL, SUBTREE, Connection, Server, Tls
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars
import ssl

auth_bp = Blueprint('auth', __name__)
login_manager = LoginManager()

# Role hierarchy — higher number = more privilege.
ROLE_LEVELS = {'viewer': 1, 'editor': 2, 'admin': 3}


# ── User object ───────────────────────────────────────────────────────────────

class LDAPUser(UserMixin):
    """A logged-in user. Identity + role live in the session cookie; we do not
    keep a local user table. `get_id()` encodes username|role so the session
    survives across requests without re-querying LDAP."""

    def __init__(self, username, role, dn=''):
        self.id = username
        self.username = username
        self.role = role
        self.dn = dn

    def get_id(self):
        return f'{self.username}|{self.role}'


@login_manager.user_loader
def _load_user(user_id):
    """Rebuild the user from the signed session id. No LDAP round-trip.

    DB role grants are re-resolved on every request — both direct user grants
    and group grants, the latter using the groups captured at the user's last
    login (stored in the DB). So a role change in the admin panel (user OR
    group) takes effect immediately on the member's next request, without
    forcing them to sign out and back in. (A brand-new LDAP group membership
    still needs one fresh login, since membership is only read from LDAP at
    sign-in.) Falls back to the login-baked role when the DB has no grant."""
    if not user_id or '|' not in user_id:
        return None
    username, role = user_id.split('|', 1)
    if role not in ROLE_LEVELS:
        return None

    from models import resolve_db_role, get_user_groups
    live = resolve_db_role(username, get_user_groups(username))
    if live in ROLE_LEVELS:
        role = live
    return LDAPUser(username, role)


# ── LDAP plumbing ─────────────────────────────────────────────────────────────

def _server():
    cfg = current_app.config
    tls = None
    if cfg['LDAP_USE_SSL']:
        validate = ssl.CERT_REQUIRED if cfg['LDAP_TLS_VALIDATE'] else ssl.CERT_NONE
        tls = Tls(validate=validate)
    return Server(
        host=cfg['LDAP_HOST'],
        port=cfg['LDAP_PORT'],
        use_ssl=cfg['LDAP_USE_SSL'],
        tls=tls,
        get_info=ALL,
        connect_timeout=10,
    )


def _role_for_groups(group_names):
    """Pick the highest-privilege role whose mapped group list intersects the
    user's groups. Falls back to DEFAULT_ROLE (which may be '')."""
    cfg = current_app.config
    have = {g.lower() for g in group_names}
    best = None
    for role, groups in cfg['ROLE_MAP'].items():
        if role not in ROLE_LEVELS:
            continue
        if have & {g.lower() for g in groups}:
            if best is None or ROLE_LEVELS[role] > ROLE_LEVELS[best]:
                best = role
    return best or (cfg['DEFAULT_ROLE'] or None)


def _user_dn_template():
    """The DN template used by 'direct' mode. Defaults to
    '<attr>={username},<user_base_dn>' if none is configured."""
    cfg = current_app.config
    tmpl = cfg['LDAP_USER_DN_TEMPLATE']
    if tmpl:
        return tmpl
    return f"{cfg['LDAP_USER_ATTR']}={{username}}," + cfg['LDAP_USER_BASE_DN']


def _resolve_user_dn(server, username, password, safe_user):
    """Return (user_dn, authenticated_connection) or (None, None) on bad creds.

    Honours LDAP_AUTH_MODE:
      'direct' — bind immediately as the templated DN.
      'search' — bind (service acct/anon), search for the DN, re-bind as user.
    Raises RuntimeError on server/configuration errors.
    """
    cfg = current_app.config

    if cfg['LDAP_AUTH_MODE'] == 'direct':
        user_dn = _user_dn_template().format(username=username)
        try:
            conn = Connection(server, user=user_dn, password=password)
            if not conn.bind():
                return None, None             # wrong password / no such user
        except LDAPException as e:
            raise RuntimeError(f'LDAP bind failed: {e}') from e
        return user_dn, conn

    # 'search' mode: locate the DN with a (service-account or anonymous) bind.
    try:
        search_conn = Connection(
            server,
            user=cfg['LDAP_BIND_DN'] or None,
            password=cfg['LDAP_BIND_PASSWORD'] or None,
            auto_bind=True,
        )
    except LDAPException as e:
        raise RuntimeError(f'LDAP search bind failed: {e}') from e

    try:
        user_filter = f"({cfg['LDAP_USER_ATTR']}={safe_user})"
        search_conn.search(
            search_base=cfg['LDAP_USER_BASE_DN'],
            search_filter=user_filter,
            search_scope=SUBTREE,
            attributes=[cfg['LDAP_USER_ATTR']],
        )
        if not search_conn.entries:
            return None, None                 # no such user
        user_dn = search_conn.entries[0].entry_dn
    finally:
        search_conn.unbind()

    try:
        user_conn = Connection(server, user=user_dn, password=password)
        if not user_conn.bind():
            return None, None                 # wrong password
    except LDAPException as e:
        raise RuntimeError(f'LDAP user bind failed: {e}') from e
    return user_dn, user_conn


def ldap_authenticate(username, password):
    """Authenticate `username`/`password` against LDAP.

    Returns an LDAPUser on success, or None on bad credentials / no role.
    Raises RuntimeError if the directory itself is unreachable/misconfigured,
    so the login view can show a distinct "server error" message.
    """
    if not username or not password:
        return None

    cfg = current_app.config
    server = _server()
    safe_user = escape_filter_chars(username)

    # 1 + 2) Resolve the user's DN and obtain a bound (authenticated) connection.
    user_dn, user_conn = _resolve_user_dn(server, username, password, safe_user)
    if user_conn is None:
        return None

    # 3) Resolve group membership -> role.
    try:
        member_value = user_dn if cfg['LDAP_MEMBER_ATTR_TYPE'] == 'dn' else username
        group_filter = f"({cfg['LDAP_MEMBER_ATTR']}={escape_filter_chars(member_value)})"
        user_conn.search(
            search_base=cfg['LDAP_GROUP_BASE_DN'],
            search_filter=group_filter,
            search_scope=SUBTREE,
            attributes=[cfg['LDAP_GROUP_NAME_ATTR']],
        )
        groups = []
        for entry in user_conn.entries:
            val = entry[cfg['LDAP_GROUP_NAME_ATTR']].value
            if isinstance(val, (list, tuple)):
                groups.extend(str(v) for v in val)
            elif val is not None:
                groups.append(str(val))

        # Remember *this user's own* groups so the admin panel can show only
        # the groups they actually belong to (not every group in the
        # directory). Persisted in the DB (durable across refreshes/restarts/
        # browsers) with the session as a fast fallback.
        from models import set_user_groups
        my_groups = sorted(set(groups))
        session['my_groups'] = my_groups
        set_user_groups(username, my_groups)

        # Best-effort: refresh the local directory cache (for admin-panel
        # autocomplete) while we still hold an authenticated connection.
        _cache_directory(user_conn)
    finally:
        user_conn.unbind()

    # Resolve role. DB-managed grants (admin panel) win; the static LDAP→role
    # map is the fallback so existing configuration keeps working.
    #   DB user grant → DB group grant → LDAP ROLE_MAP → DEFAULT_ROLE
    from models import resolve_db_role
    role = resolve_db_role(username, groups) or _role_for_groups(groups)
    if not role:
        # Authenticated, but no role -> not authorised to use the app.
        return None

    return LDAPUser(username, role, dn=user_dn)


def _cache_directory(conn):
    """Snapshot the directory's users and groups into the local cache so the
    admin panel can suggest existing people/groups. Best-effort — any failure
    (no search permission, server limits, …) is logged and swallowed so it can
    never break login. Uses the already-authenticated `conn`."""
    cfg = current_app.config
    try:
        from models import cache_directory_entries

        # Users under the user base (e.g. uid=*).
        conn.search(
            search_base=cfg['LDAP_USER_BASE_DN'],
            search_filter=f"({cfg['LDAP_USER_ATTR']}=*)",
            search_scope=SUBTREE,
            attributes=[cfg['LDAP_USER_ATTR']],
        )
        users = [str(e[cfg['LDAP_USER_ATTR']].value)
                 for e in conn.entries if e[cfg['LDAP_USER_ATTR']].value]

        # Groups: any object that carries the membership attribute.
        conn.search(
            search_base=cfg['LDAP_GROUP_BASE_DN'],
            search_filter=f"({cfg['LDAP_MEMBER_ATTR']}=*)",
            search_scope=SUBTREE,
            attributes=[cfg['LDAP_GROUP_NAME_ATTR']],
        )
        groups = []
        for e in conn.entries:
            val = e[cfg['LDAP_GROUP_NAME_ATTR']].value
            if isinstance(val, (list, tuple)):
                groups.extend(str(v) for v in val)
            elif val is not None:
                groups.append(str(val))

        cache_directory_entries('user', users)
        cache_directory_entries('group', groups)
    except Exception as e:  # noqa: BLE001 — must never break login
        current_app.logger.warning('directory cache refresh failed: %s', e)


# ── RBAC decorator ────────────────────────────────────────────────────────────

def current_role():
    return getattr(current_user, 'role', None) if current_user.is_authenticated else None


def role_required(minimum):
    """Require the logged-in user to have at least `minimum` role.

    Unauthenticated callers are redirected to login (or get 401 JSON for /api).
    Authenticated-but-under-privileged callers get 403.
    """
    need = ROLE_LEVELS[minimum]

    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not current_user.is_authenticated:
                return _unauthorized()
            if ROLE_LEVELS.get(current_user.role, 0) < need:
                if _wants_json():
                    return jsonify({'error': 'forbidden',
                                    'need_role': minimum}), 403
                return render_template('403.html', need=minimum), 403
            return view(*args, **kwargs)
        return wrapped
    return decorator


def _wants_json():
    return request.path.startswith('/api/')


def _unauthorized():
    if _wants_json():
        return jsonify({'error': 'authentication required'}), 401
    return redirect(url_for('auth.login', next=request.path))


# ── Routes ────────────────────────────────────────────────────────────────────

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('views.index'))

    if request.method == 'POST':
        username = (request.form.get('username') or '').strip()
        password = request.form.get('password') or ''
        try:
            user = ldap_authenticate(username, password)
        except RuntimeError as e:
            current_app.logger.error('LDAP error: %s', e)
            flash('Could not reach the authentication server. Try again later.',
                  'error')
            return render_template('login.html'), 503

        if user is None:
            flash('Invalid credentials, or your account has no assigned role.',
                  'error')
            return render_template('login.html'), 401

        login_user(user)
        nxt = request.args.get('next')
        # Only allow same-site relative redirects.
        if not nxt or not nxt.startswith('/') or nxt.startswith('//'):
            nxt = url_for('views.index')
        return redirect(nxt)

    return render_template('login.html')


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been signed out.', 'info')
    return redirect(url_for('auth.login'))


# ── Wiring ────────────────────────────────────────────────────────────────────

def init_auth(app):
    """Initialise Flask-Login and register the auth blueprint."""
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Please sign in to continue.'

    # For /api/* requests, return 401 JSON instead of redirecting to the login page.
    @login_manager.unauthorized_handler
    def _on_unauthorized():
        return _unauthorized()

    # Expose the current role to all templates (for nav / conditional UI).
    @app.context_processor
    def _inject_role():
        return {'current_role': current_role()}

    app.register_blueprint(auth_bp)
