import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, campaignsTable, campaignTargetsTable, destinationsTable, telegramAccountsTable } from "@workspace/db";
import { blockCampaignDestinations } from "./campaign-destination-blocks";
import type { RerunAssessment } from "./campaign-rerun-assessment";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Called only for an explicitly confirmed rerun. Unknown groups are retained.
 * Account-scoped fences prevent automatic jobs from recreating excluded peers. */
export async function pruneUnavailableRerunGroups(
  tx:Tx,campaign:typeof campaignsTable.$inferSelect,assessment:RerunAssessment,jobId:string,
){
  const invalid=new Set(assessment.groups.filter(group=>group.category==="invalid").map(group=>group.id));
  if(!invalid.size||!campaign.telegramAccountId)return{deleted:false,removedDestinationCount:0};
  const [account]=await tx.select().from(telegramAccountsTable).where(and(
    eq(telegramAccountsTable.id,campaign.telegramAccountId),
    eq(telegramAccountsTable.ownerUserId,campaign.ownerUserId),isNull(telegramAccountsTable.deletedAt)));
  if(!account)return{deleted:false,removedDestinationCount:0};
  const groups=await tx.select({id:destinationsTable.id,telegramId:destinationsTable.telegramId,title:destinationsTable.title})
    .from(destinationsTable).where(and(eq(destinationsTable.accountId,account.id),inArray(destinationsTable.id,[...invalid])));
  if(!groups.length)return{deleted:false,removedDestinationCount:0};
  await blockCampaignDestinations(tx,{owner:campaign.ownerUserId,account,groups,previewId:jobId});
  const selected=campaign.destinationIds?.length?campaign.destinationIds:assessment.groups.map(group=>group.id);
  const retained=[...new Set(selected.filter(id=>!invalid.has(id)))];
  if(!retained.length){
    await tx.delete(campaignsTable).where(and(eq(campaignsTable.id,campaign.id),eq(campaignsTable.ownerUserId,campaign.ownerUserId)));
    return{deleted:true,removedDestinationCount:groups.length};
  }
  await tx.update(campaignsTable).set({destinationIds:retained,updatedAt:new Date()})
    .where(and(eq(campaignsTable.id,campaign.id),eq(campaignsTable.ownerUserId,campaign.ownerUserId)));
  await tx.update(campaignTargetsTable).set({status:"cancelled",lastError:"CAMPAIGN_DESTINATION_BLOCKED",
    nextAttemptAt:null,quotaReservedAt:null,updatedAt:new Date()}).where(and(
      eq(campaignTargetsTable.campaignId,campaign.id),eq(campaignTargetsTable.status,"pending"),
      inArray(campaignTargetsTable.destinationId,[...invalid])));
  return{deleted:false,removedDestinationCount:groups.length};
}
