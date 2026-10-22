#!/usr/bin/env python3
"""
scripts/import_librebooking.py — copy upcoming LibreBooking reservations into
arena-website's own `reservations` table, so the new calendar shows who
already has what booked.

LibreBooking is production and must never be modified. This script only runs
one SELECT inside the librebooking-db container (via `oc exec`, the root
password stays in the pod). Everything it writes goes to arena-website's DB.

    ./arena-website/bin/python scripts/import_librebooking.py           # dry run: show what would be imported
    ./arena-website/bin/python scripts/import_librebooking.py --apply   # write into arena-website's DB

Re-running is safe: rows are matched on the LibreBooking reservation instance
id (source='librebooking', external_id=<id>) and updated in place.
"""
import argparse
import os
import re
import subprocess
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

NAMESPACE = 'librebooking'
CONTAINER = 'librebooking-db'

# Read-only. Upcoming, non-deleted reservations (status 2 = deleted).
# LibreBooking stores reservation times in UTC.
QUERY = r"""
SELECT ri.reservation_instance_id, ri.start_date, ri.end_date, r.name, u.username,
       REPLACE(REPLACE(REPLACE(IFNULL(rs.title, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), '')
FROM reservation_instances ri
JOIN reservation_series rs    ON rs.series_id = ri.series_id
JOIN reservation_resources rr ON rr.series_id = rs.series_id
JOIN resources r              ON r.resource_id = rr.resource_id
JOIN users u                  ON u.user_id = rs.owner_id
WHERE rs.status_id <> 2 AND ri.end_date > UTC_TIMESTAMP()
ORDER BY ri.start_date
"""

RADIO_KEYS = ('usrp:', 'dev:foxconn', 'dev:wnc', 'dev:erdn', 'dev:vvdn', 'dev:benetel', 'dev:amplitech')


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def resource_key(lb_name):
    """Map a LibreBooking resource name to the arena-website catalog key
    (see rack3d.js usrpKey/devKey). Returns None for resources we don't show."""
    m = re.match(r'USRP x\d+ \.(\d+)$', lb_name, re.I)
    if m:
        return f'usrp:192.168.40.{m.group(1)}'
    m = re.match(r'(Foxconn RU \d+)', lb_name)
    if m:
        return 'dev:' + slug(m.group(1))
    special = {'Keysight Spectrum Analyzer EXA': 'dev:keysight-exa'}
    if lb_name in special:
        return special[lb_name]
    known = {'WNC-01', 'WNC-02', 'ERDN-01', 'ERDN-02', 'VVDN', 'Benetel', 'Amplitech mMIMO',
             'GH-01', 'GH-02', 'x5g-ran-01', 'x5g-ran-02', 'RFBox', 'UESim', 'RuSIM-02 (Boston)',
             *[f'Devkit-0{i}' for i in range(1, 8)]}
    return 'dev:' + slug(lb_name) if lb_name in known else None


def fetch():
    pod = subprocess.run(
        ['oc', 'get', 'pods', '-n', NAMESPACE, '-o', 'name', '-l', 'app=librebooking'],
        check=True, capture_output=True, text=True).stdout.split()
    if not pod:
        pod = [p for p in subprocess.run(['oc', 'get', 'pods', '-n', NAMESPACE, '-o', 'name'],
               check=True, capture_output=True, text=True).stdout.split() if 'librebooking' in p]
    sql = QUERY.replace('\n', ' ').replace('"', '\\"')
    out = subprocess.run(
        ['oc', 'exec', '-n', NAMESPACE, pod[0], '-c', CONTAINER, '--', 'sh', '-c',
         f'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" librebooking --batch -N -e "{sql}"'],
        check=True, capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines():
        parts = line.split('\t')
        if len(parts) < 6:
            continue
        rid, start, end, name, user, title = parts[:6]
        rows.append(dict(id=rid, start=datetime.fromisoformat(start), end=datetime.fromisoformat(end),
                         name=name, user=user, title=title))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--apply', action='store_true', help='write into arena-website (default: dry run)')
    args = ap.parse_args()

    rows = fetch()
    mapped, skipped = [], {}
    for r in rows:
        key = resource_key(r['name'])
        if key:
            mapped.append((key, r))
        else:
            skipped[r['name']] = skipped.get(r['name'], 0) + 1

    print(f'{len(rows)} upcoming LibreBooking reservations; {len(mapped)} map to arena-website resources.')
    for key, r in mapped:
        print(f"  {r['start']:%Y-%m-%d %H:%M} → {r['end']:%Y-%m-%d %H:%M} UTC  {key:28}  {r['user']}")
    if skipped:
        print('Not shown in the 3D lab (skipped): ' + ', '.join(f'{n} ×{c}' for n, c in sorted(skipped.items())))
    if not args.apply:
        print('\nDry run — nothing written. Re-run with --apply to import.')
        return

    from app import create_app
    from models import Reservation, db
    app = create_app()
    with app.app_context():
        added = updated = 0
        for key, r in mapped:
            row = Reservation.query.filter_by(source='librebooking', external_id=r['id']).first()
            if row is None:
                row = Reservation(source='librebooking', external_id=r['id'])
                db.session.add(row)
                added += 1
            else:
                updated += 1
            row.resource_key = key
            row.resource_name = r['name'][:120]
            row.resource_kind = 'radio' if key.startswith(RADIO_KEYS) else 'device'
            row.username = r['user']
            row.comment = r['title'] or None
            row.starts_at, row.ends_at = r['start'], r['end']
        db.session.commit()
        print(f'Imported into arena-website: {added} new, {updated} updated.')


if __name__ == '__main__':
    main()
