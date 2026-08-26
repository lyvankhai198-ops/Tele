#!/usr/bin/env bash
set -euo pipefail

PORT="${TELECAMPAIGN_PORT:-3004}"
HEALTH_URL="${TELECAMPAIGN_HEALTH_URL:-http://127.0.0.1:${PORT}/api/healthz}"
TIMEOUT_SECONDS="${TELECAMPAIGN_HEALTH_TIMEOUT_SECONDS:-10}"

deadline=$((SECONDS + TIMEOUT_SECONDS))
response=""
while (( SECONDS < deadline )); do
  if response="$(curl --fail --silent --show-error --max-time 2 "$HEALTH_URL" 2>/dev/null)" \
    && grep -Fq '"status":"ok"' <<<"$response"; then
    break
  fi
  sleep 1
done

if ! grep -Fq '"status":"ok"' <<<"$response"; then
  echo "TeleCampaign health endpoint did not become ready within ${TIMEOUT_SECONDS}s." >&2
  exit 1
fi

if command -v pm2 >/dev/null 2>&1; then
  status="$(pm2 jlist | node -e 'let input=""; process.stdin.on("data", (chunk) => { input += chunk; }).on("end", () => { const app = JSON.parse(input).find((item) => item.name === "telecampaign-api"); process.stdout.write(app?.pm2_env?.status ?? "missing"); });')"
  if [[ "$status" != "online" ]]; then
    echo "telecampaign-api is not online (status: $status)." >&2
    exit 1
  fi
fi

echo "TeleCampaign is healthy."