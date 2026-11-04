import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db, campaignsTable, campaignTargetsTable, destinationsTable, telegramAccountsTable,
  systemSettingsTable } from "@workspace/db";
import { assessCampaignRerun, type RerunAssessment, type RerunDestinationEvidence } from "./campaign-rerun-assessment";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Campaign = typeof campaignsTable.$inferSelect;
export type RerunPolicy = { onlySendable: boolean; autoDeleteInvalid: boolean; jobId: string };
export type RerunReport = RerunAssessment & {
  id: string; name: string; reviewedAt: string; deleted: boolean; removedDestinationCount: number;
};
const policyKey = (owner:string,id:string)=>`campaign_rerun_policy:${owner}:${id}`;
const reportPrefix = (owner:string,jobId:string)=>`campaign_rerun_review:${owner}:${jobId}:`;

export async function campaignRerunAssessment(tx: Tx, campaign: Campaign): Promise<RerunAssessment> {
  const [account] = campaign.telegramAccountId ? await tx.select({
    id:telegramAccountsTable.id, status:telegramAccountsTable.status, session:telegramAccountsTable.sessionEncrypted,
  }).from(telegramAccountsTable).where(and(eq(telegramAccountsTable.id,campaign.telegramAccountId),
    eq(telegramAccountsTable.ownerUserId,campaign.ownerUserId),isNull(telegramAccountsTable.deletedAt))) : [];
  const counts = await tx.select({
    id:campaignTargetsTable.destinationId,
    pending:sql<number>`count(*) filter (where status='pending')::int`,
    sending:sql<number>`count(*) filter (where status='sending')::int`,
    uncertain:sql<number>`count(*) filter (where status='requires_review')::int`,
    sent:sql<number>`count(*) filter (where status='sent')::int`,
    failed:sql<number>`count(*) filter (where status='failed')::int`,
    cancelled:sql<number>`count(*) filter (where status='cancelled')::int`,
    attempted:sql<number>`count(*) filter (where attempts>0)::int`,
    lastSentAt:sql<Date|null>`max(coalesce(sent_at,updated_at)) filter (where status='sent')`,
    lastFailedAt:sql<Date|null>`max(updated_at) filter (where status='failed')`,
  }).from(campaignTargetsTable).where(eq(campaignTargetsTable.campaignId,campaign.id))
    .groupBy(campaignTargetsTable.destinationId);
  const ids = [...new Set(campaign.destinationIds?.length ? campaign.destinationIds : counts.map(c=>c.id))];
  const rows = ids.length && account ? await tx.select().from(destinationsTable).where(and(
    inArray(destinationsTable.id,ids),eq(destinationsTable.accountId,account.id))).for("share") : [];
  const evidence: RerunDestinationEvidence[] = ids.map(id=>{
    const g=rows.find(row=>row.id===id), c=counts.find(row=>row.id===id);
    return { id,title:g?.title ?? id,exists:Boolean(g),canPost:g?.canPost ?? false,
      permissionReason:g?.permissionReason ?? null,permissionCheckedAt:g?.permissionCheckedAt ?? null,
      restrictedUntil:g?.restrictedUntil ?? null,pending:c?.pending ?? 0,sending:c?.sending ?? 0,
      uncertain:c?.uncertain ?? 0,sent:c?.sent ?? 0,failed:c?.failed ?? 0,cancelled:c?.cancelled ?? 0,
      attempted:c?.attempted ?? 0,
      lastSentAt:c?.lastSentAt ? new Date(c.lastSentAt) : null,
      lastFailedAt:c?.lastFailedAt ? new Date(c.lastFailedAt) : null };
  });
  // An ambiguous historical target cannot be hidden by editing destinationIds.
  for (const c of counts.filter(c=>!ids.includes(c.id) && (c.uncertain || c.sending))) {
    evidence.push({id:c.id,title:c.id,exists:false,canPost:false,permissionReason:null,
      permissionCheckedAt:null,restrictedUntil:null,pending:c.pending,sending:c.sending,uncertain:c.uncertain,
      sent:c.sent,failed:c.failed,cancelled:c.cancelled,attempted:c.attempted,lastSentAt:null,lastFailedAt:null});
  }
  const result=assessCampaignRerun({connected:Boolean(account?.status==="connected" && account.session),
    groups:evidence,terminal:["completed","completed_with_errors","cancelled"].includes(campaign.status)});
  const sentCount=counts.reduce((n,c)=>n+c.sent,0);
  return {...result,sentCount,failedCount:counts.reduce((n,c)=>n+c.failed,0),
    targetCount:counts.reduce((n,c)=>n+c.sent+c.failed+c.cancelled+c.pending+c.sending+c.uncertain,0),
    canDelete:result.canDelete && sentCount===0 && counts.every(c=>!c.pending && !c.sending && !c.uncertain)};
}

export async function saveRerunPolicy(tx:Tx, owner:string, id:string, policy:RerunPolicy) {
  await tx.insert(systemSettingsTable).values({key:policyKey(owner,id),value:JSON.stringify({...policy,reviewed:false})})
    .onConflictDoUpdate({target:systemSettingsTable.key,set:{value:JSON.stringify({...policy,reviewed:false}),updatedAt:new Date()}});
}

export async function reviewFinishedRerun(campaignId:string) {
  return db.transaction(async tx=>{
    const [campaign]=await tx.select().from(campaignsTable).where(eq(campaignsTable.id,campaignId)).for("update");
    if (!campaign || !["completed","completed_with_errors","cancelled"].includes(campaign.status)) return;
    const key=policyKey(campaign.ownerUserId,campaign.id);
    const [row]=await tx.select().from(systemSettingsTable).where(eq(systemSettingsTable.key,key)).for("update");
    if (!row) return;
    const policy=JSON.parse(row.value) as RerunPolicy & {reviewed:boolean};
    if (policy.reviewed) return;
    const assessment=await campaignRerunAssessment(tx,campaign);
    const pending=await tx.select({id:campaignTargetsTable.id}).from(campaignTargetsTable).where(and(
      eq(campaignTargetsTable.campaignId,campaign.id),inArray(campaignTargetsTable.status,["pending","sending"]))).limit(1);
    if (pending.length) return;
    const invalidIds=assessment.groups.filter(g=>g.category==="invalid").map(g=>g.id);
    let deleted=false, removedDestinationCount=0;
    if (policy.autoDeleteInvalid && assessment.canDelete) {
      await tx.delete(campaignsTable).where(and(eq(campaignsTable.id,campaign.id),
        eq(campaignsTable.ownerUserId,campaign.ownerUserId)));
      deleted=true;
    } else if (policy.autoDeleteInvalid && invalidIds.length && assessment.category!=="review"
      && assessment.groups.some(g=>g.category!=="invalid")) {
      // Retain sent/error history. Only detach confirmed-unavailable destinations
      // from this campaign, never remove globally synced groups or other campaigns.
      const kept=assessment.groups.filter(g=>!invalidIds.includes(g.id)).map(g=>g.id);
      await tx.update(campaignsTable).set({destinationIds:kept,updatedAt:new Date()})
        .where(and(eq(campaignsTable.id,campaign.id),eq(campaignsTable.ownerUserId,campaign.ownerUserId)));
      removedDestinationCount=invalidIds.length;
    }
    const report:RerunReport={...assessment,id:campaign.id,name:campaign.name,reviewedAt:new Date().toISOString(),
      deleted,removedDestinationCount};
    await tx.insert(systemSettingsTable).values({
      key:reportPrefix(campaign.ownerUserId,policy.jobId)+campaign.id,value:JSON.stringify(report),
    }).onConflictDoNothing();
    await tx.update(systemSettingsTable).set({value:JSON.stringify({...policy,reviewed:true}),updatedAt:new Date()})
      .where(eq(systemSettingsTable.key,key));
    return report;
  });
}

export async function getRerunReports(owner:string,jobId:string):Promise<RerunReport[]> {
  const rows=await db.select({value:systemSettingsTable.value}).from(systemSettingsTable)
    .where(like(systemSettingsTable.key,reportPrefix(owner,jobId)+"%"));
  return rows.map(row=>JSON.parse(row.value) as RerunReport);
}

/** Recovery after a restart between terminal status and review; no network probes. */
let reviewBusy=false;
export async function processFinishedRerunReviews() {
  if (reviewBusy) return;
  reviewBusy=true;
  try {
  const result=await db.execute(sql`SELECT c.id FROM campaigns c
    JOIN system_settings s ON s.key='campaign_rerun_policy:'||c.owner_user_id||':'||c.id::text
    WHERE c.status IN ('completed','completed_with_errors','cancelled')
      AND s.value::jsonb->>'reviewed'='false'
    ORDER BY c.updated_at LIMIT 5`);
  for (const row of result.rows) await reviewFinishedRerun(String(row.id));
  } finally {reviewBusy=false;}
}
