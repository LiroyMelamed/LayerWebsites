#!/usr/bin/env bash
# Measure frontend asset sizes and API response times for a tenant deployment.
# Usage: ./scripts/perf-baseline.sh [frontend-url] [api-health-url]
#
# Examples:
#   ./scripts/perf-baseline.sh https://ashrafessa.mela-media.co.il https://api-ashrafessa.mela-media.co.il/health
#   ./scripts/perf-baseline.sh https://morlevy.mela-media.co.il https://api-morlevy.mela-media.co.il/health

set -euo pipefail

FRONTEND_URL="${1:-http://localhost:3000}"
API_URL="${2:-http://localhost:5001/health}"

echo "=== Performance baseline ==="
echo "Frontend: $FRONTEND_URL"
echo "API:      $API_URL"
echo "Time:     $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo

echo "--- Frontend HTML + main JS bundle ---"
HTML=$(curl -sS -o /tmp/lw-perf-index.html -w "%{time_total}" "$FRONTEND_URL/")
echo "HTML download: ${HTML}s"

MAIN_JS=$(grep -oE '/static/js/[^"]+\.js' /tmp/lw-perf-index.html | head -1 || true)
if [[ -n "$MAIN_JS" ]]; then
  JS_URL="${FRONTEND_URL%/}${MAIN_JS}"
  curl -sS -o /tmp/lw-perf-main.js -w "Main JS download: %{time_total}s (size %{size_download} bytes)\n" "$JS_URL"
  gzip -c /tmp/lw-perf-main.js 2>/dev/null | wc -c | awk '{print "Main JS gzip estimate:", $1, "bytes"}'
else
  echo "Could not find main JS chunk in index.html"
fi
echo

echo "--- API health (5 samples) ---"
for i in 1 2 3 4 5; do
  curl -sS -o /dev/null -w "sample $i: %{http_code} %{time_total}s\n" "$API_URL"
done
echo

echo "--- Chunk count (lazy-loaded routes) ---"
CHUNK_COUNT=$(grep -cE '/static/js/[0-9]+\.' /tmp/lw-perf-index.html 2>/dev/null || echo 0)
echo "Async chunks referenced in HTML: $CHUNK_COUNT (higher after code-splitting deploy)"
echo
echo "Done."
