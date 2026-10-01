import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  appUsersTable,
  authSessionsTable,
  db,
  passwordResetRequestsTable,
  telegramAccountsTable,
} from "@workspace/db";
import {
  createTemporaryPassword,
  hashPassword,
  hashSessionToken,
  normalizeUsername,
} from "./auth";
import { encryptSecret } from "./crypto";
import { normalizeTelegramPhone, phoneForAccount } from "./telegram";

const START_TOKEN_LIFETIME_MS = 15 * 60_000;
const ADMIN_REVIEW_LIFETIME_MS = 24 * 60 * 60_000;
const RESET_TOKEN_LIFETIME_MS = 15 * 60_000;
const TEMPORARY_PASSWORD_DELIVERY_LIFETIME_MS = 24 * 60 * 60_000;
const TEMPORARY_PASSWORD_DELIVERY_RETRY_MS = 60_000;

export function createPasswordResetStartToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createPasswordResetChallenge(username: string, rawToken: string): Promise<void> {
  const normalizedUsername = normalizeUsername(username);
  const now = new Date();

  await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(eq(appUsersTable.usernameNormalized, normalizedUsername))
      .limit(1);
    if (!candidate) return;

    await tx.execute(sql`SELECT 1 FROM ${appUsersTable} WHERE ${appUsersTable.id} = ${candidate.id} FOR UPDATE`);
    const [linkedAccount] = await tx
      .select({ id: telegramAccountsTable.id })
      .from(telegramAccountsTable)
      .where(and(
        eq(telegramAccountsTable.ownerUserId, candidate.id),
        eq(telegramAccountsTable.status, "connected"),
        isNotNull(telegramAccountsTable.telegramUserId),
        isNotNull(telegramAccountsTable.phoneEncrypted),
        isNotNull(telegramAccountsTable.sessionEncrypted),
        isNull(telegramAccountsTable.deletedAt),
      ))
      .limit(1);
    if (!linkedAccount) return;

    await tx.update(passwordResetRequestsTable)
      .set({
        status: "expired",
        startTokenHash: null,
        resetTokenHash: null,
        telegramUserId: null,
        telegramChatId: null,
        temporaryPasswordEncrypted: null,
        updatedAt: now,
      })
      .where(and(
        eq(passwordResetRequestsTable.userId, candidate.id),
        inArray(passwordResetRequestsTable.status, ["awaiting_telegram", "awaiting_admin", "reset_issued", "delivery_pending"]),
      ));

    await tx.insert(passwordResetRequestsTable).values({
      userId: candidate.id,
      status: "awaiting_telegram",
      startTokenHash: hashSessionToken(rawToken),
      expiresAt: new Date(now.getTime() + START_TOKEN_LIFETIME_MS),
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function verifyPasswordResetTelegram(
  rawToken: string,
  telegramUserId: string,
  telegramChatId: string,
): Promise<boolean> {
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: passwordResetRequestsTable.id,
        userId: passwordResetRequestsTable.userId,
      })
      .from(passwordResetRequestsTable)
      .where(and(
        eq(passwordResetRequestsTable.startTokenHash, tokenHash),
        eq(passwordResetRequestsTable.status, "awaiting_telegram"),
        gt(passwordResetRequestsTable.expiresAt, now),
      ))
      .limit(1);
    if (!candidate) return false;

    await tx.execute(sql`SELECT 1 FROM ${appUsersTable} WHERE ${appUsersTable.id} = ${candidate.userId} FOR UPDATE`);
    await tx.execute(sql`SELECT 1 FROM ${passwordResetRequestsTable} WHERE ${passwordResetRequestsTable.id} = ${candidate.id} FOR UPDATE`);
    const [request] = await tx
      .select({
        id: passwordResetRequestsTable.id,
        userId: passwordResetRequestsTable.userId,
        status: passwordResetRequestsTable.status,
        expiresAt: passwordResetRequestsTable.expiresAt,
      })
      .from(passwordResetRequestsTable)
      .where(eq(passwordResetRequestsTable.id, candidate.id))
      .limit(1);
    if (!request || request.status !== "awaiting_telegram" || request.expiresAt <= now) return false;

    const [linkedAccount] = await tx
      .select({ id: telegramAccountsTable.id })
      .from(telegramAccountsTable)
      .where(and(
        eq(telegramAccountsTable.ownerUserId, request.userId),
        eq(telegramAccountsTable.telegramUserId, telegramUserId),
        eq(telegramAccountsTable.status, "connected"),
        isNotNull(telegramAccountsTable.phoneEncrypted),
        isNotNull(telegramAccountsTable.sessionEncrypted),
        isNull(telegramAccountsTable.deletedAt),
      ))
      .limit(1);
    if (!linkedAccount) return false;

    await tx.update(passwordResetRequestsTable)
      .set({
        status: "awaiting_telegram",
        startTokenHash: null,
        telegramUserId,
        telegramChatId,
        updatedAt: now,
      })
      .where(eq(passwordResetRequestsTable.id, request.id));
    return true;
  });
}

export type PasswordRecoveryContactResult = "no_request" | "not_verified" | "issued";

function linkedPhoneMatches(account: typeof telegramAccountsTable.$inferSelect, phone: string | null | undefined): boolean {
  if (!account.phoneEncrypted || !phone) return false;
  const linkedPhone = normalizeTelegramPhone(phoneForAccount(account));
  const submittedPhone = normalizeTelegramPhone(phone);
  return linkedPhone !== null && submittedPhone !== null && linkedPhone === submittedPhone;
}

export async function findUsernameForVerifiedTelegramContact(
  telegramUserId: string,
  contactUserId: string | null,
  contactPhone: string | null,
): Promise<string | null> {
  if (!contactUserId || contactUserId !== telegramUserId || !contactPhone) return null;
  const accounts = await db
    .select()
    .from(telegramAccountsTable)
    .where(and(
      eq(telegramAccountsTable.telegramUserId, telegramUserId),
      eq(telegramAccountsTable.status, "connected"),
      isNotNull(telegramAccountsTable.phoneEncrypted),
      isNotNull(telegramAccountsTable.sessionEncrypted),
      isNull(telegramAccountsTable.deletedAt),
    ));

  for (const account of accounts) {
    if (!linkedPhoneMatches(account, contactPhone)) continue;
    const [user] = await db
      .select({ username: appUsersTable.username })
      .from(appUsersTable)
      .where(eq(appUsersTable.id, account.ownerUserId))
      .limit(1);
    if (user) return user.username;
  }
  return null;
}

export async function completePasswordRecoveryWithContact(
  telegramUserId: string,
  telegramChatId: string,
  contactUserId: string | null,
  contactPhone: string | null,
): Promise<PasswordRecoveryContactResult> {
  const now = new Date();
  const [candidate] = await db
    .select({
      id: passwordResetRequestsTable.id,
      userId: passwordResetRequestsTable.userId,
    })
    .from(passwordResetRequestsTable)
    .where(and(
      eq(passwordResetRequestsTable.status, "awaiting_telegram"),
      isNull(passwordResetRequestsTable.startTokenHash),
      eq(passwordResetRequestsTable.telegramUserId, telegramUserId),
      eq(passwordResetRequestsTable.telegramChatId, telegramChatId),
      gt(passwordResetRequestsTable.expiresAt, now),
    ))
    .limit(1);
  if (!candidate) return "no_request";
  if (!contactUserId || contactUserId !== telegramUserId || !contactPhone) return "not_verified";

  const [candidateAccount] = await db
    .select()
    .from(telegramAccountsTable)
    .where(and(
      eq(telegramAccountsTable.ownerUserId, candidate.userId),
      eq(telegramAccountsTable.telegramUserId, telegramUserId),
      eq(telegramAccountsTable.status, "connected"),
      isNotNull(telegramAccountsTable.phoneEncrypted),
      isNotNull(telegramAccountsTable.sessionEncrypted),
      isNull(telegramAccountsTable.deletedAt),
    ))
    .limit(1);
  if (!candidateAccount || !linkedPhoneMatches(candidateAccount, contactPhone)) return "not_verified";

  const temporaryPassword = createTemporaryPassword();
  const [passwordHash, temporaryPasswordEncrypted] = await Promise.all([
    hashPassword(temporaryPassword),
    Promise.resolve(encryptSecret(temporaryPassword)),
  ]);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ${appUsersTable} WHERE ${appUsersTable.id} = ${candidate.userId} FOR UPDATE`);
    await tx.execute(sql`SELECT 1 FROM ${telegramAccountsTable} WHERE ${telegramAccountsTable.id} = ${candidateAccount.id} FOR UPDATE`);
    await tx.execute(sql`SELECT 1 FROM ${passwordResetRequestsTable} WHERE ${passwordResetRequestsTable.id} = ${candidate.id} FOR UPDATE`);

    const [request] = await tx
      .select({
        id: passwordResetRequestsTable.id,
        userId: passwordResetRequestsTable.userId,
        status: passwordResetRequestsTable.status,
        startTokenHash: passwordResetRequestsTable.startTokenHash,
        telegramUserId: passwordResetRequestsTable.telegramUserId,
        telegramChatId: passwordResetRequestsTable.telegramChatId,
        expiresAt: passwordResetRequestsTable.expiresAt,
      })
      .from(passwordResetRequestsTable)
      .where(eq(passwordResetRequestsTable.id, candidate.id))
      .limit(1);
    if (
      !request
      || request.userId !== candidate.userId
      || request.status !== "awaiting_telegram"
      || request.startTokenHash !== null
      || request.telegramUserId !== telegramUserId
      || request.telegramChatId !== telegramChatId
      || request.expiresAt <= now
    ) return "no_request";

    const [account] = await tx
      .select()
      .from(telegramAccountsTable)
      .where(and(
        eq(telegramAccountsTable.id, candidateAccount.id),
        eq(telegramAccountsTable.ownerUserId, candidate.userId),
        eq(telegramAccountsTable.telegramUserId, telegramUserId),
        eq(telegramAccountsTable.status, "connected"),
        isNotNull(telegramAccountsTable.phoneEncrypted),
        isNotNull(telegramAccountsTable.sessionEncrypted),
        isNull(telegramAccountsTable.deletedAt),
      ))
      .limit(1);
    if (!account || !linkedPhoneMatches(account, contactPhone)) return "not_verified";

    await tx.update(appUsersTable)
      .set({ passwordHash, mustChangePassword: true, updatedAt: now })
      .where(eq(appUsersTable.id, candidate.userId));
    await tx.update(authSessionsTable)
      .set({ invalidatedAt: now })
      .where(and(
        eq(authSessionsTable.userId, candidate.userId),
        isNull(authSessionsTable.invalidatedAt),
      ));
    await tx.update(passwordResetRequestsTable)
      .set({
        status: "expired",
        startTokenHash: null,
        resetTokenHash: null,
        telegramUserId: null,
        telegramChatId: null,
        temporaryPasswordEncrypted: null,
        updatedAt: now,
      })
      .where(and(
        eq(passwordResetRequestsTable.userId, candidate.userId),
        sql`${passwordResetRequestsTable.id} <> ${candidate.id}`,
        inArray(passwordResetRequestsTable.status, ["awaiting_telegram", "awaiting_admin", "reset_issued", "delivery_pending"]),
      ));
    await tx.update(passwordResetRequestsTable)
      .set({
        status: "delivery_pending",
        startTokenHash: null,
        resetTokenHash: null,
        temporaryPasswordEncrypted,
        passwordDeliveryAttemptedAt: null,
        expiresAt: new Date(now.getTime() + TEMPORARY_PASSWORD_DELIVERY_LIFETIME_MS),
        updatedAt: now,
      })
      .where(eq(passwordResetRequestsTable.id, request.id));
    return "issued";
  });
}

export async function claimPendingTemporaryPasswordDeliveries(limit = 5): Promise<Array<{
  id: string;
  username: string;
  telegramChatId: string;
  temporaryPasswordEncrypted: string;
}>> {
  const now = new Date();
  const retryBefore = new Date(now.getTime() - TEMPORARY_PASSWORD_DELIVERY_RETRY_MS);

  return db.transaction(async (tx) => {
    await tx.update(passwordResetRequestsTable)
      .set({
        status: "expired",
        temporaryPasswordEncrypted: null,
        telegramUserId: null,
        telegramChatId: null,
        updatedAt: now,
      })
      .where(and(
        eq(passwordResetRequestsTable.status, "delivery_pending"),
        lte(passwordResetRequestsTable.expiresAt, now),
      ));

    const pending = await tx
      .select({
        id: passwordResetRequestsTable.id,
        userId: passwordResetRequestsTable.userId,
        telegramChatId: passwordResetRequestsTable.telegramChatId,
        temporaryPasswordEncrypted: passwordResetRequestsTable.temporaryPasswordEncrypted,
      })
      .from(passwordResetRequestsTable)
      .where(and(
        eq(passwordResetRequestsTable.status, "delivery_pending"),
        isNotNull(passwordResetRequestsTable.temporaryPasswordEncrypted),
        isNotNull(passwordResetRequestsTable.telegramChatId),
        gt(passwordResetRequestsTable.expiresAt, now),
        or(
          isNull(passwordResetRequestsTable.passwordDeliveryAttemptedAt),
          lt(passwordResetRequestsTable.passwordDeliveryAttemptedAt, retryBefore),
        ),
      ))
      .orderBy(passwordResetRequestsTable.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true });

    if (pending.length === 0) return [];
    await tx.update(passwordResetRequestsTable)
      .set({ passwordDeliveryAttemptedAt: now, updatedAt: now })
      .where(inArray(passwordResetRequestsTable.id, pending.map((request) => request.id)));

    const users = await tx
      .select({ id: appUsersTable.id, username: appUsersTable.username })
      .from(appUsersTable)
      .where(inArray(appUsersTable.id, [...new Set(pending.map((request) => request.userId))]));
    const usernames = new Map(users.map((user) => [user.id, user.username]));

    return pending.flatMap((request) => {
      const username = usernames.get(request.userId);
      if (!username || !request.telegramChatId || !request.temporaryPasswordEncrypted) return [];
      return [{
        id: request.id,
        username,
        telegramChatId: request.telegramChatId,
        temporaryPasswordEncrypted: request.temporaryPasswordEncrypted,
      }];
    });
  });
}

export async function markTemporaryPasswordDelivered(requestId: string): Promise<void> {
  const now = new Date();
  await db.update(passwordResetRequestsTable)
    .set({
      status: "completed",
      telegramUserId: null,
      telegramChatId: null,
      temporaryPasswordEncrypted: null,
      passwordDeliveryAttemptedAt: null,
      updatedAt: now,
    })
    .where(and(
      eq(passwordResetRequestsTable.id, requestId),
      eq(passwordResetRequestsTable.status, "delivery_pending"),
    ));
}

export async function claimPendingPasswordResetNotifications(limit = 5): Promise<Array<{
  id: string;
  username: string;
  telegramUserId: string;
  telegramChatId: string;
}>> {
  const now = new Date();
  const retryBefore = new Date(now.getTime() - 60_000);

  return db.transaction(async (tx) => {
    const pending = await tx
      .select({
        id: passwordResetRequestsTable.id,
        userId: passwordResetRequestsTable.userId,
        telegramUserId: passwordResetRequestsTable.telegramUserId,
        telegramChatId: passwordResetRequestsTable.telegramChatId,
      })
      .from(passwordResetRequestsTable)
      .where(and(
        eq(passwordResetRequestsTable.status, "awaiting_admin"),
        isNull(passwordResetRequestsTable.adminNotificationSentAt),
        gt(passwordResetRequestsTable.expiresAt, now),
        or(
          isNull(passwordResetRequestsTable.adminNotificationAttemptedAt),
          lt(passwordResetRequestsTable.adminNotificationAttemptedAt, retryBefore),
        ),
      ))
      .orderBy(passwordResetRequestsTable.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true });

    if (pending.length === 0) return [];
    await tx.update(passwordResetRequestsTable)
      .set({ adminNotificationAttemptedAt: now, updatedAt: now })
      .where(inArray(passwordResetRequestsTable.id, pending.map((request) => request.id)));

    const userIds = [...new Set(pending.map((request) => request.userId))];
    const users = await tx
      .select({ id: appUsersTable.id, username: appUsersTable.username })
      .from(appUsersTable)
      .where(inArray(appUsersTable.id, userIds));
    const usernames = new Map(users.map((user) => [user.id, user.username]));

    return pending.flatMap((request) => {
      const username = usernames.get(request.userId);
      if (!username || !request.telegramUserId || !request.telegramChatId) return [];
      return [{ ...request, username, telegramUserId: request.telegramUserId, telegramChatId: request.telegramChatId }];
    });
  });
}

export async function markPasswordResetAdminNotificationSent(requestId: string, messageId: number): Promise<void> {
  const now = new Date();
  await db.update(passwordResetRequestsTable)
    .set({
      adminMessageId: messageId,
      adminNotificationSentAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(passwordResetRequestsTable.id, requestId),
      eq(passwordResetRequestsTable.status, "awaiting_admin"),
    ));
}

type PasswordResetReview =
  | { outcome: "stale" }
  | { outcome: "approved"; telegramChatId: string; resetToken: string }
  | { outcome: "rejected"; telegramChatId: string };

export async function reviewPasswordResetRequest(
  requestId: string,
  adminTelegramId: string,
  approve: boolean,
): Promise<PasswordResetReview> {
  const now = new Date();
  const resetToken = approve ? randomBytes(32).toString("base64url") : null;

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: passwordResetRequestsTable.id,
        userId: passwordResetRequestsTable.userId,
      })
      .from(passwordResetRequestsTable)
      .where(eq(passwordResetRequestsTable.id, requestId))
      .limit(1);
    if (!candidate) return { outcome: "stale" };

    await tx.execute(sql`SELECT 1 FROM ${appUsersTable} WHERE ${appUsersTable.id} = ${candidate.userId} FOR UPDATE`);
    await tx.execute(sql`SELECT 1 FROM ${passwordResetRequestsTable} WHERE ${passwordResetRequestsTable.id} = ${candidate.id} FOR UPDATE`);
    const [request] = await tx
      .select({
        id: passwordResetRequestsTable.id,
        userId: passwordResetRequestsTable.userId,
        status: passwordResetRequestsTable.status,
        expiresAt: passwordResetRequestsTable.expiresAt,
        telegramUserId: passwordResetRequestsTable.telegramUserId,
        telegramChatId: passwordResetRequestsTable.telegramChatId,
      })
      .from(passwordResetRequestsTable)
      .where(eq(passwordResetRequestsTable.id, candidate.id))
      .limit(1);
    if (
      !request
      || request.status !== "awaiting_admin"
      || request.expiresAt <= now
      || !request.telegramUserId
      || !request.telegramChatId
    ) return { outcome: "stale" };

    const [linkedAccount] = await tx
      .select({ id: telegramAccountsTable.id })
      .from(telegramAccountsTable)
      .where(and(
        eq(telegramAccountsTable.ownerUserId, request.userId),
        eq(telegramAccountsTable.telegramUserId, request.telegramUserId),
        eq(telegramAccountsTable.status, "connected"),
        isNotNull(telegramAccountsTable.sessionEncrypted),
        isNull(telegramAccountsTable.deletedAt),
      ))
      .limit(1);
    if (!linkedAccount) {
      await tx.update(passwordResetRequestsTable)
        .set({
          status: "expired",
          startTokenHash: null,
          resetTokenHash: null,
          telegramUserId: null,
          telegramChatId: null,
          updatedAt: now,
        })
        .where(eq(passwordResetRequestsTable.id, request.id));
      return { outcome: "stale" };
    }

    if (!approve) {
      await tx.update(passwordResetRequestsTable)
        .set({
          status: "rejected",
          startTokenHash: null,
          resetTokenHash: null,
          telegramUserId: null,
          telegramChatId: null,
          reviewedByTelegramId: adminTelegramId,
          updatedAt: now,
        })
        .where(eq(passwordResetRequestsTable.id, request.id));
      return { outcome: "rejected", telegramChatId: request.telegramChatId };
    }

    await tx.update(passwordResetRequestsTable)
      .set({
        status: "reset_issued",
        startTokenHash: null,
        resetTokenHash: hashSessionToken(resetToken!),
        reviewedByTelegramId: adminTelegramId,
        expiresAt: new Date(now.getTime() + RESET_TOKEN_LIFETIME_MS),
        updatedAt: now,
      })
      .where(eq(passwordResetRequestsTable.id, request.id));
    return { outcome: "approved", telegramChatId: request.telegramChatId, resetToken: resetToken! };
  });
}

export async function restorePasswordResetAfterDeliveryFailure(requestId: string): Promise<void> {
  const now = new Date();
  await db.update(passwordResetRequestsTable)
    .set({
      status: "awaiting_admin",
      resetTokenHash: null,
      reviewedByTelegramId: null,
      adminNotificationSentAt: null,
      expiresAt: new Date(now.getTime() + ADMIN_REVIEW_LIFETIME_MS),
      updatedAt: now,
    })
    .where(and(
      eq(passwordResetRequestsTable.id, requestId),
      eq(passwordResetRequestsTable.status, "reset_issued"),
    ));
}

export async function completePasswordReset(resetToken: string, newPassword: string): Promise<boolean> {
  const resetTokenHash = hashSessionToken(resetToken);
  const now = new Date();
  const [candidate] = await db
    .select({
      id: passwordResetRequestsTable.id,
      userId: passwordResetRequestsTable.userId,
    })
    .from(passwordResetRequestsTable)
    .where(and(
      eq(passwordResetRequestsTable.resetTokenHash, resetTokenHash),
      eq(passwordResetRequestsTable.status, "reset_issued"),
      gt(passwordResetRequestsTable.expiresAt, now),
    ))
    .limit(1);
  if (!candidate) return false;

  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ${appUsersTable} WHERE ${appUsersTable.id} = ${candidate.userId} FOR UPDATE`);
    await tx.execute(sql`SELECT 1 FROM ${passwordResetRequestsTable} WHERE ${passwordResetRequestsTable.id} = ${candidate.id} FOR UPDATE`);
    const [request] = await tx
      .select({
        id: passwordResetRequestsTable.id,
        userId: passwordResetRequestsTable.userId,
        status: passwordResetRequestsTable.status,
        expiresAt: passwordResetRequestsTable.expiresAt,
      })
      .from(passwordResetRequestsTable)
      .where(and(
        eq(passwordResetRequestsTable.id, candidate.id),
        eq(passwordResetRequestsTable.resetTokenHash, resetTokenHash),
      ))
      .limit(1);
    if (!request || request.status !== "reset_issued" || request.expiresAt <= now) return false;

    const [user] = await tx
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(eq(appUsersTable.id, request.userId))
      .limit(1);
    if (!user) return false;

    await tx.update(appUsersTable)
      .set({ passwordHash, mustChangePassword: false, updatedAt: now })
      .where(eq(appUsersTable.id, user.id));
    await tx.update(authSessionsTable)
      .set({ invalidatedAt: now })
      .where(and(
        eq(authSessionsTable.userId, user.id),
        isNull(authSessionsTable.invalidatedAt),
      ));
    await tx.update(passwordResetRequestsTable)
      .set({
        status: "completed",
        startTokenHash: null,
        resetTokenHash: null,
        telegramUserId: null,
        telegramChatId: null,
        updatedAt: now,
      })
      .where(and(
        eq(passwordResetRequestsTable.userId, user.id),
        sql`${passwordResetRequestsTable.id} = ${request.id}`,
      ));
    await tx.update(passwordResetRequestsTable)
      .set({
        status: "expired",
        startTokenHash: null,
        resetTokenHash: null,
        telegramUserId: null,
        telegramChatId: null,
        temporaryPasswordEncrypted: null,
        updatedAt: now,
      })
      .where(and(
        eq(passwordResetRequestsTable.userId, user.id),
        sql`${passwordResetRequestsTable.id} <> ${request.id}`,
        inArray(passwordResetRequestsTable.status, ["awaiting_telegram", "awaiting_admin", "reset_issued", "delivery_pending"]),
      ));
    return true;
  });
}