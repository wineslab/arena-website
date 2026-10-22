"""
models.py — SQLAlchemy ORM models and database helper functions.

Tables
------
antenna_mappings  One row per configured antenna (keyed by antenna_id).
phone_positions   Single row storing the phone marker's floor-plan position.
test_results      One row per USRP test run (history + last-result lookup).
reservations      Bookings of radios / devices (the LibreBooking replacement).
"""
import json
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc

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
    One row per floor (keyed by floor number)."""
    __tablename__ = 'phone_positions'

    id    = db.Column(db.Integer, primary_key=True)
    floor = db.Column(db.Integer, nullable=False, unique=True, default=6)
    # Percentage offsets over the floor-plan image (0–100)
    left  = db.Column(db.Float, nullable=False, default=50.0)
    top   = db.Column(db.Float, nullable=False, default=50.0)


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


def load_phone(floor=6):
    """Return the phone position for a floor as {left, top}, or {} if unset."""
    row = PhonePosition.query.filter_by(floor=floor).first()
    return {'left': row.left, 'top': row.top} if row else {}


def list_phone_positions():
    """Return all phone rows (one per floor) ordered by floor."""
    return PhonePosition.query.order_by(PhonePosition.floor).all()


def save_phone(data, floor=6):
    """Upsert the phone position row for the given floor."""
    row = PhonePosition.query.filter_by(floor=floor).first()
    if row:
        row.left = data.get('left', row.left)
        row.top  = data.get('top',  row.top)
    else:
        db.session.add(PhonePosition(
            floor=floor,
            left =data.get('left', 50.0),
            top  =data.get('top',  50.0),
        ))
    db.session.commit()


# ── Floor-plan devices (radios / UEs) ─────────────────────────────────────────

class Device(db.Model):
    """User-placed marker on the floor plan (radio or UE).
    Independent of antennas (which are fixed) and the phone marker."""
    __tablename__ = 'devices'

    id     = db.Column(db.Integer, primary_key=True)
    floor  = db.Column(db.Integer, nullable=False, default=6, index=True)
    kind   = db.Column(db.String(20), nullable=False)             # 'radio' | 'ue'
    name   = db.Column(db.String(80), nullable=False, default='Device')
    # Percentage offsets over the floor-plan image (0–100)
    left   = db.Column(db.Float, nullable=False, default=50.0)
    top    = db.Column(db.Float, nullable=False, default=50.0)
    # User-toggled mapped/unmapped state — used by the filter chips. Marker
    # styling is unchanged regardless of this flag (per the design decision
    # to keep radio/UE visuals consistent).
    mapped = db.Column(db.Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            'id':     self.id,
            'floor':  self.floor,
            'kind':   self.kind,
            'name':   self.name,
            'left':   self.left,
            'top':    self.top,
            'mapped': bool(self.mapped),
        }


def list_devices(floor=None):
    q = Device.query
    if floor is not None:
        q = q.filter_by(floor=floor)
    return [d.to_dict() for d in q.order_by(Device.id).all()]


def create_device(data):
    d = Device(
        floor =int(data.get('floor', 6)),
        kind  =str(data.get('kind', 'ue')),
        name  =str(data.get('name', 'Device')),
        left  =float(data.get('left', 50.0)),
        top   =float(data.get('top',  50.0)),
        mapped=bool(data.get('mapped', False)),
    )
    db.session.add(d)
    db.session.commit()
    return d.to_dict()


def update_device(device_id, data):
    d = Device.query.get(device_id)
    if not d:
        return None
    if 'name'   in data: d.name   = str(data['name'])
    if 'left'   in data: d.left   = float(data['left'])
    if 'top'    in data: d.top    = float(data['top'])
    if 'kind'   in data: d.kind   = str(data['kind'])
    if 'floor'  in data: d.floor  = int(data['floor'])
    if 'mapped' in data: d.mapped = bool(data['mapped'])
    db.session.commit()
    return d.to_dict()


def delete_device(device_id):
    d = Device.query.get(device_id)
    if not d:
        return False
    db.session.delete(d)
    db.session.commit()
    return True


# ── Antenna position overrides ────────────────────────────────────────────────

class AntennaPosition(db.Model):
    """User-overridden floor-plan position for a specific antenna.

    When a row exists, the frontend uses these (left, top) percentages
    instead of the hard-coded defaults baked into static/js/app.js.
    Deleting the row reverts the antenna to its default position."""
    __tablename__ = 'antenna_positions'

    antenna_id = db.Column(db.String(20), primary_key=True)
    left       = db.Column(db.Float, nullable=False, default=50.0)
    top        = db.Column(db.Float, nullable=False, default=50.0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            'antenna_id': self.antenna_id,
            'left':       self.left,
            'top':        self.top,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
        }


def load_antenna_positions():
    """Return {antenna_id: {left, top}} for every override row."""
    return {r.antenna_id: {'left': r.left, 'top': r.top}
            for r in AntennaPosition.query.all()}


def list_antenna_positions():
    """Return all AntennaPosition rows ordered by antenna_id (for /db viewer)."""
    return AntennaPosition.query.order_by(AntennaPosition.antenna_id).all()


def save_antenna_position(antenna_id, left, top):
    """Upsert one antenna position override. Returns the resulting dict."""
    row = AntennaPosition.query.get(antenna_id)
    if row:
        row.left = float(left)
        row.top  = float(top)
    else:
        row = AntennaPosition(antenna_id=antenna_id,
                              left=float(left), top=float(top))
        db.session.add(row)
    db.session.commit()
    return {'antenna_id': antenna_id, 'left': float(left), 'top': float(top)}


def reset_antenna_position(antenna_id):
    """Delete an override so the antenna reverts to its default. Returns True if removed."""
    row = AntennaPosition.query.get(antenna_id)
    if not row:
        return False
    db.session.delete(row)
    db.session.commit()
    return True


# ── Access control: role grants (RBAC managed in-app) ─────────────────────────

# Role ordering, most → least privileged. Kept in sync with routes/auth.py.
ROLE_LEVELS = {'viewer': 1, 'editor': 2, 'admin': 3}


class RoleGrant(db.Model):
    """A role assigned to a single user or to an LDAP group, managed from the
    in-app admin panel. These take precedence over the static LDAP→role map
    in config (which remains a fallback). One row per subject."""
    __tablename__ = 'role_grants'

    id           = db.Column(db.Integer, primary_key=True)
    subject_type = db.Column(db.String(10), nullable=False)   # 'user' | 'group'
    subject      = db.Column(db.String(120), nullable=False)  # username or group cn
    role         = db.Column(db.String(20), nullable=False)   # viewer|editor|admin
    note         = db.Column(db.String(200), nullable=True)
    updated_at   = db.Column(db.DateTime, default=datetime.utcnow,
                             onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('subject_type', 'subject', name='uq_role_grant_subject'),
    )

    def to_dict(self):
        return {
            'id':           self.id,
            'subject_type': self.subject_type,
            'subject':      self.subject,
            'role':         self.role,
            'note':         self.note or '',
            'updated_at':   self.updated_at.isoformat() + 'Z' if self.updated_at else None,
        }


def list_grants():
    """All role grants, users first then groups, alphabetised within each."""
    rows = RoleGrant.query.order_by(
        RoleGrant.subject_type, RoleGrant.subject
    ).all()
    return [r.to_dict() for r in rows]


def set_grant(subject_type, subject, role, note=None):
    """Upsert a grant for (subject_type, subject). Returns its dict, or raises
    ValueError on invalid input."""
    subject_type = (subject_type or '').strip().lower()
    subject      = (subject or '').strip()
    role         = (role or '').strip().lower()
    if subject_type not in ('user', 'group'):
        raise ValueError("subject_type must be 'user' or 'group'")
    if not subject:
        raise ValueError('subject is required')
    if role not in ROLE_LEVELS:
        raise ValueError("role must be one of viewer/editor/admin")

    row = RoleGrant.query.filter_by(subject_type=subject_type, subject=subject).first()
    if row:
        row.role = role
        row.note = note
    else:
        row = RoleGrant(subject_type=subject_type, subject=subject,
                        role=role, note=note)
        db.session.add(row)
    db.session.commit()
    return row.to_dict()


def delete_grant(grant_id):
    """Delete a grant by id. Returns the deleted dict, or None if not found."""
    row = RoleGrant.query.get(grant_id)
    if not row:
        return None
    out = row.to_dict()
    db.session.delete(row)
    db.session.commit()
    return out


def user_grant_role(username):
    """The role granted directly to a user, or None. Used for live re-resolution
    on every request (no LDAP round-trip needed)."""
    if not username:
        return None
    row = RoleGrant.query.filter_by(subject_type='user', subject=username).first()
    return row.role if row else None


def resolve_db_role(username, groups):
    """Resolve the app role for a user from DB grants only (no LDAP fallback).

    A direct user grant wins outright; otherwise the highest-privilege role
    among the user's group grants is used. Returns the role string or None
    when the DB has nothing to say (caller then falls back to LDAP/default)."""
    direct = user_grant_role(username)
    if direct:
        return direct

    have = {g.lower() for g in (groups or [])}
    if not have:
        return None
    best = None
    for r in RoleGrant.query.filter_by(subject_type='group').all():
        if r.subject.lower() in have and r.role in ROLE_LEVELS:
            if best is None or ROLE_LEVELS[r.role] > ROLE_LEVELS[best]:
                best = r.role
    return best


class DirectoryEntry(db.Model):
    """A snapshot of users / groups seen in the LDAP directory, refreshed
    (best-effort) on each successful login. Powers the autocomplete in the
    admin panel so admins can pick existing people/groups instead of guessing
    usernames. Purely a convenience cache — never authoritative."""
    __tablename__ = 'directory_entries'

    id      = db.Column(db.Integer, primary_key=True)
    kind    = db.Column(db.String(10), nullable=False)   # 'user' | 'group'
    name    = db.Column(db.String(160), nullable=False)  # uid or cn
    seen_at = db.Column(db.DateTime, default=datetime.utcnow,
                        onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('kind', 'name', name='uq_directory_kind_name'),
    )


def cache_directory_entries(kind, names):
    """Upsert a batch of directory names of one kind. Best-effort; commits once."""
    if kind not in ('user', 'group') or not names:
        return
    existing = {e.name: e for e in DirectoryEntry.query.filter_by(kind=kind).all()}
    now = datetime.utcnow()
    changed = False
    for raw in names:
        n = (raw or '').strip()
        if not n:
            continue
        if n in existing:
            existing[n].seen_at = now
        else:
            row = DirectoryEntry(kind=kind, name=n, seen_at=now)
            db.session.add(row)
            existing[n] = row
        changed = True
    if changed:
        db.session.commit()


def list_directory():
    """Return {'users': [...], 'groups': [...]} of cached directory names."""
    users = [e.name for e in DirectoryEntry.query
             .filter_by(kind='user').order_by(DirectoryEntry.name).all()]
    groups = [e.name for e in DirectoryEntry.query
              .filter_by(kind='group').order_by(DirectoryEntry.name).all()]
    return {'users': users, 'groups': groups}


class UserGroup(db.Model):
    """The LDAP groups a specific user belongs to, captured at their last login.

    Lets the admin panel show *that admin's own* groups reliably — independent
    of the session cookie, so it survives refreshes, restarts, and a different
    browser. Refreshed (replaced) on every successful login."""
    __tablename__ = 'user_groups'

    id       = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(160), nullable=False, index=True)
    group    = db.Column(db.String(160), nullable=False)
    seen_at  = db.Column(db.DateTime, default=datetime.utcnow,
                         onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('username', 'group', name='uq_user_group'),
    )


def set_user_groups(username, names):
    """Replace the stored group membership for `username` with `names`.
    Best-effort; commits once. A user with no groups ends up with no rows."""
    username = (username or '').strip()
    if not username:
        return
    UserGroup.query.filter_by(username=username).delete()
    seen = set()
    for raw in (names or []):
        n = (raw or '').strip()
        if n and n not in seen:
            seen.add(n)
            db.session.add(UserGroup(username=username, group=n))
    db.session.commit()


def get_user_groups(username):
    """The groups stored for `username` (alphabetical), or [] if none."""
    username = (username or '').strip()
    if not username:
        return []
    return [r.group for r in UserGroup.query
            .filter_by(username=username).order_by(UserGroup.group).all()]


def seed_admin_grants(usernames):
    """Ensure each username has at least an admin user-grant. Idempotent —
    only creates a grant when the user has none yet, so an admin who was later
    downgraded in the UI is not silently re-promoted on restart."""
    created = []
    for name in usernames:
        name = (name or '').strip()
        if not name:
            continue
        exists = RoleGrant.query.filter_by(subject_type='user', subject=name).first()
        if exists:
            continue
        db.session.add(RoleGrant(subject_type='user', subject=name,
                                 role='admin', note='seeded bootstrap admin'))
        created.append(name)
    if created:
        db.session.commit()
    return created


# ── USRP test results ─────────────────────────────────────────────────────────

class TestResult(db.Model):
    """One row per USRP test run. Persisted so the rack view can show
    the last-test status next to each USRP card."""
    __tablename__ = 'test_results'

    id          = db.Column(db.Integer, primary_key=True)
    usrp_ip     = db.Column(db.String(50), nullable=False, index=True)
    test_type   = db.Column(db.String(20), nullable=False, default='internal_loop')
    status      = db.Column(db.String(20), nullable=False, default='running')  # running|success|failure|error
    started_at  = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    finished_at = db.Column(db.DateTime, nullable=True)
    output_dir  = db.Column(db.String(255), nullable=True)  # absolute dir holding plot PNGs
    result_json = db.Column(db.Text, nullable=True)         # full result_data dict
    log         = db.Column(db.Text, nullable=True)         # captured stdout/log
    error       = db.Column(db.Text, nullable=True)

    def to_summary(self):
        """Compact dict for list views (rack cards, history)."""
        return {
            'id':          self.id,
            'usrp_ip':     self.usrp_ip,
            'test_type':   self.test_type,
            'status':      self.status,
            'started_at':  self.started_at.isoformat() + 'Z' if self.started_at else None,
            'finished_at': self.finished_at.isoformat() + 'Z' if self.finished_at else None,
        }

    def to_full(self):
        """Full dict including parsed result_data and log."""
        d = self.to_summary()
        d['output_dir'] = self.output_dir
        d['result']     = json.loads(self.result_json) if self.result_json else None
        d['log']        = self.log or ''
        d['error']      = self.error
        return d


def latest_test_per_ip():
    """Return {ip: summary_dict} for the most recent run of each USRP IP."""
    rows = (TestResult.query
            .order_by(TestResult.usrp_ip, desc(TestResult.started_at))
            .all())
    seen = {}
    for r in rows:
        if r.usrp_ip not in seen:
            seen[r.usrp_ip] = r.to_summary()
    return seen


def list_test_results(limit=200):
    """Return recent TestResult rows for the /db viewer (most recent first)."""
    return (TestResult.query
            .order_by(desc(TestResult.started_at))
            .limit(limit)
            .all())


# ── Reservations ──────────────────────────────────────────────────────────────

class Reservation(db.Model):
    """A booking of one radio or device for a time range.

    Resources are identified by a stable string key from the frontend catalog
    (`usrp:<ip>` for USRPs, `dev:<slug>` for bench devices); the name is stored
    alongside so the row reads on its own. Times are naive UTC.
    """
    __tablename__ = 'reservations'

    id            = db.Column(db.Integer, primary_key=True)
    resource_key  = db.Column(db.String(80), nullable=False, index=True)
    resource_name = db.Column(db.String(120), nullable=False)
    resource_kind = db.Column(db.String(20), nullable=False, default='device')   # radio | device
    username      = db.Column(db.String(80), nullable=False, index=True)
    comment       = db.Column(db.Text, nullable=True)
    starts_at     = db.Column(db.DateTime, nullable=False, index=True)
    ends_at       = db.Column(db.DateTime, nullable=False, index=True)
    created_at    = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    # 'insi' for bookings made here; 'librebooking' for rows imported read-only
    # from the old system (external_id = its reservation_instance_id).
    source        = db.Column(db.String(20), nullable=False, default='insi')
    external_id   = db.Column(db.String(40), nullable=True, index=True)

    def to_dict(self, viewer=None):
        iso = lambda d: d.isoformat() + 'Z'
        return {
            'id':            self.id,
            'resource_key':  self.resource_key,
            'resource_name': self.resource_name,
            'resource_kind': self.resource_kind,
            'username':      self.username,
            'comment':       self.comment or '',
            'starts_at':     iso(self.starts_at),
            'ends_at':       iso(self.ends_at),
            'created_at':    iso(self.created_at),
            'source':        self.source,
            'mine':          viewer is not None and viewer == self.username,
        }


def reservations_between(start, end, resource_key=None):
    """Reservations overlapping [start, end), optionally for one resource."""
    q = Reservation.query.filter(Reservation.starts_at < end, Reservation.ends_at > start)
    if resource_key:
        q = q.filter_by(resource_key=resource_key)
    return q.order_by(Reservation.starts_at).all()


def reservation_conflicts(resource_key, start, end, exclude_id=None):
    """Existing reservations of `resource_key` that overlap [start, end)."""
    q = Reservation.query.filter(
        Reservation.resource_key == resource_key,
        Reservation.starts_at < end, Reservation.ends_at > start)
    if exclude_id is not None:
        q = q.filter(Reservation.id != exclude_id)
    return q.all()
