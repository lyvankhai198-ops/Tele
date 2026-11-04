import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { processTemplateJobs } from "../../artifacts/api-server/src/lib/campaign-template-jobs";
import { getSystemSettings,updateSystemSettings } from "../../artifacts/api-server/src/lib/system-settings";

export async function testTemplateJobs({adminId,userId,adminCookie,userCookie,request}:{
  adminId:string;userId:string;adminCookie:string;userCookie:string;
  request:(path:string,cookie?:string,body?:unknown,method?:string,headers?:Record<string,string>)=>Promise<Response>;
}){
  const check=(v:unknown,c:string)=>assert.ok(v,c);
  const base="/campaigns/bulk-template",account=randomUUID(),template=randomUUID(),prefix=`Tự động: job-${randomUUID()}`;
  const original=await getSystemSettings();
  const ids:string[]=[];
  const ownAccounts=[randomUUID(),randomUUID()],ownTemplate=randomUUID(),ownCampaigns:string[]=[];
  await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status) VALUES($1,$2,'job fixture','disconnected')",[account,adminId]);
  await pool.query("INSERT INTO message_templates(id,owner_user_id,name,content,mode) VALUES($1,$2,'job fixture','stable snapshot','text')",[template,adminId]);
  const create=(extra={})=>request(base,adminCookie,{templateId:template,telegramAccountId:account,requestId:randomUUID(),...extra});
  const read=async(id:string)=>(await(await request(`${base}/jobs/${id}`,adminCookie)).json()) as any;
  async function add(n:number){
    const rows=await pool.query(`INSERT INTO campaigns(owner_user_id,name,content,status,telegram_account_id)
      SELECT $1,$2||'-'||i,'unchanged','draft',$3 FROM generate_series(1,$4::integer) i RETURNING id`,[adminId,prefix,account,n]);
    ids.push(...rows.rows.map(r=>r.id));
  }
  try{
    await add(1200);
    const requestId=randomUUID(),before=Date.now();
    const response=await create({requestId}),job=await response.json() as any;
    check(response.status===202&&Date.now()-before<5000&&job.total===1200&&job.processed===0,"E2E_TEMPLATE_JOB_FAST_ACCEPT");
    check((await pool.query("SELECT count(*)::int n FROM campaigns WHERE id=ANY($1::uuid[]) AND content='unchanged'",[ids])).rows[0].n===1200,"E2E_TEMPLATE_JOB_ACCEPT_NO_SYNC_WRITES");
    check((await(await create({requestId})).json() as any).id===job.id,"E2E_TEMPLATE_JOB_REPLAY_ACCEPT");
    check((await(await create()).json() as any).id===job.id,"E2E_TEMPLATE_JOB_ACTIVE_DEDUP");
    check((await create({telegramAccountId:undefined})).status===409,"E2E_TEMPLATE_JOB_CONFLICT");
    check((await request(`${base}/jobs/${job.id}`,userCookie)).status===404,"E2E_TEMPLATE_JOB_OTHER_OWNER_HIDDEN");
    check((await request(`${base}/jobs/${job.id}/retry`,userCookie,{})).status===404,"E2E_TEMPLATE_JOB_OTHER_OWNER_RETRY_HIDDEN");
    check((await request(`${base}/jobs/${job.id}`)).status===401,"E2E_TEMPLATE_JOB_ANON_DENIED");
    const foreign=randomUUID();
    check((await request(`${base}/jobs/${foreign}`,adminCookie)).status===404,"E2E_TEMPLATE_JOB_FOREIGN_READ");
    check((await request(`${base}/jobs/${foreign}/retry`,adminCookie,{})).status===404,"E2E_TEMPLATE_JOB_FOREIGN_RETRY");
    check((await request(`${base}/jobs/${job.id}/skipped/-1`,adminCookie)).status===400,"E2E_TEMPLATE_JOB_INVALID_OFFSET");
    await Promise.all([processTemplateJobs(2),processTemplateJobs(2)]);
    let current=await read(job.id);
    check(current.processed>=2&&current.processed<=4&&current.updatedCount===current.processed,"E2E_TEMPLATE_JOB_MULTI_WORKER");
    // SKIP LOCKED allows a second worker to find no row while the first owns
    // this job. Bring the deterministic failure fixture to cursor four.
    await processTemplateJobs(4-current.processed);
    const logs=await pool.query("SELECT count(*)::int n FROM activity_logs WHERE metadata->>'jobId'=$1",[job.id]);
    check(logs.rows[0].n===4,"E2E_TEMPLATE_JOB_ONE_AUDIT_PER_UPDATE");
    // Emulate lost HTTP response/reopened window: no local identity is needed.
    const latest=await(await request(`${base}/jobs/latest`,adminCookie)).json() as any;
    check(latest.id===job.id&&latest.processed===4,"E2E_TEMPLATE_JOB_REOPEN_PERSISTED");
    // Fail after mutation but before audit/cursor. The entire step must roll back.
    await pool.query(`CREATE FUNCTION fixture_template_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event='campaign.bulk_template_updated' THEN RAISE EXCEPTION 'fixture' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER fixture_template_audit_failure BEFORE INSERT ON activity_logs FOR EACH ROW EXECUTE FUNCTION fixture_template_audit_failure()");
    try{await processTemplateJobs(1);}finally{
      await pool.query("DROP TRIGGER fixture_template_audit_failure ON activity_logs");
      await pool.query("DROP FUNCTION fixture_template_audit_failure()");
    }
    current=await read(job.id);
    check(current.status==="failed"&&current.processed===4,"E2E_TEMPLATE_JOB_ATOMIC_CURSOR");
    check((await pool.query("SELECT count(*)::int n FROM campaigns WHERE id=ANY($1::uuid[]) AND content='stable snapshot'",[ids])).rows[0].n===4,"E2E_TEMPLATE_JOB_MUTATION_ROLLED_BACK");
    await request(`${base}/jobs/${job.id}/retry`,adminCookie,{});
    // Each call opens fresh DB transactions; all progress is durable, not an
    // in-memory queue. This continues the failed job after reading only its id.
    await processTemplateJobs(1);
    check((await read(job.id)).processed===5,"E2E_TEMPLATE_JOB_RESUME_CURSOR");
    // Template edits after acceptance do not silently change the chosen snapshot.
    await pool.query("UPDATE message_templates SET content='edited later' WHERE id=$1",[template]);
    await processTemplateJobs(1300);
    current=await read(job.id);
    check(current.status==="completed"&&current.updatedCount===1200&&current.defaultStatus==="not_applicable","E2E_TEMPLATE_JOB_FINISHED_LARGE_BATCH");
    const receipt=await pool.query("SELECT count(*)::int n FROM activity_logs WHERE metadata->>'jobId'=$1",[job.id]);
    check(receipt.rows[0].n===1200,"E2E_TEMPLATE_JOB_NO_DUPLICATE_AUDITS");
    const replay=await(await create({requestId})).json() as any;
    check(replay.id===job.id&&replay.status==="completed","E2E_TEMPLATE_JOB_COMPLETED_REPLAY");
    check((await create({requestId,telegramAccountId:undefined})).status===409,"E2E_TEMPLATE_JOB_CHANGED_KEY");
    assert.deepEqual(await getSystemSettings(),original,"E2E_TEMPLATE_JOB_SCOPED_DEFAULT_UNCHANGED");
    // Re-check account deletion between acceptance and execution.
    const deleted=await(await create()).json() as any;
    await pool.query("UPDATE telegram_accounts SET deleted_at=now() WHERE id=$1",[account]);
    await processTemplateJobs(1300);
    const skipped=await read(deleted.id);
    check(skipped.skippedCount===1200&&skipped.skipped.length===50&&skipped.updatedCount===0,"E2E_TEMPLATE_JOB_DELETED_ACCOUNT_SKIP");
    const page=await(await request(`${base}/jobs/${deleted.id}/skipped/50`,adminCookie)).json() as any;
    check(page.skippedOffset===50&&page.skipped.length===50&&page.skipped[0].id!==skipped.skipped[0].id,"E2E_TEMPLATE_JOB_PAGED_REASONS");
    await pool.query("UPDATE telegram_accounts SET deleted_at=NULL WHERE id=$1",[account]);
    await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])",[ids]);ids.length=0;
    await add(2);
    const allResponse=await create({telegramAccountId:undefined}),all=await allResponse.json() as any;
    check(allResponse.status===202&&all.defaultStatus==="pending","E2E_TEMPLATE_JOB_DEFAULT_DEFERRED");
    const settings=await getSystemSettings();
    await updateSystemSettings({...settings,registrationEnabled:!settings.registrationEnabled},adminId);
    await processTemplateJobs(100);
    const finished=await read(all.id),after=await getSystemSettings();
    check(finished.defaultStatus==="updated"&&after.postJoinCampaign.templateId===template,"E2E_TEMPLATE_JOB_DEFAULT_ONCE");
    check(after.registrationEnabled===!settings.registrationEnabled,"E2E_TEMPLATE_JOB_SETTINGS_NOT_CLOBBERED");
    await updateSystemSettings({...after,postJoinCampaign:{...after.postJoinCampaign,templateId:null}},adminId);
    await processTemplateJobs(3);
    check((await getSystemSettings()).postJoinCampaign.templateId===null,"E2E_TEMPLATE_JOB_COMPLETION_NOT_REPLAYED");
    const changed=await(await create({telegramAccountId:undefined})).json() as any;
    await pool.query("UPDATE message_templates SET content='changed after all-account acceptance' WHERE id=$1",[template]);
    await processTemplateJobs(100);
    check((await read(changed.id)).defaultStatus==="skipped","E2E_TEMPLATE_JOB_CHANGED_DEFAULT_SKIPPED");
    // A regular customer can update only their own automatic campaigns.
    const sharedBefore=await getSystemSettings();
    for(const ownAccount of ownAccounts)
      await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status) VALUES($1,$2,'customer fixture','disconnected')",[ownAccount,userId]);
    await pool.query("INSERT INTO message_templates(id,owner_user_id,name,content,mode) VALUES($1,$2,'customer fixture','customer-new','text')",[ownTemplate,userId]);
    for(const [index,status,name] of [[0,"draft","Tự động customer A"],[0,"queued","Tự động customer A2"],[1,"running","Tự động customer B"],[0,"completed","Tự động completed"],[0,"draft","Manual customer"]] as const){
      const row=await pool.query("INSERT INTO campaigns(owner_user_id,telegram_account_id,name,status,content) VALUES($1,$2,$3,$4,'customer-original') RETURNING id",
        [userId,ownAccounts[index],name,status]);ownCampaigns.push(row.rows[0].id);
    }
    const ownCreate=(extra={})=>request(base,userCookie,{templateId:ownTemplate,requestId:randomUUID(),...extra});
    check((await ownCreate({telegramAccountId:account})).status===404,"E2E_TEMPLATE_CUSTOMER_FOREIGN_ACCOUNT");
    check((await ownCreate({templateId:template,telegramAccountId:ownAccounts[0]})).status===404,"E2E_TEMPLATE_CUSTOMER_FOREIGN_TEMPLATE");
    const selectedResponse=await ownCreate({telegramAccountId:ownAccounts[0]}),selected=await selectedResponse.json() as any;
    check(selectedResponse.status===202&&selected.total===2,"E2E_TEMPLATE_CUSTOMER_ACCOUNT_ACCEPTED");
    await processTemplateJobs(12);
    const ownRead=async(id:string)=>(await(await request(`${base}/jobs/${id}`,userCookie)).json()) as any;
    check((await ownRead(selected.id)).status==="completed","E2E_TEMPLATE_CUSTOMER_ACCOUNT_COMPLETED");
    const otherAccount=await pool.query("SELECT content FROM campaigns WHERE id=$1",[ownCampaigns[2]]);
    check(otherAccount.rows[0].content==="customer-original","E2E_TEMPLATE_CUSTOMER_ACCOUNT_SCOPE");
    // Client-supplied privilege fields must not grant access to shared defaults.
    const allOwnResponse=await ownCreate({updateGlobalDefault:true,owner:adminId}),allOwn=await allOwnResponse.json() as any;
    check(allOwnResponse.status===202&&allOwn.total===3&&allOwn.defaultStatus==="not_applicable","E2E_TEMPLATE_CUSTOMER_ALL_ACCEPTED");
    await processTemplateJobs(12);
    const ownDone=await ownRead(allOwn.id);
    check(ownDone.status==="completed"&&ownDone.updatedCount===3&&ownDone.defaultStatus==="not_applicable","E2E_TEMPLATE_CUSTOMER_ALL_COMPLETED");
    const matching=await pool.query("SELECT count(*)::int n FROM campaigns WHERE id=ANY($1::uuid[]) AND content='customer-new'",[ownCampaigns]);
    check(matching.rows[0].n===3,"E2E_TEMPLATE_CUSTOMER_ELIGIBLE_ONLY");
    assert.deepEqual(await getSystemSettings(),sharedBefore,"E2E_TEMPLATE_CUSTOMER_SHARED_DEFAULT_PROTECTED");
    check((await request(`${base}/jobs/${allOwn.id}`,adminCookie)).status===404,"E2E_TEMPLATE_CUSTOMER_JOB_PRIVATE");
    console.log("E2E_TEMPLATE_CUSTOMER_ACCESS_PASSED");
    console.log("E2E_TEMPLATE_JOBS_PASSED");
  }finally{
    await updateSystemSettings(original,adminId);
    await pool.query("DELETE FROM system_settings WHERE key LIKE $1",[`campaign_template_job:${adminId}:%`]);
    await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])",[ids]);
    await pool.query("DELETE FROM message_templates WHERE id=$1",[template]);
    await pool.query("DELETE FROM telegram_accounts WHERE id=$1",[account]);
    await pool.query("DELETE FROM system_settings WHERE key LIKE $1",[`campaign_template_job:${userId}:%`]);
    await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])",[ownCampaigns]);
    await pool.query("DELETE FROM message_templates WHERE id=$1",[ownTemplate]);
    await pool.query("DELETE FROM telegram_accounts WHERE id=ANY($1::uuid[])",[ownAccounts]);
  }
}
