import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, telegramAccountsTable, campaignsTable, destinationsTable } from "@workspace/db";

/**
 * Keep the credential tombstone, but remove this account's campaigns and synced
 * destinations atomically. Never use telegramId: the same group can belong to
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
    // The sender acquires this same row before claiming a target. Do not remove
    // a target while a live Telegram request may be delivering its message.
    const [{ busy }] = await tx.select({
      busy: sql<boolean>`${telegramAccountsTable.deliveryLeaseUntil} > clock_timestamp()`,
    }).from(telegramAccountsTable).where(eq(telegramAccountsTable.id, accountId));
    if (busy) return "busy" as const;

    await tx.delete(campaignsTable).where(and(
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
    ));
    // Campaign FK cascades remove targets first; logs keep their existing
    // ON DELETE SET NULL history policy.
    await tx.delete(destinationsTable).where(eq(destinationsTable.accountId, accountId));
    await tx.update(telegramAccountsTable).set({
      status: "deleted",
      apiHashEncrypted: null,
      phoneEncrypted: null,
      sessionEncrypted: null,
      deliveryLeaseUntil: null,
      deliveryLeaseToken: null,
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(telegramAccountsTable.id, accountId));
    return "deleted" as const;
  });
}
