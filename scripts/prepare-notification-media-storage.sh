#!/usr/bin/env bash
set -euo pipefail
umask 077

ENV_FILE="/etc/telecampaign/api.env"
MEDIA_ROOT="/var/lib/telecampaign/media"
MAX_MEDIA_BYTES=52428800
MAX_TOTAL_MEDIA_BYTES=2147483648
UUID_PATTERN='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

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

mkdir -p "$MEDIA_ROOT"
chmod 700 "$MEDIA_ROOT"

query_output="$(mktemp "$(dirname "$MEDIA_ROOT")/.telecampaign-media-query.XXXXXX")"
cleanup_query_output() {
  rm -f "$query_output"
}
trap cleanup_query_output EXIT
if ! psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align \
  --command 'SELECT media_path FROM admin_notifications WHERE media_path IS NOT NULL' > "$query_output"; then
  echo "Unable to verify existing notification media references; migration was not applied." >&2
  exit 1
fi

missing=0
while IFS= read -r media_path; do
  media_name="${media_path##*/}"
  if [[ ! "$media_path" =~ ^/objects/admin-notifications/${UUID_PATTERN}$ ]]; then
    echo "Notification media metadata has an unsupported path; migration was not applied." >&2
    exit 1
  fi
  media_file="$MEDIA_ROOT/$media_name"
  if [[ ! -f "$media_file" || -L "$media_file" ]]; then
    missing=1
    continue
  fi
  media_size="$(stat --format=%s "$media_file")"
  if (( media_size < 1 || media_size > MAX_MEDIA_BYTES )); then
    echo "Notification media file exceeds storage limits; migration was not applied." >&2
    exit 1
  fi
done < "$query_output"

if [[ "$missing" -ne 0 ]]; then
  echo "Existing notification media is missing from $MEDIA_ROOT. Recover matching UUID files before deploying this storage migration." >&2
  exit 1
fi

media_file_count=0
media_total_bytes=0
while IFS= read -r -d '' media_file; do
  media_name="$(basename "$media_file")"
  [[ "$media_name" =~ ^${UUID_PATTERN}$ ]] || continue
  media_file_count=$((media_file_count + 1))
  if (( media_file_count > 500 )); then
    echo "Notification media exceeds the supported 500-file capacity; migration was not applied." >&2
    exit 1
  fi
  media_total_bytes=$((media_total_bytes + $(stat --format=%s "$media_file")))
  if (( media_total_bytes > MAX_TOTAL_MEDIA_BYTES )); then
    echo "Notification media exceeds the supported 2 GiB capacity; migration was not applied." >&2
    exit 1
  fi
done < <(find "$MEDIA_ROOT" -maxdepth 1 -type f -print0)

echo "Notification media storage is ready."