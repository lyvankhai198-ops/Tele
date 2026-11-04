import {and,eq,inArray,notInArray,or,sql} from "drizzle-orm";
import {campaignsTable,telegramAccountsTable} from "@workspace/db";
import {campaignListScope} from "./campaign-list-scope";
import {registerOperation,type OperationJob,type OperationTx} from "./operations";

export async function deletionStep(tx:OperationTx,job:OperationJob){
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
    // Do not combine hundreds of thousands of target ids in an OR subplan:
    // PostgreSQL can materialize that list once per log row when it exceeds work_mem.
    if(job.kind==="delete_account"&&!job.payload.accountLogsDone){
      const removed=await tx.execute(sql`DELETE FROM activity_logs WHERE id IN(
        SELECT id FROM activity_logs WHERE owner_user_id=${job.owner}
          AND account_id=${job.accountId}::uuid LIMIT 1000) RETURNING id`);
      job.processed+=removed.rows.length;
      if(removed.rows.length<1000)job.payload.accountLogsDone=true;
      return false;
    }
    for(let pass=0;pass<4;pass++){
      const offset=Number(job.payload.logOffset??0),block=ids.slice(offset,offset+20);
      if(!block.length){job.phase="targets";return false;}
      const direct=await tx.execute(sql`DELETE FROM activity_logs WHERE id IN(
        SELECT id FROM activity_logs WHERE owner_user_id=${job.owner}
          AND campaign_id=ANY(${sql.param(block)}::uuid[]) LIMIT 1000) RETURNING id`);
      const linked=await tx.execute(sql`DELETE FROM activity_logs WHERE id IN(
        SELECT l.id FROM campaign_targets t JOIN activity_logs l ON l.target_id=t.id
        WHERE l.owner_user_id=${job.owner} AND t.campaign_id=ANY(${sql.param(block)}::uuid[])
        LIMIT 1000) RETURNING id`);
      job.processed+=direct.rows.length+linked.rows.length;
      if(direct.rows.length===1000||linked.rows.length===1000)return false;
      job.payload.logOffset=offset+block.length;
    }
    return false;
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
      WHERE a.owner_user_id=${job.owner} AND a.id=${job.accountId}::uuid ORDER BY d.id LIMIT ${Number(job.payload.groupChunk??5)}) RETURNING id`);
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
