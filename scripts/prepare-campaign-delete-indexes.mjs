// Dedicated TeleCamp maintenance only. No campaign rows, status or logs are deleted.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

export const DELETE_INDEXES = Object.freeze([
  ["activity_logs_campaign_idx", "activity_logs", "campaign_id"],
  ["activity_logs_target_idx", "activity_logs", "target_id"],
  ["admin_group_join_jobs_auto_campaign_idx", "admin_group_join_jobs", "auto_campaign_id"],
  ["campaign_targets_campaign_updated_idx", "campaign_targets", "campaign_id", "updated_at"],
]);

export async function prepareCampaignDeleteIndexes(client, { cancelStalledDeletes = false } = {}) {
  await client.query("SET lock_timeout = '5s'");
  await client.query("SET statement_timeout = '180s'");
  // An abandoned pre-fix autocommit DELETE can block concurrent index creation.
  // Cancel only this application's exact protected delete shape, never workers,
  // unrelated tables/users/databases, or recent requests. Cancellation rolls its
  // unfinished statement back; it does not stop or modify running campaigns.
  if (cancelStalledDeletes) {
    const result = await client.query(`SELECT pg_cancel_backend(pid) AS cancelled
      FROM pg_stat_activity
      WHERE datname=current_database() AND usesysid=(SELECT oid FROM pg_roles WHERE rolname=current_user)
        AND pid<>pg_backend_pid() AND state='active' AND backend_type='client backend'
        AND query_start < now()-interval '90 seconds'
        AND query ~* '^delete from "campaigns"'
        AND query LIKE '%"owner_user_id"%' AND query LIKE '%"status" not in%'`);
    console.log("stalled_campaign_deletes_cancelled=" + result.rows.filter(row => row.cancelled).length);
  }
  for (const [name, table, ...columns] of DELETE_INDEXES) {
    const valid = await client.query(`SELECT i.indisvalid AND i.indisready AS valid
      FROM pg_index i WHERE i.indexrelid=to_regclass($1)`, [`public.${name}`]);
    // Recover only our fixed-name incomplete concurrent indexes after a timeout.
    if (valid.rows.length && !valid.rows[0].valid) {
      await client.query(`DROP INDEX CONCURRENTLY "public"."${name}"`);
    }
    await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "public"."${table}" (${columns.map(column => `"${column}"`).join(", ")})`);
    const check = await client.query(`SELECT i.indisvalid AND i.indisready AS valid
      FROM pg_index i WHERE i.indexrelid=to_regclass($1)`, [`public.${name}`]);
    if (!check.rows[0]?.valid) throw Error("Index verification failed");
  }
}

async function main() {
  const root = process.env.TELECAMPAIGN_ROOT || "/opt/telecampaign";
  const require = createRequire(path.join(root, "lib/db/package.json"));
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    if (!process.env.DATABASE_URL) throw Error("Missing protected environment");
    await client.connect();
    await prepareCampaignDeleteIndexes(client, { cancelStalledDeletes: true });
    console.log("campaign_delete_indexes=passed");
  } catch {
    console.error("campaign_delete_indexes=failed");
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
