#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(dirname "$(realpath "$0")")/lib/telecampaign-release.sh"
release_lock
release_checkpoint
