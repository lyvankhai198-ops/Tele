import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
import {processCampaignBulkJobs} from "../../artifacts/api-server/src/lib/campaign-bulk-jobs";

export async function testCampaignAccountFilter(input:{
  ownerId:string;otherOwnerId:string;ownerCookie:string;
  request:(path:string,cookie?:string,body?:unknown,method?:string,headers?:Record<string,string>)=>Promise<Response>;
}){
  const {ownerId,otherOwnerId,ownerCookie,request}=input;
  const check=(value:unknown,code:string)=>assert.ok(value,code);
  // Earlier bulk fixtures intentionally exceed PLUS limits. Account scoping is
  // tested independently of that quota, exactly as in the bulk-job fixture.
  const previousPlan=(await pool.query("SELECT plan FROM subscriptions WHERE owner_user_id=$1",[ownerId])).rows[0].plan;
  await pool.query("UPDATE subscriptions SET plan='unlimited' WHERE owner_user_id=$1",[ownerId]);
  const a=randomUUID(),b=randomUUID(),foreign=randomUUID(),destination=randomUUID(),prefix=`Filter-${randomUUID()}-`;
  await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted) VALUES($1,$4,'Filter A','connected','test-only-no-real-session'),($2,$4,'Filter B','connected','test-only-no-real-session'),($3,$5,'Foreign','connected','test-only-no-real-session')",[a,b,foreign,ownerId,otherOwnerId]);
  await pool.query("INSERT INTO destinations(id,account_id,title,telegram_id,can_post) VALUES($1,$2,'Filter destination','-1000000999',true)",[destination,a]);
  const definitions=[
    [a,"running","scope",ownerId],[a,"queued","scope",ownerId],[a,"running","other",ownerId],
    [b,"running","scope",ownerId],[foreign,"running","scope",otherOwnerId],
    [a,"draft","scope",ownerId],[b,"draft","scope",ownerId],
    [a,"completed_with_errors","scope",ownerId],[b,"completed_with_errors","scope",ownerId],
  ];
  const ids:string[]=[];
  for(const [account,status,suffix,owner]of definitions){
    const id=randomUUID();ids.push(id);
    await pool.query(`INSERT INTO campaigns(id,owner_user_id,telegram_account_id,name,status,content,repeat_count,round_delay_min_seconds,round_delay_max_seconds)
      VALUES($1,$2,$3,$4,$5,'Filter fixture',1,3600,3600)`,[id,owner,account,prefix+suffix,status]);
  }
  await pool.query("UPDATE campaigns SET destination_ids=$1 WHERE id=$2",[[destination],ids[7]]);
  await pool.query("INSERT INTO campaign_targets(campaign_id,destination_id,status,sent_at,next_attempt_at) VALUES($1,$2,'sent',now(),now())",[ids[7],destination]);
  const pause=await request("/campaigns/bulk-control",ownerCookie,{action:"pause",telegramAccountId:a,status:"running",search:prefix+"scope"},"POST");
  check(pause.status===200&&(await pause.json()).updatedCount===1,"E2E_ACCOUNT_FILTER_PAUSE_ONE");
  const states=await pool.query("SELECT id,status FROM campaigns WHERE id=ANY($1::uuid[])",[ids]);
  const state=new Map(states.rows.map(row=>[row.id,row.status]));
  check(state.get(ids[0])==="paused"&&state.get(ids[1])==="queued"&&state.get(ids[2])==="running"
    &&state.get(ids[3])==="running"&&state.get(ids[4])==="running","E2E_ACCOUNT_FILTER_NO_OTHER_ACCOUNT_OR_STATUS");
  const denied=await request("/campaigns/bulk-control",ownerCookie,{action:"pause",telegramAccountId:foreign},"POST");
  check(denied.status===200&&(await denied.json()).updatedCount===0,"E2E_ACCOUNT_FILTER_OWNER_GUARD");
  const literal=await request("/campaigns/bulk-control",ownerCookie,{action:"pause",telegramAccountId:a,search:prefix+"%_"},"POST");
  check(literal.status===200&&(await literal.json()).updatedCount===0,"E2E_ACCOUNT_FILTER_LITERAL_SEARCH");
  const remove=await request("/campaigns/bulk-delete",ownerCookie,{status:"draft",search:prefix,telegramAccountId:a},"POST");
  check(remove.status===200&&(await remove.json()).deletedCount===1,"E2E_ACCOUNT_FILTER_DELETE_ONE");
  const retained=await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])",[[ids[0],ids[5],ids[6]]]);
  check(retained.rows.length===2&&retained.rows.some(row=>row.id===ids[6]),"E2E_ACCOUNT_FILTER_DELETE_RETAINS_OTHER_ACCOUNT");
  const header={"Idempotency-Key":randomUUID()},start=new Date(Date.now()+60*60_000).toISOString();
  const body={action:"resume",scope:"completed",status:"completed",telegramAccountId:a,search:prefix,intervalSeconds:60,scheduledAt:start,onlySendable:false};
  const accepted=await request("/campaigns/bulk-control",ownerCookie,body,"POST",header);
  const result=await accepted.json();
  check(accepted.status===202&&result.job?.total===1,"E2E_ACCOUNT_FILTER_RERUN_SNAPSHOT_ONE");
  const changed=await request("/campaigns/bulk-control",ownerCookie,{...body,telegramAccountId:b},"POST",header);
  check(changed.status===409,"E2E_ACCOUNT_FILTER_RERUN_IDEMPOTENCY_SCOPE");
  for(let i=0;i<3;i++)await processCampaignBulkJobs(2);
  const progress=await (await request(`/campaigns/bulk-control/jobs/${result.job.id}`,ownerCookie)).json();
  check(progress.status!=="failed","E2E_ACCOUNT_FILTER_RERUN_PROCESSOR");
  check(progress.skippedCount===0,"E2E_ACCOUNT_FILTER_RERUN_NOT_SKIPPED");
  const clones=await pool.query("SELECT cloned_from_campaign_id,telegram_account_id FROM campaigns WHERE cloned_from_campaign_id=ANY($1::uuid[])",[[ids[7],ids[8]]]);
  check(clones.rows.length===1&&clones.rows[0].cloned_from_campaign_id===ids[7]
    &&clones.rows[0].telegram_account_id===a,"E2E_ACCOUNT_FILTER_RERUN_ONLY_SELECTED_ACCOUNT");
  const final=await request(`/campaigns/bulk-control/jobs/${result.job.id}`,ownerCookie);
  check(final.status===200&&(await final.json()).status==="completed","E2E_ACCOUNT_FILTER_RERUN_COMPLETES");
  await pool.query("DELETE FROM campaigns WHERE owner_user_id=ANY($1::text[]) AND name LIKE $2",[[ownerId,otherOwnerId],prefix+"%"]);
  await pool.query("DELETE FROM destinations WHERE id=$1",[destination]);
  await pool.query("DELETE FROM telegram_accounts WHERE id=ANY($1::uuid[])",[[a,b,foreign]]);
  await pool.query("UPDATE subscriptions SET plan=$2 WHERE owner_user_id=$1",[ownerId,previousPlan]);
}
