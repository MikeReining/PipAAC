"""044 IL e2e: read the iPad's people.json FILE (not the UI) and check the invited person.

usage: e2e_invite_registry_check.py <people.json> <relay-user-id>
"""
import json
import sys

rows = json.load(open(sys.argv[1]))["users"]
r = next((u for u in rows if u["id"] == sys.argv[2]), None)
assert r, f"person {sys.argv[2]} not in the iPad registry: {[u['id'] for u in rows]}"
assert r.get("role") == "partner", r
sync = r["sync"]
assert sync["userId"] == sys.argv[2] and sync.get("epoch") == 1 and not sync.get("pendingJoin"), sync
print("  iPad registry:", json.dumps({"id": r["id"][:8], "name": r.get("name"), "role": r.get("role"), "sync": sync}))
