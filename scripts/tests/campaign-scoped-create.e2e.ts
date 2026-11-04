import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";

export async function testCampaignScopedCreate({adminId,adminCookie,userCookie,request}:{
  adminId:string;adminCookie:string;userCookie:string;
  request:(path:string,cookie?:string,body?:unknown,method?:string,headers?:Record<string,string>)=>Promise<Response>;
}){
  const url=new URL(process.env.DATABASE_URL!);
  if(url.hostname!=="127.0.0.1"||url.pathname!=="/telecamp_test"||process.env.TELECAMPAIGN_E2E_ONLY!=="1")throw Error("E2E_UNSAFE_DATABASE_REFUSED");
  const accounts=[randomUUID(),randomUUID()],destination=randomUUID();
  const marker=`scoped-create-${randomUUID()}`,key=randomUUID(),otherKey=randomUUID();
  const ids:string[]=[];
  const post=(body:unknown,token=key,cookie=adminCookie)=>request("/campaigns",cookie,body,"POST",{"Idempotency-Key":token});
  try{
    for(const account of accounts)await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted,telegram_user_id) VALUES($1::uuid,$2,'scoped fixture','connected','fixture-not-a-session',$1::text)",[account,adminId]);
    await pool.query("INSERT INTO destinations(id,account_id,telegram_id,title,can_post) VALUES($1,$2,$3,'scoped fixture',true)",[destination,accounts[0],marker]);
    for(const account of accounts){
      const row=await pool.query("INSERT INTO campaigns(owner_user_id,telegram_account_id,name,content,status) VALUES($1,$2,$3,'fixture','draft') RETURNING id",[adminId,account,marker]);
      ids.push(row.rows[0].id);
    }
    console.log("E2E_SCOPED_FIXTURES_READY");
    const scoped=await request(`/campaigns/load-manifest?telegramAccountId=${accounts[0]}`,adminCookie);
    const manifest=await scoped.json() as any;
    assert.equal(scoped.status,200,"E2E_SCOPED_MANIFEST_HTTP");
    assert.deepEqual(manifest.campaignIds,[ids[0]],"E2E_SCOPED_MANIFEST_ACCOUNT");
    assert.ok(manifest.revisions[ids[0]],"E2E_SCOPED_MANIFEST_REVISION");
    const batch=await request(`/campaigns/load-batch?ids=${ids.join(",")}&telegramAccountId=${accounts[0]}`,adminCookie);
    const data=await batch.json() as any;
    assert.deepEqual(data.campaigns.map((c:any)=>c.id),[ids[0]],"E2E_SCOPED_BATCH_ACCOUNT");
    assert.deepEqual(data.missingIds,[ids[1]],"E2E_SCOPED_BATCH_OTHER_ACCOUNT_HIDDEN");
    const foreign=await(await request(`/campaigns/load-manifest?telegramAccountId=${accounts[0]}`,userCookie)).json() as any;
    assert.equal(foreign.total,0,"E2E_SCOPED_MANIFEST_OWNER");
    assert.equal((await request("/campaigns/load-manifest?telegramAccountId=invalid",adminCookie)).status,400,"E2E_SCOPED_BAD_ACCOUNT");
    await pool.query("UPDATE campaigns SET updated_at=updated_at+interval '1 second' WHERE id=$1",[ids[0]]);
    const changed=await(await request(`/campaigns/load-manifest?telegramAccountId=${accounts[0]}`,adminCookie)).json() as any;
    assert.notEqual(changed.revisions[ids[0]],manifest.revisions[ids[0]],"E2E_SCOPED_REVISION_CHANGES");
    const all=await(await request("/campaigns/load-manifest",adminCookie)).json() as any;
    assert.ok(ids.every(id=>all.campaignIds.includes(id)),"E2E_SCOPED_ALL_ACCOUNTS");
    console.log("E2E_SCOPED_READS_PASSED");

    const body={name:marker+"-new",content:"fixture only",telegramAccountId:accounts[0],
      destinationIds:[destination],scheduledAt:null,timezone:"UTC",repeatCount:1,
      roundDelayMinSeconds:3600,roundDelayMaxSeconds:3600,timingMode:"round",groupIntervalSeconds:0};
    const responses=await Promise.all([post(body),post(body)]);
    console.log("E2E_SCOPED_CREATE_HTTP_"+responses.map(response=>response.status).join("_"));
    assert.ok(responses.every(response=>response.status===201),"E2E_CREATE_CONCURRENT_HTTP");
    const created=await Promise.all(responses.map(response=>response.json())) as any[];
    assert.equal(created[0].id,created[1].id,"E2E_CREATE_CONCURRENT_SAME_CAMPAIGN");
    ids.push(created[0].id);
    assert.equal((await pool.query("SELECT count(*)::int n FROM campaigns WHERE owner_user_id=$1 AND name=$2",[adminId,body.name])).rows[0].n,1,"E2E_CREATE_NO_DUPLICATES");
    assert.equal((await pool.query("SELECT count(*)::int n FROM campaign_targets WHERE campaign_id=$1",[created[0].id])).rows[0].n,1,"E2E_CREATE_TARGETS_NOT_DUPLICATED");
    const retry=await post(body);
    assert.equal(retry.status,201,"E2E_CREATE_LOST_RESPONSE_RETRY");
    assert.equal((await retry.json() as any).id,created[0].id,"E2E_CREATE_RETRY_SAME_ID");
    assert.equal((await post({...body,name:marker+"-changed"})).status,409,"E2E_CREATE_DIFFERENT_BODY_REJECTED");
    assert.notEqual((await post(body,key,userCookie)).status,201,"E2E_CREATE_REPLAY_IS_OWNER_SCOPED");
    const intentional=await post(body,otherKey);
    assert.equal(intentional.status,201,"E2E_CREATE_NEW_REQUEST_ALLOWED");
    const intentionalId=(await intentional.json() as any).id;ids.push(intentionalId);
    assert.notEqual(intentionalId,created[0].id,"E2E_CREATE_NEW_REQUEST_NEW_ID");
    await pool.query("DELETE FROM campaigns WHERE id=$1",[created[0].id]);
    assert.equal((await post(body)).status,410,"E2E_CREATE_DELETED_REQUEST_NOT_RECREATED");
    assert.equal((await post(body,"invalid")).status,400,"E2E_CREATE_INVALID_KEY");
    console.log("E2E_SCOPED_CREATE_PASSED");
  }finally{
    await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])",[ids]);
    await pool.query("DELETE FROM system_settings WHERE key=ANY($1::text[])",[[`campaign_create_request:${adminId}:${key}`,`campaign_create_request:${adminId}:${otherKey}`]]);
    await pool.query("DELETE FROM telegram_accounts WHERE id=ANY($1::uuid[])",[accounts]);
  }
}
