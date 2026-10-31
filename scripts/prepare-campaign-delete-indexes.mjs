// Dedicated TeleCamp maintenance only. No campaign rows, status or logs are deleted.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
        AND query LIKE '%"owner_user_id"%' AND query LIKE '%"id" in (%'
        AND (query LIKE '%"status" not in%' OR
          octet_length(query)>=pg_size_bytes(current_setting('track_activity_query_size'))-4)`);
    console.log("stalled_campaign_deletes_cancelled=" + result.rows.filter(row => row.cancelled).length);
  }
  for (const [name, table, ...columns] of DELETE_INDEXES) {
    const valid = await client.query(`SELECT i.indisvalid AND i.indisready AS valid
      FROM pg_index i WHERE i.indexrelid=to_regclass($1)`, [`public.${name}`]);
    // Recover only our fixed-name incomplete concurrent indexes after a timeout.
    if (valid.rows[0]?.valid) continue;
    if (valid.rows.length) {
      await client.query(`DROP INDEX CONCURRENTLY "public"."${name}"`);
    }
    await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "public"."${table}" (${columns.map(column => `"${column}"`).join(", ")})`);
    const check = await client.query(`SELECT i.indisvalid AND i.indisready AS valid
      FROM pg_index i WHERE i.indexrelid=to_regclass($1)`, [`public.${name}`]);
    if (!check.rows[0]?.valid) throw Error("Index verification failed");
  }
}

// Some legacy tables belong to the local PostgreSQL owner, others to the app
// role. Use a narrow owner-only maintenance connection instead of transferring
// ownership or granting the application elevated database privileges.
export async function prepareAsLocalTableOwner(client, run = spawnSync) {
  const identity = await client.query(`SELECT current_database() AS database,
    current_setting('port') AS port,
    (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS database_oid,
    'public.activity_logs'::regclass::oid::int AS logs_oid,
    (SELECT oid::int FROM pg_roles WHERE rolname=current_user) AS role_oid,
    (inet_server_addr() IS NULL OR inet_server_addr() IN ('127.0.0.1'::inet,'::1'::inet)) AS local`);
  const row = identity.rows[0];
  if (!row?.local || !/^[0-9]+$/.test(String(row.port)) ||
      ![row.database_oid, row.logs_oid, row.role_oid].every(Number.isInteger)) throw Error("Local maintenance identity not verified");
  const statements = [];
  for (const [name, table, ...columns] of DELETE_INDEXES) {
    const existing = await client.query(`SELECT i.indisvalid AND i.indisready AS valid
      FROM pg_index i WHERE i.indexrelid=to_regclass($1)`, [`public.${name}`]);
    if (existing.rows[0]?.valid) continue;
    if (existing.rows.length) statements.push(`DROP INDEX CONCURRENTLY "public"."${name}";`);
    statements.push(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "public"."${table}" (${columns.map(column => `"${column}"`).join(", ")});`);
  }
  const input = `\\set VERBOSITY sqlstate
    DO $identity$ BEGIN
      IF (SELECT oid FROM pg_database WHERE datname=current_database()) <> ${row.database_oid}
        OR 'public.activity_logs'::regclass::oid <> ${row.logs_oid}
      THEN RAISE EXCEPTION 'Maintenance identity mismatch'; END IF;
    END $identity$;
    SET lock_timeout='5s';
    SET statement_timeout='180s';
    SELECT pg_cancel_backend(pid) FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid()
        AND usesysid IN (${row.role_oid},(SELECT relowner FROM pg_class WHERE oid='public.campaigns'::regclass))
        AND state='active' AND backend_type='client backend'
        AND query_start < now()-interval '90 seconds'
        AND query ~* '^delete from "campaigns"'
        AND query LIKE '%"owner_user_id"%' AND query LIKE '%"id" in (%'
        AND (query LIKE '%"status" not in%' OR
          octet_length(query)>=pg_size_bytes(current_setting('track_activity_query_size'))-4);
    ${statements.join("\n")}
  `;
  // -X ignores local psql startup files; all values remain in the private VPS
  // process. Output/errors are captured, never forwarded to public Actions.
  const result = run("sudo", ["-n", "-u", "postgres", "psql", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-p", String(row.port), "-d", row.database], {
    input, encoding: "utf8", timeout: 780_000, maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error || result.signal) throw Error("Owner index maintenance failed");
  console.log("campaign_delete_owner_maintenance=passed");
}

async function main() {
  const root = process.env.TELECAMPAIGN_ROOT || "/opt/telecampaign";
  const require = createRequire(path.join(root, "lib/db/package.json"));
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    if (!process.env.DATABASE_URL) throw Error("Missing protected environment");
    await client.connect();
    try {
      await prepareCampaignDeleteIndexes(client, { cancelStalledDeletes: true });
    } catch (error) {
      if (error?.code !== "42501") throw error;
      await prepareAsLocalTableOwner(client);
      await prepareCampaignDeleteIndexes(client);
    }
    console.log("campaign_delete_indexes=passed");
  } catch (error) {
    if (/^[0-9A-Z]{5}$/.test(error?.code || "")) console.error("campaign_delete_sqlstate=" + error.code);
    console.error("campaign_delete_indexes=failed");
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
