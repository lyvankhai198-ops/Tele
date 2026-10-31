#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(dirname "$(realpath "$0")")/lib/telecampaign-release.sh"
release_lock
release_require_repository
release_require_clean

if (( $# > 1 )); then
  echo "Usage: $0 [--previous|/var/backups/telecampaign/releases/<checkpoint>]" >&2
  exit 2
fi
snapshot="${1:---previous}"
if [[ "$snapshot" == "--previous" ]]; then
  [[ -f "$PREVIOUS" ]] || { echo "No saved release. Create a checkpoint before deploying." >&2; exit 1; }
  snapshot="$(cat "$PREVIOUS")"
fi
if ! release_restore "$snapshot"; then
  echo "Rollback did not complete. Check telecampaign-api; do not restart other services." >&2
  exit 1
fi