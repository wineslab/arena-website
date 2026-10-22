"""
config.py — Application configuration.
Reads DATABASE_URL from the environment (or a .env file via python-dotenv).
"""
import json
import os
from dotenv import load_dotenv

# Load variables from .env if the file exists
load_dotenv()


def _env_bool(name, default=False):
    """Parse a boolean-ish environment variable ('1', 'true', 'yes', 'on')."""
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in ('1', 'true', 'yes', 'on')


class Config:
    # PostgreSQL connection string.
    # Override by setting DATABASE_URL in your environment or .env file.
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL', 'postgresql://localhost/arena'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Sessions ──────────────────────────────────────────────────────────────
    # Secret key for signing the Flask-Login session cookie. MUST be set to a
    # stable, secret value in production (otherwise sessions reset on restart).
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-only-change-me')

    # ── LDAP authentication ───────────────────────────────────────────────────
    # Connection
    LDAP_HOST      = os.environ.get('LDAP_HOST', '10.100.1.31')
    LDAP_PORT      = int(os.environ.get('LDAP_PORT', '636'))
    LDAP_USE_SSL   = _env_bool('LDAP_USE_SSL', True)          # LDAPS on 636
    # Verify the server's TLS certificate. Testbed servers often use a
    # self-signed cert, so this defaults to off. Turn ON in production.
    LDAP_TLS_VALIDATE = _env_bool('LDAP_TLS_VALIDATE', False)

    # Authentication strategy:
    #   'direct' — bind straight away as the user's DN, built from
    #              LDAP_USER_DN_TEMPLATE. No service account needed. This is the
    #              right choice for this directory (it refuses anonymous search).
    #   'search' — bind with a service account (or anonymously), search for the
    #              user's DN, then re-bind as them. Use when DNs aren't a simple
    #              template (e.g. users live in nested OUs).
    LDAP_AUTH_MODE = os.environ.get('LDAP_AUTH_MODE', 'direct')

    # DN template for 'direct' mode. Default builds e.g.
    #   uid=<username>,ou=Users,dc=sc2,dc=net
    LDAP_USER_DN_TEMPLATE = os.environ.get('LDAP_USER_DN_TEMPLATE', '')

    # Service account used to *search* for the user's DN ('search' mode only).
    # Leave blank to attempt an anonymous search bind.
    LDAP_BIND_DN       = os.environ.get('LDAP_BIND_DN', '')
    LDAP_BIND_PASSWORD = os.environ.get('LDAP_BIND_PASSWORD', '')

    # User lookup
    LDAP_USER_BASE_DN  = os.environ.get('LDAP_USER_BASE_DN', 'ou=Users,dc=sc2,dc=net')
    LDAP_USER_ATTR     = os.environ.get('LDAP_USERNAME_ATTRIBUTE', 'uid')

    # Group / membership lookup (for RBAC)
    LDAP_GROUP_BASE_DN   = os.environ.get('LDAP_GROUP_BASE_DN', 'dc=sc2,dc=net')
    LDAP_GROUP_NAME_ATTR = os.environ.get('LDAP_GROUP_NAME_ATTRIBUTE', 'cn')
    LDAP_MEMBER_ATTR     = os.environ.get('LDAP_MEMBER_ATTRIBUTE', 'uniqueMember')
    # 'dn'  -> groups list the member's full DN (uniqueMember=<dn>)
    # 'uid' -> groups list the bare username (memberUid=<uid>)
    LDAP_MEMBER_ATTR_TYPE = os.environ.get('LDAP_MEMBER_ATTRIBUTE_TYPE', 'dn')

    # ── RBAC: map LDAP group names (cn) to application roles ───────────────────
    # Roles, most→least privileged: admin > editor > viewer.
    #   admin  — full access incl. /db viewer and exports
    #   editor — can change mappings / devices / positions and run USRP tests
    #   viewer — read-only
    # Override via ARENA_ROLE_MAP env var as JSON, e.g.
    #   ARENA_ROLE_MAP='{"admin":["arena-admins"],"editor":["arena-users"]}'
    # Roles are assigned in the /admin GUI (DB-backed), keyed by real LDAP
    # group / username. The static map defaults to empty — no placeholders.
    ROLE_MAP = json.loads(os.environ.get('ARENA_ROLE_MAP', '{}'))

    # Role granted to an authenticated user who matches no group above.
    # Set to '' (empty) to deny login to users without a mapped group.
    DEFAULT_ROLE = os.environ.get('ARENA_DEFAULT_ROLE', 'viewer')

    # ── In-app RBAC (DB-managed grants) ────────────────────────────────────────
    # Grants stored in the `role_grants` table take precedence over the static
    # ROLE_MAP above (DB user grant → DB group grant → LDAP ROLE_MAP → default).
    # Admins manage these from the /admin panel.
    #
    # Bootstrap: usernames listed here are seeded as `admin` in the DB on first
    # startup *only if they have no grant yet*, so the first admin can sign in
    # and assign everyone else. These are ordinary admin grants (NOT a separate
    # "super admin" tier) — once seeded they can be changed/removed in the UI.
    BOOTSTRAP_ADMINS = [
        u.strip() for u in os.environ.get(
            'ARENA_BOOTSTRAP_ADMINS', 'kallangaattuvalasua'
        ).split(',') if u.strip()
    ]

    # TODO: USRP test runner integration removed — wire the new runner here.
    # The website no longer depends on the USRP_unittest folder. When a new
    # test runner is plugged in (see routes/tests.py::_run_test), it should
    # write per-run artefacts under USRP_OUTPUT_PATH as <ip>_<timestamp>/.
    USRP_OUTPUT_PATH = os.environ.get(
        'USRP_OUTPUT_PATH',
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output', 'runs'),
    )
