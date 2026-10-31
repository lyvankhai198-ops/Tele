#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(dirname "$(realpath "$0")")/lib/telecampaign-release.sh"
release_lock
release_require_repository
release_require_clean
ENV_FILE="/etc/telecampaign/api.env"
[[ -r "$ENV_FILE" ]] || { echo "TeleCampaign environment file is not readable." >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if (( $# > 1 )) || [[ -n "${1:-}" && ! "$1" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 [reviewed-commit-sha] (default: origin/main)" >&2
  exit 2
fi
release_git fetch origin main --quiet
target="$(release_git rev-parse --verify "${1:-origin/main}^{commit}")"
if [[ "$target" == "$(release_git rev-parse HEAD)" ]]; then
  echo "TeleCampaign is already at the requested commit; no changes made."
  exit 0
fi
# Automatic code rollback must never silently undo or mismatch a DB migration.
# Schema-changing releases need a separately reviewed, backward-compatible plan.
if ! release_git diff --quiet HEAD "$target" -- lib/db; then
  echo "Database package changed. Refusing automatic deploy; review schema compatibility and paired recovery first." >&2
  exit 1
fi
if ! release_git cat-file -e "${target}:artifacts/api-server/src/lib/notificationMediaStorage.ts" 2>/dev/null; then
  echo "Target lacks protected filesystem notification media support." >&2
  exit 1
fi

# Existing backup creates a consistent database/media pair. It briefly stops
# only this API, restarts it and validates health. Never auto-restore this data.
bash "$ROOT/scripts/backup-telecampaign.sh"
release_checkpoint
recovery_armed=1
on_deploy_exit() {
  local status="$1"
  trap - EXIT INT TERM
  if [[ "$status" -ne 0 && "$recovery_armed" -eq 1 ]]; then
    echo "Deploy failed; restoring the previous ready-to-run release." >&2
    if ! release_restore "$SAVED_RELEASE"; then
      pm2 stop telecampaign-api >/dev/null 2>&1 || true
      echo "Automatic recovery failed. Keep the checkpoint and inspect TeleCampaign only." >&2
    fi
  fi
  exit "$status"
}
trap 'on_deploy_exit $?' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Stop before replacing assets/dependencies: neither API workers nor Nginx
# should be mistaken for an isolated staging environment.
pm2 stop telecampaign-api
# Checkpoint files are already protected; public build outputs must remain
# readable by the dedicated Nginx worker after a successful deployment.
umask 022
release_git reset --hard "$target"
pnpm --dir "$ROOT" install --frozen-lockfile --prod=false
PORT="${TELECAMPAIGN_PORT:-3004}" BASE_PATH=/ pnpm --dir "$ROOT" --filter @workspace/telecampaign run build
pnpm --dir "$ROOT" --filter @workspace/api-server run build
[[ -s "$ROOT/artifacts/telecampaign/dist/public/index.html" \
  && -s "$ROOT/artifacts/api-server/dist/index.mjs" ]]
bash "$ROOT/scripts/prepare-notification-media-storage.sh"
pm2 restart telecampaign-api --update-env
bash "$ROOT/scripts/telecampaign-healthcheck.sh"
recovery_armed=0
echo "TeleCampaign deployed at $target. Use rollback-telecampaign.sh --previous if a later functional check fails."
