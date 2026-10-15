#!/usr/bin/env bash
# Apply frame-ancestors CSP on lawyer.mela-media.co.il so signup can embed in mela-media.co.il
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
HOST="${FRONTEND_HOST:-root@84.46.253.85}"
CONF="/etc/nginx/sites-available/lawyer.mela-media.co.il"
MARKER="frame-ancestors 'self' https://mela-media.co.il"

ssh -i "$SSH_KEY" -o BatchMode=yes "$HOST" bash -s <<EOF
set -e
if [ ! -f "$CONF" ]; then
  echo "Missing $CONF" >&2
  exit 1
fi
if grep -q "$MARKER" "$CONF"; then
  echo "frame-ancestors already configured"
else
  sed -i "/server_name lawyer.mela-media.co.il;/a\\    add_header Content-Security-Policy \"frame-ancestors 'self' https://mela-media.co.il https://www.mela-media.co.il\" always;" "$CONF"
  echo "Added frame-ancestors header"
fi
nginx -t
systemctl reload nginx
echo "nginx reloaded"
EOF
