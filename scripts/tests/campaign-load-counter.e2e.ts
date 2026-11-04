import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { createSupportSession,SUPPORT_COOKIE_NAME } from "../../artifacts/api-server/src/lib/support-session";

export async function testCampaignLoadCounter({adminId,userId,adminCookie,userCookie,request}:{
  adminId:string;userId:string;adminCookie:string;userCookie:string;
  request:(path:string,cookie?:string,body?:unknown,method?:string)=>Promise<Response>;
}){
  const check=(value:unknown,code:string)=>assert.ok(value,code);
  const prefix="counter-"+randomUUID(),target=randomUUID(),account=randomUUID();
  const created:string[]=[];
  const manifest=(cookie=adminCookie)=>request("/campaigns/load-manifest",cookie);
  const batch=(ids:string[],cookie=adminCookie)=>request("/campaigns/load-batch?ids="+encodeURIComponent(ids.join(",")),cookie);
  await pool.query("INSERT INTO app_users(id,username,username_normalized,password_hash,role) VALUES($1,$2,$2,'fixture-hash','user')",[target,prefix]);
  await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status) VALUES($1,$2,'counter fixture','disconnected')",[account,target]);
  for(const [owner,n] of [[adminId,60],[userId,2],[target,1]] as const){
    const result=await pool.query(`INSERT INTO campaigns(owner_user_id,name,content,status,telegram_account_id)
      SELECT $1,$2||'-'||i,'fixture content','draft',$3 FROM generate_series(1,$4::int) i RETURNING id,owner_user_id`,
    [owner,prefix,owner===target?account:null,n]);
    created.push(...result.rows.map(row=>row.id));
  }
  try{
    const own=(await pool.query("SELECT id FROM campaigns WHERE name LIKE $1 AND owner_user_id=$2 ORDER BY id",[prefix+"%",adminId])).rows.map(row=>row.id);
    const foreign=(await pool.query("SELECT id FROM campaigns WHERE name LIKE $1 AND owner_user_id=$2 ORDER BY id",[prefix+"%",userId])).rows.map(row=>row.id);
    const before=(await pool.query("SELECT id,updated_at,content,status FROM campaigns WHERE id=ANY($1::uuid[]) ORDER BY id",[created])).rows;
    check((await manifest("")).status===401,"E2E_CAMPAIGN_LOAD_ANON_MANIFEST");
    check((await batch([own[0]],"")).status===401,"E2E_CAMPAIGN_LOAD_ANON_BATCH");
    const first=await manifest(),selection=await first.json() as any;
    check(first.headers.get("cache-control")==="no-store"&&selection.total===selection.campaignIds.length,"E2E_CAMPAIGN_LOAD_MANIFEST");
    check(own.every(id=>selection.campaignIds.includes(id))&&!foreign.some(id=>selection.campaignIds.includes(id)),"E2E_CAMPAIGN_LOAD_MANIFEST_SCOPE");
    const response=await batch(own.slice(0,25)),data=await response.json() as any;
    check(response.status===200&&response.headers.get("cache-control")==="no-store"&&data.campaigns.length===25,"E2E_CAMPAIGN_LOAD_BATCH");
    assert.deepEqual(data.campaigns.map((row:any)=>row.id),own.slice(0,25),"E2E_CAMPAIGN_LOAD_ORDER");
    const hidden=await(await batch([own[0],foreign[0]])).json() as any;
    check(hidden.campaigns.length===1&&hidden.missingIds[0]===foreign[0],"E2E_CAMPAIGN_LOAD_FOREIGN_HIDDEN");
    const customer=await(await manifest(userCookie)).json() as any;
    check(foreign.every(id=>customer.campaignIds.includes(id))&&!own.some(id=>customer.campaignIds.includes(id)),"E2E_CAMPAIGN_LOAD_USER_SCOPE");
    for(const invalid of [own.slice(0,26),[own[0],own[0]],["not-a-uuid"],[]]){
      check((await batch(invalid)).status===400,"E2E_CAMPAIGN_LOAD_INVALID_BATCH");
    }
    const support=await createSupportSession(adminId,target);
    const supportCookie=adminCookie.split("; ").filter(pair=>!pair.startsWith(SUPPORT_COOKIE_NAME+"=")).join("; ")+`; ${SUPPORT_COOKIE_NAME}=${support.cookieValue}`;
    const supportSelection=await(await manifest(supportCookie)).json() as any;
    check(supportSelection.total===1&&!supportSelection.campaignIds.some((id:string)=>own.includes(id)),"E2E_CAMPAIGN_LOAD_SUPPORT_SCOPE");
    const supportBatch=await batch(supportSelection.campaignIds,supportCookie);
    check(supportBatch.status===200,"E2E_CAMPAIGN_LOAD_SUPPORT_READ_ONLY");
    check((await pool.query("SELECT count(*)::int n FROM subscriptions WHERE owner_user_id=$1",[target])).rows[0].n===0,"E2E_CAMPAIGN_LOAD_NO_SUBSCRIPTION_WRITE");
    assert.deepEqual((await pool.query("SELECT id,updated_at,content,status FROM campaigns WHERE id=ANY($1::uuid[]) ORDER BY id",[created])).rows,before,"E2E_CAMPAIGN_LOAD_NO_CAMPAIGN_WRITE");
    await pool.query("DELETE FROM campaigns WHERE id=$1",[own[0]]);
    const removed=await(await batch([own[0],own[1]])).json() as any;
    check(removed.campaigns.length===1&&removed.missingIds[0]===own[0],"E2E_CAMPAIGN_LOAD_DELETED_BETWEEN_BATCHES");
    const added=await pool.query("INSERT INTO campaigns(owner_user_id,name,content,status) VALUES($1,$2,'new','draft') RETURNING id",[adminId,prefix+"-new"]);
    created.push(added.rows[0].id);
    check(!selection.campaignIds.includes(added.rows[0].id),"E2E_CAMPAIGN_LOAD_FIXED_SELECTION");
    console.log("E2E_CAMPAIGN_LOAD_COUNTER_PASSED");
  }finally{
    await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])",[created]);
    await pool.query("DELETE FROM telegram_accounts WHERE id=$1",[account]);
    await pool.query("DELETE FROM app_users WHERE id=$1",[target]);
  }
}
