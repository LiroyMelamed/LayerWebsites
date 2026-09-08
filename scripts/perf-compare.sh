#!/usr/bin/env bash
# Compare before/after perf-suite JSON reports.
# Usage: ./scripts/perf-compare.sh [before-json] [after-json]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATE="$(date -u +%Y-%m-%d)"
BEFORE="${1:-$(ls -t "$ROOT/scripts/perf-results/$DATE"/before-*.json 2>/dev/null | head -1)}"
AFTER="${2:-$(ls -t "$ROOT/scripts/perf-results/$DATE"/after-*.json 2>/dev/null | head -1)}"

if [[ ! -f "$BEFORE" || ! -f "$AFTER" ]]; then
  echo "Usage: $0 [before.json] [after.json]" >&2
  exit 1
fi

python3 - "$BEFORE" "$AFTER" <<'PY'
import json, sys

before = json.load(open(sys.argv[1]))
after = json.load(open(sys.argv[2]))

print("# Performance comparison")
print(f"Before: {sys.argv[1]}")
print(f"After:  {sys.argv[2]}")
print()
print("| Tenant | Health p95 (before→after) | Main JS gzip (before→after) | Δ gzip |")
print("|--------|---------------------------|-----------------------------|--------|")

for key in before.get("tenants", {}):
    b = before["tenants"].get(key, {})
    a = after["tenants"].get(key, {})
    hb = b.get("health", {}).get("p95")
    ha = a.get("health", {}).get("p95")
    gb = (b.get("mainJs") or {}).get("gzipBytes")
    ga = (a.get("mainJs") or {}).get("gzipBytes")
    delta = ""
    if gb and ga:
        pct = round((ga - gb) / gb * 100, 1)
        delta = f"{pct:+.1f}%"
    print(f"| {key} | {hb}s → {ha}s | {gb} → {ga} | {delta} |")
PY
