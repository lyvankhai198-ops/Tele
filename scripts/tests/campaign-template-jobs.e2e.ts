import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
import {processTemplateJobs} from "../../artifacts/api-server/src/lib/campaign-template-jobs";
import {getSystemSettings} from "../../artifacts/api-server/src/lib/system-settings";
export async function testTemplateJobs({adminId,userId,adminCookie,userCookie,request}:{
  adminId:string;userId:string;adminCookie:string;userCookie:string;
  request:(path:string,cookie?:string,body?:unknown,method?:string,headers?:Record<string,string>)=>Promise<Response>;
}){
  const check=(v:unknown,c:string)=>assert.ok(v,c),base="/campaigns/bulk-template",account=randomUUID(),ownAccount=randomUUID(),template=randomUUID(),ownTemplate=randomUUID(),ids:string[]=[],ownIds:string[]=[];
  const original=await getSystemSettings();
  for(const [id,owner]of[[account,adminId],[ownAccount,userId]])
    await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status) VALUES($1,$2,'fixture','disconnected')",[id,owner]);
  for(const [id,owner]of[[template,adminId],[ownTemplate,userId]])
    await pool.query("INSERT INTO message_templates(id,owner_user_id,name,content,mode) VALUES($1,$2,'fixture','stable snapshot','text')",[id,owner]);
  const create=(extra={})=>request(base,adminCookie,{templateId:template,telegramAccountId:account,campaignIds:ids,requestId:randomUUID(),...extra});
  const read=async(id:string,cookie=adminCookie)=>(await(await request(`${base}/jobs/${id}`,cookie)).json()) as any;
  try{
    const seeded=await pool.query("INSERT INTO campaigns(owner_user_id,telegram_account_id,name,status,content) SELECT $1,$2,'No prefix '||i,'draft','unchanged' FROM generate_series(1,1200) i RETURNING id",[adminId,account]);
    ids.push(...seeded.rows.map(r=>r.id));
    const requestId=randomUUID(),start=Date.now(),response=await create({requestId}),job=await response.json() as any;
    check(response.status===202&&job.total===1200&&job.processed===0&&Date.now()-start<5000,"E2E_TEMPLATE_JOB_FAST_SELECTION_ACCEPT");
    check((await(await create({requestId,campaignIds:[...ids].reverse()})).json() as any).id===job.id,"E2E_TEMPLATE_JOB_SELECTION_ORDER_DEDUP");
    check((await create({requestId,campaignIds:ids.slice(0,1)})).status===409,"E2E_TEMPLATE_JOB_CHANGED_SELECTION_REJECTED");
    check((await request(`${base}/jobs/${job.id}`,userCookie)).status===404,"E2E_TEMPLATE_JOB_OTHER_OWNER_HIDDEN");
    check((await request(`${base}/jobs/${job.id}/retry`,userCookie,{})).status===404,"E2E_TEMPLATE_JOB_OTHER_OWNER_RETRY_HIDDEN");
    await Promise.all([processTemplateJobs(2),processTemplateJobs(2)]);
    let current=await read(job.id);check(current.processed>=2&&current.processed<=4,"E2E_TEMPLATE_JOB_MULTI_WORKER");
    await processTemplateJobs(4-current.processed);
    check((await(await request(`${base}/jobs/latest`,adminCookie)).json() as any).id===job.id,"E2E_TEMPLATE_JOB_REOPEN");
    await pool.query(`CREATE FUNCTION fixture_template_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event='campaign.bulk_template_updated' THEN RAISE EXCEPTION 'fixture' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER fixture_template_audit_failure BEFORE INSERT ON activity_logs FOR EACH ROW EXECUTE FUNCTION fixture_template_audit_failure()");
    try{
      await processTemplateJobs(1);current=await read(job.id);
      check(current.status==="failed"&&current.processed===4,"E2E_TEMPLATE_JOB_ATOMIC_CURSOR");
      check((await pool.query("SELECT count(*)::int n FROM campaigns WHERE id=ANY($1::uuid[]) AND content='stable snapshot'",[ids])).rows[0].n===4,"E2E_TEMPLATE_JOB_MUTATION_ROLLBACK");
    }finally{await pool.query("DROP TRIGGER IF EXISTS fixture_template_audit_failure ON activity_logs");await pool.query("DROP FUNCTION IF EXISTS fixture_template_audit_failure()");}
    await request(`${base}/jobs/${job.id}/retry`,adminCookie,{});
    await processTemplateJobs(1300);current=await read(job.id);
    check(current.status==="completed"&&current.updatedCount===1200&&current.defaultStatus==="not_applicable","E2E_TEMPLATE_JOB_LARGE_SELECTION_COMPLETED");
    check((await pool.query("SELECT count(*)::int n FROM activity_logs WHERE metadata->>'jobId'=$1",[job.id])).rows[0].n===1200,"E2E_TEMPLATE_JOB_NO_DUPLICATE_AUDIT");
    for(const status of ["running","completed","draft"]){
      const row=await pool.query("INSERT INTO campaigns(owner_user_id,telegram_account_id,name,status,content) VALUES($1,$2,'Ordinary customer campaign',$3,'customer-old') RETURNING id",[userId,ownAccount,status]);ownIds.push(row.rows[0].id);
    }
    const send=(extra={})=>request(base,userCookie,{templateId:ownTemplate,telegramAccountId:ownAccount,campaignIds:ownIds.slice(0,2),requestId:randomUUID(),...extra});
    check((await send({campaignIds:[ownIds[0],ids[0]]})).status===404,"E2E_TEMPLATE_CUSTOMER_MIXED_OWNER_REJECTED");
    const accepted=await send(),own=await accepted.json() as any;check(accepted.status===202&&own.total===2,"E2E_TEMPLATE_CUSTOMER_SELECTED_ACCEPTED");
    await processTemplateJobs(8);
    check((await read(own.id,userCookie)).updatedCount===2,"E2E_TEMPLATE_CUSTOMER_SELECTED_COMPLETED");
    check((await pool.query("SELECT content FROM campaigns WHERE id=$1",[ownIds[2]])).rows[0].content==="customer-old","E2E_TEMPLATE_CUSTOMER_UNCHECKED_PRESERVED");
    check((await request(`${base}/jobs/${own.id}`,adminCookie)).status===404,"E2E_TEMPLATE_CUSTOMER_JOB_PRIVATE");
    assert.deepEqual(await getSystemSettings(),original,"E2E_TEMPLATE_NO_SHARED_DEFAULT");
    console.log("E2E_TEMPLATE_CUSTOMER_ACCESS_PASSED");
    console.log("E2E_TEMPLATE_JOBS_PASSED");
  }finally{
    for(const owner of [adminId,userId])await pool.query("DELETE FROM system_settings WHERE key LIKE $1",[`campaign_template_job:${owner}:%`]);
    await pool.query("DELETE FROM activity_logs WHERE campaign_id=ANY($1::uuid[])",[[...ids,...ownIds]]);
    await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])",[[...ids,...ownIds]]);
    await pool.query("DELETE FROM message_templates WHERE id=ANY($1::uuid[])",[[template,ownTemplate]]);
    await pool.query("DELETE FROM telegram_accounts WHERE id=ANY($1::uuid[])",[[account,ownAccount]]);
  }
}
