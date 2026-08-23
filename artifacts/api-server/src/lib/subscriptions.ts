import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  appUsersTable,
  activityLogsTable,
  db,
  licenseKeysTable,
  subscriptionsTable,
  telegramAccountsTable,
  campaignsTable,
} from "@workspace/db";
import { getSystemSettings, type PlanCode as SystemPlanCode } from "./system-settings";
import { decryptSecret, encryptSecret } from "./crypto";

export const PLAN_ORDER = ["plus", "pro", "unlimited"] as const;
export type PlanCode = SystemPlanCode;

export const PLAN_CATALOG = [
  { code: "plus", name: "PLUS", tagline: "Gọn gàng cho một tài khoản vận hành", accountLimit: 1, campaignLimit: 10, messageDailyLimit: 200, durationDays: 30 },
  { code: "pro", name: "PRO", tagline: "Nhiều không gian hơn cho đội nhóm", accountLimit: 3, campaignLimit: 50, messageDailyLimit: 600, durationDays: 30 },
  { code: "unlimited", name: "UNLIMITED", tagline: "Không giới hạn tài khoản Telegram", accountLimit: null, campaignLimit: null, messageDailyLimit: null, durationDays: 30 },
] as const;

type PlanCatalog = ReadonlyArray<{
  code: PlanCode;
  name: string;
  tagline: string;
  accountLimit: number | null;
  campaignLimit: number | null;
  messageDailyLimit: number | null;
  durationDays: number;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DURATION_DAYS = 1;

function isPlanCode(value: string): value is PlanCode {
  return (PLAN_ORDER as readonly string[]).includes(value);
}

export function planAccountLimit(plan: PlanCode, catalog: PlanCatalog = PLAN_CATALOG): number | null {
  const item = catalog.find((entry) => entry.code === plan);
  return item ? item.accountLimit : 1;
}

function planLimits(plan: PlanCode, catalog: PlanCatalog = PLAN_CATALOG) {
  const item = catalog.find((entry) => entry.code === plan);
  if (!item) {
    return {
      campaignLimit: 10,
      messageDailyLimit: 200,
    };
  }
  return {
    campaignLimit: item.campaignLimit,
    messageDailyLimit: item.messageDailyLimit,
  };
}

export async function getConfiguredPlanCatalog(): Promise<PlanCatalog> {
  const settings = await getSystemSettings();
  return PLAN_CATALOG.map((plan) => ({ ...plan, ...settings.planLimits[plan.code] }));
}

function normalizedLicenseKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function licenseKeyHash(value: string): string {
  return createHash("sha256").update(normalizedLicenseKey(value)).digest("hex");
}

type AdminLicenseStatus = "available" | "claimed" | "revoked";
type AdminLicenseRecord = {
  id: string;
  plan: PlanCode;
  durationDays: number;
  label: string | null;
  status: AdminLicenseStatus;
  createdAt: Date;
  createdByUsername: string | null;
  claimedAt: Date | null;
  claimedByUsername: string | null;
  revokedAt: Date | null;
  revokedByUsername: string | null;
};

export type AdminLicenseRevealResult =
  | { ok: true; licenseKey: string }
  | { ok: false; reason: "not_found" | "unavailable" };

function licenseStatus(license: typeof licenseKeysTable.$inferSelect): AdminLicenseStatus {
  if (license.revokedAt) return "revoked";
  if (license.claimedAt) return "claimed";
  return "available";
}

async function licenseUsernameMap(licenses: Array<typeof licenseKeysTable.$inferSelect>) {
  const ids = [...new Set(licenses.flatMap((license) => [license.createdBy, license.claimedBy, license.revokedBy]).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, string>();
  const users = await db.select({ id: appUsersTable.id, username: appUsersTable.username })
    .from(appUsersTable).where(inArray(appUsersTable.id, ids));
  return new Map(users.map((user) => [user.id, user.username]));
}

function toAdminLicenseRecord(license: typeof licenseKeysTable.$inferSelect, usernames: Map<string, string>): AdminLicenseRecord {
  return {
    id: license.id,
    plan: isPlanCode(license.plan) ? license.plan : "plus",
    durationDays: license.durationDays,
    label: license.label,
    status: licenseStatus(license),
    createdAt: license.createdAt,
    createdByUsername: license.createdBy ? usernames.get(license.createdBy) ?? null : null,
    claimedAt: license.claimedAt,
    claimedByUsername: license.claimedBy ? usernames.get(license.claimedBy) ?? null : null,
    revokedAt: license.revokedAt,
    revokedByUsername: license.revokedBy ? usernames.get(license.revokedBy) ?? null : null,
  };
}

export async function listAdminLicenseKeys(filters: { status?: AdminLicenseStatus; plan?: PlanCode } = {}): Promise<AdminLicenseRecord[]> {
  const licenses = await db.select().from(licenseKeysTable).orderBy(desc(licenseKeysTable.createdAt));
  const filtered = licenses.filter((license) => (
    (!filters.status || licenseStatus(license) === filters.status)
    && (!filters.plan || license.plan === filters.plan)
  ));
  const usernames = await licenseUsernameMap(filtered);
  return filtered.map((license) => toAdminLicenseRecord(license, usernames));
}

export async function revealAdminLicenseKey(licenseKeyId: string): Promise<AdminLicenseRevealResult> {
  const [license] = await db.select({ keyEncrypted: licenseKeysTable.keyEncrypted })
    .from(licenseKeysTable)
    .where(eq(licenseKeysTable.id, licenseKeyId))
    .limit(1);
  if (!license) return { ok: false, reason: "not_found" };
  if (!license.keyEncrypted) return { ok: false, reason: "unavailable" };
  try {
    return { ok: true, licenseKey: decryptSecret(license.keyEncrypted) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function generateLicenseKey(plan: PlanCode): string {
  const entropy = randomBytes(18).toString("hex").toUpperCase();
  return `TC-${plan.toUpperCase()}-${entropy.slice(0, 12)}-${entropy.slice(12, 24)}-${entropy.slice(24)}`;
}

export async function createAdminLicenseKeys(input: {
  plan: PlanCode;
  durationDays: number;
  quantity: number;
  label?: string;
  createdBy: string;
  createdByUsername?: string;
}): Promise<{ licenseKeys: string[]; licenses: AdminLicenseRecord[] }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const licenseKeys = Array.from({ length: input.quantity }, () => generateLicenseKey(input.plan));
    try {
      const licenses = await db.transaction(async (tx) => {
        const created = await tx.insert(licenseKeysTable).values(licenseKeys.map((licenseKey) => ({
          keyHash: licenseKeyHash(licenseKey),
          keyEncrypted: encryptSecret(licenseKey),
          plan: input.plan,
          durationDays: input.durationDays,
          label: input.label?.trim() || null,
          createdBy: input.createdBy,
        }))).returning();
        await tx.insert(activityLogsTable).values(created.map((license) => ({
          ownerUserId: input.createdBy,
          event: "license_key.created",
          level: "success",
          message: `Created ${license.plan.toUpperCase()} license key`,
          metadata: {
            licenseKeyId: license.id,
            plan: license.plan,
            durationDays: license.durationDays,
            label: license.label,
          },
        })));
        return created;
      });
      const usernames = new Map<string, string>();
      if (input.createdByUsername) usernames.set(input.createdBy, input.createdByUsername);
      return {
        licenseKeys,
        licenses: licenses.map((license) => toAdminLicenseRecord(license, usernames)),
      };
    } catch (error) {
      if ((error as { code?: string }).code !== "23505" || attempt === 2) throw error;
    }
  }
  throw new Error("Unable to generate a unique license key");
}

export async function revokeAdminLicenseKey(licenseKeyId: string, revokedBy: string): Promise<"revoked" | "not_found" | "not_available"> {
  return db.transaction(async (tx) => {
    const [revoked] = await tx.update(licenseKeysTable).set({
      revokedAt: new Date(),
      revokedBy,
    }).where(and(
      eq(licenseKeysTable.id, licenseKeyId),
      isNull(licenseKeysTable.claimedAt),
      isNull(licenseKeysTable.revokedAt),
    )).returning({ id: licenseKeysTable.id });
    if (revoked) {
      await tx.insert(activityLogsTable).values({
        ownerUserId: revokedBy,
        event: "license_key.revoked",
        level: "info",
        message: "Revoked an unused license key",
        metadata: { licenseKeyId },
      });
      return "revoked";
    }
    const [existing] = await tx.select({ id: licenseKeysTable.id }).from(licenseKeysTable)
      .where(eq(licenseKeysTable.id, licenseKeyId)).limit(1);
    return existing ? "not_available" : "not_found";
  });
}

function toSubscriptionSummary(
  subscription: typeof subscriptionsTable.$inferSelect,
  now = new Date(),
  catalog: PlanCatalog = PLAN_CATALOG,
) {
  const hasExpired = Boolean(subscription.expiresAt && subscription.expiresAt.getTime() <= now.getTime());
  const storedPlan = isPlanCode(subscription.plan) ? subscription.plan : "plus";
  const plan: PlanCode = hasExpired ? "plus" : storedPlan;
  const limits = planLimits(plan, catalog);
  return {
    plan,
    startedAt: subscription.startedAt,
    expiresAt: subscription.expiresAt,
    status: hasExpired ? "expired" as const : "active" as const,
    accountLimit: planAccountLimit(plan, catalog),
    ...limits,
  };
}

async function createDefaultSubscription(ownerUserId: string) {
  const [created] = await db.insert(subscriptionsTable).values({
    ownerUserId,
    plan: "plus",
  }).onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.ownerUserId, ownerUserId)).limit(1);
  if (!existing) throw new Error("Unable to initialize subscription");
  return existing;
}

export async function getSubscription(ownerUserId: string) {
  const [subscriptions, settings] = await Promise.all([
    db.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.ownerUserId, ownerUserId)).limit(1),
    getSystemSettings(),
  ]);
  const existing = subscriptions[0] ?? await createDefaultSubscription(ownerUserId);
  const catalog = PLAN_CATALOG.map((plan) => ({ ...plan, ...settings.planLimits[plan.code] }));
  return toSubscriptionSummary(existing, new Date(), catalog);
}

export async function getTelegramAccountAllowance(ownerUserId: string) {
  const [subscription, accounts] = await Promise.all([
    getSubscription(ownerUserId),
    db.select({ value: count() }).from(telegramAccountsTable)
      .where(and(eq(telegramAccountsTable.ownerUserId, ownerUserId), isNull(telegramAccountsTable.deletedAt))),
  ]);
  return {
    ...subscription,
    used: accounts[0]?.value ?? 0,
  };
}

export async function getCampaignAllowance(ownerUserId: string) {
  const [subscription, campaigns] = await Promise.all([
    getSubscription(ownerUserId),
    db.select({ value: count() }).from(campaignsTable)
      .where(eq(campaignsTable.ownerUserId, ownerUserId)),
  ]);
  return {
    ...subscription,
    used: campaigns[0]?.value ?? 0,
  };
}

export type AdminUserRecord = {
  id: string;
  username: string;
  role: "user" | "admin";
  joinedAt: Date;
  lastActiveAt: Date | null;
  storedPlan: PlanCode;
  subscription: ReturnType<typeof toSubscriptionSummary>;
  usage: {
    telegramAccounts: number;
    campaigns: number;
  };
};

function effectivePlan(subscription: typeof subscriptionsTable.$inferSelect | undefined, now: Date): PlanCode {
  if (!subscription) return "plus";
  if (subscription.expiresAt && subscription.expiresAt.getTime() <= now.getTime()) return "plus";
  return isPlanCode(subscription.plan) ? subscription.plan : "plus";
}

async function buildAdminUserRecords(catalog: PlanCatalog = PLAN_CATALOG): Promise<AdminUserRecord[]> {
  const [users, subscriptions, accounts, campaigns, activities] = await Promise.all([
    db.select({
      id: appUsersTable.id,
      username: appUsersTable.username,
      role: appUsersTable.role,
      createdAt: appUsersTable.createdAt,
    }).from(appUsersTable).orderBy(desc(appUsersTable.createdAt)),
    db.select().from(subscriptionsTable),
    db.select({
      ownerUserId: telegramAccountsTable.ownerUserId,
    }).from(telegramAccountsTable).where(isNull(telegramAccountsTable.deletedAt)),
    db.select({
      ownerUserId: campaignsTable.ownerUserId,
    }).from(campaignsTable),
    db.select({
      ownerUserId: activityLogsTable.ownerUserId,
      createdAt: activityLogsTable.createdAt,
    }).from(activityLogsTable).orderBy(desc(activityLogsTable.createdAt)),
  ]);
  const now = new Date();
  const subscriptionsByUser = new Map(subscriptions.map((subscription) => [subscription.ownerUserId, subscription]));
  const accountUsage = new Map<string, number>();
  const campaignUsage = new Map<string, number>();
  const lastActivity = new Map<string, Date>();

  for (const account of accounts) accountUsage.set(account.ownerUserId, (accountUsage.get(account.ownerUserId) ?? 0) + 1);
  for (const campaign of campaigns) campaignUsage.set(campaign.ownerUserId, (campaignUsage.get(campaign.ownerUserId) ?? 0) + 1);
  for (const activity of activities) {
    if (!lastActivity.has(activity.ownerUserId)) lastActivity.set(activity.ownerUserId, activity.createdAt);
  }

  return users.map((user) => {
    const subscription = subscriptionsByUser.get(user.id);
    const normalizedSubscription = subscription ?? {
      id: "",
      ownerUserId: user.id,
      plan: "plus",
      startedAt: user.createdAt,
      expiresAt: null,
      updatedAt: user.createdAt,
    };
    return {
      id: user.id,
      username: user.username,
      role: user.role === "admin" ? "admin" : "user",
      joinedAt: user.createdAt,
      lastActiveAt: lastActivity.get(user.id) ?? null,
      storedPlan: isPlanCode(normalizedSubscription.plan) ? normalizedSubscription.plan : "plus",
      subscription: toSubscriptionSummary(normalizedSubscription, now, catalog),
      usage: {
        telegramAccounts: accountUsage.get(user.id) ?? 0,
        campaigns: campaignUsage.get(user.id) ?? 0,
      },
    };
  });
}

export async function listAdminUsers(filters: { search?: string; plan?: PlanCode } = {}): Promise<AdminUserRecord[]> {
  const users = await buildAdminUserRecords(await getConfiguredPlanCatalog());
  const search = filters.search?.trim().toLowerCase();
  return users.filter((user) => (
    (!search || user.username.toLowerCase().includes(search))
    && (!filters.plan || user.storedPlan === filters.plan)
  ));
}

export async function getAdminUser(userId: string): Promise<AdminUserRecord | null> {
  const users = await buildAdminUserRecords(await getConfiguredPlanCatalog());
  return users.find((item) => item.id === userId) ?? null;
}

export async function getAdminOverview() {
  const [users, subscriptions, licenses, accounts, campaigns] = await Promise.all([
    db.select({ id: appUsersTable.id, role: appUsersTable.role, createdAt: appUsersTable.createdAt }).from(appUsersTable),
    db.select().from(subscriptionsTable),
    db.select().from(licenseKeysTable),
    db.select({ status: telegramAccountsTable.status }).from(telegramAccountsTable).where(isNull(telegramAccountsTable.deletedAt)),
    db.select({ status: campaignsTable.status }).from(campaignsTable),
  ]);
  const now = new Date();
  const distribution = { plus: 0, pro: 0, unlimited: 0, expired: 0 };
  const subscriptionsByUser = new Map(subscriptions.map((subscription) => [subscription.ownerUserId, subscription]));
  for (const user of users) {
    const subscription = subscriptionsByUser.get(user.id);
    const expired = Boolean(subscription?.expiresAt && subscription.expiresAt.getTime() <= now.getTime());
    if (expired) {
      distribution.expired += 1;
    } else {
      distribution[effectivePlan(subscription, now)] += 1;
    }
  }
  const licenseDistribution = { available: 0, claimed: 0, revoked: 0 };
  for (const license of licenses) licenseDistribution[licenseStatus(license)] += 1;
  return {
    usersTotal: users.length,
    usersNewLast30Days: users.filter((user) => user.createdAt.getTime() >= now.getTime() - 30 * DAY_MS).length,
    usersAdmins: users.filter((user) => user.role === "admin").length,
    subscriptions: distribution,
    licenses: licenseDistribution,
    telegramAccountsTotal: accounts.length,
    telegramAccountsConnected: accounts.filter((account) => account.status === "connected").length,
    campaignsTotal: campaigns.length,
    campaignsQueued: campaigns.filter((campaign) => ["queued", "scheduled", "running"].includes(campaign.status)).length,
    campaignsFailed: campaigns.filter((campaign) => campaign.status === "failed").length,
  };
}

export type AdminSubscriptionUpdateResult =
  | { ok: true; subscription: ReturnType<typeof toSubscriptionSummary>; action: "extension" | "upgrade" }
  | { ok: false; reason: "not_found" | "invalid_plan" | "downgrade" };

export async function updateSubscriptionByAdmin(input: {
  userId: string;
  adminUserId: string;
  plan: PlanCode;
  durationDays: number;
}): Promise<AdminSubscriptionUpdateResult> {
  const catalog = await getConfiguredPlanCatalog();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId}))`);
    const now = new Date();
    const [user] = await tx.select({ id: appUsersTable.id }).from(appUsersTable)
      .where(eq(appUsersTable.id, input.userId)).limit(1);
    if (!user) return { ok: false as const, reason: "not_found" as const };
    if (input.plan === "plus" || !Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 3660) {
      return { ok: false as const, reason: "invalid_plan" as const };
    }
    const [current] = await tx.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.ownerUserId, input.userId)).limit(1);
    const currentPlan = current ? (isPlanCode(current.plan) ? current.plan : "plus") : "plus";
    const currentIndex = PLAN_ORDER.indexOf(currentPlan);
    const nextIndex = PLAN_ORDER.indexOf(input.plan);
    if (nextIndex < currentIndex) return { ok: false as const, reason: "downgrade" as const };
    const action = nextIndex === currentIndex ? "extension" as const : "upgrade" as const;
    const retainedUntil = current?.expiresAt && current.expiresAt > now ? current.expiresAt.getTime() : now.getTime();
    const nextExpiresAt = new Date(retainedUntil + input.durationDays * DAY_MS);
    const values = {
      plan: input.plan,
      startedAt: current?.startedAt ?? now,
      expiresAt: nextExpiresAt,
      updatedAt: now,
    };
    const [next] = current
      ? await tx.update(subscriptionsTable).set(values).where(eq(subscriptionsTable.id, current.id)).returning()
      : await tx.insert(subscriptionsTable).values({ ownerUserId: input.userId, ...values }).returning();
    if (!next) throw new Error("Unable to update subscription");
    await tx.insert(activityLogsTable).values({
      ownerUserId: input.adminUserId,
      event: "subscription.admin_updated",
      level: "success",
      message: `${action === "upgrade" ? "Upgraded" : "Extended"} subscription for user ${input.userId}`,
      metadata: {
        targetUserId: input.userId,
        previousPlan: currentPlan,
        nextPlan: input.plan,
        durationDays: input.durationDays,
        action,
      },
    });
    return { ok: true as const, subscription: toSubscriptionSummary(next, now, catalog), action };
  });
}

export async function activateLicenseForUser(ownerUserId: string, rawLicenseKey: string) {
  const cleanedKey = normalizedLicenseKey(rawLicenseKey);
  if (!/^[A-Z0-9-]{8,128}$/.test(cleanedKey)) {
    return { ok: false as const, reason: "invalid_format" as const };
  }

  const catalog = await getConfiguredPlanCatalog();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ownerUserId}))`);
    const now = new Date();
    const [license] = await tx.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.keyHash, licenseKeyHash(cleanedKey))).limit(1);
    if (!license || license.claimedAt || license.revokedAt || !isPlanCode(license.plan) || license.durationDays < 1 || license.durationDays > 3660) {
      return { ok: false as const, reason: "invalid_or_used" as const };
    }

    const [current] = await tx.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.ownerUserId, ownerUserId)).limit(1);
    const hasActiveSubscription = Boolean(current && (!current.expiresAt || current.expiresAt > now));
    const currentPlan = hasActiveSubscription && current && isPlanCode(current.plan) ? current.plan : null;
    if (currentPlan && PLAN_ORDER.indexOf(license.plan) <= PLAN_ORDER.indexOf(currentPlan)) {
      return { ok: false as const, reason: "not_an_upgrade" as const };
    }

    const [claimed] = await tx.update(licenseKeysTable).set({
      claimedAt: now,
      claimedBy: ownerUserId,
    }).where(and(eq(licenseKeysTable.id, license.id), isNull(licenseKeysTable.claimedAt), isNull(licenseKeysTable.revokedAt))).returning();
    if (!claimed) return { ok: false as const, reason: "invalid_or_used" as const };

    const retainedUntil = current?.expiresAt && current.expiresAt > now ? current.expiresAt.getTime() : now.getTime();
    const nextExpiresAt = new Date(retainedUntil + license.durationDays * DAY_MS);
    const values = {
      plan: license.plan,
      startedAt: now,
      expiresAt: nextExpiresAt,
      updatedAt: now,
    };
    const [next] = current
      ? await tx.update(subscriptionsTable).set(values).where(eq(subscriptionsTable.id, current.id)).returning()
      : await tx.insert(subscriptionsTable).values({ ownerUserId, ...values }).returning();

    return { ok: true as const, subscription: toSubscriptionSummary(next, now, catalog) };
  });
}