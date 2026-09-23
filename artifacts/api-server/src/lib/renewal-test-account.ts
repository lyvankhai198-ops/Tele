import { and, eq } from "drizzle-orm";
import {
  appUsersTable,
  db,
  licenseKeysTable,
  purchaseOrdersTable,
  subscriptionsTable,
} from "@workspace/db";
import { createTemporaryPassword, hashPassword } from "./auth";

export const RENEWAL_TEST_USERNAME = "test_renewal";

export type RenewalTestAccountResetResult =
  | { ok: true; username: string; created: boolean; resetAt: Date; expiresAt: Date }
  | { ok: false; reason: "username_conflict" };

/**
 * Reset only the fixed test account. The generated password is hashed immediately
 * and is never returned or written to logs; an admin can use the normal password
 * reset flow if the account needs to be logged into.
 */
export async function resetRenewalTestAccount(): Promise<RenewalTestAccountResetResult> {
  const passwordHash = await hashPassword(createTemporaryPassword());
  return db.transaction(async (tx) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() - 1_000);
    const [existing] = await tx.select({
      id: appUsersTable.id,
      role: appUsersTable.role,
    }).from(appUsersTable)
      .where(eq(appUsersTable.usernameNormalized, RENEWAL_TEST_USERNAME))
      .limit(1);

    let userId = existing?.id;
    let created = false;
    if (existing && existing.role !== "user") return { ok: false as const, reason: "username_conflict" as const };
    if (!userId) {
      const [createdUser] = await tx.insert(appUsersTable).values({
        username: RENEWAL_TEST_USERNAME,
        usernameNormalized: RENEWAL_TEST_USERNAME,
        passwordHash,
        preferredLanguage: "vi",
        mustChangePassword: true,
        role: "user",
      }).returning({ id: appUsersTable.id });
      if (!createdUser) throw new Error("TEST_ACCOUNT_CREATE_FAILED");
      userId = createdUser.id;
      created = true;
    } else {
      await tx.update(appUsersTable).set({
        passwordHash,
        mustChangePassword: true,
        updatedAt: now,
      }).where(eq(appUsersTable.id, userId));
    }

    await tx.update(licenseKeysTable).set({
      claimedAt: null,
      claimedBy: null,
      reservedOrderId: null,
      reservedUntil: null,
    }).where(eq(licenseKeysTable.claimedBy, userId));
    await tx.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.ownerUserId, userId));

    const values = {
      plan: "plus",
      dailyQuotaExempt: false,
      dailyQuotaExemptDate: null,
      dailyQuotaExemptFrom: null,
      dailyQuotaExemptUntil: null,
      startedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      expiresAt,
      updatedAt: now,
    };
    const [current] = await tx.select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.ownerUserId, userId))
      .limit(1);
    if (current) {
      await tx.update(subscriptionsTable).set(values).where(eq(subscriptionsTable.id, current.id));
    } else {
      await tx.insert(subscriptionsTable).values({ ownerUserId: userId, ...values });
    }

    return { ok: true as const, username: RENEWAL_TEST_USERNAME, created, resetAt: now, expiresAt };
  });
}