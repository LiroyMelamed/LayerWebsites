#!/usr/bin/env bash
# Live retirement is separate from historical source and recovery archives.
require_active_tenant() {
  case "${1:-}" in
    [iI][dD][mM])
      printf '%s\n' 'Idm retirement was authorized by the owner on 2026-10-25; deployment is disabled.' >&2
      return 64
      ;;
  esac
}
