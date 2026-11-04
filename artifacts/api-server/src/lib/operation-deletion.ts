import {and,eq,inArray,notInArray,or,sql} from "drizzle-orm";
import {campaignsTable,telegramAccountsTable} from "@workspace/db";
import {campaignListScope} from "./campaign-list-scope";
import {registerOperation,type OperationJob,type OperationTx} from "./operations";

async function deletionStep(tx:OperationTx,job:OperationJob){
  if(job.phase==="queued"){
    const conditions=job.kind==="delete_account"
      ?and(eq(campaignsTable.ownerUserId,job.owner),or(eq(campaignsTable.telegramAccountId,job.accountId!),
        sql`${campaignsTable.destinationIds} && ARRAY(SELECT id FROM destinations WHERE account_id=${job.accountId}::uuid)`,
        sql`${campaignsTable.id} IN (SELECT t.campaign_id FROM campaign_targets t JOIN destinations d ON d.id=t.destination_id WHERE d.account_id=${job.accountId}::uuid)`))
      :and(campaignListScope(job.owner,job.payload),notInArray(campaignsTable.status,["queued","running"]),
        sql`${campaignsTable.id}=ANY(${sql.param(job.payload.snapshotIds??[])}::uuid[])`,
        ...(job.campaignId?[eq(campaignsTable.id,job.campaignId)]:[]));
    const rows=await tx.select({id:campaignsTable.id}).from(campaignsTable).where(conditions).for("update");
    job.payload.ids=rows.map(row=>row.id);
    if(rows.length)await tx.update(campaignsTable).set({status:"paused",pauseReason:"deletion_pending",updatedAt:new Date()})
      .where(and(eq(campaignsTable.ownerUserId,job.owner),inArray(campaignsTable.id,job.payload.ids)));
    job.phase="logs";return false;
  }
  const ids=job.payload.ids as string[];
  // Each committed chunk and its real progress are saved in one transaction.
  if(job.phase==="logs"){
    const removed=await tx.execute(sql`DELETE FROM activity_logs WHERE id IN (
      SELECT id FROM activity_logs WHERE owner_user_id=${job.owner} AND (
        campaign_id=ANY(${sql.param(ids)}::uuid[])
        OR target_id IN(SELECT id FROM campaign_targets WHERE campaign_id=ANY(${sql.param(ids)}::uuid[]))
        OR (${job.kind==="delete_account"} AND account_id=${job.accountId??null}::uuid))
      ORDER BY id LIMIT 1000) RETURNING id`);
    job.processed+=removed.rows.length;if(!removed.rows.length)job.phase="targets";return false;
  }
  if(job.phase==="targets"){
    const removed=await tx.execute(sql`DELETE FROM campaign_targets WHERE id IN(
      SELECT t.id FROM campaign_targets t JOIN campaigns c ON c.id=t.campaign_id
      WHERE c.owner_user_id=${job.owner} AND c.id=ANY(${sql.param(ids)}::uuid[]) AND c.pause_reason='deletion_pending'
      ORDER BY t.id LIMIT 2000) RETURNING id`);
    job.processed+=removed.rows.length;if(!removed.rows.length)job.phase="campaigns";return false;
  }
  if(job.phase==="campaigns"){
    const removed=await tx.execute(sql`DELETE FROM campaigns WHERE id IN(
      SELECT id FROM campaigns WHERE owner_user_id=${job.owner} AND id=ANY(${sql.param(ids)}::uuid[])
        AND pause_reason='deletion_pending' ORDER BY id LIMIT 20) RETURNING id`);
    job.processed+=removed.rows.length;
    if(!removed.rows.length){if(job.kind!=="delete_account")return true;job.phase="groups";}
    return false;
  }
  if(job.phase==="groups"){
    const removed=await tx.execute(sql`DELETE FROM destinations WHERE id IN(
      SELECT d.id FROM destinations d JOIN telegram_accounts a ON a.id=d.account_id
      WHERE a.owner_user_id=${job.owner} AND a.id=${job.accountId}::uuid ORDER BY d.id LIMIT 5) RETURNING id`);
    job.processed+=removed.rows.length;if(!removed.rows.length)job.phase="account";return false;
  }
  if(job.phase==="account"){
    const rows=await tx.delete(telegramAccountsTable).where(and(eq(telegramAccountsTable.id,job.accountId!),eq(telegramAccountsTable.ownerUserId,job.owner))).returning({id:telegramAccountsTable.id});
    job.processed+=rows.length;return true;
  }
  throw Error("OPERATION_INVALID_PHASE");
}
registerOperation("delete_account",deletionStep);
registerOperation("delete_campaigns",deletionStep);
