// Disposable PostgreSQL and HTTP only. Never operate on customer data.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
import {getSystemSettings} from "../../artifacts/api-server/src/lib/system-settings";
import {createSupportSession,SUPPORT_COOKIE_NAME} from "../../artifacts/api-server/src/lib/support-session";
import {processTemplateJobs} from "../../artifacts/api-server/src/lib/campaign-template-jobs";
export async function testCampaignTemplateAccount({adminId,userId,adminCookie,userCookie,request}:{
  adminId:string;userId:string;adminCookie:string;userCookie:string;
  request:(path:string,cookie?:string,body?:unknown,method?:string)=>Promise<Response>;
}){
  const check=(v:unknown,c:string)=>assert.ok(v,c),base="/campaigns/bulk-template";
  const a=randomUUID(),b=randomUUID(),foreign=randomUUID(),template=randomUUID(),foreignTemplate=randomUUID(),forward=randomUUID(),ids:string[]=[];
  const original=await getSystemSettings();
  for(const [id,owner]of[[a,adminId],[b,adminId],[foreign,userId]])
    await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status) VALUES($1,$2,'fixture','disconnected')",[id,owner]);
  for(const [id,owner,mode,source]of[[template,adminId,"text",null],[foreignTemplate,userId,"text",null],[forward,adminId,"forward",a]])
    await pool.query("INSERT INTO message_templates(id,owner_user_id,name,content,mode,source_account_id,source_message_id) VALUES($1,$2,'fixture','new-content',$3,$4,'42')",[id,owner,mode,source]);
  async function add(account:string,status="draft",owner=adminId){
    const id=randomUUID();ids.push(id);
    await pool.query("INSERT INTO campaigns(id,owner_user_id,telegram_account_id,name,status,content,repeat_count) VALUES($1,$2,$3,$4,$5,'old-content',3)",
      [id,owner,account,`Custom campaign ${ids.length}`,status]);return id;
  }
  const send=(campaignIds:string[],extra={},cookie=adminCookie)=>request(base,cookie,{templateId:template,telegramAccountId:a,campaignIds,requestId:randomUUID(),...extra});
  const read=async(id:string)=>(await(await request(`${base}/jobs/${id}`,adminCookie)).json()) as any;
  try{
    const selected:string[]=[];
    for(const status of ["draft","paused","queued","running","completed","completed_with_errors","failed","cancelled"])selected.push(await add(a,status));
    const deleting=await add(a,"paused");selected.push(deleting);
    await pool.query("UPDATE campaigns SET pause_reason='deletion_pending' WHERE id=$1",[deleting]);
    const untouched=await add(a),other=await add(b),foreignCampaign=await add(foreign,"draft",userId);
    const snapshot=async()=>(await pool.query(`SELECT id,to_jsonb(c)-ARRAY['content','template_id','template_mode','template_source_account_id','template_source_message_id','updated_at'] AS data FROM campaigns c WHERE id=ANY($1::uuid[]) ORDER BY id`,[selected])).rows;
    const before=await snapshot();
    await pool.query("INSERT INTO activity_logs(owner_user_id,campaign_id,level,event,message) VALUES($1,$2,'success','fixture.sent','historical-message')",[adminId,selected[4]]);
    check((await send(selected,{},"")).status===401,"E2E_TEMPLATE_SELECTION_ANON_DENIED");
    const support=await createSupportSession(adminId,userId);
    const supportCookie=adminCookie.split("; ").filter(v=>!v.startsWith(SUPPORT_COOKIE_NAME+"=")).concat(`${SUPPORT_COOKIE_NAME}=${support.token}`).join("; ");
    check((await send(selected,{},supportCookie)).status===403,"E2E_TEMPLATE_SELECTION_SUPPORT_DENIED");
    check((await send(selected,{},userCookie)).status===404,"E2E_TEMPLATE_SELECTION_FOREIGN_ACCOUNT");
    check((await send([selected[0],other])).status===404,"E2E_TEMPLATE_SELECTION_CROSS_ACCOUNT_REJECTED");
    check((await send([selected[0],foreignCampaign])).status===404,"E2E_TEMPLATE_SELECTION_CROSS_OWNER_REJECTED");
    check((await send(selected,{templateId:foreignTemplate})).status===404,"E2E_TEMPLATE_SELECTION_FOREIGN_TEMPLATE");
    check((await send([])).status===400,"E2E_TEMPLATE_SELECTION_EMPTY_REJECTED");
    check((await send(selected,{telegramAccountId:undefined})).status===400,"E2E_TEMPLATE_SELECTION_ACCOUNT_REQUIRED");
    const accepted=await send(selected),job=await accepted.json() as any;
    check(accepted.status===202&&job.total===9,"E2E_TEMPLATE_SELECTION_ANY_NAME_AND_STATUS");
    // A legacy pending default update must be neutralized as well.
    await pool.query("UPDATE system_settings SET value=jsonb_set(value::jsonb,'{defaultStatus}','\"pending\"'::jsonb)::text WHERE key=$1",[`campaign_template_job:${adminId}:${job.id}`]);
    await processTemplateJobs(30);
    const result=await read(job.id);
    check(result.status==="completed","E2E_TEMPLATE_SELECTION_COMPLETED");
    check(result.updatedCount===8&&result.defaultStatus==="not_applicable","E2E_TEMPLATE_SELECTION_FINISHED");
    check(result.skippedCount===1&&result.skipped[0]?.id===deleting&&result.skipped[0]?.reason==="scope_changed","E2E_TEMPLATE_SELECTION_DELETE_FENCE");
    assert.deepEqual(await snapshot(),before,"E2E_TEMPLATE_SELECTION_SCHEDULE_AND_STATUS_UNCHANGED");
    check((await pool.query("SELECT count(*)::int n FROM activity_logs WHERE campaign_id=$1 AND message='historical-message'",[selected[4]])).rows[0].n===1,"E2E_TEMPLATE_SELECTION_HISTORY_UNCHANGED");
    check((await pool.query("SELECT count(*)::int n FROM campaigns WHERE id=ANY($1::uuid[]) AND content='old-content'",[[untouched,other,foreignCampaign]])).rows[0].n===3,"E2E_TEMPLATE_SELECTION_UNCHECKED_UNCHANGED");
    assert.deepEqual(await getSystemSettings(),original,"E2E_TEMPLATE_SELECTION_NO_SHARED_DEFAULT");
    const forwardResponse=await send([other],{templateId:forward,telegramAccountId:b}),forwardJob=await forwardResponse.json() as any;
    check(forwardResponse.status===202,"E2E_TEMPLATE_SELECTION_FORWARD_ACCEPTED");await processTemplateJobs(5);
    check((await read(forwardJob.id)).skipped[0]?.reason==="forward_account_mismatch","E2E_TEMPLATE_SELECTION_FORWARD_REASON");
    const pending=await(await send([untouched])).json() as any;
    const addedAfter=await add(a);
    await pool.query("UPDATE message_templates SET content='edited-after-acceptance' WHERE id=$1",[template]);
    await processTemplateJobs(5);
    check((await read(pending.id)).updatedCount===1,"E2E_TEMPLATE_SELECTION_EXACT_SNAPSHOT");
    const old=await pool.query("SELECT id,content FROM campaigns WHERE id=ANY($1::uuid[])",[[untouched,addedAfter]]);
    check(old.rows.find(r=>r.id===untouched)?.content==="new-content"&&old.rows.find(r=>r.id===addedAfter)?.content==="old-content","E2E_TEMPLATE_SELECTION_TEMPLATE_SNAPSHOT");
    console.log("E2E_TEMPLATE_ACCOUNT_PASSED");
  }finally{
    await pool.query("DELETE FROM system_settings WHERE key LIKE $1",[`campaign_template_job:${adminId}:%`]);
    await pool.query("DELETE FROM activity_logs WHERE campaign_id=ANY($1::uuid[])",[ids]);
    await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])",[ids]);
    await pool.query("DELETE FROM message_templates WHERE id=ANY($1::uuid[])",[[template,foreignTemplate,forward]]);
    await pool.query("DELETE FROM telegram_accounts WHERE id=ANY($1::uuid[])",[[a,b,foreign]]);
  }
}
