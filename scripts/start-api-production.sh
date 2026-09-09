#!/usr/bin/env bash
set -euo pipefail
set -a
. /etc/telecampaign/api.env
set +a
export NODE_ENV=production
exec node --enable-source-maps /opt/telecampaign/artifacts/api-server/dist/index.mjs
