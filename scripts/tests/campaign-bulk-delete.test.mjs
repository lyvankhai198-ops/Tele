import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DELETE_INDEXES, prepareCampaignDeleteIndexes, prepareAsLocalTableOwner } from "../prepare-campaign-delete-indexes.mjs";
import { campaignDeleteError } from "../../artifacts/telecampaign/src/lib/campaign-delete-error.ts";

test("every campaign/target delete FK has a concurrent supporting index", async () => {
  const calls = [];
  let reads = 0;
  await prepareCampaignDeleteIndexes({ query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.startsWith("SELECT") && ++reads % 2 === 0 ? [{ valid: true }] : [] };
  } });
  assert.equal(DELETE_INDEXES.length, 4);
  assert.equal(calls.filter(c => c.sql.startsWith("CREATE INDEX CONCURRENTLY")).length, 4);
  assert.ok(calls.every(c => !/^(DELETE|UPDATE|TRUNCATE|ALTER TABLE|BEGIN)\b/.test(c.sql)));
  assert.ok(!calls.some(c => c.sql.includes("pg_cancel_backend")));
});
test("already valid legacy indexes need no owner-only CREATE statement", async () => {
  const calls = [];
  await prepareCampaignDeleteIndexes({query: async sql => { calls.push(sql);return {rows:[{valid:true}]}; }});
  assert.ok(!calls.some(sql => /CREATE INDEX|DROP INDEX/.test(sql)));
});
test("owner maintenance is local, identity-checked and limited to known indexes", async () => {
  let command, args, options;
  const client = {query: async sql => ({rows: sql.includes("database_oid") ? [{
    database:"fixture",port:"5432",database_oid:120,logs_oid:220,role_oid:320,local:true,
  }] : []})};
  await prepareAsLocalTableOwner(client, (c,a,o) => {command=c;args=a;options=o;return {status:0};});
  assert.equal(command,"sudo");
  assert.deepEqual(args.slice(0,4),["-n","-u","postgres","psql"]);
  for (const marker of ["Maintenance identity mismatch","CONCURRENTLY", "90 seconds",
    '"owner_user_id"', '"status" not in', "usesysid IN (320,"])
    assert.ok(options.input.includes(marker));
  assert.ok(!/ALTER TABLE|UPDATE |DELETE FROM|GRANT |pg_terminate_backend/.test(options.input));
  assert.ok(!options.input.includes("password"));
});
test("remote databases never use the local PostgreSQL owner", async () => {
  await assert.rejects(prepareAsLocalTableOwner({query:async()=>({rows:[{local:false}]})},
    ()=>assert.fail("must not spawn")), /Local maintenance identity/);
});
test("interrupted concurrent index builds are repaired using only the known index name", async () => {
  let reads = 0;
  const calls = [];
  await prepareCampaignDeleteIndexes({ query: async (sql) => {
    calls.push(sql);
    return { rows: sql.startsWith("SELECT") ? [{ valid: ++reads !== 1 }] : [] };
  } });
  assert.deepEqual(calls.filter(c => c.startsWith("DROP")), ['DROP INDEX CONCURRENTLY "public"."activity_logs_campaign_idx"']);
});
test("a failed index stops maintenance rather than reporting success", async () => {
  await assert.rejects(prepareCampaignDeleteIndexes({ query: async (sql) => ({
    rows: sql.startsWith("SELECT") ? [] : [],
  }) }), /Index verification failed/);
});
test("optional cancellation is restricted to old, owned campaign deletion statements", async () => {
  const calls = [];
  await prepareCampaignDeleteIndexes({ query: async (sql) => {
    calls.push(sql); return { rows: sql.includes("pg_cancel_backend") ? [] : [{ valid: true }] };
  } }, { cancelStalledDeletes: true });
  const cancel = calls.find(c => c.includes("pg_cancel_backend"));
  for (const guard of ["current_database()", "current_user", "90 seconds", '"owner_user_id"', '"status" not in', '^delete from "campaigns"'])
    assert.ok(cancel.includes(guard));
  assert.ok(!calls.some(c => /pg_terminate_backend|UPDATE campaigns|DELETE FROM/.test(c)));
});
test("proxy errors are readable VI/EN without exposing HTML", () => {
  for (const language of ["vi", "en"]) {
    for (const message of ['<html><head><title>504 Gateway Time-out</title></head></html>', "HTTP 502: Bad Gateway"]) {
      const text = campaignDeleteError(new Error(message), language);
      assert.ok(!/[<>]/.test(text));
      assert.ok(text.includes(language === "vi" ? "làm mới" : "Refresh"));
    }
    assert.ok(campaignDeleteError(new Error("CAMPAIGN_DELETE_BUSY"), language).includes(language === "vi" ? "hủy an toàn" : "safely cancelled"));
    assert.ok(!campaignDeleteError(new Error("private database details"), language).includes("database"));
  }
});
test("bulk delete retains owner/status guards and bounded atomic deletion+audit", () => {
  const source = fs.readFileSync(new URL("../../artifacts/api-server/src/routes/telecampaign.ts", import.meta.url), "utf8");
  const route = source.slice(source.indexOf('router.post("/campaigns/bulk-delete"'), source.indexOf('router.post("/campaigns",'));
  for (const marker of ['eq(campaignsTable.ownerUserId, ownerUserId)', 'notInArray(campaignsTable.status, ["queued", "running"])',
    "db.transaction", "SET LOCAL lock_timeout = '3s'", "SET LOCAL statement_timeout = '20s'", "tx.insert(activityLogsTable)",
    '"CAMPAIGN_DELETE_BUSY"'])
    assert.ok(route.includes(marker));
});
