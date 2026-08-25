#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "${CONFIRM_TELECAMPAIGN_RESTORE:-}" != "YES" ]]; then
  echo "Refusing destructive restore. Re-run with CONFIRM_TELECAMPAIGN_RESTORE=YES." >&2
  exit 2
fi

backup_target="${1:-}"
if [[ -z "$backup_target" ]]; then
  echo "Usage: CONFIRM_TELECAMPAIGN_RESTORE=YES $0 /path/to/telecampaign-backup" >&2
  exit 2
fi

ENV_FILE="/etc/telecampaign/api.env"
MEDIA_ROOT="/var/lib/telecampaign/media"
MAX_MEDIA_BYTES=52428800
MAX_MEDIA_FILES=500
MAX_MEDIA_ARCHIVE_BYTES=2147483648
UUID_PATTERN='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

if [[ -d "$backup_target" ]]; then
  backup_file="$backup_target/database.dump"
  media_backup_file="$backup_target/media.tar.gz"
  if [[ ! -f "$backup_target/COMPLETE" || ! -f "$backup_file" || ! -f "$media_backup_file" ]]; then
    echo "Backup snapshot is incomplete; restore was not started." >&2
    exit 2
  fi
elif [[ -f "$backup_target" && "$backup_target" == *.dump ]]; then
  if [[ -f "$(dirname "$backup_target")/COMPLETE" ]]; then
    echo "Use the completed backup directory, not its internal database.dump file." >&2
    exit 2
  fi
  backup_file="$backup_target"
  media_backup_file="${backup_file%.dump}.media.tar.gz"
  if [[ ! -f "$media_backup_file" ]]; then
    echo "Legacy database dumps require their matching media archive for a paired restore." >&2
    exit 2
  fi
else
  echo "Usage: CONFIRM_TELECAMPAIGN_RESTORE=YES $0 /path/to/telecampaign-backup" >&2
  exit 2
fi
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

media_restore_root=""
staged_media_root=""
listing_file=""
previous_media_root=""
pre_restore_database=""
database_may_have_changed=0
media_new_installed=0
cleanup_restore_staging() {
  [[ -n "$listing_file" ]] && rm -f "$listing_file"
  [[ -n "$media_restore_root" ]] && rm -rf "$media_restore_root"
}
cleanup_restore_artifacts() {
  cleanup_restore_staging
  [[ -n "$pre_restore_database" ]] && rm -f "$pre_restore_database"
}
rollback_to_pre_restore() {
  local rollback_failed=0
  if [[ "$database_may_have_changed" -eq 1 ]]; then
    if ! pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$pre_restore_database"; then
      rollback_failed=1
    fi
  fi
  if [[ -n "$previous_media_root" && -e "$previous_media_root" ]]; then
    rm -rf "$MEDIA_ROOT"
    if ! mv "$previous_media_root" "$MEDIA_ROOT"; then rollback_failed=1; fi
    previous_media_root=""
  elif [[ "$media_new_installed" -eq 1 ]]; then
    rm -rf "$MEDIA_ROOT"
  fi
  return "$rollback_failed"
}
trap cleanup_restore_artifacts EXIT

if [[ -f "$media_backup_file" ]]; then
  media_parent="$(dirname "$MEDIA_ROOT")"
  mkdir -p "$media_parent"
  listing_file="$(mktemp "$media_parent/.telecampaign-media-listing.XXXXXX")"
  if ! tar --list --verbose --numeric-owner --gzip --file="$media_backup_file" > "$listing_file"; then
    echo "Media backup cannot be read; restore was not started." >&2
    exit 1
  fi
  declare -A media_members=()
  root_seen=0
  media_member_count=0
  media_total_bytes=0
  while read -r permissions _owner size _date _time member extra; do
    if [[ -n "${extra:-}" || -z "${member:-}" || ! "$size" =~ ^[0-9]+$ ]]; then
      echo "Media backup has an invalid member listing; restore was not started." >&2
      exit 1
    fi
    if [[ "$permissions" == d* && "$member" == "./" && "$size" == "0" ]]; then
      root_seen=1
      continue
    fi
    if [[ "$permissions" != -* || ! "$member" =~ ^\./${UUID_PATTERN}$ || "$size" -lt 1 || "$size" -gt "$MAX_MEDIA_BYTES" || -n "${media_members[$member]:-}" || "$media_member_count" -ge "$MAX_MEDIA_FILES" || "$media_total_bytes" -gt "$((MAX_MEDIA_ARCHIVE_BYTES - size))" ]]; then
      echo "Media backup contains an unsafe member; restore was not started." >&2
      exit 1
    fi
    media_members["$member"]=1
    media_member_count=$((media_member_count + 1))
    media_total_bytes=$((media_total_bytes + size))
  done < "$listing_file"
  if [[ "$root_seen" -ne 1 ]]; then
    echo "Media backup is missing its root directory; restore was not started." >&2
    exit 1
  fi
  rm -f "$listing_file"
  listing_file=""

  media_restore_root="$(mktemp -d "$media_parent/.telecampaign-media-restore.XXXXXX")"
  staged_media_root="$media_restore_root/media"
  mkdir -p "$staged_media_root"
  if ! tar --extract --gzip --file="$media_backup_file" --directory="$staged_media_root" --no-same-owner --no-same-permissions \
    || find "$staged_media_root" -mindepth 1 ! -type f -print -quit | grep -q . \
    || find "$staged_media_root" -type f -size +51200k -print -quit | grep -q .; then
    echo "Media restore failed validation; restore was not started." >&2
    exit 1
  fi
  extracted_member_count=0
  extracted_total_bytes=0
  while IFS= read -r -d '' extracted_file; do
    extracted_size="$(stat --format=%s "$extracted_file")"
    if (( extracted_member_count >= MAX_MEDIA_FILES || extracted_size < 1 || extracted_size > MAX_MEDIA_BYTES || extracted_total_bytes > MAX_MEDIA_ARCHIVE_BYTES - extracted_size )); then
      echo "Media restore exceeded protected limits; restore was not started." >&2
      exit 1
    fi
    extracted_member_count=$((extracted_member_count + 1))
    extracted_total_bytes=$((extracted_total_bytes + extracted_size))
  done < <(find "$staged_media_root" -maxdepth 1 -type f -print0)
fi

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

pre_restore_database="$(mktemp "$(dirname "$MEDIA_ROOT")/.telecampaign-pre-restore.XXXXXX.dump")"
if ! pg_dump --format=custom --no-owner --no-privileges --file="$pre_restore_database" "$DATABASE_URL"; then
  echo "Unable to create a pre-restore rollback snapshot. telecampaign-api remains stopped." >&2
  exit 1
fi

database_may_have_changed=1
if ! pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$backup_file"; then
  if ! rollback_to_pre_restore; then
    echo "Restore and rollback both failed. telecampaign-api remains stopped." >&2
  else
    echo "Restore failed and the original database/media pair was restored. telecampaign-api remains stopped." >&2
  fi
  exit 1
fi

if [[ -f "$media_backup_file" ]]; then
  if [[ -L "$MEDIA_ROOT" ]]; then
    if ! rollback_to_pre_restore; then
      echo "Refused symbolic-link media directory and rollback failed. telecampaign-api remains stopped." >&2
    else
      echo "Refused symbolic-link media directory; the original database/media pair was restored. telecampaign-api remains stopped." >&2
    fi
    exit 1
  fi
  previous_media_root="$(mktemp -d "$(dirname "$MEDIA_ROOT")/.telecampaign-media-before-restore.XXXXXX")"
  rmdir "$previous_media_root"
  if [[ -e "$MEDIA_ROOT" ]] && ! mv "$MEDIA_ROOT" "$previous_media_root"; then
    if ! rollback_to_pre_restore; then
      echo "Unable to stage existing media and rollback failed. telecampaign-api remains stopped." >&2
    else
      echo "Unable to stage existing media; the original database/media pair was restored. telecampaign-api remains stopped." >&2
    fi
    exit 1
  fi
  if ! mv "$staged_media_root" "$MEDIA_ROOT"; then
    if ! rollback_to_pre_restore; then
      echo "Unable to install restored media and rollback failed. telecampaign-api remains stopped." >&2
    else
      echo "Unable to install restored media; the original database/media pair was restored. telecampaign-api remains stopped." >&2
    fi
    exit 1
  fi
  media_new_installed=1
  if ! chmod 700 "$MEDIA_ROOT"; then
    if ! rollback_to_pre_restore; then
      echo "Unable to secure restored media and rollback failed. telecampaign-api remains stopped." >&2
    else
      echo "Unable to secure restored media; the original database/media pair was restored. telecampaign-api remains stopped." >&2
    fi
    exit 1
  fi
  cleanup_restore_staging
  media_restore_root=""
else
  echo "No matching media archive found; existing notification media was left unchanged." >&2
fi

if ! pm2 restart telecampaign-api --update-env || ! "/opt/telecampaign/scripts/telecampaign-healthcheck.sh"; then
  pm2 stop telecampaign-api >/dev/null 2>&1 || true
  if ! rollback_to_pre_restore; then
    echo "TeleCampaign did not become healthy and rollback failed. It remains stopped." >&2
  else
    echo "TeleCampaign did not become healthy; the original database/media pair was restored and it remains stopped." >&2
  fi
  exit 1
fi
if [[ -n "$previous_media_root" ]]; then rm -rf "$previous_media_root"; fi
rm -f "$pre_restore_database"
pre_restore_database=""
echo "TeleCampaign restore completed and telecampaign-api is healthy."