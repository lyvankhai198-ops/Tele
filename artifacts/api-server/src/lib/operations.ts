import {randomUUID,createHash} from "node:crypto";
import {and,eq,inArray,like,notInArray,sql} from "drizzle-orm";
import {db,systemSettingsTable,telegramAccountsTable,campaignsTable} from "@workspace/db";
import {logger} from "./logger";
import {campaignListScope} from "./campaign-list-scope";
export type OperationTx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export type OperationKind="delete_account"|"delete_campaigns"|"sync_groups"|"prepare_campaign";
export type OperationJob={
  id:string;owner:string;kind:OperationKind;label:string;accountId?:string;campaignId?:string;
  state:"queued"|"running"|"completed"|"failed";phase:string;processed:number;total:number|null;
  stageProcessed?:number;
  unit:"records"|"groups"|"deliveries";error:string|null;createdAt:string;updatedAt:string;
  fingerprint:string;payload:Record<string,any>;
};
const prefix="telecamp_operation:";
const key=(owner:string,id:string)=>`${prefix}${owner}:${id}`;
const handlers=new Map<OperationKind,(tx:OperationTx,job:OperationJob)=>Promise<boolean>>();
export const operationSummary=({payload,fingerprint,owner,...summary}:OperationJob)=>summary;
export function registerOperation(kind:OperationKind,handler:(tx:OperationTx,job:OperationJob)=>Promise<boolean>){handlers.set(kind,handler);}
export async function saveOperation(tx:OperationTx,job:OperationJob){
  job.updatedAt=new Date().toISOString();
  await tx.update(systemSettingsTable).set({value:JSON.stringify(job),updatedAt:new Date()}).where(eq(systemSettingsTable.key,key(job.owner,job.id)));
}
export async function enqueueOperation(tx:OperationTx,input:{
  owner:string;kind:OperationKind;label:string;accountId?:string;campaignId?:string;
  payload?:Record<string,any>;requestId?:string;unit?:OperationJob["unit"];
}){
  await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
  await tx.execute(sql`SET LOCAL statement_timeout='6s'`);
  const fingerprint=createHash("sha256").update(JSON.stringify([input.kind,input.accountId,input.campaignId,input.payload??{}])).digest("hex");
  // Serialize identical requests, not every operation belonging to this owner.
  // A broad owner lock can invert the account-row lock used by campaign creation.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"operation:"+input.owner+":"+fingerprint}))`);
  if(input.requestId&&!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId))throw Error("OPERATION_INVALID_REQUEST");
  const existing=await tx.select().from(systemSettingsTable).where(and(like(systemSettingsTable.key,`${prefix}${input.owner}:%`),
    sql`(${systemSettingsTable.key}=${key(input.owner,input.requestId??"")}
      OR (${systemSettingsTable.value}::jsonb->>'fingerprint'=${fingerprint}
        AND (${systemSettingsTable.value}::jsonb->>'state'<>'completed' OR ${input.kind==="delete_account"})))`));
  for(const row of existing){
    const old=JSON.parse(row.value) as OperationJob;
    if(old.id===input.requestId){if(old.fingerprint!==fingerprint)throw Error("OPERATION_REQUEST_CHANGED");return old;}
    if(old.fingerprint===fingerprint&&(old.state!=="completed"||input.kind==="delete_account"))return old;
  }
  if(input.kind==="delete_campaigns"&&input.campaignId){
    const [campaign]=await tx.select().from(campaignsTable).where(and(eq(campaignsTable.id,input.campaignId),eq(campaignsTable.ownerUserId,input.owner))).for("update");
    if(!campaign)throw Error("OPERATION_NOT_FOUND");
    if(["queued","running"].includes(campaign.status))throw Error("OPERATION_STOP_CAMPAIGN_FIRST");
  }
  if(input.accountId){
    const [account]=await tx.select().from(telegramAccountsTable).where(and(eq(telegramAccountsTable.id,input.accountId),eq(telegramAccountsTable.ownerUserId,input.owner))).for("update");
    if(!account||account.deletedAt)throw Error("OPERATION_NOT_FOUND");
    if(input.kind==="delete_account"){
      await tx.update(telegramAccountsTable).set({deletedAt:new Date(),status:"saved",sessionEncrypted:null,updatedAt:new Date()}).where(eq(telegramAccountsTable.id,account.id));
    }
  }
  const now=new Date().toISOString();
  const payload={...(input.payload??{})};
  if(input.kind==="delete_campaigns"){
    const snapshot=await tx.select({id:campaignsTable.id}).from(campaignsTable).where(and(campaignListScope(input.owner,payload),
      notInArray(campaignsTable.status,["queued","running"]),...(input.campaignId?[eq(campaignsTable.id,input.campaignId)]:[]),
      ...(Array.isArray(payload.selectedCampaignIds)?[inArray(campaignsTable.id,payload.selectedCampaignIds)]:[])));
    payload.snapshotIds=snapshot.map(row=>row.id);
    if(Array.isArray(payload.selectedCampaignIds)&&payload.snapshotIds.length!==new Set(payload.selectedCampaignIds).size){
      throw Error("OPERATION_SELECTION_CHANGED");
    }
  }
  const job:OperationJob={id:input.requestId??randomUUID(),owner:input.owner,kind:input.kind,label:input.label,
    ...(input.accountId?{accountId:input.accountId}:{}),...(input.campaignId?{campaignId:input.campaignId}:{}),
    state:"queued",phase:"queued",processed:0,total:null,unit:input.unit??"records",error:null,createdAt:now,updatedAt:now,
    fingerprint,payload};
  await tx.insert(systemSettingsTable).values({key:key(job.owner,job.id),value:JSON.stringify(job)});
  return job;
}
export async function listOperations(owner:string){
  const rows=await db.select({value:sql<string>`(${systemSettingsTable.value}::jsonb-'payload'-'fingerprint'-'owner')::text`})
    .from(systemSettingsTable).where(like(systemSettingsTable.key,`${prefix}${owner}:%`));
  const jobs=rows.map(row=>JSON.parse(row.value) as ReturnType<typeof operationSummary>).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return [...jobs.filter(j=>j.state!=="completed"),...jobs.filter(j=>j.state==="completed").slice(0,5)];
}
export async function retryOperation(owner:string,id:string){
  return db.transaction(async tx=>{
    const [row]=await tx.select().from(systemSettingsTable).where(eq(systemSettingsTable.key,key(owner,id))).for("update");
    if(!row)return null;
    const job=JSON.parse(row.value) as OperationJob;
    if(job.state==="failed"){job.state="queued";job.error=null;await saveOperation(tx,job);}
    return operationSummary(job);
  });
}
export async function failOperation(owner:string,id:string,code="OPERATION_RETRY_REQUIRED",token?:string){
  await db.execute(sql`UPDATE system_settings SET value=jsonb_set(jsonb_set(value::jsonb,'{state}','"failed"'::jsonb),'{error}',to_jsonb(${code}::text))::text,updated_at=now()
    WHERE key=${key(owner,id)} AND value::jsonb->>'state' IN ('queued','running')
      AND (${token??null}::text IS NULL OR value::jsonb->'payload'->>'token'=${token??null})`);
}
export function operationErrorCode(error:unknown):string{
  let value=error as {code?:unknown;cause?:unknown}|undefined;
  for(let depth=0;depth<5&&value;depth++,value=value.cause as typeof value){
    if(typeof value.code==="string"&&/^(?:[0-9A-Z]{5}|ECONNRESET|ETIMEDOUT|ECONNREFUSED)$/.test(value.code))return value.code;
  }
  return "OPERATION_STEP_FAILED";
}
export function isAutomaticDeletionRetry(code:string){
  return ["55P03","57014","40P01","40001","53300","57P01","ECONNRESET","ETIMEDOUT","ECONNREFUSED"].includes(code)||code.startsWith("08");
}
async function postponeDeletion(owner:string,id:string,code:string){
  await db.execute(sql`UPDATE system_settings SET value=(value::jsonb||jsonb_build_object(
    'state','queued','error','OPERATION_AUTO_RETRY','updatedAt',${new Date().toISOString()}::text,
    'payload',(value::jsonb->'payload')||jsonb_build_object(
      'retryCount',COALESCE((value::jsonb->'payload'->>'retryCount')::int,0)+1,
      'retryAfter',${Date.now()}::bigint+LEAST(15000,2000*(COALESCE((value::jsonb->'payload'->>'retryCount')::int,0)+1)),
      'groupChunk',CASE WHEN ${code}='57014' THEN GREATEST(1,COALESCE((value::jsonb->'payload'->>'groupChunk')::int,5)/2)
        ELSE COALESCE((value::jsonb->'payload'->>'groupChunk')::int,5) END
    )))::text,updated_at=now() WHERE key=${key(owner,id)}
      AND value::jsonb->>'kind' IN('delete_account','delete_campaigns')
      AND value::jsonb->>'state' IN('queued','running')`);
}
export async function recoverDeletionOperations(){
  // These requests were already explicitly confirmed. Resume their saved
  // checkpoints after deployment, without creating another deletion request.
  await db.execute(sql`UPDATE system_settings SET value=(value::jsonb||jsonb_build_object(
    'state','queued','error',NULL,'updatedAt',${new Date().toISOString()}::text))::text,updated_at=now()
    WHERE key LIKE ${prefix+"%"} AND value::jsonb->>'kind' IN('delete_account','delete_campaigns')
      AND value::jsonb->>'state'='failed' AND value::jsonb->>'error'='OPERATION_RETRY_REQUIRED'`);
}
let busy=false,timer:ReturnType<typeof setInterval>|undefined;
export async function processOperations(steps=1){
  if(busy)return;busy=true;
  try{for(let i=0;i<steps;i++){
    let identity:{owner:string;id:string;kind:OperationKind}|undefined;
    try{
      const worked=await db.transaction(async tx=>{
        await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
        await tx.execute(sql`SET LOCAL statement_timeout='6s'`);
        const rows=await tx.execute(sql`SELECT value FROM system_settings WHERE key LIKE ${prefix+"%"}
          AND value::jsonb->>'state' IN ('queued','running') AND value::jsonb->>'kind'<>'sync_groups'
          AND COALESCE((value::jsonb->'payload'->>'retryAfter')::bigint,0)<=${Date.now()}::bigint
          ORDER BY updated_at,key LIMIT 1 FOR UPDATE SKIP LOCKED`);
        if(!rows.rows.length)return false;
        const job=JSON.parse((rows.rows[0] as {value:string}).value) as OperationJob;
        identity={owner:job.owner,id:job.id,kind:job.kind};
        const handler=handlers.get(job.kind);if(!handler)throw Error("OPERATION_HANDLER_MISSING");
        job.state="running";job.error=null;delete job.payload.retryAfter;delete job.payload.retryCount;
        if(await handler(tx,job)){
          job.state="completed";
          if(job.phase==="cancelled")job.total=null;
          else{job.phase="completed";if(job.total===null)job.total=job.processed;}
        }
        await saveOperation(tx,job);return true;
      });
      if(!worked)break;
    }catch(error){
      const code=operationErrorCode(error);
      if(identity){
        const automatic=["delete_account","delete_campaigns"].includes(identity.kind)&&isAutomaticDeletionRetry(code);
        await (automatic?postponeDeletion(identity.owner,identity.id,code):failOperation(identity.owner,identity.id)).catch(()=>{});
      }
      logger.warn({operationId:identity?.id,code},"Background operation will recover from its saved checkpoint");
      break;
    }
  }}finally{busy=false;}
}
export function startOperationWorker(){if(timer)return;void recoverDeletionOperations().then(()=>processOperations()).catch(()=>{});
  timer=setInterval(()=>void processOperations(2),1000);}
export const operationKey=key;
