"""
list_ldap_groups.py — list ALL groups in the LDAP directory, bucketed by
prefix (the part before the first '-'), so you can decide which groups should
map to which Arena role.

Run it yourself (prompts for your password locally via getpass):

    ./arena-website/bin/python list_ldap_groups.py            # all groups
    ./arena-website/bin/python list_ldap_groups.py vpn         # only names containing 'vpn'
    ./arena-website/bin/python list_ldap_groups.py vpn mgmt    # 'vpn' OR 'mgmt'

Binds as you (so the directory will answer), searches the group base for every
group object, and prints them grouped by category.
"""
import getpass
import ssl
import sys

from ldap3 import ALL, SUBTREE, Connection, Server, Tls

from config import Config as C


def user_dn(username):
    if C.LDAP_USER_DN_TEMPLATE:
        return C.LDAP_USER_DN_TEMPLATE.format(username=username)
    return f"{C.LDAP_USER_ATTR}={username},{C.LDAP_USER_BASE_DN}"


def main():
    filters = [a.lower() for a in sys.argv[1:]]
    print(f"LDAP server: {C.LDAP_HOST}:{C.LDAP_PORT} (SSL={C.LDAP_USE_SSL})")
    if filters:
        print(f"Filter: names containing any of {filters}\n")

    username = input("Your LDAP username (uid): ").strip()
    if not username:
        sys.exit("No username given.")
    password = getpass.getpass("Your LDAP password (hidden): ")

    tls = None
    if C.LDAP_USE_SSL:
        validate = ssl.CERT_REQUIRED if C.LDAP_TLS_VALIDATE else ssl.CERT_NONE
        tls = Tls(validate=validate)
    server = Server(C.LDAP_HOST, port=C.LDAP_PORT, use_ssl=C.LDAP_USE_SSL,
                    tls=tls, get_info=ALL, connect_timeout=10)

    conn = Connection(server, user=user_dn(username), password=password)
    if not conn.bind():
        sys.exit(f"\n❌ Bind failed: {conn.result.get('description')} "
                 f"({conn.result.get('message')})")
    print("✅ Authenticated.\n")

    # Every object that carries the membership attribute = a group.
    conn.search(
        search_base=C.LDAP_GROUP_BASE_DN,
        search_filter=f"({C.LDAP_MEMBER_ATTR}=*)",
        search_scope=SUBTREE,
        attributes=[C.LDAP_GROUP_NAME_ATTR],
    )
    names = set()
    for e in conn.entries:
        val = e[C.LDAP_GROUP_NAME_ATTR].value
        if isinstance(val, (list, tuple)):
            names.update(str(v) for v in val)
        elif val is not None:
            names.add(str(val))
    conn.unbind()

    if filters:
        names = {n for n in names if any(f in n.lower() for f in filters)}

    # Bucket by prefix (token before first '-').
    buckets = {}
    for n in names:
        prefix = n.split('-', 1)[0] if '-' in n else n
        buckets.setdefault(prefix, []).append(n)

    print(f"Found {len(names)} group(s) in {len(buckets)} categor(y/ies):\n")
    for prefix in sorted(buckets):
        members = sorted(buckets[prefix])
        print(f"[{prefix}]  ({len(members)})")
        for n in members:
            print(f"   • {n}")
        print()

    print("Tell me which group(s) → which role (admin / editor / viewer) and "
          "I'll set them up in the local DB.")


if __name__ == '__main__':
    main()
