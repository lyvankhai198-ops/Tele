import { and, eq, gt, isNull } from "drizzle-orm";
import { appUsersTable, db, supportSessionsTable } from "@workspace/db";
import { createSessionToken, hashSessionToken } from "./auth";

export const SUPPORT_COOKIE_NAME = "telecampaign_support";
const SUPPORT_SESSION_TTL_MS = 45 * 60_000;

export type SupportContext = {
  targetUserId: string;
  targetUsername: string;
  expiresAt: Date;
};

export function supportSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SUPPORT_SESSION_TTL_MS,
  };
}

export async function createSupportSession(adminUserId: string, targetUserId: string): Promise<{ token: string; context: SupportContext }> {
  const [target] = await db
    .select({ id: appUsersTable.id, username: appUsersTable.username })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, targetUserId))
    .limit(1);
  if (!target) throw new Error("Target user was not found");

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_TTL_MS);
  await db.transaction(async (tx) => {
    await tx.update(supportSessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(supportSessionsTable.adminUserId, adminUserId),
        isNull(supportSessionsTable.revokedAt),
      ));
    await tx.insert(supportSessionsTable).values({
      adminUserId,
      targetUserId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });
  });

  return {
    token,
    context: {
      targetUserId: target.id,
      targetUsername: target.username,
      expiresAt,
    },
  };
}

export async function resolveSupportSession(token: string, adminUserId: string): Promise<SupportContext | null> {
  const [session] = await db
    .select({
      targetUserId: supportSessionsTable.targetUserId,
      targetUsername: appUsersTable.username,
      expiresAt: supportSessionsTable.expiresAt,
    })
    .from(supportSessionsTable)
    .innerJoin(appUsersTable, eq(supportSessionsTable.targetUserId, appUsersTable.id))
    .where(and(
      eq(supportSessionsTable.adminUserId, adminUserId),
      eq(supportSessionsTable.tokenHash, hashSessionToken(token)),
      isNull(supportSessionsTable.revokedAt),
      gt(supportSessionsTable.expiresAt, new Date()),
    ))
    .limit(1);
  return session ?? null;
}

export async function revokeSupportSession(token: string, adminUserId: string): Promise<void> {
  await db.update(supportSessionsTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(supportSessionsTable.adminUserId, adminUserId),
      eq(supportSessionsTable.tokenHash, hashSessionToken(token)),
      isNull(supportSessionsTable.revokedAt),
    ));
}