import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
import {processOperations} from "../../artifacts/api-server/src/lib/operations";
import {processSyncOperations} from "../../artifacts/api-server/src/lib/operation-sync";
export async function testOperations(input:{
  ownerId:string;otherOwnerId:string;ownerCookie:string;otherCookie:string;
  request:(path:string,cookie?:string,body?:unknown,method?:string,headers?:Record<string,string>)=>Promise<Response>;
}){
  const {ownerId,otherOwnerId,ownerCookie,otherCookie,request}=input;
  console.log("E2E_OP_BEGIN");
  const check=(ok:unknown,code:string)=>assert.ok(ok,code);
  const a=randomUUID(),b=randomUUID(),foreign=randomUUID(),da=randomUUID(),db=randomUUID(),df=randomUUID();
  const ca=randomUUID(),cb=randomUUID(),cr=randomUUID(),cf=randomUUID(),tag=`Operations-${randomUUID()}`;
  await pool.query(`INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted)
    VALUES($1,$4,'Operations A','connected','fixture-session'),($2,$4,'Operations B','connected','fixture-session'),($3,$5,'Foreign','connected','fixture-session')`,[a,b,foreign,ownerId,otherOwnerId]);
  await pool.query(`INSERT INTO destinations(id,account_id,title,telegram_id,can_post)
    VALUES($1,$4,'A','-1000000888',true),($2,$5,'B','-1000000888',true),($3,$6,'Foreign','-1000000888',true)`,[da,db,df,a,b,foreign]);
  for(const [id,owner,account,destination,status,name] of [
    [ca,ownerId,a,da,"running",tag],[cb,ownerId,b,db,"draft",tag],
    [cr,ownerId,b,db,"running",tag],[cf,otherOwnerId,foreign,df,"draft",tag],
  ]){
    await pool.query("INSERT INTO campaigns(id,owner_user_id,telegram_account_id,name,status,content,destination_ids,repeat_count) VALUES($1,$2,$3,$4,$5,'Fixture',$6,1)",
      [id,owner,account,name,status,[destination]]);
  }
  await pool.query("INSERT INTO campaign_targets(campaign_id,destination_id,status,next_attempt_at) SELECT $1,$2,'pending',now() FROM generate_series(1,2001)",[ca,da]);
  await pool.query("INSERT INTO activity_logs(owner_user_id,event,message,account_id,campaign_id) VALUES($1,'fixture','Fixture',$2,$3)",[ownerId,a,ca]);
  console.log("E2E_OP_FIXTURES_READY");
  check((await request("/operations",undefined,{kind:"delete_account",accountId:a,confirm:true},"POST")).status===401,"E2E_OP_AUTH");
  check((await request("/operations",ownerCookie,{kind:"delete_account",accountId:foreign,confirm:true},"POST")).status===404,"E2E_OP_FOREIGN_ACCOUNT");
  check((await request("/operations",ownerCookie,{kind:"delete_account",accountId:a},"POST")).status===400,"E2E_OP_CONFIRM_REQUIRED");
  const body={kind:"delete_account",accountId:a,confirm:true},headers={"Idempotency-Key":randomUUID()};
  const [accepted,repeated]=await Promise.all([request("/operations",ownerCookie,body,"POST",headers),request("/operations",ownerCookie,body,"POST",headers)]);
  const job=await accepted.json();
  check(accepted.status===202&&job.state==="queued","E2E_OP_ACCEPTED");
  check(repeated.status===202&&(await repeated.json()).id===job.id,"E2E_OP_CONCURRENT_DUPLICATE");
  console.log("E2E_OP_ACCEPTANCE_PASSED");
  check((await pool.query("SELECT deleted_at,session_encrypted FROM telegram_accounts WHERE id=$1",[a])).rows[0].deleted_at
    &&(await pool.query("SELECT session_encrypted FROM telegram_accounts WHERE id=$1",[a])).rows[0].session_encrypted===null,"E2E_OP_IMMEDIATE_FENCE");
  const duplicate=await (await request("/operations",ownerCookie,body,"POST",headers)).json();
  check(duplicate.id===job.id,"E2E_OP_NO_DUPLICATE");
  const list=async(cookie=ownerCookie)=>await (await request("/operations",cookie,undefined,"GET")).json();
  const progress=async()=>((await list()) as any[]).find(row=>row.id===job.id);
  check(!(await list(otherCookie)).some((row:any)=>row.id===job.id),"E2E_OP_OWNER_PROGRESS");
  check(!JSON.stringify(await list()).includes("fixture-session")&&job.payload===undefined&&job.owner===undefined,"E2E_OP_PRIVATE_PAYLOAD");
  for(let i=0;i<8&&(await progress()).phase!=="targets";i++)await processOperations();
  check((await progress()).phase==="targets","E2E_OP_STAGE_RESTORED");
  console.log("E2E_OP_TARGET_STAGE_PASSED");
  check((await request(`/campaigns/${ca}/status`,ownerCookie,{status:"queued"},"PATCH")).status===409,"E2E_OP_CANNOT_REACTIVATE_DELETING");
  const blocker=await pool.connect();
  try{
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM campaign_targets WHERE campaign_id=$1 ORDER BY id LIMIT 1 FOR UPDATE",[ca]);
    await processOperations();
    check((await progress()).state==="failed","E2E_OP_LOCK_FAILURE_RECOVERABLE");
    check(Number((await pool.query("SELECT count(*) FROM campaign_targets WHERE campaign_id=$1",[ca])).rows[0].count)===2001,"E2E_OP_FAILED_CHUNK_ATOMIC");
  }finally{await blocker.query("ROLLBACK");blocker.release();}
  check((await request(`/operations/${job.id}/retry`,otherCookie,{},"POST")).status===404,"E2E_OP_RETRY_OWNER");
  check((await request(`/operations/${job.id}/retry`,ownerCookie,{},"POST")).status===202,"E2E_OP_RETRY_SAME_JOB");
  await processOperations(30);
  check((await progress()).state==="completed"&&(await progress()).processed>=2005,"E2E_OP_COMPLETED_REAL_COUNTER");
  console.log("E2E_OP_LOCK_RECOVERY_PASSED");
  check(!(await pool.query("SELECT id FROM telegram_accounts WHERE id=$1",[a])).rows.length,"E2E_OP_ACCOUNT_REMOVED");
  check(!(await pool.query("SELECT id FROM campaigns WHERE id=$1",[ca])).rows.length,"E2E_OP_RUNNING_CAMPAIGN_REMOVED");
  check(!(await pool.query("SELECT id FROM destinations WHERE id=$1",[da])).rows.length,"E2E_OP_GROUP_REMOVED");
  check((await pool.query("SELECT id FROM destinations WHERE id=ANY($1::uuid[])",[[db,df]])).rows.length===2,"E2E_OP_SAME_TELEGRAM_ID_RETAINED");
  const bulk=await request("/operations",ownerCookie,{kind:"delete_campaigns",confirm:true,telegramAccountId:b,search:tag},"POST");
  check(bulk.status===202,"E2E_OP_BULK_ACCEPTED");await processOperations(30);
  check(!(await pool.query("SELECT id FROM campaigns WHERE id=$1",[cb])).rows.length
    &&(await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])",[[cr,cf]])).rows.length===2,"E2E_OP_BULK_SCOPE_AND_RUNNING_GUARD");
  console.log("E2E_OP_BULK_PASSED");
  const sync=await (await request("/operations",ownerCookie,{kind:"sync_groups",accountId:b},"POST")).json();
  await processSyncOperations({sync:async(_id,onProgress)=>{await onProgress?.(3);return 3;}});
  const synced=(await list()).find((row:any)=>row.id===sync.id);
  check(synced?.state==="completed"&&synced.processed===3&&synced.total===3,"E2E_OP_SYNC_COUNTER");
  console.log("E2E_OP_SYNC_PASSED");
  const previous=(await pool.query("SELECT plan FROM subscriptions WHERE owner_user_id=$1",[ownerId])).rows[0].plan;
  await pool.query("UPDATE subscriptions SET plan='unlimited' WHERE owner_user_id=$1",[ownerId]);
  try{
    const created=await request("/campaigns",ownerCookie,{name:tag+" preparation",telegramAccountId:b,destinationIds:[db],content:"Fixture",
      repeatCount:1501,timingMode:"round",groupIntervalSeconds:0,roundDelayMinSeconds:3600,roundDelayMaxSeconds:3600,timezone:"Asia/Ho_Chi_Minh"},"POST");
    const campaign=await created.json();
    check(created.status===201&&campaign.status==="draft","E2E_OP_LARGE_CREATE_NONBLOCKING");
    await processOperations();
    const first=(await list()).find((row:any)=>row.campaignId===campaign.id);
    check(first?.processed===500&&first.total===1501&&first.state==="running","E2E_OP_PREPARATION_CHUNK");
    await processOperations(10);
    check(Number((await pool.query("SELECT count(*) FROM campaign_targets WHERE campaign_id=$1",[campaign.id])).rows[0].count)===1501,"E2E_OP_PREPARATION_EXACT_COUNT");
    check((await pool.query("SELECT status,pause_reason FROM campaigns WHERE id=$1",[campaign.id])).rows[0].status==="queued","E2E_OP_RELEASE_ONLY_AFTER_PREPARED");
    console.log("E2E_OP_PREPARATION_PASSED");
  }finally{await pool.query("UPDATE subscriptions SET plan=$2 WHERE owner_user_id=$1",[ownerId,previous]);}
}
