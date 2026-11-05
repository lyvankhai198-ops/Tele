import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testCampaignSkippedCleanup } from "./campaign-skipped-cleanup.e2e";
import { pool, db } from "@workspace/db";
import { processCampaignBulkJobs } from "../../artifacts/api-server/src/lib/campaign-bulk-jobs";
import { processFinishedRerunReviews, reviewFinishedRerun, saveRerunPolicy } from "../../artifacts/api-server/src/lib/campaign-rerun-review";
import { UNAVAILABLE_TELEGRAM_DESTINATION_REASON as unavailable } from "../../artifacts/api-server/src/lib/telegram-destination-state";

export async function testCampaignRerunSafety(input:{
  ownerId:string;ownerCookie:string;otherOwnerId:string;otherCookie:string;
  request:(path:string,cookie?:string,body?:unknown,method?:string,headers?:Record<string,string>)=>Promise<Response>;
}) {
  console.log("E2E_PHASE_RERUN_SAFETY");
  const {ownerId,ownerCookie,otherOwnerId,otherCookie,request}=input;
  const check=(v:unknown,code:string)=>assert.ok(v,code);
  await pool.query(`INSERT INTO subscriptions(owner_user_id,plan,expires_at)
    VALUES($1,'unlimited',now()+interval '1 day')
    ON CONFLICT(owner_user_id) DO UPDATE SET plan='unlimited',expires_at=now()+interval '1 day'`,[ownerId]);
  const account=randomUUID(),foreignAccount=randomUUID();
  const good=randomUUID(),bad=randomUUID(),temporary=randomUUID();
  for(const [id,owner] of [[account,ownerId],[foreignAccount,otherOwnerId]])await pool.query(
    "INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted) VALUES($1,$2,'rerun-safety-fixture','connected','fixture-only')",[id,owner]);
  for(const id of [good,bad,temporary])await pool.query(`INSERT INTO destinations
    (id,account_id,telegram_id,title,can_post,permission_checked_at)
    VALUES($1::uuid,$2::uuid,$1::text,'rerun-safety-fixture',true,now())`,[id,account]);
  await pool.query("UPDATE destinations SET can_post=false,permission_reason=$1 WHERE id=$2",[unavailable,bad]);
  const ids:Record<string,string>={};
  async function seed(name:string,destinations:string[],status="completed",owner=ownerId,acct=account) {
    const id=randomUUID();ids[name]=id;
    await pool.query(`INSERT INTO campaigns(id,owner_user_id,name,content,status,telegram_account_id,
      destination_ids,repeat_count,timing_mode,round_delay_min_seconds,round_delay_max_seconds)
      VALUES($1,$2,$3,'fixture',$4,$5,$6::uuid[],1,'round',60,60)`,
    [id,owner,`rerun-safety-fixture-${name}`,status,acct,destinations]);
    return id;
  }
  async function target(campaign:string,destination:string,status:string,attempts=1) {
    await pool.query(`INSERT INTO campaign_targets(campaign_id,destination_id,status,attempts,updated_at,sent_at)
      VALUES($1,$2,$3,$4,now()-interval '1 hour',CASE WHEN $3='sent' THEN now()-interval '1 hour' END)`,
    [campaign,destination,status,attempts]);
  }
  await target(await seed("good",[good]),good,"sent");
  await target(await seed("temporary",[temporary]),temporary,"failed");
  await target(await seed("invalid",[bad]),bad,"failed");
  await target(await seed("uncertain",[bad]),bad,"requires_review");
  const mixed=await seed("mixed",[good,bad,temporary]);
  await target(mixed,good,"sent");await target(mixed,bad,"failed");await target(mixed,temporary,"failed");
  await seed("unattempted",[bad]);
  const hidden=await seed("hidden-history",[bad]);await target(hidden,bad,"failed");await target(hidden,good,"sent");
  const foreign=await seed("foreign",[],"completed",otherOwnerId,foreignAccount);
  const foreignBefore=(await pool.query("SELECT row_to_json(c) value FROM campaigns c WHERE id=$1",[foreign])).rows[0].value;
  const at=new Date(Date.now()+3600000).toISOString();
  const body={action:"resume",telegramAccountId:account,scope:"completed",intervalSeconds:60,scheduledAt:at,onlySendable:true};
  const token=randomUUID();
  const accepted=await request("/campaigns/bulk-control",ownerCookie,body,"POST",{"Idempotency-Key":token});
  const initial=(await accepted.json() as any).job;
  check(accepted.status===202 && initial.onlySendable===true && initial.autoDeleteInvalid===false,"E2E_RERUN_SAFE_DEFAULTS");
  await processCampaignBulkJobs(20);
  const load=async(id:string)=>(await (await request(`/campaigns/bulk-control/jobs/${id}`,ownerCookie)).json()) as any;
  const first=await load(initial.id);
  check(first.status==="completed" && first.updatedCount===2 && first.deletedCount===0,"E2E_RERUN_FILTER_ACTUAL_OUTCOMES");
  check(first.results.some((r:any)=>r.id===ids.temporary && r.assessment.category==="temporary") &&
    first.results.some((r:any)=>r.id===ids.uncertain && r.assessment.category==="review"),"E2E_RERUN_REASONS");
  const mixedRun=first.results.find((r:any)=>r.id===mixed).runId;
  check((await pool.query("SELECT destination_ids FROM campaigns WHERE id=$1",[mixedRun])).rows[0].destination_ids.join()===good,
    "E2E_RERUN_PARTIAL_ONLY_READY_GROUP");
  check((await pool.query("SELECT destination_ids FROM campaigns WHERE id=$1",[mixed])).rows[0].destination_ids.length===3,
    "E2E_RERUN_NO_CLEANUP_WITHOUT_OPT_IN");
  check((await request(`/campaigns/bulk-control/jobs/${initial.id}`,otherCookie)).status===404,"E2E_RERUN_REPORT_OWNER");
  check((await request("/campaigns/bulk-control",ownerCookie,{...body,onlySendable:false},"POST",{"Idempotency-Key":token})).status===409,
    "E2E_RERUN_OPTIONS_IDEMPOTENCY");
  const secondResponse=await request("/campaigns/bulk-control",ownerCookie,
    {...body,autoDeleteInvalid:true},"POST",{"Idempotency-Key":randomUUID()});
  const secondId=(await secondResponse.json() as any).job.id;
  await processCampaignBulkJobs(20);
  const second=await load(secondId);
  check(second.deletedCount===0 && second.autoDeleteInvalid===false
    && second.results.find((r:any)=>r.id===ids.invalid).outcome==="skipped",
    "E2E_RERUN_LEGACY_FLAG_CANNOT_BYPASS_PREVIEW");
  check((await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])",[
    [ids.temporary,ids.uncertain,ids.unattempted,ids["hidden-history"]]])).rowCount===4,
    "E2E_RERUN_NEVER_DELETE_TRANSIENT_UNKNOWN_OR_SUCCESS_HISTORY");
  const kept=(await pool.query("SELECT destination_ids FROM campaigns WHERE id=$1",[mixed])).rows[0].destination_ids;
  check(kept.includes(good)&&kept.includes(temporary)&&kept.includes(bad),"E2E_RERUN_NO_DETACH_BEFORE_SELECTION");
  check((await pool.query("SELECT id FROM campaign_targets WHERE campaign_id=$1",[mixed])).rowCount===3,
    "E2E_RERUN_PARTIAL_HISTORY_PRESERVED");

  // Finish one opted-in run with real stored failure outcomes, followed by a
  // newer full-sync absence. Recovery worker performs the one-time review.
  const finish=second.results.find((r:any)=>r.id===ids.good).runId;
  await pool.query("UPDATE campaign_targets SET status='failed',attempts=1,updated_at=now()-interval '1 minute' WHERE campaign_id=$1",[finish]);
  await pool.query("UPDATE campaigns SET status='completed' WHERE id=$1",[finish]);
  await pool.query("UPDATE destinations SET can_post=false,permission_reason=$1,permission_checked_at=now() WHERE id=$2",[unavailable,good]);
  await processFinishedRerunReviews();
  check((await pool.query("SELECT id FROM campaigns WHERE id=$1",[finish])).rowCount===1,"E2E_RERUN_AFTER_FINISH_PREVIEW_REQUIRED");
  const reviewed=await load(secondId);
  check(reviewed.reviews.some((r:any)=>r.id===finish && !r.deleted && r.sentCount===0),"E2E_RERUN_DURABLE_REVIEW_REPORT");
  await processFinishedRerunReviews();
  check((await load(secondId)).reviews.length===reviewed.reviews.length,"E2E_RERUN_REVIEW_IDEMPOTENT");

  const retained=first.results.find((r:any)=>r.id===ids.good).runId;
  await pool.query("UPDATE campaign_targets SET status='failed',attempts=1,updated_at=now()-interval '1 minute' WHERE campaign_id=$1",[retained]);
  await pool.query("UPDATE campaigns SET status='completed' WHERE id=$1",[retained]);
  await reviewFinishedRerun(retained);
  check((await pool.query("SELECT id FROM campaigns WHERE id=$1",[retained])).rowCount===1,"E2E_RERUN_FINISH_NO_DELETE_WITHOUT_OPT_IN");
  check((await load(initial.id)).reviews.some((r:any)=>r.id===retained&&!r.deleted),"E2E_RERUN_SETTINGS_PERSIST_PER_OPERATION");

  // A mixed finished campaign retains successes and removes only the invalid
  // destination; raw delivery history remains available.
  await pool.query("UPDATE destinations SET can_post=true,permission_reason=NULL WHERE id=$1",[temporary]);
  const partial=await seed("partial-review",[temporary,bad]);
  await target(partial,temporary,"sent");await target(partial,bad,"failed");
  await db.transaction(tx=>saveRerunPolicy(tx,ownerId,partial,{onlySendable:true,autoDeleteInvalid:true,jobId:secondId}));
  const partialReport=await reviewFinishedRerun(partial);
  check(partialReport?.removedDestinationCount===0 && !partialReport.deleted,"E2E_RERUN_REVIEW_NEVER_DETACHES_WITHOUT_SELECTION");
  check((await pool.query("SELECT count(*)::int n FROM campaign_targets WHERE campaign_id=$1",[partial])).rows[0].n===2,
    "E2E_RERUN_PARTIAL_KEEP_DELIVERY_EVIDENCE");
  const protectedRun=await seed("protected-review",[bad]);await target(protectedRun,bad,"requires_review");
  await db.transaction(tx=>saveRerunPolicy(tx,ownerId,protectedRun,{onlySendable:true,autoDeleteInvalid:true,jobId:secondId}));
  const protectedReport=await reviewFinishedRerun(protectedRun);
  check(protectedReport?.category==="review"&&!protectedReport.deleted,"E2E_RERUN_FINISH_AMBIGUOUS_KEEP");
  check(JSON.stringify((await pool.query("SELECT row_to_json(c) value FROM campaigns c WHERE id=$1",[foreign])).rows[0].value)===JSON.stringify(foreignBefore),
    "E2E_RERUN_OTHER_OWNER_UNCHANGED");

  await testCampaignSkippedCleanup(input);
  const retryAccount=randomUUID(),retryGood=randomUUID(),retryBad=randomUUID();
  await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted) VALUES($1,$2,'retry-all-fixture','connected','test-only-no-real-session')",[retryAccount,ownerId]);
  for(const destination of [retryGood,retryBad])await pool.query("INSERT INTO destinations(id,account_id,telegram_id,title,can_post) VALUES($1,$2,$3,'retry-all-fixture',true)",
    [destination,retryAccount,destination]);
  const fastTemporary=await seed("fast-temporary",[retryGood],"completed",ownerId,retryAccount);
  await target(fastTemporary,retryGood,"failed");
  await pool.query("UPDATE campaign_targets SET last_error='network timeout' WHERE campaign_id=$1",[fastTemporary]);
  const fastUncertain=await seed("fast-uncertain",[retryGood],"completed",ownerId,retryAccount);
  await target(fastUncertain,retryGood,"requires_review");
  const fastDenied=await seed("fast-denied",[retryBad],"completed",ownerId,retryAccount);
  await target(fastDenied,retryBad,"failed");
  await pool.query("UPDATE campaign_targets SET last_error='403: CHAT_SEND_PLAIN_FORBIDDEN' WHERE campaign_id=$1",[fastDenied]);
  const fastResponse=await request("/campaigns/bulk-control",ownerCookie,{...body,telegramAccountId:retryAccount,
    onlySendable:false,autoDeleteInvalid:true,confirmAutoDelete:true},"POST",{"Idempotency-Key":randomUUID()});
  const fastInitial=(await fastResponse.json() as any).job;
  check(fastResponse.status===202&&fastInitial.phase==="campaigns"&&!fastInitial.onlySendable&&fastInitial.autoDeleteInvalid,
    "E2E_RERUN_ALL_NO_ACCOUNT_SYNC");
  await processCampaignBulkJobs(20);
  const fastDone=await load(fastInitial.id);
  check(fastDone.updatedCount===2&&fastDone.deletedCount===1&&fastDone.skippedCount===0,"E2E_RERUN_ALL_RETRIES_AND_PRUNES");
  check(!(await pool.query("SELECT id FROM campaigns WHERE id=$1",[fastDenied])).rowCount,"E2E_RERUN_ALL_DENIED_SOURCE_DELETED");
  const stalled=await seed("fast-stalled",[retryGood],"paused",ownerId,retryAccount);
  const stalledResponse=await request("/campaigns/bulk-control",ownerCookie,{...body,telegramAccountId:retryAccount,scope:"paused",
    onlySendable:false,autoDeleteInvalid:true,confirmAutoDelete:true},"POST",{"Idempotency-Key":randomUUID()});
  const stalledJob=(await stalledResponse.json() as any).job;
  await processCampaignBulkJobs(20);
  check((await load(stalledJob.id)).updatedCount===1
    &&(await pool.query("SELECT id FROM campaigns WHERE cloned_from_campaign_id=$1",[stalled])).rowCount===1,
    "E2E_RERUN_ALL_REBUILDS_EXHAUSTED_PAUSED_RUN");
  // Restore this isolated owner so the existing bulk-suite cardinality checks
  // remain independent of these new fixtures.
  await pool.query("DELETE FROM campaigns WHERE name LIKE 'rerun-safety-fixture-%'");
  await pool.query("DELETE FROM telegram_accounts WHERE id=ANY($1::uuid[])",[[account,foreignAccount,retryAccount]]);
  await pool.query("DELETE FROM system_settings WHERE key LIKE $1",[`campaign_destination_block:${ownerId}:account:${retryAccount}:%`]);
  await pool.query("DELETE FROM system_settings WHERE key LIKE $1 OR key LIKE $2 OR key LIKE $3",[
    `campaign_bulk_job:${ownerId}:%`,`campaign_rerun_policy:${ownerId}:%`,`campaign_rerun_review:${ownerId}:%`]);
  console.log("E2E_RERUN_SAFETY_PASSED");
}
