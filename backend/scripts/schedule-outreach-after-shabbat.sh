#!/usr/bin/env bash
# Schedule remaining law-firm outreach to start at צאת שבת (Jerusalem).
set -euo pipefail

ROOT="/Users/liroymelamed/Projects/LayerWebsites/backend"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
SCHED_LOG="$LOG_DIR/outreach-scheduled-$(date +%Y%m%d).log"
RUN_LOG="$LOG_DIR/real-run-scheduled-$(date +%Y%m%d-%H%M%S).console.log"

TARGET_HOUR="${TARGET_HOUR:-20}"
TARGET_MINUTE="${TARGET_MINUTE:-26}"
TZ_NAME="Asia/Jerusalem"

{
  echo "============================================="
  echo "Scheduled outreach waiter started: $(date)"
  echo "Will start send at ${TARGET_HOUR}:$(printf '%02d' "$TARGET_MINUTE") ${TZ_NAME}"
  echo "Resume state: $LOG_DIR/outreach-state.json"
  echo "============================================="
} | tee -a "$SCHED_LOG"

# Sleep until target local time (Jerusalem).
python3 - <<PY | tee -a "$SCHED_LOG"
from datetime import datetime
from zoneinfo import ZoneInfo
import time, sys
tz = ZoneInfo("${TZ_NAME}")
now = datetime.now(tz)
target = now.replace(hour=${TARGET_HOUR}, minute=${TARGET_MINUTE}, second=0, microsecond=0)
if target <= now:
    print(f"Target already passed ({target.isoformat()}); starting immediately.", flush=True)
    sys.exit(0)
secs = (target - now).total_seconds()
print(f"now={now.isoformat()}", flush=True)
print(f"target={target.isoformat()}", flush=True)
print(f"sleeping {int(secs)}s (~{secs/3600:.2f}h)", flush=True)
time.sleep(secs)
print(f"woke at {datetime.now(tz).isoformat()} — starting send", flush=True)
PY

echo "Starting outreach send at $(date)" | tee -a "$SCHED_LOG"

node scripts/send-law-firm-outreach-real.js \
  --file "./data/רשימת עורכי דין.xlsx" \
  --send --resume --smtp app \
  --sales-deck "./data/מצגת מכירות.pdf" \
  --platform-url "https://mela-media.co.il/platform/" \
  --from-name "לירוי מלמד · Melamedia" \
  --reply-to "liroymelamed@icloud.com" \
  --delay-ms 5000 \
  2>&1 | tee -a "$RUN_LOG" | tee -a "$SCHED_LOG"

echo "Scheduled outreach finished at $(date) exit=$?" | tee -a "$SCHED_LOG"
