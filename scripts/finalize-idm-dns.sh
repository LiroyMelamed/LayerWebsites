#!/usr/bin/env bash
# After Cloudflare A records exist for idm + api-idm, run this to issue certs
# and redeploy SPA against the preferred API host.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"

# Issue FE cert
ssh -i "$SSH_KEY" -o BatchMode=yes root@84.46.253.85 \
  'certbot --nginx -d idm.mela-media.co.il --non-interactive --agree-tos --register-unsafely-without-email --expand || true'

# Issue API cert
ssh -i "$SSH_KEY" -o BatchMode=yes root@37.60.230.148 \
  'certbot --nginx -d api-idm.mela-media.co.il --non-interactive --agree-tos --register-unsafely-without-email --expand || true'

# Rebuild + deploy preferred SPA
cd "$ROOT"
./scripts/deploy-tenant-frontend.sh idm

echo "Verify:"
curl -sS -o /dev/null -w "fe:%{http_code}\n" https://idm.mela-media.co.il/
curl -sS -o /dev/null -w "api:%{http_code}\n" https://api-idm.mela-media.co.il/health
