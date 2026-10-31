#!/usr/bin/env bash
# Shared by the dedicated TeleCampaign release commands. Never source api.env
# here: snapshots must not copy or print production credentials.
ROOT="/opt/telecampaign"
RELEASES="/var/backups/telecampaign/releases"
LOCK="/var/lib/telecampaign/operation.lock"
PREVIOUS="$RELEASES/PREVIOUS"
STAGING="/var/lib/telecampaign/staging"
SAVED_RELEASE=""

release_git() {
  git -c safe.directory="$ROOT" -C "$ROOT" "$@"
}

release_lock() {
  mkdir -p "$(dirname "$LOCK")" || return 1
  # A child backup/restore command inherits the parent's locked descriptor.
  if [[ "$(readlink "/proc/$$/fd/9" 2>/dev/null || true)" != "$LOCK" ]]; then
    exec 9>"$LOCK"
  fi
  flock -n 9 || { echo "Another TeleCampaign operation is running." >&2; return 1; }
}

release_require_repository() {
  [[ -d "$ROOT/.git" && ! -L "$ROOT" \
    && -f "$ROOT/artifacts/api-server/package.json" \
    && -f "$ROOT/artifacts/telecampaign/package.json" ]] \
    || { echo "Refusing operation outside the TeleCampaign deployment." >&2; return 1; }
}

release_require_clean() {
  [[ -z "$(release_git status --porcelain --untracked-files=normal)" ]] \
    || { echo "TeleCampaign has local changes; commit or preserve them first." >&2; return 1; }
}

release_runtime_paths() {
  local base path
  for base in node_modules artifacts lib scripts; do
    [[ -d "$ROOT/$base" && ! -L "$ROOT/$base" ]] || continue
    while IFS= read -r -d '' path; do
      path="${path#"$ROOT/"}"
      if [[ "$path" =~ ^(node_modules|(artifacts|lib)/[^/]+/(node_modules|dist)|scripts/(node_modules|dist))$ ]]; then
        printf '%s\0' "$path"
      fi
    done < <(find "$ROOT/$base" -maxdepth 3 -type d \
      \( -name node_modules -o -name dist \) -print0 -prune)
  done
}

release_validate() {
  local snapshot="$1" path sha
  [[ -d "$snapshot" && ! -L "$snapshot" ]] || return 1
  snapshot="$(realpath -e "$snapshot")" || return 1
  [[ "$snapshot" == "$RELEASES/"* && -f "$snapshot/COMPLETE" ]] || return 1
  [[ "$(cat "$snapshot/COMPLETE")" == "telecampaign-release-v1" ]] || return 1
  [[ -f "$snapshot/COMMIT" && -f "$snapshot/runtime.tar.gz" \
    && -f "$snapshot/RUNTIME_PATHS" && -f "$snapshot/SHA256SUMS" ]] || return 1
  (cd "$snapshot" && sha256sum --status --check SHA256SUMS) || return 1
  sha="$(cat "$snapshot/COMMIT")"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 1
  release_git cat-file -e "${sha}^{commit}" || return 1
  while IFS= read -r -d '' path; do
    [[ "$path" =~ ^(node_modules|(artifacts|lib)/[^/]+/(node_modules|dist)|scripts/(node_modules|dist))$ ]] || return 1
  done < "$snapshot/RUNTIME_PATHS"
  tar -tzf "$snapshot/runtime.tar.gz" >/dev/null || return 1
}

release_validate_prebuilt() {
  local stage="$1" expected_sha="$2" path member platform
  [[ -d "$stage" && ! -L "$stage" ]] || return 1
  stage="$(realpath -e "$stage")" || return 1
  [[ "$stage" == "$STAGING/$expected_sha" ]] || return 1
  for path in COMMIT PLATFORM RUNTIME_PATHS runtime.tar.gz SHA256SUMS COMPLETE; do
    [[ -f "$stage/$path" && ! -L "$stage/$path" ]] || return 1
  done
  [[ "$(cat "$stage/COMPLETE")" == "telecampaign-runtime-v1" ]] || return 1
  (cd "$stage" && sha256sum --status --check SHA256SUMS) || return 1
  [[ "$(cat "$stage/COMMIT")" == "$expected_sha" ]] || return 1
  platform="$(node -p 'process.platform+":"+process.arch+":"+process.versions.modules')" || return 1
  [[ "$(cat "$stage/PLATFORM")" == "$platform" ]] || return 1
  while IFS= read -r -d '' path; do
    [[ "$path" =~ ^(node_modules|(artifacts|lib)/[^/]+/(node_modules|dist)|scripts/(node_modules|dist))$ ]] || return 1
  done < "$stage/RUNTIME_PATHS"
  tar -tzf "$stage/runtime.tar.gz" >/dev/null || return 1
  while IFS= read -r member; do
    [[ ! "$member" =~ (^|/)\.\.(/|$) ]] || return 1
    [[ "$member" =~ ^(node_modules(/.*)?|(artifacts|lib)/[^/]+/(node_modules|dist)(/.*)?|scripts/(node_modules|dist)(/.*)?)$ ]] || return 1
  done < <(tar -tzf "$stage/runtime.tar.gz")
}

release_checkpoint() {
  local sha temporary final
  release_require_repository
  release_require_clean
  bash "$ROOT/scripts/telecampaign-healthcheck.sh"
  [[ -s "$ROOT/artifacts/api-server/dist/index.mjs" \
    && -s "$ROOT/artifacts/telecampaign/dist/public/index.html" \
    && -d "$ROOT/node_modules" && ! -L "$ROOT/node_modules" ]] \
    || { echo "A built, installed release is required before checkpointing." >&2; return 1; }
  mkdir -p "$RELEASES"
  chmod 700 "$RELEASES"
  sha="$(release_git rev-parse HEAD)"
  temporary="$(mktemp -d "$RELEASES/.incomplete.XXXXXX")"
  # Incomplete snapshots are never selected; keep them for diagnosis on failure.
  printf '%s\n' "$sha" > "$temporary/COMMIT"
  release_runtime_paths > "$temporary/RUNTIME_PATHS"
  tar -czf "$temporary/runtime.tar.gz" -C "$ROOT" --null --files-from="$temporary/RUNTIME_PATHS"
  (cd "$temporary" && sha256sum COMMIT RUNTIME_PATHS runtime.tar.gz > SHA256SUMS)
  printf 'telecampaign-release-v1\n' > "$temporary/COMPLETE"
  final="$RELEASES/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}-${temporary##*.}"
  # Keep the source commit reachable even after force-pushes or Git GC.
  release_git update-ref "refs/telecampaign/checkpoints/${final##*/}" "$sha"
  mv "$temporary" "$final"
  release_validate "$final"
  printf '%s\n' "$final" > "$RELEASES/.previous.$$"
  mv "$RELEASES/.previous.$$" "$PREVIOUS"
  SAVED_RELEASE="$final"
  echo "Ready-to-run TeleCampaign checkpoint: $final"
}

release_restore() {
  local snapshot="$1" sha path
  release_validate "$snapshot" \
    || { echo "Release checkpoint is missing, incomplete or corrupt; nothing changed." >&2; return 1; }
  sha="$(cat "$snapshot/COMMIT")"
  if ! release_git diff --quiet HEAD "$sha" -- lib/db; then
    echo "Database package differs from the checkpoint; review database compatibility before rollback." >&2
    return 1
  fi
  # Do not call scripts from the target release after switching its source.
  # All restore logic is already loaded into this process.
  pm2 stop telecampaign-api || return 1
  release_git reset --hard "$sha" || return 1
  while IFS= read -r -d '' path; do
    rm -rf -- "$ROOT/$path" || return 1
  done < <(release_runtime_paths)
  while IFS= read -r -d '' path; do
    rm -rf -- "$ROOT/$path" || return 1
  done < "$snapshot/RUNTIME_PATHS"
  # Preserve web-asset read permissions for Nginx even though the wrapper uses
  # umask 077 to protect the checkpoint archive itself.
  tar --extract --gzip --same-permissions --no-same-owner \
    --file="$snapshot/runtime.tar.gz" --directory="$ROOT" || return 1
  if ! pm2 restart telecampaign-api --update-env \
    || ! bash "$ROOT/scripts/telecampaign-healthcheck.sh"; then
    pm2 stop telecampaign-api >/dev/null 2>&1 || true
    echo "Recovered files but health validation failed; telecampaign-api remains stopped." >&2
    return 1
  fi
  echo "TeleCampaign restored to $sha without installing or rebuilding."
}
