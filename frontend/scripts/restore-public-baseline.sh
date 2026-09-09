#!/usr/bin/env bash
# Restore build-scratch paths copied by apply-tenant-branding.js back to git baseline.
# Run from repo root or frontend/ after any local npm run build:*.
#
# Usage: ./frontend/scripts/restore-public-baseline.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: $ROOT" >&2
  exit 1
fi

git restore frontend/public frontend/src/assets/images/logos
rm -f frontend/public/site.webmanifest

echo "# Restored frontend/public and src/assets/images/logos to git baseline"
git status --short frontend/public frontend/src/assets/images/logos || true
