import { and, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  activityLogsTable,
  appUsersTable,
  campaignTargetsTable,
  campaignsTable,
  db,
  destinationsTable,
  proxiesTable,
  telegramAccountsTable,
} from "@workspace/db";
import { getSubscription, type AdminUserRecord } from "./subscriptions";
import { getSystemSettings } from "./system-settings";

const SUPPORT_ERROR_LIMIT = 50;
const SUPPORT_ACTIVITY_LIMIT = 50;
const SUPPORT_TARGET_LIMIT = 100;

function destinationLink(username: string | null): string | null {
  if (!username) return null;
  const normalized = username.replace(/^@/, "").trim();
  return normalized ? `https://t.me/${normalized}` : null;
}

type SupportTarget = {
  id: string;
  campaignId: string;
  campaignName: string;
  destinationId: string;
  destinationTitle: string;
  destinationUsername: string | null;
  destinationLink: string | null;
  destinationKind: string;
  topicId: number | null;
  status: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  sentAt: Date | null;
  updatedAt: Date;
};

function toSupportTarget(target: Omit<SupportTarget, "destinationLink">): SupportTarget {
  return { ...target, destinationLink: destinationLink(target.destinationUsername) };
}

export type AdminUserSupportRecord = {
  user: AdminUserRecord;
  overview: {
    activeCampaigns: number;
    pausedCampaigns: number;
    campaignsWithErrors: number;
    sentToday: number;
    totalCampaigns: number;
    telegramAccountsTotal: number;
    telegramAccountsConnected: number;
    failedDeliveries: number;
    reviewDeliveries: number;
    destinationsTotal: number;
  };
  telegramAccounts: Array<{
    id: string;
    name: string;
    username: string | null;
    phoneMasked: string | null;
    status: string;
    proxyName: string | null;
    proxyStatus: string | null;
    lastSyncAt: Date | null;
    cooldownUntil: Date | null;
    destinationCount: number;
    campaignCount: number;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    content: string;
    templateMode: string;
    templateSourceAccountName: string | null;
    templateSourceMessageId: string | null;
    telegramAccountId: string | null;
    telegramAccountName: string | null;
    scheduledAt: Date | null;
    timezone: string;
    repeatCount: number;
    dailyQuota: {
      limit: number | null;
      used: number;
      remaining: number | null;
      sentToday: number;
      reservedToday: number;
    };
    destinationCount: number;
    deliveryCount: number;
    pendingCount: number;
    sendingCount: number;
    sentCount: number;
    failedCount: number;
    reviewCount: number;
  }>;
  campaignsTruncated: boolean;
  recentErrors: Array<SupportTarget>;
  activity: Array<{
    id: string;
    level: string;
    event: string;
    message: string;
    campaignId: string | null;
    accountId: string | null;
    createdAt: Date;
  }>;
};

export type AdminUserSupportCampaignTargetsRecord = {
  totalTargets: number;
  hasMore: boolean;
  targets: SupportTarget[];
};

export async function getAdminUserSupport(userId: string): Promise<AdminUserSupportRecord | null> {
  const [appUser] = await db.select({
    id: appUsersTable.id,
    username: appUsersTable.username,
    role: appUsersTable.role,
    createdAt: appUsersTable.createdAt,
  }).from(appUsersTable).where(eq(appUsersTable.id, userId)).limit(1);
  if (!appUser) return null;

  const [subscription, settings, accountUsage, campaignUsage, lastActivity] = await Promise.all([
    getSubscription(userId),
    getSystemSettings(),
    db.select({ value: count() }).from(telegramAccountsTable)
      .where(and(eq(telegramAccountsTable.ownerUserId, userId), isNull(telegramAccountsTable.deletedAt))),
    db.select({ value: count() }).from(campaignsTable)
      .where(eq(campaignsTable.ownerUserId, userId)),
    db.select({ createdAt: activityLogsTable.createdAt }).from(activityLogsTable)
      .where(eq(activityLogsTable.ownerUserId, userId))
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(1),
  ]);
  const dayStart = sql`date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
  const user: AdminUserRecord = {
    id: appUser.id,
    username: appUser.username,
    role: appUser.role === "admin" ? "admin" : "user",
    joinedAt: appUser.createdAt,
    lastActiveAt: lastActivity[0]?.createdAt ?? null,
    storedPlan: subscription.plan,
    subscription,
    usage: {
      telegramAccounts: accountUsage[0]?.value ?? 0,
      campaigns: campaignUsage[0]?.value ?? 0,
    },
  };

  const [accounts, destinationCounts, campaignAccountCounts, campaigns, campaignStatusCounts, targetStatusCounts, failingCampaignCount, sentTodayCount, activity, recentErrorRows] = await Promise.all([
    db.select({
      id: telegramAccountsTable.id,
      name: telegramAccountsTable.name,
      username: telegramAccountsTable.username,
      phoneMasked: telegramAccountsTable.phoneMasked,
      status: telegramAccountsTable.status,
      proxyId: telegramAccountsTable.proxyId,
      lastSyncAt: telegramAccountsTable.lastSyncAt,
      cooldownUntil: telegramAccountsTable.cooldownUntil,
    }).from(telegramAccountsTable)
      .where(and(eq(telegramAccountsTable.ownerUserId, userId), isNull(telegramAccountsTable.deletedAt))),
    db.select({
      accountId: destinationsTable.accountId,
      value: count(),
    }).from(destinationsTable)
      .innerJoin(telegramAccountsTable, eq(destinationsTable.accountId, telegramAccountsTable.id))
      .where(and(eq(telegramAccountsTable.ownerUserId, userId), isNull(telegramAccountsTable.deletedAt)))
      .groupBy(destinationsTable.accountId),
    db.select({
      accountId: campaignsTable.telegramAccountId,
      value: count(),
    }).from(campaignsTable)
      .where(and(eq(campaignsTable.ownerUserId, userId), isNotNull(campaignsTable.telegramAccountId)))
      .groupBy(campaignsTable.telegramAccountId),
    db.select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      content: campaignsTable.content,
      telegramAccountId: campaignsTable.telegramAccountId,
      templateMode: campaignsTable.templateMode,
      templateSourceAccountId: campaignsTable.templateSourceAccountId,
      templateSourceMessageId: campaignsTable.templateSourceMessageId,
      status: campaignsTable.status,
      scheduledAt: campaignsTable.scheduledAt,
      timezone: campaignsTable.timezone,
      repeatCount: campaignsTable.repeatCount,
    }).from(campaignsTable)
      .where(eq(campaignsTable.ownerUserId, userId))
       .orderBy(desc(campaignsTable.updatedAt)),
    db.select({
      status: campaignsTable.status,
      value: count(),
    }).from(campaignsTable)
      .where(eq(campaignsTable.ownerUserId, userId))
      .groupBy(campaignsTable.status),
    db.select({
      status: campaignTargetsTable.status,
      value: count(),
    }).from(campaignsTable)
      .leftJoin(campaignTargetsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
      .where(eq(campaignsTable.ownerUserId, userId))
      .groupBy(campaignTargetsTable.status),
    db.select({
      value: sql<number>`count(distinct ${campaignTargetsTable.campaignId})`.mapWith(Number),
    }).from(campaignTargetsTable)
      .innerJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
      .where(and(
        eq(campaignsTable.ownerUserId, userId),
        inArray(campaignTargetsTable.status, ["failed", "requires_review"]),
      )),
    db.select({ value: count() }).from(activityLogsTable)
      .where(and(
        eq(activityLogsTable.ownerUserId, userId),
        eq(activityLogsTable.event, "campaign.target.sent"),
        sql`${activityLogsTable.createdAt} >= ${dayStart}`,
      )),
    db.select({
      id: activityLogsTable.id,
      level: activityLogsTable.level,
      event: activityLogsTable.event,
      message: activityLogsTable.message,
      campaignId: activityLogsTable.campaignId,
      accountId: activityLogsTable.accountId,
      createdAt: activityLogsTable.createdAt,
    }).from(activityLogsTable)
      .where(eq(activityLogsTable.ownerUserId, userId))
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(SUPPORT_ACTIVITY_LIMIT),
    db.select({
      id: campaignTargetsTable.id,
      campaignId: campaignTargetsTable.campaignId,
      campaignName: campaignsTable.name,
      destinationId: destinationsTable.id,
      destinationTitle: destinationsTable.title,
      destinationUsername: destinationsTable.username,
      destinationKind: destinationsTable.kind,
      topicId: destinationsTable.topicId,
      status: campaignTargetsTable.status,
      attempts: campaignTargetsTable.attempts,
      lastError: campaignTargetsTable.lastError,
      nextAttemptAt: campaignTargetsTable.nextAttemptAt,
      sentAt: campaignTargetsTable.sentAt,
      updatedAt: campaignTargetsTable.updatedAt,
    }).from(campaignTargetsTable)
      .innerJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
      .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
      .where(and(
        eq(campaignsTable.ownerUserId, userId),
        or(
          inArray(campaignTargetsTable.status, ["failed", "requires_review"]),
          isNotNull(campaignTargetsTable.lastError),
        ),
      ))
      .orderBy(desc(campaignTargetsTable.updatedAt))
      .limit(SUPPORT_ERROR_LIMIT),
  ]);

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const campaignMetrics = campaignIds.length
    ? await db.select({
      campaignId: campaignTargetsTable.campaignId,
      deliveryCount: count(),
      destinationCount: sql<number>`count(distinct ${campaignTargetsTable.destinationId})`.mapWith(Number),
      pendingCount: sql<number>`count(*) filter (where ${campaignTargetsTable.status} = 'pending')`.mapWith(Number),
      sendingCount: sql<number>`count(*) filter (where ${campaignTargetsTable.status} = 'sending')`.mapWith(Number),
      sentCount: sql<number>`count(*) filter (where ${campaignTargetsTable.status} = 'sent')`.mapWith(Number),
      failedCount: sql<number>`count(*) filter (where ${campaignTargetsTable.status} = 'failed')`.mapWith(Number),
      reviewCount: sql<number>`count(*) filter (where ${campaignTargetsTable.status} = 'requires_review')`.mapWith(Number),
       sentToday: sql<number>`count(*) filter (where ${campaignTargetsTable.status} = 'sent' and (
         ${campaignTargetsTable.quotaReservedAt} >= date_trunc('day', now() AT TIME ZONE ${settings.defaultTimezone}) AT TIME ZONE ${settings.defaultTimezone}
         or (${campaignTargetsTable.quotaReservedAt} is null and ${campaignTargetsTable.sentAt} >= date_trunc('day', now() AT TIME ZONE ${settings.defaultTimezone}) AT TIME ZONE ${settings.defaultTimezone})
       ))`.mapWith(Number),
       reservedToday: sql<number>`count(*) filter (where ${campaignTargetsTable.status} in ('sending', 'requires_review') and
         ${campaignTargetsTable.quotaReservedAt} >= date_trunc('day', now() AT TIME ZONE ${settings.defaultTimezone}) AT TIME ZONE ${settings.defaultTimezone}
       )`.mapWith(Number),
    }).from(campaignTargetsTable)
      .where(inArray(campaignTargetsTable.campaignId, campaignIds))
      .groupBy(campaignTargetsTable.campaignId)
    : [];
  const proxyIds = accounts.flatMap((account) => account.proxyId ? [account.proxyId] : []);
  const proxies = proxyIds.length
    ? await db.select({
      id: proxiesTable.id,
      name: proxiesTable.name,
      status: proxiesTable.status,
    }).from(proxiesTable).where(inArray(proxiesTable.id, proxyIds))
    : [];

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const destinationCountByAccount = new Map(destinationCounts.map((item) => [item.accountId, item.value]));
  const campaignCountByAccount = new Map(
    campaignAccountCounts.flatMap((item) => item.accountId ? [[item.accountId, item.value] as const] : []),
  );
  const proxyById = new Map(proxies.map((proxy) => [proxy.id, proxy]));
  const sourceAccountNameById = new Map(accounts.map((account) => [account.id, account.name]));
  const metricByCampaign = new Map(campaignMetrics.map((metric) => [metric.campaignId, metric]));

  const telegramAccounts = accounts.map((account) => {
    const proxy = account.proxyId ? proxyById.get(account.proxyId) : undefined;
    return {
      id: account.id,
      name: account.name,
      username: account.username,
      phoneMasked: account.phoneMasked,
      status: account.status,
      proxyName: proxy?.name ?? null,
      proxyStatus: proxy?.status ?? null,
      lastSyncAt: account.lastSyncAt,
      cooldownUntil: account.cooldownUntil,
      destinationCount: destinationCountByAccount.get(account.id) ?? 0,
      campaignCount: campaignCountByAccount.get(account.id) ?? 0,
    };
  });

  const supportCampaigns = campaigns.map((campaign) => {
    const metrics = metricByCampaign.get(campaign.id);
    const account = campaign.telegramAccountId ? accountById.get(campaign.telegramAccountId) : undefined;
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      content: campaign.content,
      templateMode: campaign.templateMode,
      templateSourceAccountName: campaign.templateSourceAccountId
        ? sourceAccountNameById.get(campaign.templateSourceAccountId) ?? null
        : null,
      templateSourceMessageId: campaign.templateSourceMessageId,
      telegramAccountId: campaign.telegramAccountId,
      telegramAccountName: account?.name ?? null,
      scheduledAt: campaign.scheduledAt,
      timezone: campaign.timezone,
      repeatCount: campaign.repeatCount,
       dailyQuota: {
         limit: subscription.messageDailyLimit,
         used: subscription.messageDailyLimit === null
           ? (metrics?.sentToday ?? 0) + (metrics?.reservedToday ?? 0)
           : Math.min(
             (metrics?.sentToday ?? 0) + (metrics?.reservedToday ?? 0),
             subscription.messageDailyLimit,
           ),
         remaining: subscription.messageDailyLimit === null
           ? null
           : Math.max(
             0,
             subscription.messageDailyLimit - (metrics?.sentToday ?? 0) - (metrics?.reservedToday ?? 0),
           ),
         sentToday: metrics?.sentToday ?? 0,
         reservedToday: metrics?.reservedToday ?? 0,
       },
      destinationCount: metrics?.destinationCount ?? 0,
      deliveryCount: metrics?.deliveryCount ?? 0,
      pendingCount: metrics?.pendingCount ?? 0,
      sendingCount: metrics?.sendingCount ?? 0,
      sentCount: metrics?.sentCount ?? 0,
      failedCount: metrics?.failedCount ?? 0,
      reviewCount: metrics?.reviewCount ?? 0,
    };
  });

  const campaignStatusCount = new Map(campaignStatusCounts.map((item) => [item.status, item.value]));
  const targetStatusCount = new Map(targetStatusCounts.map((item) => [item.status ?? "none", item.value]));
  const failedDeliveries = targetStatusCount.get("failed") ?? 0;
  const reviewDeliveries = targetStatusCount.get("requires_review") ?? 0;
  const campaignsWithErrors = failingCampaignCount[0]?.value ?? 0;
  const connectedStatuses = new Set(["connected", "active"]);

  return {
    user,
    overview: {
      activeCampaigns: (campaignStatusCount.get("queued") ?? 0) + (campaignStatusCount.get("running") ?? 0),
      pausedCampaigns: campaignStatusCount.get("paused") ?? 0,
      campaignsWithErrors,
      sentToday: sentTodayCount[0]?.value ?? 0,
      totalCampaigns: user.usage.campaigns,
      telegramAccountsTotal: accounts.length,
      telegramAccountsConnected: accounts.filter((account) => connectedStatuses.has(account.status)).length,
      failedDeliveries,
      reviewDeliveries,
      destinationsTotal: [...destinationCountByAccount.values()].reduce((total, value) => total + value, 0),
    },
    telegramAccounts,
    campaigns: supportCampaigns,
    campaignsTruncated: false,
    recentErrors: recentErrorRows.map(toSupportTarget),
    activity,
  };
}

export async function getAdminUserSupportCampaignTargets(input: {
  userId: string;
  campaignId: string;
  limit: number;
  offset: number;
}): Promise<AdminUserSupportCampaignTargetsRecord | null> {
  const [campaign] = await db.select({ id: campaignsTable.id }).from(campaignsTable)
    .where(and(eq(campaignsTable.id, input.campaignId), eq(campaignsTable.ownerUserId, input.userId)))
    .limit(1);
  if (!campaign) return null;

  const limit = Math.min(Math.max(input.limit, 1), SUPPORT_TARGET_LIMIT);
  const [total, targets] = await Promise.all([
    db.select({ value: count() }).from(campaignTargetsTable)
      .where(eq(campaignTargetsTable.campaignId, campaign.id)),
    db.select({
      id: campaignTargetsTable.id,
      campaignId: campaignTargetsTable.campaignId,
      campaignName: campaignsTable.name,
      destinationId: destinationsTable.id,
      destinationTitle: destinationsTable.title,
      destinationUsername: destinationsTable.username,
      destinationKind: destinationsTable.kind,
      topicId: destinationsTable.topicId,
      status: campaignTargetsTable.status,
      attempts: campaignTargetsTable.attempts,
      lastError: campaignTargetsTable.lastError,
      nextAttemptAt: campaignTargetsTable.nextAttemptAt,
      sentAt: campaignTargetsTable.sentAt,
      updatedAt: campaignTargetsTable.updatedAt,
    }).from(campaignTargetsTable)
      .innerJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
      .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
      .where(eq(campaignTargetsTable.campaignId, campaign.id))
      .orderBy(desc(campaignTargetsTable.updatedAt), desc(campaignTargetsTable.id))
      .limit(limit)
      .offset(input.offset),
  ]);
  const totalTargets = total[0]?.value ?? 0;
  return {
    totalTargets,
    hasMore: input.offset + targets.length < totalTargets,
    targets: targets.map(toSupportTarget),
  };
}