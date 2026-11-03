import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_SCHEMA_SHA = "527af4b1ad98342e6bc466a652d3e245f140b59d14ea5d36fd952c0560bc03fd";
export const ROUND_SCHEMA_SHA = "67d9fbc4c76ab70ab5fe0ec10080aaaae005f9cf7a73107fd81c8437ff143ccb";
const schemaPath = "lib/db/src/schema/index.ts";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = code => { throw new Error(code); };

export function approvedSchemaChange(before, after, files) {
  return [BASE_SCHEMA_SHA, ROUND_SCHEMA_SHA].includes(before)
    && after === ROUND_SCHEMA_SHA
    && files.every(file => file === schemaPath)
    && (before === after || files.length === 1);
}

export function checkSource(root, target) {
  if (!/^[a-f0-9]{40}$/.test(target)) fail("ROUND_SCHEMA_TARGET_INVALID");
  const git = args => execFileSync("git", ["-c", `safe.directory=${root}`, "-C", root, ...args], {stdio:["ignore","pipe","pipe"]});
  const before = digest(git(["show",`HEAD:${schemaPath}`]));
  const after = digest(git(["show",`${target}:${schemaPath}`]));
  const files = git(["diff","--name-only","HEAD",target,"--","lib/db"]).toString().trim().split("\n").filter(Boolean);
  if (!approvedSchemaChange(before,after,files)) fail("ROUND_SCHEMA_UNREVIEWED_CHANGE");
}

const additions = `
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS timing_mode text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.campaign_targets ADD COLUMN IF NOT EXISTS delivery_order integer;
ALTER TABLE public.campaign_targets ADD COLUMN IF NOT EXISTS wait_before_seconds integer;
COMMIT;`;
const indexSql = `
SET lock_timeout = '3s';
SET statement_timeout = '120s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS campaign_targets_campaign_delivery_order_idx
  ON public.campaign_targets (campaign_id, delivery_order) WHERE delivery_order IS NOT NULL;`;

async function verifyInstalled(client) {
  const {rows} = await client.query(`SELECT table_name,column_name,data_type,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public' AND
    ((table_name='campaigns' AND column_name='timing_mode') OR
     (table_name='campaign_targets' AND column_name IN ('delivery_order','wait_before_seconds')))`);
  if (rows.length !== 3) fail("ROUND_SCHEMA_COLUMNS_MISSING");
  const mode = rows.find(row=>row.column_name==="timing_mode");
  if (mode?.data_type!=="text" || mode.is_nullable!=="NO" || !/^'legacy'::text$/.test(mode.column_default??""))
    fail("ROUND_SCHEMA_MODE_INCOMPATIBLE");
  if (rows.filter(row=>row.table_name==="campaign_targets").some(row=>row.data_type!=="integer" || row.is_nullable!=="YES"))
    fail("ROUND_SCHEMA_TARGET_INCOMPATIBLE");
  const {rows:indexes} = await client.query(`SELECT i.indisvalid,pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='campaign_targets_campaign_delivery_order_idx'`);
  if (indexes.length!==1 || !indexes[0].indisvalid
    || !/ON public\.campaign_targets USING btree \(campaign_id, delivery_order\) WHERE \(delivery_order IS NOT NULL\)/.test(indexes[0].definition))
    fail("ROUND_SCHEMA_INDEX_INCOMPATIBLE");
}

export async function prepareSchema(root, {verifyOnly=false}={}) {
  if (!process.env.DATABASE_URL) fail("ROUND_SCHEMA_DATABASE_UNAVAILABLE");
  const require = createRequire(path.join(root,"lib/db/package.json"));
  const {Client} = require("pg");
  const client = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
  await client.connect();
  try {
    if (!verifyOnly) {
      // Reject pre-existing conflicting columns instead of silently changing their types/defaults.
      const existing = await client.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
        WHERE table_schema='public' AND ((table_name='campaigns' AND column_name='timing_mode') OR
        (table_name='campaign_targets' AND column_name IN ('delivery_order','wait_before_seconds')))`);
      if (existing.rows.some(row=>row.data_type!==(row.column_name==="timing_mode"?"text":"integer")))
        fail("ROUND_SCHEMA_EXISTING_TYPE_CONFLICT");
      const {rows:[identity]} = await client.query(`SELECT current_database() AS database,
        (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
        extract(epoch from pg_postmaster_start_time())::text AS started,
        inet_server_addr()::text AS address,inet_server_port() AS port,
        (SELECT bool_and(pg_has_role(current_user,pg_get_userbyid(relowner),'USAGE'))
          FROM pg_class WHERE oid IN ('public.campaigns'::regclass,'public.campaign_targets'::regclass)) AS owns`);
      const invalidIndex = await client.query(`SELECT i.indisvalid,pg_get_indexdef(i.indexrelid) AS definition
        FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='campaign_targets_campaign_delivery_order_idx'`);
      let repairIndex = "";
      if (invalidIndex.rows.length && !invalidIndex.rows[0].indisvalid) {
        if (!/ON public\.campaign_targets USING btree \(campaign_id, delivery_order\) WHERE \(delivery_order IS NOT NULL\)/.test(invalidIndex.rows[0].definition))
          fail("ROUND_SCHEMA_INDEX_NAME_CONFLICT");
        repairIndex = "DROP INDEX CONCURRENTLY public.campaign_targets_campaign_delivery_order_idx;";
      }
      if (identity.owns) {
        await client.query(additions);
        if (repairIndex) await client.query(repairIndex);
        // CREATE INDEX CONCURRENTLY must not share a multi-statement implicit transaction.
        await client.query("SET lock_timeout='3s'; SET statement_timeout='120s'");
        await client.query(indexSql.slice(indexSql.indexOf("CREATE INDEX")));
      } else {
        const url = new URL(process.env.DATABASE_URL);
        if (!["127.0.0.1","localhost","[::1]"].includes(url.hostname) || url.searchParams.has("host")
          || !["127.0.0.1","::1"].includes(identity.address)
          || !/^[a-zA-Z0-9_]{1,63}$/.test(identity.database)
          || !/^\d+$/.test(identity.oid) || !/^\d+(\.\d+)?$/.test(identity.started)
          || !Number.isInteger(identity.port)) fail("ROUND_SCHEMA_PRIVILEGED_SCOPE_REFUSED");
        const identitySql = `DO $$ BEGIN IF
          (SELECT oid::text FROM pg_database WHERE datname=current_database()) <> '${identity.oid}'
          OR extract(epoch from pg_postmaster_start_time())::text <> '${identity.started}'
          THEN RAISE EXCEPTION 'ROUND_SCHEMA_DATABASE_IDENTITY_MISMATCH'; END IF; END $$;`;
        const psql = sql => {
          const result = spawnSync("sudo",["-n","-u","postgres","psql","-X","--no-password","--set=ON_ERROR_STOP=1",
            "--host=/var/run/postgresql",`--port=${identity.port}`,`--dbname=${identity.database}`],{
            input:identitySql+"\n"+sql,encoding:"utf8",timeout:150000,
            env:{PATH:process.env.PATH,HOME:"/var/lib/postgresql",LC_ALL:"C"},maxBuffer:1024*1024,
          });
          if (result.status!==0 || result.error) fail("ROUND_SCHEMA_PRIVILEGED_MIGRATION_FAILED");
        };
        psql(additions);
        if (repairIndex) psql(repairIndex);
        // Separate psql invocation keeps CONCURRENTLY outside a transaction block.
        psql(indexSql);
      }
    }
    await verifyInstalled(client);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [mode,root,target] = process.argv.slice(2);
  try {
    if (!["--check-source","--apply","--verify-installed"].includes(mode) || !root || !target) fail("ROUND_SCHEMA_USAGE");
    checkSource(path.resolve(root),target);
    if (mode!=="--check-source") await prepareSchema(path.resolve(root),{verifyOnly:mode==="--verify-installed"});
    console.log("round_timing_schema=passed");
  } catch (error) {
    console.error(error instanceof Error && /^ROUND_SCHEMA_[A-Z_]+$/.test(error.message) ? error.message : "ROUND_SCHEMA_FAILED");
    if (typeof error?.code==="string" && /^[A-Z0-9_]{3,40}$/.test(error.code))
      console.error("ROUND_SCHEMA_ERROR_CODE_"+error.code);
    process.exitCode=1;
  }
}
