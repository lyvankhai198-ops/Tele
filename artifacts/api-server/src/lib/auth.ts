import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  appUsersTable,
  activityLogsTable,
  authSessionsTable,
  campaignsTable,
  db,
  telegramAccountsTable,
  type AppUser,
} from "@workspace/db";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export const SESSION_COOKIE_NAME = "telecampaign_session";

export type SafeAuthUser = Pick<AppUser, "id" | "username" | "role">;
export class OwnershipMigrationPendingError extends Error {
  constructor(public readonly unmappedOwners: number) {
    super("Legacy workspace ownership needs a secure migration before TeleCampaign data can be accessed.");
  }
}

function deriveScryptKey(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  if (!username) return "Tên đăng nhập không được để trống";
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    return "Tên đăng nhập gồm 3–32 ký tự: chữ cái, số, dấu chấm, gạch dưới hoặc gạch ngang";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Mật khẩu không được để trống";
  if (password.length < 10) return "Mật khẩu phải có ít nhất 10 ký tự";
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return "Mật khẩu cần có cả chữ cái và số";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveScryptKey(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), derived.toString("base64")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = encoded.split("$");
  if (algorithm !== "scrypt" || !rawN || !rawR || !rawP || !rawSalt || !rawHash) return false;

  const salt = Buffer.from(rawSalt, "base64");
  const expected = Buffer.from(rawHash, "base64");
  if (!salt.length || !expected.length) return false;

  const derived = await deriveScryptKey(password, salt, expected.length, {
    N: Number(rawN),
    r: Number(rawR),
    p: Number(rawP),
    maxmem: 64 * 1024 * 1024,
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

export async function resolveAuthenticatedUser(user: SafeAuthUser): Promise<SafeAuthUser> {
  const configuredBootstrapAdminId = process.env.TELECAMPAIGN_ADMIN_USER_ID?.trim();
  if (configuredBootstrapAdminId && user.id === configuredBootstrapAdminId && user.role !== "admin") {
    const [promoted] = await db.update(appUsersTable)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(appUsersTable.id, user.id))
      .returning({ id: appUsersTable.id, username: appUsersTable.username, role: appUsersTable.role });
    return promoted ?? { ...user, role: "admin" };
  }
  return user;
}

export async function getAuthenticatedUser(token: string): Promise<SafeAuthUser | null> {
  const [user] = await db
    .select({ id: appUsersTable.id, username: appUsersTable.username, role: appUsersTable.role })
    .from(authSessionsTable)
    .innerJoin(appUsersTable, eq(authSessionsTable.userId, appUsersTable.id))
    .where(and(
      eq(authSessionsTable.tokenHash, hashSessionToken(token)),
      isNull(authSessionsTable.invalidatedAt),
      gt(authSessionsTable.expiresAt, new Date()),
    ))
    .limit(1);

  return user ? resolveAuthenticatedUser(user) : null;
}

export async function invalidateSession(token: string): Promise<void> {
  await db
    .update(authSessionsTable)
    .set({ invalidatedAt: new Date() })
    .where(and(eq(authSessionsTable.tokenHash, hashSessionToken(token)), isNull(authSessionsTable.invalidatedAt)));
}

export async function getUnmappedLegacyOwnerCount(): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT count(*)::text AS count
    FROM (
      SELECT owner_user_id FROM telegram_accounts
      UNION
      SELECT owner_user_id FROM campaigns
    ) AS legacy_owners
    WHERE NOT EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id::text = legacy_owners.owner_user_id
    )
  `);
  return Number(result.rows[0]?.count ?? "0");
}

export async function assertOwnershipMigrationReady(): Promise<void> {
  const unmappedOwners = await getUnmappedLegacyOwnerCount();
  if (unmappedOwners > 0) throw new OwnershipMigrationPendingError(unmappedOwners);
}

export async function migrateLegacyOwner(legacyOwnerId: string, targetUserId: string): Promise<{ mappedRecords: number; remainingUnmappedOwners: number } | null> {
  const [targetUser] = await db
    .select({ id: appUsersTable.id })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, targetUserId))
    .limit(1);
  if (!targetUser) return null;

  const beforeMigration = await db.execute<{ count: string }>(sql`
    SELECT count(*)::text AS count
    FROM (
      SELECT owner_user_id FROM telegram_accounts WHERE owner_user_id = ${legacyOwnerId}
      UNION ALL
      SELECT owner_user_id FROM campaigns WHERE owner_user_id = ${legacyOwnerId}
      UNION ALL
      SELECT owner_user_id FROM activity_logs WHERE owner_user_id = ${legacyOwnerId}
    ) AS legacy_records
  `);
  const recordCount = Number(beforeMigration.rows[0]?.count ?? "0");
  if (recordCount === 0) return null;

  await db.transaction(async (tx) => {
    await tx.update(telegramAccountsTable).set({ ownerUserId: targetUser.id, updatedAt: new Date() })
      .where(eq(telegramAccountsTable.ownerUserId, legacyOwnerId));
    await tx.update(campaignsTable).set({ ownerUserId: targetUser.id, updatedAt: new Date() })
      .where(eq(campaignsTable.ownerUserId, legacyOwnerId));
    await tx.update(activityLogsTable).set({ ownerUserId: targetUser.id })
      .where(eq(activityLogsTable.ownerUserId, legacyOwnerId));
  });

  return {
    mappedRecords: recordCount,
    remainingUnmappedOwners: await getUnmappedLegacyOwnerCount(),
  };
}