# TeleCampaign Operations

## Scope

These commands apply only to TeleCampaign. They must run from `/opt/telecampaign` and may only restart `telecampaign-api`. Never restart PM2 globally, edit shared Nginx configuration, or operate on any other project.

## Health check

Run the local check after every deploy:

```bash
/opt/telecampaign/scripts/telecampaign-healthcheck.sh
```

The check verifies that the dedicated PM2 process is online and that `GET /api/healthz` can reach both the API and database.

## Database backup

Create an encrypted-permission database dump owned by the current operator:

```bash
/opt/telecampaign/scripts/backup-telecampaign.sh
```

Backups are stored only in `/var/backups/telecampaign` and files older than 14 days are removed. `TELECAMPAIGN_BACKUP_DIR` is intentionally ignored; `TELECAMPAIGN_BACKUP_RETENTION_DAYS` may be set only for a one-off retention adjustment.

The backup and restore scripts always read `/etc/telecampaign/api.env`; they intentionally reject environment-file overrides so another VPS project's database cannot be selected by mistake.

## Scheduled operations

Install `/opt/telecampaign/scripts/telecampaign-operations.cron` as `/etc/cron.d/telecampaign-operations` with mode `0644`. It runs only the dedicated backup and local health-check scripts; it does not restart PM2 or operate on any other VPS project.

## Restore

Restore overwrites the TeleCampaign database. Use a verified backup and require an explicit confirmation:

```bash
CONFIRM_TELECAMPAIGN_RESTORE=YES \
  /opt/telecampaign/scripts/restore-telecampaign.sh \
  /var/backups/telecampaign/telecampaign-YYYYMMDDTHHMMSSZ.dump
```

The restore script stops only `telecampaign-api`, verifies it stopped, restores the database, then restarts only that process and runs the health check. If the restore fails, it leaves the process stopped to prevent unsafe campaign sends.

## Rollback application code

Use a known-good TeleCampaign commit SHA. The rollback script refuses a dirty repository, rebuilds only TeleCampaign, restarts only `telecampaign-api`, and runs its health check:

```bash
/opt/telecampaign/scripts/rollback-telecampaign.sh <known-good-commit-sha>
```

Application rollback does not roll back the database schema. Keep schema changes backward-compatible until a verified backup/restore plan is available.

## Safe deploy checklist

1. Publish validated code to GitHub `main`.
2. In `/opt/telecampaign`, fast-forward to that commit.
3. Run the TeleCampaign database schema update with the TeleCampaign environment loaded.
4. Build the TeleCampaign web artifact and API artifact.
5. Restart only `telecampaign-api`.
6. Run `scripts/telecampaign-healthcheck.sh`.
7. Verify the public HTTPS health URL.