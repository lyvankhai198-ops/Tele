#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_TELECAMPAIGN_RESTORE:-}" != "YES" ]]; then
  echo "Refusing destructive restore. Re-run with CONFIRM_TELECAMPAIGN_RESTORE=YES." >&2
  exit 2
fi

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Usage: CONFIRM_TELECAMPAIGN_RESTORE=YES $0 /path/to/telecampaign-backup.dump" >&2
  exit 2
fi

ENV_FILE="/etc/telecampaign/api.env"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "TeleCampaign environment file is not readable: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${DATABASE_URL:?DATABASE_URL must be configured in the TeleCampaign environment file}"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 is required to fence telecampaign-api before a restore." >&2
  exit 1
fi

process_status="$(pm2 jlist | node -e 'let input=""; process.stdin.on("data", (chunk) => { input += chunk; }).on("end", () => { const app = JSON.parse(input).find((item) => item.name === "telecampaign-api"); process.stdout.write(app?.pm2_env?.status ?? "missing"); });')"
if [[ "$process_status" != "online" ]]; then
  echo "Refusing restore because telecampaign-api is not online (status: $process_status)." >&2
  exit 1
fi

pm2 stop telecampaign-api
stopped_status="$(pm2 jlist | node -e 'let input=""; process.stdin.on("data", (chunk) => { input += chunk; }).on("end", () => { const app = JSON.parse(input).find((item) => item.name === "telecampaign-api"); process.stdout.write(app?.pm2_env?.status ?? "missing"); });')"
if [[ "$stopped_status" != "stopped" ]]; then
  echo "telecampaign-api did not stop cleanly; restore was not started." >&2
  exit 1
fi

if ! pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$backup_file"; then
  echo "Restore failed. telecampaign-api remains stopped to prevent unsafe sends." >&2
  exit 1
fi

if ! pm2 restart telecampaign-api --update-env || ! "/opt/telecampaign/scripts/telecampaign-healthcheck.sh"; then
  pm2 stop telecampaign-api >/dev/null 2>&1 || true
  echo "TeleCampaign did not become healthy after restore and remains stopped." >&2
  exit 1
fi
echo "TeleCampaign database restore completed and telecampaign-api is healthy."