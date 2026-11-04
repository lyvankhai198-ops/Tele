import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { DEFAULT_SYSTEM_SETTINGS, SYSTEM_SETTINGS_KEY } from "./system-settings";
import { logger } from "./logger";

// Job, campaign mutation, audit and cursor commit together. No Telegram calls.
type Tx = Pick<typeof pool, "query">;
type Template = { id: string; content: string; mode: string; source_account_id: string | null; source_message_id: string | null };
type Job = {
  id: string; owner: string; fingerprint: string; accountId: string | null;
  template: Template; ids: string[]; cursor: number; updatedCount: number;
  skipped: Array<{id: string; name: string; reason: string}>;
  status: "queued" | "running" | "completed" | "failed"; error: string | null;
  defaultStatus: "not_applicable" | "pending" | "updated" | "skipped";
  createdAt: string; finishedAt: string | null;
};
const prefix = "campaign_template_job:";
const key = (owner: string, id: string) => `${prefix}${owner}:${id}`;
const validId = (id: string) => /^[a-zA-Z0-9-]{16,80}$/.test(id);
const lockOwner = async (tx: Tx, owner: string) => {
  const result = await tx.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [`template-job:${owner}`]);
  if (!result.rows[0].locked) throw Error("TEMPLATE_JOB_BUSY");
};
const summary = (job: Job, offset = 0) => ({
  id: job.id, status: job.status, total: job.ids.length, processed: job.cursor,
  updatedCount: job.updatedCount, skippedCount: job.skipped.length,
  skipped: job.skipped.slice(offset, offset + 50), skippedOffset: offset,
  telegramAccountId: job.accountId, templateId: job.template.id,
  defaultStatus: job.defaultStatus, error: job.error, createdAt: job.createdAt, finishedAt: job.finishedAt,
});
async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='8s'");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
async function save(tx: Tx, job: Job) {
  await tx.query("UPDATE system_settings SET value=$2,updated_at=now() WHERE key=$1", [key(job.owner, job.id), JSON.stringify(job)]);
}
export async function createTemplateJob(input: {owner: string; templateId: string; telegramAccountId?: string; requestId?: string}) {
  const id = input.requestId ?? randomUUID();
  if (!validId(id)) throw Error("TEMPLATE_JOB_INVALID_REQUEST");
  const fingerprint = createHash("sha256").update(JSON.stringify([input.templateId,input.telegramAccountId ?? null])).digest("hex");
  return transaction(async tx => {
    await lockOwner(tx, input.owner);
    const existing = await tx.query("SELECT value FROM system_settings WHERE key=$1", [key(input.owner,id)]);
    if (existing.rows[0]) {
      const job = JSON.parse(existing.rows[0].value) as Job;
      if (job.fingerprint !== fingerprint) throw Error("TEMPLATE_JOB_REQUEST_CHANGED");
      return summary(job);
    }
    const active = await tx.query(`SELECT value FROM system_settings WHERE key LIKE $1
      AND value::jsonb->>'status' IN ('queued','running','failed') ORDER BY updated_at DESC LIMIT 1`, [`${prefix}${input.owner}:%`]);
    if (active.rows[0]) {
      const job = JSON.parse(active.rows[0].value) as Job;
      if (job.fingerprint !== fingerprint) throw Error("TEMPLATE_JOB_CONFLICT");
      return summary(job);
    }
    if (input.telegramAccountId) {
      const account = await tx.query("SELECT id FROM telegram_accounts WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL", [input.telegramAccountId,input.owner]);
      if (!account.rows.length) throw Error("TEMPLATE_JOB_ACCOUNT_NOT_FOUND");
    }
    const templates = await tx.query<Template>(`SELECT id,content,mode,source_account_id,source_message_id FROM message_templates
      WHERE id=$1 AND owner_user_id=$2`, [input.templateId,input.owner]);
    if (!templates.rows[0]) throw Error("TEMPLATE_JOB_TEMPLATE_NOT_FOUND");
    // Snapshot just ids and template text, never credentials/sessions. New campaigns
    // created after acceptance deliberately do not enter this operation.
    const candidates = await tx.query(`SELECT id FROM campaigns WHERE owner_user_id=$1 AND name LIKE 'Tự động%'
      AND status IN ('draft','paused','queued','running') AND ($2::uuid IS NULL OR telegram_account_id=$2)
      ORDER BY created_at,id`, [input.owner,input.telegramAccountId ?? null]);
    const job: Job = {id,owner:input.owner,fingerprint,accountId:input.telegramAccountId ?? null,
      template:templates.rows[0],ids:candidates.rows.map(r=>r.id),cursor:0,updatedCount:0,skipped:[],
      status:"queued",error:null,defaultStatus:input.telegramAccountId?"not_applicable":"pending",
      createdAt:new Date().toISOString(),finishedAt:null};
    await tx.query("INSERT INTO system_settings(key,value,updated_by) VALUES($1,$2,$3)", [key(job.owner,id),JSON.stringify(job),input.owner]);
    return summary(job);
  });
}
export async function getTemplateJob(owner: string, id: string, offset = 0) {
  if (!validId(id)) return null;
  const result = await pool.query("SELECT value FROM system_settings WHERE key=$1", [key(owner,id)]);
  return result.rows[0] ? summary(JSON.parse(result.rows[0].value), offset) : null;
}
export async function latestTemplateJob(owner: string) {
  const result = await pool.query(`SELECT value FROM system_settings WHERE key LIKE $1
    ORDER BY (value::jsonb->>'createdAt') DESC,key DESC LIMIT 1`, [`${prefix}${owner}:%`]);
  return result.rows[0] ? summary(JSON.parse(result.rows[0].value)) : null;
}
export async function retryTemplateJob(owner: string, id: string) {
  if (!validId(id)) return null;
  return transaction(async tx => {
    await lockOwner(tx,owner);
    const result = await tx.query("SELECT value FROM system_settings WHERE key=$1 FOR UPDATE", [key(owner,id)]);
    if (!result.rows[0]) return null;
    const job = JSON.parse(result.rows[0].value) as Job;
    if (job.status === "failed") {job.status="queued";job.error=null;await save(tx,job);}
    return summary(job);
  });
}
async function processCampaign(tx: Tx, job: Job, id: string) {
  const selected = await tx.query(`SELECT telegram_account_id FROM campaigns WHERE id=$1 AND owner_user_id=$2`, [id,job.owner]);
  const accountId = job.accountId ?? selected.rows[0]?.telegram_account_id;
  if (!accountId) return {name:"",reason:"missing_account"};
  // Account before campaign, matching deletion lock order. Recheck account id
  // after the campaign lock, including all-account jobs.
  const account = await tx.query(`SELECT id FROM telegram_accounts WHERE id=$1 AND owner_user_id=$2
    AND deleted_at IS NULL FOR SHARE`, [accountId,job.owner]);
  if (!account.rows.length) return {name:"",reason:"account_unavailable"};
  const campaigns = await tx.query(`SELECT id,name,status,telegram_account_id,cloned_from_campaign_id,cloned_from_user_id
    FROM campaigns WHERE id=$1 AND owner_user_id=$2 FOR UPDATE`, [id,job.owner]);
  const campaign = campaigns.rows[0];
  if (!campaign || !campaign.name.startsWith("Tự động") ||
    !["draft","paused","queued","running"].includes(campaign.status) || campaign.telegram_account_id !== accountId) {
    return {name:campaign?.name ?? "",reason:"scope_changed"};
  }
  const template = job.template;
  const current = await tx.query(`SELECT id FROM message_templates WHERE id=$1 AND owner_user_id=$2 FOR SHARE`, [template.id,job.owner]);
  if (!current.rows.length) return {name:campaign.name,reason:"template_unavailable"};
  if (campaign.cloned_from_campaign_id && campaign.cloned_from_user_id !== job.owner && template.mode !== "forward") {
    return {name:campaign.name,reason:"admin_clone_requires_forward"};
  }
  if (template.mode === "forward" && (template.source_account_id !== accountId || !template.source_message_id)) {
    return {name:campaign.name,reason:"forward_account_mismatch"};
  }
  await tx.query(`UPDATE campaigns SET content=$3,template_id=$4,template_mode=$5,
    template_source_account_id=$6,template_source_message_id=$7,updated_at=now() WHERE id=$1 AND owner_user_id=$2`,
  [id,job.owner,template.content,template.id,template.mode,template.mode==="forward"?template.source_account_id:null,
    template.mode==="forward"?template.source_message_id:null]);
  await tx.query(`INSERT INTO activity_logs(owner_user_id,campaign_id,level,event,message,metadata)
    VALUES($1,$2,'success','campaign.bulk_template_updated','Updated automatic campaign template',$3)`,
  [job.owner,id,JSON.stringify({jobId:job.id,templateId:template.id,telegramAccountId:job.accountId})]);
  return {name:campaign.name,reason:null};
}
async function finalize(tx: Tx, job: Job) {
  if (job.defaultStatus === "pending") {
    // No stale read/write of unrelated settings; default+completion share the
    // same transaction. A changed/deleted template never becomes a live default.
    const result = await tx.query<Template>(`SELECT id,content,mode,source_account_id,source_message_id FROM message_templates
      WHERE id=$1 AND owner_user_id=$2 FOR SHARE`, [job.template.id,job.owner]);
    if (JSON.stringify(result.rows[0]) !== JSON.stringify(job.template)) job.defaultStatus="skipped";
    else {
      await tx.query(`INSERT INTO system_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING`,
        [SYSTEM_SETTINGS_KEY,JSON.stringify(DEFAULT_SYSTEM_SETTINGS)]);
      await tx.query(`UPDATE system_settings SET value=jsonb_set(value::jsonb,'{postJoinCampaign}',
        COALESCE(value::jsonb->'postJoinCampaign','{}'::jsonb)||jsonb_build_object('templateId',$2::text))::text,
        updated_by=$3,updated_at=now() WHERE key=$1`, [SYSTEM_SETTINGS_KEY,job.template.id,job.owner]);
      job.defaultStatus="updated";
    }
  }
  job.status="completed";job.finishedAt=new Date().toISOString();job.error=null;
}
export async function processTemplateJobs(maxSteps = 25) {
  for (let step=0;step<maxSteps;step++) {
    let failed: {key:string;cursor:number} | undefined;
    try {
      const processed = await transaction(async tx => {
        const result = await tx.query(`SELECT key,value FROM system_settings WHERE key LIKE $1
          AND value::jsonb->>'status' IN ('queued','running') ORDER BY updated_at,key LIMIT 1 FOR UPDATE SKIP LOCKED`, [`${prefix}%`]);
        if (!result.rows[0]) return false;
        const job = JSON.parse(result.rows[0].value) as Job;
        failed={key:result.rows[0].key,cursor:job.cursor};
        await lockOwner(tx,job.owner);
        // Permission can be revoked after acceptance. Stop rather than complete
        // privileged work under an account no longer authorized as administrator.
        const admin = await tx.query("SELECT id FROM app_users WHERE id=$1 AND role='admin'", [job.owner]);
        if (!admin.rows.length) throw Error("TEMPLATE_JOB_ACCESS_REVOKED");
        if (job.cursor<job.ids.length) {
          const id=job.ids[job.cursor], outcome=await processCampaign(tx,job,id);
          if (outcome.reason) job.skipped.push({id,name:outcome.name,reason:outcome.reason});
          else job.updatedCount++;
          job.cursor++;
        }
        job.status="running";
        if (job.cursor===job.ids.length) await finalize(tx,job);
        await save(tx,job);
        return true;
      });
      if (!processed) break;
    } catch (error) {
      const code=(error as {code?:string}).code;
      if (["55P03","40P01","40001","57014"].includes(code ?? "") || (error as Error).message==="TEMPLATE_JOB_BUSY") break;
      if (failed) await transaction(async tx => {
        const row=await tx.query("SELECT value FROM system_settings WHERE key=$1 FOR UPDATE",[failed!.key]);
        if (!row.rows[0]) return;
        const job=JSON.parse(row.rows[0].value) as Job;
        if (job.status==="completed" || job.cursor!==failed!.cursor) return;
        job.status="failed";job.error="TEMPLATE_JOB_FAILED";await save(tx,job);
      });
      logger.warn("Automatic template job paused; committed progress is preserved");
      break;
    }
  }
}
let timer: ReturnType<typeof setInterval> | undefined;
let busy=false;
export function startTemplateJobWorker() {
  if (timer) return;
  const tick=async()=>{if(busy)return;busy=true;try{await processTemplateJobs();}catch{logger.warn("Template job worker unavailable");}finally{busy=false;}};
  timer=setInterval(()=>{void tick();},1000);timer.unref();void tick();
}
