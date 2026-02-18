#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Nightly PostgreSQL backup → Cloudflare R2
#
# Usage (manual):
#   bash /root/LayerWebsites/backend/scripts/backup-db-to-r2.sh
#
# Cron (every night at 02:00):
#   0 2 * * * /root/LayerWebsites/backend/scripts/backup-db-to-r2.sh >> /var/log/melamedlaw-backup.log 2>&1
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# ── Load DB + R2 credentials from backend .env ──
ENV_FILE="/root/LayerWebsites/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "$(date '+%F %T') ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

# Export only the vars we need
export $(grep -E '^(DB_|S3_)' "$ENV_FILE" | xargs)

# ── Config ──
STAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="/tmp/melamedlaw-${STAMP}.dump"
R2_KEY="backups/melamedlaw-${STAMP}.dump"
RETENTION_DAYS=7

echo "$(date '+%F %T') Starting backup..."

# ── 1) Dump database (use postgres superuser for full access) ──
sudo -u postgres pg_dump \
  --format=custom \
  --file "$DUMP_FILE" \
  "$DB_NAME"

DUMP_SIZE=$(stat --printf="%s" "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
echo "$(date '+%F %T') Dump created: $DUMP_FILE (${DUMP_SIZE} bytes)"

# ── 2) Upload to R2 using AWS CLI (S3-compatible) ──
# Uses the S3_ env vars from .env
export AWS_ACCESS_KEY_ID="$S3_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET"
ENDPOINT="$S3_ENDPOINT"
BUCKET="$S3_BUCKET"

aws s3 cp "$DUMP_FILE" "s3://${BUCKET}/${R2_KEY}" \
  --endpoint-url "$ENDPOINT" \
  --no-progress

echo "$(date '+%F %T') Uploaded to R2: s3://${BUCKET}/${R2_KEY}"

# ── 3) Clean up local dump ──
rm -f "$DUMP_FILE"
echo "$(date '+%F %T') Local dump removed."

# ── 4) Delete old backups from R2 (older than RETENTION_DAYS) ──
CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

# List all backup files and delete old ones
aws s3 ls "s3://${BUCKET}/backups/" \
  --endpoint-url "$ENDPOINT" 2>/dev/null | while read -r line; do
  
  FILE_NAME=$(echo "$line" | awk '{print $4}')
  if [ -z "$FILE_NAME" ]; then continue; fi
  
  # Extract date from filename: melamedlaw-YYYYMMDD-HHMMSS.dump
  FILE_DATE=$(echo "$FILE_NAME" | grep -oP '\d{8}' | head -1)
  if [ -z "$FILE_DATE" ]; then continue; fi
  
  if [ "$FILE_DATE" -lt "$CUTOFF_DATE" ] 2>/dev/null; then
    aws s3 rm "s3://${BUCKET}/backups/${FILE_NAME}" \
      --endpoint-url "$ENDPOINT" --quiet
    echo "$(date '+%F %T') Deleted old backup: ${FILE_NAME}"
  fi
done

echo "$(date '+%F %T') Backup complete."
