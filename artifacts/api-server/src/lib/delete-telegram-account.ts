import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, telegramAccountsTable, campaignsTable, destinationsTable, activityLogsTable } from "@workspace/db";

/**
 * Remove this account and its dependent data atomically.
 * Never use telegramId: the same group can belong to
 * more than one connected account.
 */
export async function deleteTelegramAccountData(accountId: string, ownerUserId: string) {
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(telegramAccountsTable).where(and(
      eq(telegramAccountsTable.id, accountId),
      eq(telegramAccountsTable.ownerUserId, ownerUserId),
      isNull(telegramAccountsTable.deletedAt),
    )).for("update");
    if (!account) return "not_found" as const;
    const matchingCampaigns = and(
      eq(campaignsTable.ownerUserId, ownerUserId),
      or(
        eq(campaignsTable.telegramAccountId, accountId),
        // Include old campaigns with a null account link and drafts that have
        // destinations but no materialized targets yet.
        sql`${campaignsTable.destinationIds} && ARRAY(
          SELECT id FROM destinations WHERE account_id = ${accountId}::uuid
        )`,
        sql`EXISTS (
          SELECT 1 FROM campaign_targets t
          JOIN destinations d ON d.id = t.destination_id
          WHERE t.campaign_id = ${campaignsTable.id}
            AND d.account_id = ${accountId}::uuid
        )`,
      ),
    );
    const campaignIds = tx.select({ id: campaignsTable.id }).from(campaignsTable).where(matchingCampaigns);
    await tx.delete(activityLogsTable).where(and(
      eq(activityLogsTable.ownerUserId, ownerUserId),
      or(
        eq(activityLogsTable.accountId, accountId),
        sql`${activityLogsTable.campaignId} IN (${campaignIds})`,
        sql`${activityLogsTable.targetId} IN (
          SELECT id FROM campaign_targets WHERE campaign_id IN (${campaignIds})
        )`,
      ),
    ));
    await tx.delete(campaignsTable).where(matchingCampaigns);
    // FK cascades remove campaign targets, login challenges, account reminders
    // and join jobs. Shared templates/proxies/library entries remain available.
    await tx.delete(destinationsTable).where(eq(destinationsTable.accountId, accountId));
    await tx.delete(telegramAccountsTable).where(eq(telegramAccountsTable.id, accountId));
    return "deleted" as const;
  });
}

export async function telegramAccountWasDeleted(accountId: string) {
  const [account] = await db.select({ deletedAt: telegramAccountsTable.deletedAt })
    .from(telegramAccountsTable).where(eq(telegramAccountsTable.id, accountId));
  return !account || account.deletedAt !== null;
}
