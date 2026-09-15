#!/usr/bin/env bash
# Set mela-media.co.il API subdomains to DNS-only (grey cloud) via Cloudflare API.
# Bypasses CF proxy on API hosts — same pattern as api.calls.melamedlaw.co.il (direct to origin).
#
# Prerequisites:
#   export CF_API_TOKEN='...'   # Zone.DNS Edit (+ Zone.Read)
#   export CF_ZONE_ID='...'     # optional; auto-resolved for mela-media.co.il
#
# Usage:
#   ./scripts/cloudflare-api-dns-only.sh              # apply DNS-only for API records
#   ./scripts/cloudflare-api-dns-only.sh --dry-run    # show planned changes
#   ./scripts/cloudflare-api-dns-only.sh --verify     # print proxied status only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZONE_NAME="${CF_ZONE_NAME:-mela-media.co.il}"
DRY_RUN=false
VERIFY_ONLY=false

API_RECORDS=(
  api-morlevy
  api-ashrafessa
  api-melamedia
  api-idm
  api-lawyer
)

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --verify) VERIFY_ONLY=true ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "ERROR: set CF_API_TOKEN (Zone.DNS Edit permission for ${ZONE_NAME})" >&2
  echo "  https://dash.cloudflare.com/profile/api-tokens" >&2
  exit 1
fi

cf_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [[ -n "$data" ]]; then
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

resolve_zone_id() {
  if [[ -n "${CF_ZONE_ID:-}" ]]; then
    echo "$CF_ZONE_ID"
    return 0
  fi
  local resp
  resp=$(cf_api GET "/zones?name=${ZONE_NAME}")
  python3 - <<PY "$resp"
import json, sys
data = json.loads(sys.argv[1])
if not data.get("success") or not data.get("result"):
    print("ERROR: zone not found", file=sys.stderr)
    sys.exit(1)
print(data["result"][0]["id"])
PY
}

ZONE_ID="$(resolve_zone_id)"
echo "# Cloudflare zone ${ZONE_NAME} (${ZONE_ID})"

list_records() {
  cf_api GET "/zones/${ZONE_ID}/dns_records?per_page=100&type=A,CNAME"
}

VERIFY_FLAG=0; $VERIFY_ONLY && VERIFY_FLAG=1
DRY_FLAG=0; $DRY_RUN && DRY_FLAG=1

python3 - "$VERIFY_FLAG" "$DRY_FLAG" "$ZONE_ID" <<'PY'
import json, os, subprocess, sys

verify_only = sys.argv[1] == "1"
dry_run = sys.argv[2] == "1"
zone_id = sys.argv[3]
token = os.environ["CF_API_TOKEN"]
names = [
    "api-morlevy",
    "api-ashrafessa",
    "api-melamedia",
    "api-idm",
    "api-lawyer",
]

def cf_get(path):
    out = subprocess.check_output([
        "curl", "-sS",
        "-H", f"Authorization: Bearer {token}",
        f"https://api.cloudflare.com/client/v4{path}",
    ], text=True)
    data = json.loads(out)
    if not data.get("success"):
        raise RuntimeError(data.get("errors") or data)
    return data

records = cf_get(f"/zones/{zone_id}/dns_records?per_page=200")["result"]
by_name = {}
for r in records:
    if r["name"].endswith(".mela-media.co.il") or r["name"] == "mela-media.co.il":
        short = r["name"].replace(".mela-media.co.il", "")
        by_name[short] = r
        by_name[r["name"]] = r

print(f"{'record':<22} {'type':<6} {'proxied':<8} content")
print("-" * 60)
for n in names:
    rec = by_name.get(n)
    if not rec:
        print(f"{n + '.mela-media.co.il':<22} MISSING")
        continue
    proxied = rec.get("proxied", False)
    print(f"{rec['name']:<22} {rec['type']:<6} {str(proxied):<8} {rec.get('content','')}")

if verify_only:
    sys.exit(0)

changed = 0
for n in names:
    rec = by_name.get(n)
    if not rec:
        print(f"SKIP missing record: {n}.mela-media.co.il", file=sys.stderr)
        continue
    if rec.get("proxied") is False:
        print(f"OK already DNS-only: {rec['name']}")
        continue
    payload = json.dumps({"type": rec["type"], "name": rec["name"], "content": rec["content"], "proxied": False, "ttl": rec.get("ttl", 1)})
    print(f"SET DNS-only: {rec['name']} -> {rec['content']}")
    if dry_run:
        changed += 1
        continue
    out = subprocess.check_output([
        "curl", "-sS", "-X", "PATCH",
        "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json",
        f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{rec['id']}",
        "--data", payload,
    ], text=True)
    data = json.loads(out)
    if not data.get("success"):
        raise RuntimeError(f"PATCH failed for {rec['name']}: {data.get('errors')}")
    changed += 1

print(f"\n# {'Would update' if dry_run else 'Updated'} {changed} API record(s) to DNS-only")
PY

echo
echo "Verify API latency (should show origin IP 37.60.230.148, not Cloudflare):"
for host in api-morlevy api-melamedia api-idm; do
  echo -n "  ${host}.mela-media.co.il -> "
  dig +short "${host}.mela-media.co.il" | head -1 || true
done
