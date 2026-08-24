#!/usr/bin/env bash
set -euo pipefail
umask 077

ENV_FILE="/etc/telecampaign/api.env"
BACKUP_ROOT="/var/backups/telecampaign"
BACKUP_DIR="$BACKUP_ROOT"
RETENTION_DAYS="${TELECAMPAIGN_BACKUP_RETENTION_DAYS:-14}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "TeleCampaign environment file is not readable: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${DATABASE_URL:?DATABASE_URL must be configured in the TeleCampaign environment file}"

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

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_path="$backup_dir/telecampaign-${timestamp}.dump"
temporary_path="$(mktemp "$backup_dir/.telecampaign-${timestamp}.XXXXXX.dump")"
trap 'rm -f "$temporary_path"' EXIT

pg_dump --format=custom --no-owner --no-privileges --file="$temporary_path" "$DATABASE_URL"
mv "$temporary_path" "$final_path"
find "$backup_dir" -maxdepth 1 -type f -name 'telecampaign-*.dump' -mtime "+${RETENTION_DAYS}" -delete

echo "TeleCampaign database backup completed: $(basename "$final_path")"