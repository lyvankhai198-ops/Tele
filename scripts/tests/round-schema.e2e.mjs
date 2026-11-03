import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import path from "node:path";
import {prepareSchema} from "../prepare-round-timing-schema.mjs";

const root=process.cwd();
if(process.env.DATABASE_URL!=="postgres://telecamp_test@127.0.0.1:5432/telecamp_test")
  throw Error("ROUND_SCHEMA_TEST_DATABASE_REFUSED");
const require=createRequire(path.join(root,"lib/db/package.json"));
const {Client}=require("pg");
const client=new Client({connectionString:process.env.DATABASE_URL});
let phase="ROUND_SCHEMA_TEST_CONNECT";
try {
  await client.connect();
  const counts=await client.query("SELECT (SELECT count(*) FROM campaigns)+(SELECT count(*) FROM campaign_targets) AS n");
  assert.equal(Number(counts.rows[0].n),0,"ROUND_SCHEMA_TEST_DATABASE_NOT_EMPTY");
  phase="ROUND_SCHEMA_TEST_LEGACY_SETUP";
  await client.query(`DROP INDEX IF EXISTS public.campaign_targets_campaign_delivery_order_idx;
    ALTER TABLE public.campaign_targets DROP COLUMN delivery_order,DROP COLUMN wait_before_seconds;
    ALTER TABLE public.campaigns DROP COLUMN timing_mode`);
  const user=randomUUID(),account=randomUUID(),destination=randomUUID(),campaign=randomUUID();
  await client.query("INSERT INTO app_users(id,username,username_normalized,password_hash) VALUES($1,$2,$2,'fixture-only-no-login')",[user,"schema_"+user.slice(0,8)]);
  await client.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status) VALUES($1,$2,'schema-fixture','connected')",[account,user]);
  await client.query("INSERT INTO destinations(id,account_id,telegram_id,title,can_post) VALUES($1,$2,'-100000000001','schema-fixture',true)",[destination,account]);
  await client.query(`INSERT INTO campaigns(id,owner_user_id,name,content,telegram_account_id,destination_ids,status,repeat_count,
    delay_min_seconds,delay_max_seconds,round_delay_min_seconds,round_delay_max_seconds)
    VALUES($1,$2,'schema-fixture','fixture',$3,$4,'running',2,17,29,37,53)`,[campaign,user,account,[destination]]);
  for(const status of ["sent","pending"]) await client.query(`INSERT INTO campaign_targets(id,campaign_id,destination_id,status,next_attempt_at,sent_at)
    VALUES($1,$2,$3,$4,now()+interval '1 hour',CASE WHEN $4='sent' THEN now() ELSE NULL END)`,[randomUUID(),campaign,destination,status]);
  const snapshot=async()=>({
    campaign:(await client.query("SELECT to_jsonb(c)-'timing_mode' AS body FROM campaigns c WHERE id=$1",[campaign])).rows,
    targets:(await client.query("SELECT to_jsonb(t)-'delivery_order'-'wait_before_seconds' AS body FROM campaign_targets t WHERE campaign_id=$1 ORDER BY id",[campaign])).rows,
  });
  const before=await snapshot();
  phase="ROUND_SCHEMA_TEST_ADDITIVE_APPLY";
  await prepareSchema(root);
  assert.deepEqual(await snapshot(),before,"ROUND_SCHEMA_LEGACY_DATA_CHANGED");
  assert.equal((await client.query("SELECT timing_mode FROM campaigns WHERE id=$1",[campaign])).rows[0].timing_mode,"legacy");
  assert.equal((await client.query("SELECT count(*)::int AS n FROM campaign_targets WHERE campaign_id=$1 AND delivery_order IS NULL AND wait_before_seconds IS NULL",[campaign])).rows[0].n,2);
  const address=(await client.query("SELECT host(inet_server_addr()) AS value")).rows[0].value;
  // GitHub's PostgreSQL service is forwarded from loopback into its own network.
  // Only the native-VPS privileged path requires a loopback server address.
  assert.ok(typeof address==="string"&&!address.includes("/"),"ROUND_SCHEMA_ADDRESS_CANONICAL_FORMAT");
  phase="ROUND_SCHEMA_TEST_IDEMPOTENCE";
  await prepareSchema(root);
  assert.deepEqual(await snapshot(),before,"ROUND_SCHEMA_SECOND_APPLY_CHANGED_DATA");
  await client.query("DELETE FROM campaign_targets WHERE campaign_id=$1",[campaign]);
  await client.query("DELETE FROM campaigns WHERE id=$1",[campaign]);
  await client.query("DELETE FROM destinations WHERE id=$1",[destination]);
  await client.query("DELETE FROM telegram_accounts WHERE id=$1",[account]);
  await client.query("DELETE FROM app_users WHERE id=$1",[user]);
  console.log("round_timing_schema_additive_legacy_preservation=passed");
} catch(error) {
  console.error(phase);
  console.error(error instanceof Error && /^ROUND_SCHEMA_[A-Z_]+$/.test(error.message)?error.message:"ROUND_SCHEMA_TEST_FAILED");
  if(error&&typeof error==="object"&&typeof error.code==="string"&&/^[A-Z0-9_]+$/.test(error.code))
    console.error("ROUND_SCHEMA_TEST_ERROR_CODE_"+error.code);
  process.exitCode=1;
} finally {
  await client.end();
}
