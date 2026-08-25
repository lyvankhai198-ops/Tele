#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/telecampaign"
MEDIA_ROOT="/var/lib/telecampaign/media"
UUID_PATTERN='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
TARGET_SHA="${1:-}"

if [[ -z "$TARGET_SHA" ]]; then
  echo "Usage: $0 <known-good-commit-sha>" >&2
  exit 2
fi
if [[ ! -d "$ROOT/.git" ]]; then
  echo "TeleCampaign repository was not found at $ROOT." >&2
  exit 1
fi
if [[ ! -f "$ROOT/artifacts/telecampaign/package.json" || ! -f "$ROOT/artifacts/api-server/package.json" ]]; then
  echo "Refusing rollback because $ROOT is not a TeleCampaign deployment." >&2
  exit 1
fi

cd "$ROOT"
git -c safe.directory="$ROOT" diff --quiet
git -c safe.directory="$ROOT" diff --cached --quiet
git -c safe.directory="$ROOT" fetch origin main --quiet
git -c safe.directory="$ROOT" cat-file -e "${TARGET_SHA}^{commit}"
if ! git -c safe.directory="$ROOT" cat-file -e "${TARGET_SHA}:artifacts/api-server/src/lib/notificationMediaStorage.ts" 2>/dev/null \
  && [[ -d "$MEDIA_ROOT" ]] \
  && find "$MEDIA_ROOT" -maxdepth 1 -type f -regextype posix-extended -regex ".*/${UUID_PATTERN}" -print -quit | grep -q .; then
  echo "Refusing rollback: the target release cannot serve existing filesystem notification media." >&2
  exit 1
fi

git -c safe.directory="$ROOT" reset --hard "$TARGET_SHA"
pnpm install --frozen-lockfile
PORT="${TELECAMPAIGN_PORT:-3004}" BASE_PATH=/ pnpm --filter @workspace/telecampaign run build
pnpm --filter @workspace/api-server run build
pm2 restart telecampaign-api --update-env
"$ROOT/scripts/telecampaign-healthcheck.sh"

echo "TeleCampaign rollback completed at $TARGET_SHA."