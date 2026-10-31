# TeleCampaign Operations

## Scope

These commands apply only to TeleCampaign. They must run from `/opt/telecampaign` and may only restart `telecampaign-api`. Never restart PM2 globally, edit shared Nginx configuration, or operate on any other project.

## Health check

Run the local check after every deploy:

```bash
/opt/telecampaign/scripts/telecampaign-healthcheck.sh
```

The check verifies that the dedicated PM2 process is online and that `GET /api/healthz` can reach both the API and database.

## Backup

Create encrypted-permission backups of the database and notification media:

```bash
/opt/telecampaign/scripts/backup-telecampaign.sh
```

Backups are stored only in `/var/backups/telecampaign` and files older than 7 days are removed. Each completed backup is one timestamped directory containing `database.dump`, `media.tar.gz`, and a completion marker; the directory appears only after all three are ready. Media lives in `/var/lib/telecampaign/media`. The backup script briefly stops only `telecampaign-api` while it takes both files, then restarts it and runs the local health check; this keeps database rows and media files in one consistent snapshot. Backup and restore reject media sets above 500 files or 2 GiB uncompressed. `TELECAMPAIGN_BACKUP_DIR` is intentionally ignored; `TELECAMPAIGN_BACKUP_RETENTION_DAYS` may be set only for a one-off retention adjustment.

The backup and restore scripts always read `/etc/telecampaign/api.env`; they intentionally reject environment-file overrides so another VPS project's database or media path cannot be selected by mistake.

## Notification media

Notification images and videos live only in `/var/lib/telecampaign/media`, with owner-only permissions. They are never committed to Git or stored in PostgreSQL. The API serves these files only through the authenticated notification-media route; do not expose this directory with Nginx or copy files into the repository.

The API removes unreferenced media after a one-hour grace period at startup and hourly thereafter. This covers uploads that were abandoned before a notification was saved.

Before the first filesystem-media release, run the migration preflight while the API is stopped:

```bash
bash /opt/telecampaign/scripts/prepare-notification-media-storage.sh
```

It creates the protected directory and verifies every existing notification-media database reference has a matching UUID-named file on VPS. It refuses deployment rather than silently breaking historical media; recover/copy those matching files first if it reports a missing file.

## Scheduled operations

Install `/opt/telecampaign/scripts/telecampaign-operations.cron` as `/etc/cron.d/telecampaign-operations` with mode `0644`. It runs only the dedicated backup and local health-check scripts; the backup briefly stops and restarts only `telecampaign-api`, never PM2 globally or any other VPS project.

The same cron file rotates only the dedicated TeleCampaign PM2 logs every five minutes. Rotation uses `copytruncate`, a 25 MiB size threshold, compression, and seven retained files, so it does not stop `telecampaign-api` or the campaign worker. Install `/opt/telecampaign/scripts/telecampaign-api.logrotate` as `/etc/logrotate.d/telecampaign-api` with mode `0644`.

## Restore

Restore overwrites the TeleCampaign database. Use a verified backup and require an explicit confirmation:

```bash
CONFIRM_TELECAMPAIGN_RESTORE=YES \
  /opt/telecampaign/scripts/restore-telecampaign.sh \
  /var/backups/telecampaign/telecampaign-YYYYMMDDTHHMMSSZ
```

The restore script requires every part of a new-format backup directory and restores `/var/lib/telecampaign/media` while `telecampaign-api` is stopped. A legacy `.dump` is accepted only with its matching legacy media archive, so a database/media pair is never restored separately. Before mutating data, it creates a rollback snapshot; if restore, media replacement, restart, or health validation fails, it restores the original database/media pair and keeps `telecampaign-api` stopped for inspection.

## Rollback application code

Use a **ready-to-run checkpoint**, not a fresh install/build of an old commit.
Each checkpoint saves the source commit, installed workspace dependencies
(including native modules), and built web/API/library artifacts. Checksums are
verified before any change. Git refs keep checkpoint commits reachable during GC.
Production credentials in `/etc/telecampaign/api.env`, database rows and media
are not changed by code rollback.

```bash
bash /opt/telecampaign/scripts/rollback-telecampaign.sh --previous
```

For a specific older checkpoint, pass its full directory instead of `--previous`:

```bash
bash /opt/telecampaign/scripts/rollback-telecampaign.sh \
  /var/backups/telecampaign/releases/<checkpoint-directory>
```

The old arbitrary-commit rollback interface is intentionally no longer supported:
an old SHA alone does not preserve a working build or dependencies. If no
checkpoint exists, the command refuses without replacing code. Manual rollback
does not require a working API or access to GitHub/npm. It refuses dirty source,
corrupt/incomplete snapshots, and differences in `lib/db` that require a reviewed
compatibility plan. If the restored API fails health validation, it stays stopped
for inspection rather than continuing an unhealthy worker.

### Initial setup (once)

Install these scripts together from the reviewed GitHub change, using the same
Unix account and `PM2_HOME` as `telecampaign-api`. Verify that the currently running
web/API build matches the checked-out commit and that the repository is clean.
Then create a baseline **before any application changes**:

```bash
bash /opt/telecampaign/scripts/checkpoint-telecampaign.sh
```

This baseline only works for a currently healthy release that already has built
assets and installed dependencies. It cannot reconstruct a previously working
version from an already broken installation. Initial installation of the scripts
does not itself deploy new application code. Keep access to a trusted copy of the
release scripts: restoring a checkpoint from before their introduction also
restores the source from before these scripts existed.

For the first protected rollout, keep the reviewed release scripts together in
an owner-only control directory outside the live checkout, for example
`/var/lib/telecampaign/control/<reviewed-commit>/scripts`. Invoke that copy for
deploy and rollback. Its helper still pins all application operations to
`/opt/telecampaign`; its backup command comes from the same trusted control copy.
Provision `/var/lib/telecampaign/operation.lock` for the TeleCampaign PM2 owner
without replacing an existing lock inode. Preserve any local source changes
before making the checkout clean; do not discard them with a blanket reset.

### Safe deploy

Publish reviewed and tested changes to GitHub `main`, but **do not run `git pull`,
reset, install or build on VPS first**. Invoke the installed wrapper:

```bash
bash /opt/telecampaign/scripts/deploy-telecampaign.sh
# Or deploy a reviewed commit:
bash /opt/telecampaign/scripts/deploy-telecampaign.sh <commit-sha>
```

It fetches the target without changing the live checkout, rejects changes in
`lib/db`, takes a paired database/media backup, and saves a checksummed
ready-to-run release checkpoint. Only then does it stop `telecampaign-api`,
switch code, install/build, run media preflight, restart that process, and check
API/database health. Build, install, restart, preflight or health failure triggers
automatic **code/dependency/asset** recovery from that exact checkpoint. The
deploy still exits nonzero so failure cannot be mistaken for success.

On a memory-constrained shared VPS, use a prebuilt runtime instead of running
pnpm/Vite/esbuild there:

```bash
bash /var/lib/telecampaign/control/<reviewed-control-commit>/scripts/deploy-telecampaign.sh \
  <reviewed-app-commit> --prebuilt /var/lib/telecampaign/staging/<reviewed-app-commit>
```

The staged release must contain `COMMIT`, `PLATFORM` (OS/architecture/Node ABI),
NUL-delimited `RUNTIME_PATHS`, `runtime.tar.gz`, `SHA256SUMS`, and a
`telecampaign-runtime-v1` completion marker. Validation happens before backup or
source replacement. Only workspace `node_modules` and `dist` paths are accepted;
environment/configuration files and arbitrary paths cannot be installed this way.
Build on the same OS/architecture and Node major, using only the necessary
frontend build environment through a private temporary file, never a log or an
uploaded environment file. The VPS still creates its own database/media backup
and old-runtime checkpoint before activating the prebuilt dependencies/assets.

If a later functional check reveals a bug, use `rollback-telecampaign.sh --previous`.
Basic health checks do not prove login, campaigns, payments or Telegram actions
are correct: verify those separately and check the public HTTPS page after deploy.
Recovery is not zero downtime: the API is stopped during replacement, and Nginx
may briefly serve unavailable/mixed frontend assets. No shared Nginx configuration
or other project's PM2 processes are changed.

Deploy, checkpoint, backup, restore and rollback share a nonblocking operation
lock. Use the same Unix account for all of them. Checkpoints live only under
`/var/backups/telecampaign/releases`, with owner-only permissions; they are **not**
deleted by the seven-day database backup cleanup. Monitor disk space and retain
the required known-good checkpoints. The checkpoint process must finish before
any source replacement; disk-full/archive failures therefore abort the deploy.

### Database and external side effects

Code rollback is deliberately separate from destructive data restore. It must
not erase orders, users, campaign progress or media created after deployment.
The wrapper never runs schema push/migration commands; any `lib/db` change
requires a separately reviewed, backward-compatible schema/recovery plan.
For a necessary full data restore, use the explicit confirmation and paired
backup procedure above, understanding that newer database/media changes are
lost. No rollback can unsend Telegram messages or undo external payments.

SIGINT/SIGTERM and ordinary command failures attempt code recovery. A power loss,
SIGKILL, failed disk or corrupt checkpoint cannot guarantee automatic recovery.
After a hard interruption, inspect the saved checkpoint and run the manual
rollback command; if recovery cannot pass health checks, keep the API stopped.

### Offline release-safety tests

```bash
bash -n scripts/*.sh scripts/lib/telecampaign-release.sh
python3 scripts/tests/test_release_safety.py
```

These tests use temporary Git repositories and fake PM2/pnpm/health/database-backup
commands. They exercise checkpoint validation, successful deploy, install/build/
media-preflight/restart/health failure recovery, late manual rollback, dirty
source, schema-change refusal, and operation locking without accessing a VPS.
They do not replace a controlled VPS rollback rehearsal or a real database
restore drill.