import {and,eq,sql} from "drizzle-orm";
import {campaignsTable,campaignTargetsTable,telegramAccountsTable} from "@workspace/db";
import {enqueueOperation,registerOperation,type OperationTx,type OperationJob} from "./operations";
type Campaign=typeof campaignsTable.$inferSelect;
export async function enqueueLargeResume(tx:OperationTx,campaign:Campaign,resumedAt:Date){
  const [locked]=await tx.select().from(campaignsTable).where(and(eq(campaignsTable.id,campaign.id),eq(campaignsTable.ownerUserId,campaign.ownerUserId))).for("update");
  if(!locked||["deletion_pending","preparing_targets"].includes(locked.pauseReason??""))throw Error("OPERATION_IN_PROGRESS");
  const stats=await tx.execute(sql`SELECT count(*) AS count,min(next_attempt_at) AS earliest FROM campaign_targets
    WHERE campaign_id=${campaign.id}::uuid AND status='pending' AND last_error IS NULL AND next_attempt_at IS NOT NULL`);
  const stat=stats.rows[0] as {count:string;earliest:Date|null};
  if(Number(stat.count)<=1000)return null;
  const shift=stat.earliest?Math.max(0,resumedAt.getTime()-new Date(stat.earliest).getTime()):0;
  await tx.update(campaignsTable).set({status:"draft",pauseReason:"preparing_targets",updatedAt:new Date()}).where(eq(campaignsTable.id,campaign.id));
  return enqueueOperation(tx,{owner:campaign.ownerUserId,kind:"prepare_campaign",campaignId:campaign.id,label:campaign.name,unit:"deliveries",
    payload:{mode:"retime",total:shift>0?Number(stat.count):0,shift,resumedAt:resumedAt.toISOString(),cursor:null,
      clearPast:!!campaign.scheduledAt&&campaign.scheduledAt<=resumedAt,finalStatus:"queued"}});
}
export async function enqueuePreparation(tx:OperationTx,campaign:Campaign,destinationIds:string[],startAt:Date,
  finalStatus:string,remaining?:ReadonlyMap<string,number>,reset?:"all"|"pending"){
  const [locked]=await tx.select().from(campaignsTable).where(and(eq(campaignsTable.id,campaign.id),eq(campaignsTable.ownerUserId,campaign.ownerUserId))).for("update");
  if(!locked||locked.pauseReason==="deletion_pending")throw Error("OPERATION_SOURCE_DELETED");
  if(locked.telegramAccountId){
    const [account]=await tx.select().from(telegramAccountsTable).where(and(eq(telegramAccountsTable.id,locked.telegramAccountId),eq(telegramAccountsTable.ownerUserId,locked.ownerUserId))).for("update");
    if(!account||account.deletedAt)throw Error("OPERATION_SOURCE_DELETED");
  }
  const counts=Object.fromEntries(destinationIds.map(id=>[id,remaining?.get(id)??campaign.repeatCount]));
  const total=Object.values(counts).reduce((n,v)=>n+v,0);
  await tx.update(campaignsTable).set({status:"draft",pauseReason:"preparing_targets",updatedAt:new Date()}).where(eq(campaignsTable.id,campaign.id));
  return enqueueOperation(tx,{owner:campaign.ownerUserId,kind:"prepare_campaign",campaignId:campaign.id,label:campaign.name,unit:"deliveries",
    payload:{destinationIds,counts,left:total,total,nextAt:startAt.toISOString(),order:0,wait:0,index:0,roundIds:null,
      timingMode:campaign.timingMode,groupGap:campaign.delayMinSeconds,min:campaign.roundDelayMinSeconds,max:campaign.roundDelayMaxSeconds,finalStatus,reset}});
}
/** Checkpoint the sampler and cursor after each 500 rows; never replay earlier random draws. */
export function nextPreparationChunk(p:Record<string,any>,campaignId:string,draw=Math.random){
  const rows:(typeof campaignTargetsTable.$inferInsert)[]=[];
  while(rows.length<500&&p.left>0){
    p.roundIds??=p.destinationIds.filter((id:string)=>p.counts[id]>0);
    if(!p.roundIds.length)throw Error("OPERATION_INVALID_PREPARATION");
    const id=p.roundIds[p.index];
    rows.push({campaignId,destinationId:id,status:"pending",attempts:0,quotaReservedAt:null,
      nextAttemptAt:new Date(p.nextAt),lastError:null,sentMessageId:null,sentAt:null,
      ...(p.timingMode==="round"?{deliveryOrder:p.order,waitBeforeSeconds:p.wait}:{})});
    p.order++;p.index++;p.counts[id]--;p.left--;
    if(p.left>0){
      p.wait=p.timingMode==="round"&&p.index<p.roundIds.length
        ?(p.destinationIds.length>1?p.groupGap:0):p.min+Math.floor(draw()*(p.max-p.min+1));
      p.nextAt=new Date(new Date(p.nextAt).getTime()+p.wait*1000).toISOString();
    }
    if(p.index===p.roundIds.length){p.index=0;p.roundIds=null;}
  }
  return rows;
}
registerOperation("prepare_campaign",async(tx,job)=>{
  const [campaign]=await tx.select().from(campaignsTable).where(and(eq(campaignsTable.id,job.campaignId!),eq(campaignsTable.ownerUserId,job.owner))).for("update");
  const [account]=campaign?.telegramAccountId?await tx.select({deletedAt:telegramAccountsTable.deletedAt}).from(telegramAccountsTable).where(eq(telegramAccountsTable.id,campaign.telegramAccountId)):[];
  if(!campaign||campaign.pauseReason==="deletion_pending"||account?.deletedAt){job.phase="cancelled";return true;}
  if(campaign.pauseReason!=="preparing_targets")throw Error("OPERATION_PREPARATION_CHANGED");
  const p=job.payload;job.total=p.total;
  if(p.mode==="retime"){
    job.phase="retiming";
    const selected=p.shift>0?await tx.execute(sql`SELECT id FROM campaign_targets WHERE campaign_id=${campaign.id}::uuid
      AND status='pending' AND last_error IS NULL AND next_attempt_at IS NOT NULL
      AND (${p.cursor??null}::uuid IS NULL OR id>${p.cursor??null}::uuid) ORDER BY id LIMIT 500 FOR UPDATE`):{rows:[]};
    const ids=selected.rows.map(row=>(row as {id:string}).id);
    if(ids.length){
      const updated=await tx.execute(sql`UPDATE campaign_targets SET next_attempt_at=next_attempt_at+${p.shift}*interval '1 millisecond',
        updated_at=${p.resumedAt}::timestamptz WHERE id=ANY(${sql.param(ids)}::uuid[]) RETURNING id`);
      p.cursor=ids[ids.length-1];job.processed+=updated.rows.length;return false;
    }
    await tx.update(campaignsTable).set({status:"queued",pauseReason:null,updatedAt:new Date(p.resumedAt),
      ...(p.clearPast?{scheduledAt:null}:{})}).where(eq(campaignsTable.id,campaign.id));
    return true;
  }
  if(p.reset){
    job.phase="reset";
    const removed=await tx.execute(sql`DELETE FROM campaign_targets WHERE id IN(
      SELECT id FROM campaign_targets WHERE campaign_id=${campaign.id}::uuid
        AND (${p.reset==="all"} OR status IN ('pending','failed','requires_review','cancelled')) ORDER BY id LIMIT 1500) RETURNING id`);
    job.stageProcessed=(job.stageProcessed??0)+removed.rows.length;
    if(removed.rows.length)return false;
    p.reset=null;
  }
  job.phase="preparing";
  const rows=nextPreparationChunk(p,campaign.id);
  if(rows.length)await tx.insert(campaignTargetsTable).values(rows);
  job.processed+=rows.length;
  if(p.left>0)return false;
  await tx.update(campaignsTable).set({status:p.finalStatus as Campaign["status"],pauseReason:null,updatedAt:new Date()}).where(and(eq(campaignsTable.id,campaign.id),eq(campaignsTable.pauseReason,"preparing_targets")));
  return true;
});
