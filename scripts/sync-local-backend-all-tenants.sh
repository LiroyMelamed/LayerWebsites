#!/usr/bin/env bash
# Retired: uncommitted overlays lose the relationship between Git and live source.
set -euo pipefail
echo "Direct backend overlays are retired. Deploy a reviewed, committed tenant candidate with deploy-tenant-backend.sh." >&2
exit 1
