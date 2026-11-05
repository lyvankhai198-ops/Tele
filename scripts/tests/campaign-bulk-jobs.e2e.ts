import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { processCampaignBulkJobs } from "../../artifacts/api-server/src/lib/campaign-bulk-jobs";

export async function testCampaignBulkJobs(input: {
  ownerId: string; ownerCookie: string; otherCookie: string;
  request: (path: string, cookie?: string, body?: unknown, method?: string, headers?: Record<string,string>) => Promise<Response>;
}) {
  const {ownerId,ownerCookie,otherCookie,request}=input;
  const check=(value:unknown,code:string)=>assert.ok(value,code);
  const account=randomUUID(), destinations=[randomUUID(),randomUUID(),randomUUID()];
  await pool.query("UPDATE subscriptions SET plan='unlimited' WHERE owner_user_id=$1",[ownerId]);
  await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted) VALUES($1,$2,'bulk-fixture','connected','test-only-no-real-session')",[account,ownerId]);
  for(let index=0;index<destinations.length;index++) await pool.query(`INSERT INTO destinations(id,account_id,telegram_id,title,can_post)
    VALUES($1,$2,$3,'bulk-fixture',true)`,[destinations[index],account,String(index)]);
  const ids=Array.from({length:15},()=>randomUUID());
  for(const id of ids) {
    await pool.query(`INSERT INTO campaigns(id,owner_user_id,name,content,status,telegram_account_id,destination_ids,repeat_count,round_delay_min_seconds,round_delay_max_seconds)
      VALUES($1,$2,'bulk-fixture','fixture text','completed',$3,$4,300,3,3)`,[id,ownerId,account,destinations]);
    await pool.query(`INSERT INTO campaign_targets(campaign_id,destination_id,status,attempts,sent_at)
      SELECT $1,$2,'sent',1,now() FROM generate_series(1,300)`,[id,destinations[0]]);
  }
  const header={"Idempotency-Key":randomUUID()};
  const start=new Date(Date.now()+86400000).toISOString();
  const body={action:"resume",telegramAccountId:account,scope:"completed",intervalSeconds:600,scheduledAt:start};
  check((await request("/campaigns/bulk-control",ownerCookie,{...body,telegramAccountId:undefined})).status===400,
    "E2E_BULK_ACCOUNT_REQUIRED");
  const before=Date.now();
  const accepted=await request("/campaigns/bulk-control",ownerCookie,body,"POST",header);
  const initial=await accepted.json() as any;
  check(accepted.status===202 && initial.job && Date.now()-before<5000,"E2E_BULK_ACCEPTED_WITHOUT_WAITING");
  const id=initial.job.id;
  const progress=async()=>await (await request(`/campaigns/bulk-control/jobs/${id}`,ownerCookie)).json() as any;
  const permissionId=randomUUID(),permissionKey=`telecamp_operation:${ownerId}:${permissionId}`;
  await pool.query("INSERT INTO system_settings(key,value) VALUES($1,$2)",
    [permissionKey,JSON.stringify({state:"queued"})]);
  await pool.query(`UPDATE system_settings SET value=(value::jsonb||$2::jsonb)::text WHERE key=$1`,
    [`campaign_bulk_job:${ownerId}:${id}`,JSON.stringify({permissionSyncId:permissionId,permissionsVerified:false})]);
  await processCampaignBulkJobs(30);
  check((await progress()).processed===0 && (await progress()).phase==="checking_permissions",
    "E2E_BULK_WAITS_FOR_FRESH_PERMISSIONS");
  await pool.query("UPDATE system_settings SET value=$2 WHERE key=$1",[permissionKey,JSON.stringify({state:"completed"})]);
  check(initial.job.total===15 && initial.job.processed===0,"E2E_BULK_SNAPSHOT");
  const same=await request("/campaigns/bulk-control",ownerCookie,body,"POST",header);
  check((await same.json() as any).job.id===id,"E2E_BULK_DUPLICATE_SUBMIT_SAME_JOB");
  const parallel=await request("/campaigns/bulk-control",ownerCookie,body,"POST",{"Idempotency-Key":randomUUID()});
  check((await parallel.json() as any).job.id===id,"E2E_BULK_ONE_ACTIVE_JOB");
  check((await request(`/campaigns/bulk-control/jobs/${id}`,otherCookie)).status===404,"E2E_BULK_OWNER_READ");
  check((await request(`/campaigns/bulk-control/jobs/${id}/retry`,otherCookie,{})).status===404,"E2E_BULK_OWNER_RETRY");
  check((await request(`/campaigns/bulk-control/jobs/${id}`)).status===401,"E2E_BULK_ANONYMOUS");
  const locker=await pool.connect();
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM campaign_targets WHERE campaign_id=ANY($1::uuid[]) FOR UPDATE",[ids]);
    await processCampaignBulkJobs(1);
  } finally {await locker.query("ROLLBACK");locker.release();}
  check((await progress()).processed===1,"E2E_BULK_NO_HISTORICAL_TARGET_LOCKS");
  // An insert failure rolls back the new run and its targets AND leaves the
  // durable cursor unchanged, so retry continues without creating a duplicate.
  await pool.query(`CREATE FUNCTION fixture_bulk_target_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture failure' USING ERRCODE='23514'; END $$`);
  await pool.query("CREATE TRIGGER fixture_bulk_target_failure BEFORE INSERT ON campaign_targets FOR EACH ROW EXECUTE FUNCTION fixture_bulk_target_failure()");
  try {await processCampaignBulkJobs(1);}
  finally {
    await pool.query("DROP TRIGGER fixture_bulk_target_failure ON campaign_targets");
    await pool.query("DROP FUNCTION fixture_bulk_target_failure()");
  }
  const failed=await progress();
  check(failed.status==="failed" && failed.processed===1 && failed.updatedCount===1,"E2E_BULK_ATOMIC_CURSOR");
  const copiesAfterFailure=await pool.query("SELECT count(*)::int AS n FROM campaigns WHERE cloned_from_campaign_id=ANY($1::uuid[])",[ids]);
  check(copiesAfterFailure.rows[0].n===1,"E2E_BULK_FAILED_RUN_ROLLED_BACK");
  await request(`/campaigns/bulk-control/jobs/${id}/retry`,ownerCookie,{});
  await Promise.all([processCampaignBulkJobs(1),processCampaignBulkJobs(1)]);
  check((await progress()).processed===2,"E2E_BULK_CONCURRENT_WORKER_NOT_REPLAYED");
  await processCampaignBulkJobs(20);
  const done=await progress();
  check(done.status==="completed" && done.updatedCount===15 && done.processed===15,"E2E_BULK_COMPLETED");
  const runs=await pool.query(`SELECT id,scheduled_at,schedule_anchor_at,repeat_count,timing_mode,delay_min_seconds,delay_max_seconds FROM campaigns
    WHERE cloned_from_campaign_id=ANY($1::uuid[]) ORDER BY schedule_anchor_at`,[ids]);
  check(runs.rowCount===15,"E2E_BULK_EXACTLY_ONE_COPY");
  for(let index=0;index<runs.rows.length;index++) {
    const run=runs.rows[index];
    check(run.repeat_count===300 && new Date(run.schedule_anchor_at).getTime()===new Date(start).getTime()+index*600000,
      "E2E_BULK_SCHEDULE_SPACING_PRESERVED");
    const targets=await pool.query(`SELECT count(*)::int AS n,min(next_attempt_at) AS first,max(next_attempt_at) AS last
      FROM campaign_targets WHERE campaign_id=$1`,[run.id]);
    check(targets.rows[0].n===900,"E2E_BULK_ALL_TARGET_CHUNKS");
    check(run.timing_mode==="round" && run.delay_min_seconds===0 && run.delay_max_seconds===0,
      "E2E_BULK_NEW_RUN_ROUND_MODE");
    check(new Date(targets.rows[0].last).getTime()-new Date(targets.rows[0].first).getTime()===299*3000,
      "E2E_BULK_ROUND_DELAY_PRESERVED");
  }
  const originals=await pool.query(`SELECT count(*)::int AS n FROM campaigns
    WHERE id=ANY($1::uuid[]) AND status='completed' AND repeat_count=300`,[ids]);
  const history=await pool.query("SELECT count(*)::int AS n FROM campaign_targets WHERE campaign_id=ANY($1::uuid[]) AND status='sent'",[ids]);
  check(originals.rows[0].n===15 && history.rows[0].n===4500,"E2E_BULK_ORIGINALS_HISTORY_UNCHANGED");
  await request("/campaigns/bulk-control",ownerCookie,body,"POST",header);
  await processCampaignBulkJobs(2);
  const finalCount=await pool.query("SELECT count(*)::int AS n FROM campaigns WHERE cloned_from_campaign_id=ANY($1::uuid[])",[ids]);
  check(finalCount.rows[0].n===15,"E2E_BULK_COMPLETED_RETRY_NO_DUPLICATE");
  const changed=await request("/campaigns/bulk-control",ownerCookie,{...body,intervalSeconds:0},"POST",header);
  check(changed.status===409,"E2E_BULK_IDEMPOTENCY_PAYLOAD_GUARD");
  await pool.query("DELETE FROM system_settings WHERE key=$1",[permissionKey]);
  await pool.query("UPDATE subscriptions SET plan='plus' WHERE owner_user_id=$1",[ownerId]);
}
