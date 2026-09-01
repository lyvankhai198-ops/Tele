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

The same cron file rotates only the dedicated TeleCampaign PM2 logs every five minutes. Rotation uses `copytruncate`, a 25 MiB size threshold, compression, and seven retained files, so it does not stop `telecampaign-api` or the campaign worker. The log policy is stored at `/opt/telecampaign/scripts/telecampaign-api.logrotate`.

## Restore

Restore overwrites the TeleCampaign database. Use a verified backup and require an explicit confirmation:

```bash
CONFIRM_TELECAMPAIGN_RESTORE=YES \
  /opt/telecampaign/scripts/restore-telecampaign.sh \
  /var/backups/telecampaign/telecampaign-YYYYMMDDTHHMMSSZ
```

The restore script requires every part of a new-format backup directory and restores `/var/lib/telecampaign/media` while `telecampaign-api` is stopped. A legacy `.dump` is accepted only with its matching legacy media archive, so a database/media pair is never restored separately. Before mutating data, it creates a rollback snapshot; if restore, media replacement, restart, or health validation fails, it restores the original database/media pair and keeps `telecampaign-api` stopped for inspection.

## Rollback application code

Use a known-good TeleCampaign commit SHA. The rollback script refuses a dirty repository, rebuilds only TeleCampaign, restarts only `telecampaign-api`, and runs its health check:

```bash
/opt/telecampaign/scripts/rollback-telecampaign.sh <known-good-commit-sha>
```

Application rollback does not roll back the database schema. It also refuses to roll back to a release that cannot read filesystem notification media while such media exists; restore a paired backup first if that rollback is required. Keep schema changes backward-compatible until a verified backup/restore plan is available.

## Safe deploy checklist

1. Publish validated code to GitHub `main`.
2. In `/opt/telecampaign`, fast-forward to that commit.
3. Run the TeleCampaign database schema update with the TeleCampaign environment loaded.
4. Build the TeleCampaign web artifact and API artifact.
5. Stop only `telecampaign-api`, run `bash scripts/prepare-notification-media-storage.sh`, and correct any missing historical media before continuing.
6. Restart only `telecampaign-api`.
7. Run `scripts/telecampaign-healthcheck.sh`.
8. Verify the public HTTPS health URL and an authenticated notification-media upload.