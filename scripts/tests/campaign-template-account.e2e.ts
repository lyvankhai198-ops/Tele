// Disposable PostgreSQL/HTTP only. No Telegram sessions or customer campaigns.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { getSystemSettings, updateSystemSettings } from "../../artifacts/api-server/src/lib/system-settings";
import { createSupportSession, SUPPORT_COOKIE_NAME } from "../../artifacts/api-server/src/lib/support-session";

export async function testCampaignTemplateAccount(input: {
  adminId: string; userId: string; adminCookie: string; userCookie: string;
  request: (path: string, cookie?: string, body?: unknown, method?: string) => Promise<Response>;
}) {
  console.log("E2E_PHASE_TEMPLATE_ACCOUNT");
  const {adminId, userId, adminCookie, userCookie, request} = input;
  const check = (value: unknown, code: string) => assert.ok(value, code);
  const originalSettings = await getSystemSettings();
  const a = randomUUID(), b = randomUUID(), foreign = randomUUID(), deleted = randomUUID();
  for (const [id, owner] of [[a,adminId],[b,adminId],[foreign,userId],[deleted,adminId]]) {
    await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status) VALUES($1,$2,'template-fixture','disconnected')",[id,owner]);
  }
  await pool.query("UPDATE telegram_accounts SET deleted_at=now() WHERE id=$1",[deleted]);
  const text = randomUUID(), old = randomUUID(), otherTemplate = randomUUID(), forwardA = randomUUID(), incompleteForward = randomUUID();
  for (const [id,owner,mode,source,message] of [
    [text,adminId,"text",null,null],[old,adminId,"text",null,null],
    [otherTemplate,userId,"text",null,null],[forwardA,adminId,"forward",a,"42"],
    [incompleteForward,adminId,"forward",a,null],
  ]) {
    await pool.query(`INSERT INTO message_templates(id,owner_user_id,name,content,mode,source_account_id,source_message_id)
      VALUES($1,$2,'template-fixture','fixture template content',$3,$4,$5)`,[id,owner,mode,source,message]);
  }
  const ids: string[] = [];
  async function campaign(account: string | null, status="draft", name="Tự động: scoped fixture", owner=adminId, adminClone=false) {
    const id=randomUUID();ids.push(id);
    await pool.query(`INSERT INTO campaigns(id,owner_user_id,name,telegram_account_id,status,template_id,content,cloned_from_campaign_id,cloned_from_user_id)
      VALUES($1,$2,$3,$4,$5,$6,'unchanged',$7,$8)`,
    [id,owner,name,account,status,old,adminClone?randomUUID():null,adminClone?userId:null]);
    return id;
  }
  const eligible = await Promise.all(["draft","paused","queued","running"].map(status=>campaign(a,status)));
  const other = await campaign(b);
  const untouched = await Promise.all([
    campaign(a,"completed"),campaign(a,"completed_with_errors"),campaign(a,"failed"),
    campaign(a,"draft","Ordinary campaign"),campaign(foreign,"draft","Tự động: foreign",userId),
  ]);
  const clone = await campaign(a,"paused","Tự động: admin clone",adminId,true);
  const missingAccount = await campaign(null);
  const submit = (templateId: string, accountId?: string, cookie=adminCookie) =>
    request("/campaigns/bulk-template",cookie,{templateId,...(accountId?{telegramAccountId:accountId}:{})});
  const current = async(id:string)=>(await pool.query("SELECT template_id,telegram_account_id FROM campaigns WHERE id=$1",[id])).rows[0];
  try {
    check((await submit(text,a,"")).status===401,"E2E_TEMPLATE_ANON_DENIED");
    check((await submit(text,a,userCookie)).status===403,"E2E_TEMPLATE_USER_DENIED");
    const support=await createSupportSession(adminId,userId);
    check((await submit(text,a,`${adminCookie}; ${SUPPORT_COOKIE_NAME}=${support.token}`)).status===403,"E2E_TEMPLATE_SUPPORT_DENIED");
    check((await submit(text,foreign)).status===404,"E2E_TEMPLATE_FOREIGN_ACCOUNT");
    check((await submit(text,deleted)).status===404,"E2E_TEMPLATE_DELETED_ACCOUNT");
    check((await submit(text,randomUUID())).status===404,"E2E_TEMPLATE_MISSING_ACCOUNT");
    check((await submit(text,"invalid")).status===400,"E2E_TEMPLATE_INVALID_ACCOUNT");
    check((await submit(otherTemplate,a)).status===404,"E2E_TEMPLATE_FOREIGN_TEMPLATE");
    check((await submit(randomUUID(),a)).status===404,"E2E_TEMPLATE_MISSING_TEMPLATE");
    const response=await submit(text,a), result=await response.json() as any;
    check(response.ok && result.updatedCount===4 && result.skipped.some((s:any)=>s.id===clone),"E2E_TEMPLATE_SELECTED_COUNTS");
    for(const id of eligible)check((await current(id)).template_id===text,"E2E_TEMPLATE_ALL_ACTIVE_STATUSES");
    for(const id of [other,...untouched,clone,missingAccount])check((await current(id)).template_id===old,"E2E_TEMPLATE_OTHERS_UNCHANGED");
    assert.deepEqual(await getSystemSettings(),originalSettings,"E2E_TEMPLATE_SHARED_DEFAULT_UNCHANGED");
    const forwards=await submit(forwardA,a);
    check(forwards.ok && (await forwards.json() as any).updatedCount===5,"E2E_TEMPLATE_FORWARD_AND_ADMIN_CLONE");
    const wrong=await submit(forwardA,b), wrongBody=await wrong.json() as any;
    check(wrong.ok && wrongBody.updatedCount===0 && wrongBody.skipped.some((s:any)=>s.id===other),"E2E_TEMPLATE_FORWARD_WRONG_ACCOUNT_SKIPPED");
    check((await current(other)).template_id===old,"E2E_TEMPLATE_WRONG_FORWARD_NOT_WRITTEN");
    const incomplete=await submit(incompleteForward,a), incompleteBody=await incomplete.json() as any;
    check(incomplete.ok && incompleteBody.updatedCount===0 && incompleteBody.skippedCount===5,"E2E_TEMPLATE_FORWARD_MESSAGE_REQUIRED");

    // Hold a campaign while the request selects its candidates. Mutate it
    // before its row lock is acquired: the transaction must recheck the scope.
    async function raceChange(kind:"account"|"status"|"name") {
      const id=await campaign(a);
      const client=await pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM campaigns WHERE id=$1 FOR UPDATE",[id]);
        if(kind==="account")await client.query("UPDATE campaigns SET telegram_account_id=$2 WHERE id=$1",[id,b]);
        if(kind==="status")await client.query("UPDATE campaigns SET status='completed' WHERE id=$1",[id]);
        if(kind==="name")await client.query("UPDATE campaigns SET name='No longer automatic' WHERE id=$1",[id]);
        pending=submit(text,a);
        let blocked=false;
        for(let i=0;i<150;i++){
          blocked=(await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event_type='Lock' AND query LIKE '%campaigns%' AND query LIKE '%FOR UPDATE%' LIMIT 1`)).rows.length>0;
          if(blocked)break;
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        check(blocked,"E2E_TEMPLATE_RACE_LOCK_OBSERVED");
        await client.query("COMMIT");
        const changed=await pending, body=await changed.json() as any;
        check(changed.ok && body.skipped.some((s:any)=>s.id===id),"E2E_TEMPLATE_TRANSACTION_SCOPE_RECHECK");
        check((await current(id)).template_id===old,"E2E_TEMPLATE_RACE_NOT_OVERWRITTEN");
      } finally {
        await client.query("ROLLBACK");client.release();
        if(pending)await pending;
      }
    }
    await raceChange("account");await raceChange("status");await raceChange("name");
    assert.deepEqual(await getSystemSettings(),originalSettings,"E2E_TEMPLATE_SCOPED_NEVER_CHANGES_DEFAULT");
    const all=await submit(text), allBody=await all.json() as any;
    check(all.ok && allBody.updatedCount>=5 && (await current(other)).template_id===text,"E2E_TEMPLATE_LEGACY_ALL_ACCOUNTS");
    check(allBody.skipped.some((s:any)=>s.id===missingAccount) && allBody.skipped.some((s:any)=>s.id===clone),"E2E_TEMPLATE_LEGACY_SKIPS_PRESERVED");
    check((await getSystemSettings()).postJoinCampaign.templateId===text,"E2E_TEMPLATE_LEGACY_SHARED_DEFAULT");
    for(const id of untouched)check((await current(id)).template_id===old,"E2E_TEMPLATE_LEGACY_OWNER_STATUS_PREFIX_PRESERVED");
    console.log("E2E_TEMPLATE_ACCOUNT_PASSED");
  } finally {
    await updateSystemSettings(originalSettings,adminId);
    await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])",[ids]);
    await pool.query("DELETE FROM message_templates WHERE id=ANY($1::uuid[])",[[text,old,otherTemplate,forwardA,incompleteForward]]);
    await pool.query("DELETE FROM telegram_accounts WHERE id=ANY($1::uuid[])",[[a,b,foreign,deleted]]);
  }
}
