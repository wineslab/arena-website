"""
check_my_ldap_groups.py — show which LDAP groups your account belongs to.

Run it yourself so your password is typed locally (getpass — not echoed, not
stored, not in shell history):

    ./arena-website/bin/python check_my_ldap_groups.py

It binds to the same LDAP server the website uses (from config.py / .env),
authenticates as you, lists your groups, and shows how each group currently
maps to an Arena role under ARENA_ROLE_MAP — so you can decide which group
should be 'admin'.
"""
import getpass
import ssl
import sys

from ldap3 import ALL, SUBTREE, Connection, Server, Tls
from ldap3.utils.conv import escape_filter_chars

from config import Config as C


def user_dn(username):
    if C.LDAP_USER_DN_TEMPLATE:
        return C.LDAP_USER_DN_TEMPLATE.format(username=username)
    return f"{C.LDAP_USER_ATTR}={username},{C.LDAP_USER_BASE_DN}"


def main():
    print(f"LDAP server: {C.LDAP_HOST}:{C.LDAP_PORT} (SSL={C.LDAP_USE_SSL})\n")
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

    dn = user_dn(username)
    print(f"\nBinding as: {dn}")
    conn = Connection(server, user=dn, password=password)
    if not conn.bind():
        sys.exit(f"\n❌ Bind failed — wrong username/password, or wrong DN.\n"
                 f"   ({conn.result.get('description')}: {conn.result.get('message')})")
    print("✅ Authenticated.\n")

    # Find groups whose membership attribute lists this user.
    member_value = dn if C.LDAP_MEMBER_ATTR_TYPE == 'dn' else username
    conn.search(
        search_base=C.LDAP_GROUP_BASE_DN,
        search_filter=f"({C.LDAP_MEMBER_ATTR}={escape_filter_chars(member_value)})",
        search_scope=SUBTREE,
        attributes=[C.LDAP_GROUP_NAME_ATTR],
    )
    groups = []
    for e in conn.entries:
        val = e[C.LDAP_GROUP_NAME_ATTR].value
        if isinstance(val, (list, tuple)):
            groups.extend(str(v) for v in val)
        elif val is not None:
            groups.append(str(val))
    conn.unbind()

    # Current static mapping (for reference).
    role_of = {}
    for role, gs in C.ROLE_MAP.items():
        for g in gs:
            role_of[g.lower()] = role

    print(f"You are in {len(groups)} group(s):")
    if not groups:
        print("  (none found — check LDAP_GROUP_BASE_DN / LDAP_MEMBER_ATTRIBUTE)")
    for g in sorted(groups):
        mapped = role_of.get(g.lower())
        tag = f"  → currently maps to Arena role: {mapped}" if mapped else "  (no Arena role yet)"
        print(f"  • {g}{tag}")
    print(f"\nYour resolved uid for grants: {username}")
    print("Tell me which group above should be 'admin' and I'll wire it up "
          "(group-based) in the local DB.")


if __name__ == '__main__':
    main()
