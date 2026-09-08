#!/usr/bin/env bash
# Multi-tenant performance baseline — frontend assets, API health, optional auth endpoints.
#
# Usage:
#   ./scripts/perf-suite.sh                    # all tenants, health + frontend only
#   ./scripts/perf-suite.sh --label before     # tag output directory
#   PERF_AUTH_TOKEN='eyJ...' ./scripts/perf-suite.sh  # include authenticated API tests
#
# Output: scripts/perf-results/YYYY-MM-DD/<label>-HHMMSS.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="run"
AUTH_TOKEN="${PERF_AUTH_TOKEN:-}"

for arg in "$@"; do
  case "$arg" in
    --label) shift; LABEL="${1:-run}"; shift || true ;;
    --label=*) LABEL="${arg#*=}" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

declare -a TENANT_KEYS=(melamedlaw morlevy ashrafessa melamedia idm)
declare -a FE_URLS=(
  "https://client.melamedlaw.co.il"
  "https://morlevy.mela-media.co.il"
  "https://ashrafessa.mela-media.co.il"
  "https://melamedia.mela-media.co.il"
  "https://idm.mela-media.co.il"
)
declare -a API_BASES=(
  "https://api.calls.melamedlaw.co.il"
  "https://api-morlevy.mela-media.co.il"
  "https://api-ashrafessa.mela-media.co.il"
  "https://api-melamedia.mela-media.co.il"
  "https://api-idm.mela-media.co.il"
)

TS_DATE="$(date -u +%Y-%m-%d)"
TS_STAMP="$(date -u +%H%M%S)"
OUT_DIR="$ROOT/scripts/perf-results/$TS_DATE"
OUT_FILE="$OUT_DIR/${LABEL}-${TS_STAMP}.json"
mkdir -p "$OUT_DIR"

curl_timing() {
  curl -sS -o "$1" -w '%{time_starttransfer}\t%{time_total}\t%{http_code}\t%{size_download}' "$2" 2>/dev/null || echo '0\t0\t000\t0'
}

health_samples() {
  local url="$1"
  local n="${2:-10}"
  local i t
  for ((i=1; i<=n; i++)); do
    t=$(curl -sS -o /dev/null -w '%{time_total}' "$url" 2>/dev/null || echo "999")
    echo "$t"
  done
}

percentile_py() {
  python3 - "$@" <<'PY'
import json, sys
vals = [float(x) for x in sys.stdin.read().split() if x.strip()]
if not vals:
    print(json.dumps({"p50": None, "p95": None, "min": None, "max": None, "n": 0}))
    sys.exit(0)
vals.sort()
def pct(p):
    if len(vals) == 1:
        return vals[0]
    k = (len(vals)-1) * p
    f = int(k)
    c = min(f+1, len(vals)-1)
    return vals[f] + (vals[c]-vals[f]) * (k-f)
print(json.dumps({
    "p50": round(pct(0.50), 4),
    "p95": round(pct(0.95), 4),
    "min": round(min(vals), 4),
    "max": round(max(vals), 4),
    "n": len(vals),
}))
PY
}

auth_api_timing() {
  local base="$1"
  local path="$2"
  local token="$3"
  curl -sS -o /dev/null -w '%{time_total}\t%{http_code}' \
    -H "Authorization: Bearer $token" \
    "${base}${path}" 2>/dev/null || echo '999\t000'
}

FROM_ISO="$(date -u +%Y-%m-%dT00:00:00.000Z)"
TO_ISO="$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) + timedelta(days=30)).strftime('%Y-%m-%dT00:00:00.000Z'))
PY
)"

echo "# perf-suite label=$LABEL date=$TS_DATE"
echo "# output: $OUT_FILE"

python3 - "$OUT_FILE" "$LABEL" "$TS_DATE" "$AUTH_TOKEN" "$FROM_ISO" "$TO_ISO" <<'PY'
import json, os, subprocess, sys, tempfile

out_file, label, ts_date, auth_token, from_iso, to_iso = sys.argv[1:7]
root = os.path.dirname(os.path.dirname(os.path.abspath(out_file)))

tenant_keys = ["melamedlaw", "morlevy", "ashrafessa", "melamedia", "idm"]
fe_urls = [
    "https://client.melamedlaw.co.il",
    "https://morlevy.mela-media.co.il",
    "https://ashrafessa.mela-media.co.il",
    "https://melamedia.mela-media.co.il",
    "https://idm.mela-media.co.il",
]
api_bases = [
    "https://api.calls.melamedlaw.co.il",
    "https://api-morlevy.mela-media.co.il",
    "https://api-ashrafessa.mela-media.co.il",
    "https://api-melamedia.mela-media.co.il",
    "https://api-idm.mela-media.co.il",
]

def sh(cmd):
    return subprocess.check_output(cmd, shell=True, text=True).strip()

def curl_timing(out_path, url):
    try:
        line = sh(f'curl -sS -o "{out_path}" -w "%{{time_starttransfer}}\t%{{time_total}}\t%{{http_code}}\t%{{size_download}}" "{url}"')
        ttfb, total, code, size = line.split("\t")
        return float(ttfb), float(total), int(code), int(size)
    except Exception:
        return 0.0, 0.0, 0, 0

def health_stats(url, n=10):
    samples = []
    for _ in range(n):
        try:
            t = float(sh(f'curl -sS -o /dev/null -w "%{{time_total}}" "{url}"'))
        except Exception:
            t = 999.0
        samples.append(t)
    vals = sorted(samples)
    def pct(p):
        if not vals: return None
        if len(vals) == 1: return vals[0]
        k = (len(vals)-1)*p
        f = int(k); c = min(f+1, len(vals)-1)
        return round(vals[f] + (vals[c]-vals[f])*(k-f), 4)
    return {"p50": pct(0.5), "p95": pct(0.95), "min": round(min(vals),4), "max": round(max(vals),4), "n": len(vals)}

def auth_call(base, path, token):
    try:
        line = sh(
            f'curl -sS -o /dev/null -w "%{{time_total}}\t%{{http_code}}" '
            f'-H "Authorization: Bearer {token}" "{base}{path}"'
        )
        t, code = line.split("\t")
        return round(float(t), 4), int(code)
    except Exception:
        return None, 0

report = {
    "label": label,
    "date": ts_date,
    "authTests": bool(auth_token),
    "tenants": {},
}

tmpdir = tempfile.mkdtemp(prefix="lw-perf-")
try:
    for key, fe, api in zip(tenant_keys, fe_urls, api_bases):
        t = {"frontendUrl": fe, "apiBase": api}
        html_path = os.path.join(tmpdir, f"{key}-index.html")
        ttfb, total, code, size = curl_timing(html_path, fe + "/")
        t["html"] = {"ttfbSec": round(ttfb,4), "totalSec": round(total,4), "httpCode": code, "bytes": size}

        main_js = main_css = None
        try:
            with open(html_path, encoding="utf-8", errors="ignore") as f:
                html = f.read()
            import re
            mjs = re.search(r'/static/js/[^"\']+\.js', html)
            mcss = re.search(r'/static/css/[^"\']+\.css', html)
            if mjs:
                js_url = fe.rstrip("/") + mjs.group(0)
                jpath = os.path.join(tmpdir, f"{key}-main.js")
                jttfb, jtotal, jcode, jsize = curl_timing(jpath, js_url)
                gzip_size = 0
                try:
                    gzip_size = int(sh(f'gzip -c "{jpath}" | wc -c'))
                except Exception:
                    pass
                main_js = {"url": js_url, "ttfbSec": round(jttfb,4), "totalSec": round(jtotal,4),
                           "bytes": jsize, "gzipBytes": gzip_size, "httpCode": jcode}
            if mcss:
                css_url = fe.rstrip("/") + mcss.group(0)
                cpath = os.path.join(tmpdir, f"{key}-main.css")
                cttfb, ctotal, ccode, csize = curl_timing(cpath, css_url)
                cc = ""
                try:
                    cc = sh(f'curl -sSI "{css_url}" | grep -i cache-control | head -1').strip()
                except Exception:
                    pass
                main_css = {"url": css_url, "totalSec": round(ctotal,4), "bytes": csize,
                            "httpCode": ccode, "cacheControl": cc}
        except Exception as e:
            t["parseError"] = str(e)

        t["mainJs"] = main_js
        t["mainCss"] = main_css
        t["health"] = health_stats(api + "/health")

        if auth_token:
            mh_cold_t, mh_cold_c = auth_call(api, "/api/Data/GetManagerHomeData", auth_token)
            mh_warm_t, mh_warm_c = auth_call(api, "/api/Data/GetManagerHomeData", auth_token)
            cal_path = f"/api/calendar/events?from={from_iso}&to={to_iso}&scope=firm&limit=500"
            cal_t, cal_c = auth_call(api, cal_path, auth_token)
            sign_t, sign_c = auth_call(api, "/api/SigningFiles/lawyer-files", auth_token)
            t["auth"] = {
                "managerHomeColdSec": mh_cold_t, "managerHomeColdCode": mh_cold_c,
                "managerHomeWarmSec": mh_warm_t, "managerHomeWarmCode": mh_warm_c,
                "calendarEventsSec": cal_t, "calendarEventsCode": cal_c,
                "signingListSec": sign_t, "signingListCode": sign_c,
            }

        report["tenants"][key] = t
        print(f"  {key}: health p95={t['health']['p95']}s mainJs={ (main_js or {}).get('gzipBytes') } gzip bytes")
finally:
    subprocess.call(["rm", "-rf", tmpdir])

# signing bench on melamedia only if token provided via PERF_SIGNING_TOKEN
signing_token = os.environ.get("PERF_SIGNING_TOKEN", "")
if signing_token:
    bench = os.path.join(root, "backend/scripts/bench-public-signing.js")
    if os.path.isfile(bench):
        try:
            out = subprocess.check_output(
                ["node", bench, "--base", "https://api-melamedia.mela-media.co.il/api", "--token", signing_token],
                text=True, stderr=subprocess.STDOUT, timeout=120, cwd=root)
            report["signingBenchMelamedia"] = {"raw": out[-4000:]}
        except Exception as e:
            report["signingBenchMelamedia"] = {"error": str(e)}

with open(out_file, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
print(f"\nWrote {out_file}")
PY

echo "Done."
