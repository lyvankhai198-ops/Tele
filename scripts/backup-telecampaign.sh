#!/usr/bin/env bash
set -euo pipefail
umask 077

ENV_FILE="/etc/telecampaign/api.env"
BACKUP_ROOT="/var/backups/telecampaign"
BACKUP_DIR="$BACKUP_ROOT"
MEDIA_ROOT="/var/lib/telecampaign/media"
RETENTION_DAYS="${TELECAMPAIGN_BACKUP_RETENTION_DAYS:-14}"
MAX_MEDIA_FILES=500
MAX_MEDIA_BYTES=2147483648
UUID_PATTERN='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
api_fenced=0
snapshot_temporary_dir=""

restart_api_after_backup() {
  if [[ "$api_fenced" -ne 1 ]]; then return; fi
  if ! pm2 restart telecampaign-api --update-env || ! /opt/telecampaign/scripts/telecampaign-healthcheck.sh; then
    pm2 stop telecampaign-api >/dev/null 2>&1 || true
    echo "TeleCampaign backup could not safely restart telecampaign-api; it remains stopped." >&2
    api_fenced=0
    return 1
  fi
  api_fenced=0
}

cleanup() {
  status=$?
  [[ -n "$snapshot_temporary_dir" ]] && rm -rf "$snapshot_temporary_dir"
  if ! restart_api_after_backup; then exit 1; fi
  exit "$status"
}
trap cleanup EXIT

if [[ ! -r "$ENV_FILE" ]]; then
  echo "TeleCampaign environment file is not readable: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${DATABASE_URL:?DATABASE_URL must be configured in the TeleCampaign environment file}"
if [[ -n "${TELECAMPAIGN_MEDIA_DIR:-}" && "${TELECAMPAIGN_MEDIA_DIR}" != "$MEDIA_ROOT" ]]; then
  echo "TELECAMPAIGN_MEDIA_DIR must be $MEDIA_ROOT on this VPS." >&2
  exit 1
fi

backup_root="$(realpath -m "$BACKUP_ROOT")"
backup_dir="$(realpath -m "$BACKUP_DIR")"
case "$backup_dir" in
  "$backup_root"|"$backup_root"/*) ;;
  *)
    echo "Backups must remain inside $backup_root." >&2
    exit 1
    ;;
esac

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
mkdir -p "$MEDIA_ROOT"
chmod 700 "$MEDIA_ROOT"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 is required to create a paired TeleCampaign backup." >&2
  exit 1
fi
process_status="$(pm2 jlist | node -e 'let input=""; process.stdin.on("data", (chunk) => { input += chunk; }).on("end", () => { const app = JSON.parse(input).find((item) => item.name === "telecampaign-api"); process.stdout.write(app?.pm2_env?.status ?? "missing"); });')"
if [[ "$process_status" != "online" ]]; then
  echo "Refusing backup because telecampaign-api is not online (status: $process_status)." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_final_dir="$backup_dir/telecampaign-${timestamp}"
if [[ -e "$snapshot_final_dir" ]]; then
  echo "Backup snapshot already exists: $snapshot_final_dir" >&2
  exit 1
fi
snapshot_temporary_dir="$(mktemp -d "$backup_dir/.telecampaign-${timestamp}.XXXXXX")"
database_backup_path="$snapshot_temporary_dir/database.dump"
media_backup_path="$snapshot_temporary_dir/media.tar.gz"
media_list_path="$snapshot_temporary_dir/.media-files"

pm2 stop telecampaign-api
api_fenced=1
stopped_status="$(pm2 jlist | node -e 'let input=""; process.stdin.on("data", (chunk) => { input += chunk; }).on("end", () => { const app = JSON.parse(input).find((item) => item.name === "telecampaign-api"); process.stdout.write(app?.pm2_env?.status ?? "missing"); });')"
if [[ "$stopped_status" != "stopped" ]]; then
  echo "telecampaign-api did not stop cleanly; paired backup was not started." >&2
  exit 1
fi

media_file_count=0
media_total_bytes=0
printf '%s\0' . > "$media_list_path"
while IFS= read -r -d '' media_file; do
  media_name="$(basename "$media_file")"
  [[ "$media_name" =~ ^${UUID_PATTERN}$ ]] || continue
  media_size="$(stat --format=%s "$media_file")"
  if (( media_file_count >= MAX_MEDIA_FILES || media_size < 1 || media_size > 52428800 || media_total_bytes > MAX_MEDIA_BYTES - media_size )); then
    echo "Notification media exceeds the protected backup limits." >&2
    exit 1
  fi
  media_file_count=$((media_file_count + 1))
  media_total_bytes=$((media_total_bytes + media_size))
  printf './%s\0' "$media_name" >> "$media_list_path"
done < <(find "$MEDIA_ROOT" -maxdepth 1 -type f -print0)

pg_dump --format=custom --no-owner --no-privileges --file="$database_backup_path" "$DATABASE_URL"
tar --create --gzip --file="$media_backup_path" --directory="$MEDIA_ROOT" --no-recursion --null --files-from="$media_list_path"
rm -f "$media_list_path"
printf 'telecampaign-media-snapshot-v1\n' > "$snapshot_temporary_dir/COMPLETE"
mv "$snapshot_temporary_dir" "$snapshot_final_dir"
snapshot_temporary_dir=""
find "$backup_dir" -maxdepth 1 -type d -name 'telecampaign-*' -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +
find "$backup_dir" -maxdepth 1 -type f -name 'telecampaign-*.dump' -mtime "+${RETENTION_DAYS}" -delete
find "$backup_dir" -maxdepth 1 -type f -name 'telecampaign-*.media.tar.gz' -mtime "+${RETENTION_DAYS}" -delete
restart_api_after_backup

echo "TeleCampaign backup completed: $(basename "$snapshot_final_dir")"