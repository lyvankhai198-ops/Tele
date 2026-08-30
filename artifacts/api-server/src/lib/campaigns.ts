import { and, asc, count, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  campaignTargetsTable,
  campaignsTable,
  db,
  destinationsTable,
  pool,
  telegramAccountsTable,
} from "@workspace/db";
import { recordActivity } from "./activity";
import {
  forwardTelegramSavedMessage,
  isDevelopmentDemoTelegramAccount,
  isTelegramSafePreSendTimeout,
  sendTelegramMessage,
} from "./telegram";
import { logger } from "./logger";
import { getSubscription } from "./subscriptions";
import { getSystemSettings } from "./system-settings";
import {
  legacyScheduleOffsetMs,
  nextCampaignDailyStart,
  rebasePastPendingSchedule,
  rebaseQuotaPausedSchedule,
} from "./campaign-schedule";
import { canReserveDailyQuota, isWithinDailyQuota } from "./campaign-policy";
import { getDatabaseNow } from "./database-clock";
import {
  getUserDailyQuotaUsage,
  releaseUserDailyQuota,
  reserveUserDailyQuota,
  type UserDailyQuotaReservation,
} from "./user-daily-quota";

const MAX_FLOOD_WAIT_SECONDS = 24 * 60 * 60;
const DELIVERY_LEASE_MS = 5 * 60_000;
const DELIVERY_LEASE_RENEW_MS = 60_000;

class OwnerDeliveryBusyError extends Error {
  constructor() {
    super("Another delivery for this owner is already being processed.");
    this.name = "OwnerDeliveryBusyError";
  }
}

/**
 * Older campaigns could be created after their selected schedule had already
 * passed (for example, selecting today's date with an empty time defaulted to
 * 00:00). Their later rounds were incorrectly anchored to that old timestamp.
 * Rebase only untouched pending deliveries, preserving sent deliveries and
 * explicit retry/quota schedules.
 */
export async function rebaseLegacyPastScheduleCampaigns() {
  const now = new Date();
  const activeCampaigns = await db.select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(inArray(campaignsTable.status, ["queued", "running"]));

  let rebasedCampaigns = 0;
  let rebasedTargets = 0;
  for (const candidate of activeCampaigns) {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM ${campaignsTable} WHERE ${campaignsTable.id} = ${candidate.id} FOR UPDATE`);
      const [campaign] = await tx.select({
        id: campaignsTable.id,
        status: campaignsTable.status,
        scheduledAt: campaignsTable.scheduledAt,
        createdAt: campaignsTable.createdAt,
      }).from(campaignsTable).where(eq(campaignsTable.id, candidate.id));
      if (!campaign || !["queued", "running"].includes(campaign.status)) return { campaigns: 0, targets: 0 };

      const offsetMs = legacyScheduleOffsetMs(campaign.scheduledAt, campaign.createdAt);
      if (offsetMs === 0) return { campaigns: 0, targets: 0 };

      const pendingTargets = await tx.select({
        id: campaignTargetsTable.id,
        nextAttemptAt: campaignTargetsTable.nextAttemptAt,
      }).from(campaignTargetsTable).where(and(
        eq(campaignTargetsTable.campaignId, campaign.id),
        eq(campaignTargetsTable.status, "pending"),
        isNull(campaignTargetsTable.lastError),
        gte(campaignTargetsTable.nextAttemptAt, now),
      ));

      let targets = 0;
      for (const target of pendingTargets) {
        if (!target.nextAttemptAt) continue;
        const [rebased] = await tx.update(campaignTargetsTable).set({
          nextAttemptAt: new Date(target.nextAttemptAt.getTime() + offsetMs),
          updatedAt: now,
        }).where(and(
          eq(campaignTargetsTable.id, target.id),
          eq(campaignTargetsTable.status, "pending"),
          isNull(campaignTargetsTable.lastError),
          eq(campaignTargetsTable.nextAttemptAt, target.nextAttemptAt),
        )).returning({ id: campaignTargetsTable.id });
        if (rebased) targets += 1;
      }

      // Null is the durable marker for an immediately configured campaign.
      // It prevents this legacy correction from ever applying again.
      await tx.update(campaignsTable).set({
        scheduledAt: null,
        updatedAt: now,
      }).where(eq(campaignsTable.id, campaign.id));
      return { campaigns: 1, targets };
    });
    rebasedCampaigns += result.campaigns;
    rebasedTargets += result.targets;
  }

  if (rebasedCampaigns > 0) {
    logger.info({ rebasedCampaigns, rebasedTargets }, "Rebased active campaign schedules that were anchored before configuration time");
  }
}

/**
 * Prepare a paused campaign to resume without compressing its remaining rounds
 * into one immediate burst. Only ordinary pending targets are shifted; retries,
 * review states, in-flight deliveries, and confirmed sends are left intact.
 */
export async function rebaseCampaignScheduleForResume(campaignId: string, resumedAt = new Date()) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ${campaignsTable} WHERE ${campaignsTable.id} = ${campaignId} FOR UPDATE`);
    const [campaign] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
    if (!campaign || campaign.status !== "paused") {
      return { rebasedTargetCount: 0, clearedPastSchedule: false, nextRunAt: null, resumedAt };
    }

    await tx.execute(sql`SELECT 1 FROM ${campaignTargetsTable} WHERE ${campaignTargetsTable.campaignId} = ${campaignId} FOR UPDATE`);
    const targets = await tx.select({
      id: campaignTargetsTable.id,
      status: campaignTargetsTable.status,
      lastError: campaignTargetsTable.lastError,
      nextAttemptAt: campaignTargetsTable.nextAttemptAt,
    }).from(campaignTargetsTable).where(eq(campaignTargetsTable.campaignId, campaignId));
    const rebase = rebasePastPendingSchedule(targets, resumedAt);

    let rebasedTargetCount = 0;
    for (const update of rebase.updates) {
      const [updated] = await tx.update(campaignTargetsTable).set({
        nextAttemptAt: update.nextAttemptAt,
        updatedAt: resumedAt,
      }).where(and(
        eq(campaignTargetsTable.id, update.id),
        eq(campaignTargetsTable.status, "pending"),
        isNull(campaignTargetsTable.lastError),
        eq(campaignTargetsTable.nextAttemptAt, update.previousNextAttemptAt),
      )).returning({ id: campaignTargetsTable.id });
      if (updated) rebasedTargetCount += 1;
    }

    const clearedPastSchedule = Boolean(campaign.scheduledAt && campaign.scheduledAt <= resumedAt);
    if (clearedPastSchedule) {
      await tx.update(campaignsTable).set({
        scheduledAt: null,
        updatedAt: resumedAt,
      }).where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.status, "paused")));
    }

    return { rebasedTargetCount, clearedPastSchedule, nextRunAt: rebase.nextRunAt, resumedAt };
  });
}

async function withOwnerDeliveryLock<T>(ownerUserId: string, action: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const lockKey = `telecampaign:delivery:${ownerUserId}`;
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [lockKey],
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) throw new OwnerDeliveryBusyError();
    return await action();
  } finally {
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      }
    } finally {
      client.release();
    }
  }
}

const DAILY_QUOTA_PAUSE_REASON = "Daily message limit reached. Campaign paused and will resume automatically on a new day.";
const LEGACY_DAILY_QUOTA_PAUSE_REASON = "Daily message limit reached. Campaign paused until you resume it on a new day.";
const USER_DAILY_QUOTA_PAUSE_REASON = "Daily user message limit reached. Campaign paused and will resume automatically on a new day.";
const DAILY_QUOTA_PAUSE_REASONS = [
  DAILY_QUOTA_PAUSE_REASON,
  LEGACY_DAILY_QUOTA_PAUSE_REASON,
  USER_DAILY_QUOTA_PAUSE_REASON,
];
const DAILY_QUOTA_CAMPAIGN_PAUSE_REASONS = ["daily_quota", "user_daily_quota"];

type DailyQuotaResult =
  | { pausedForQuota: true }
  | { pausedForQuota: false; userQuotaReservation?: UserDailyQuotaReservation };

async function reserveCampaignDailyQuota(input: {
  campaign: typeof campaignsTable.$inferSelect;
  targetId: string;
  limit: number;
  timezone: string;
  reservedAt: Date;
}): Promise<boolean> {
  const state = await getCampaignDailyQuotaState({
    campaignId: input.campaign.id,
    timezone: input.timezone,
    now: input.reservedAt,
  });
  if (!canReserveDailyQuota(state, input.limit)) return false;

  const dayStart = sql`date_trunc('day', ${input.reservedAt}::timestamptz AT TIME ZONE ${input.timezone}) AT TIME ZONE ${input.timezone}`;
  const [reserved] = await db.update(campaignTargetsTable).set({
    quotaReservedAt: input.reservedAt,
    updatedAt: input.reservedAt,
  }).where(and(
    eq(campaignTargetsTable.id, input.targetId),
    eq(campaignTargetsTable.status, "sending"),
    isNull(campaignTargetsTable.quotaReservedAt),
  )).returning({ id: campaignTargetsTable.id });
  if (!reserved) {
    throw new Error("Delivery quota reservation could not be persisted; manual review is required.");
  }

  const [reservedAfterClaim] = await db.select({ value: count() }).from(campaignTargetsTable)
    .where(and(
      eq(campaignTargetsTable.campaignId, input.campaign.id),
      inArray(campaignTargetsTable.status, ["sending", "requires_review"]),
      gte(campaignTargetsTable.quotaReservedAt, dayStart),
    ));
  return isWithinDailyQuota(
    { ...state, reservedToday: reservedAfterClaim?.value ?? state.reservedToday + 1 },
    input.limit,
  );
}

async function getCampaignDailyQuotaState(input: {
  campaignId: string;
  timezone: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const dayStart = sql`date_trunc('day', ${now}::timestamptz AT TIME ZONE ${input.timezone}) AT TIME ZONE ${input.timezone}`;
  const [sentUsage] = await db.select({ value: count() }).from(campaignTargetsTable)
    .where(and(
      eq(campaignTargetsTable.campaignId, input.campaignId),
      eq(campaignTargetsTable.status, "sent"),
      or(
        gte(campaignTargetsTable.quotaReservedAt, dayStart),
        and(
          isNull(campaignTargetsTable.quotaReservedAt),
          gte(campaignTargetsTable.sentAt, dayStart),
        ),
      ),
    ));
  const [reservedUsage] = await db.select({ value: count() }).from(campaignTargetsTable)
    .where(and(
      eq(campaignTargetsTable.campaignId, input.campaignId),
      inArray(campaignTargetsTable.status, ["sending", "requires_review"]),
      gte(campaignTargetsTable.quotaReservedAt, dayStart),
    ));
  return {
    sentToday: sentUsage?.value ?? 0,
    reservedToday: reservedUsage?.value ?? 0,
  };
}

async function pauseForDailyQuota(
  campaign: typeof campaignsTable.$inferSelect,
  targetId: string,
  previousAttempts: number,
): Promise<DailyQuotaResult> {
  const [subscription, settings] = await Promise.all([
    getSubscription(campaign.ownerUserId),
    getSystemSettings(),
  ]);
  const timezone = settings.defaultTimezone.replace(/'/g, "");
  let quotaScope: "campaign" | "user" | null = null;
  const reservationTime = new Date();

  if (subscription.messageDailyLimit !== null) {
    const reserved = await reserveCampaignDailyQuota({
      campaign,
      targetId,
      limit: subscription.messageDailyLimit,
      timezone,
      reservedAt: reservationTime,
    });
    if (!reserved) quotaScope = "campaign";
  }

  // Each delivery must hold both reservations before it reaches Telegram. The
  // per-user ledger survives campaign deletion; the target reservation keeps
  // the existing per-campaign guard intact.
  if (!quotaScope && subscription.userMessageDailyLimit !== null) {
    const userQuotaReservation = await reserveUserDailyQuota({
      ownerUserId: campaign.ownerUserId,
      limit: subscription.userMessageDailyLimit,
      timezone,
      reservedAt: reservationTime,
    });
    if (userQuotaReservation) {
      return { pausedForQuota: false, userQuotaReservation };
    }
    quotaScope = "user";
  }

  if (!quotaScope) return { pausedForQuota: false };

  const now = new Date();
  const pauseReason = quotaScope === "user"
    ? USER_DAILY_QUOTA_PAUSE_REASON
    : DAILY_QUOTA_PAUSE_REASON;
  const pauseResult = await db.transaction(async (tx) => {
    const [target] = await tx.update(campaignTargetsTable).set({
      status: "pending",
      attempts: previousAttempts,
      quotaReservedAt: null,
      lastError: pauseReason,
      updatedAt: now,
    }).where(and(
      eq(campaignTargetsTable.id, targetId),
      eq(campaignTargetsTable.status, "sending"),
    )).returning({ id: campaignTargetsTable.id });
    if (!target) return false;

    const [pausedCampaign] = await tx.update(campaignsTable).set({
      status: "paused",
      pauseReason: quotaScope === "user" ? "user_daily_quota" : "daily_quota",
      updatedAt: now,
    }).where(and(
      eq(campaignsTable.id, campaign.id),
      inArray(campaignsTable.status, ["queued", "running"]),
    )).returning({ id: campaignsTable.id });
    return Boolean(pausedCampaign);
  });
  if (pauseResult) {
    const isUserQuota = quotaScope === "user";
    const messageDailyLimit = isUserQuota
      ? subscription.userMessageDailyLimit
      : subscription.messageDailyLimit;
    await recordActivity({
      ownerUserId: campaign.ownerUserId,
      event: "campaign.paused.daily_quota_reached",
      level: "warning",
      campaignId: campaign.id,
      targetId,
      message: isUserQuota
        ? `Daily user message limit of ${messageDailyLimit} reached. Campaign will resume automatically on a new day.`
        : `Daily message limit of ${messageDailyLimit} reached. Campaign will resume automatically on a new day.`,
      metadata: {
        quotaScope,
        campaignDailyMessageLimit: subscription.messageDailyLimit,
        userMessageDailyLimit: subscription.userMessageDailyLimit,
        automaticResume: true,
      },
    });
  }
  return { pausedForQuota: true };
}

async function resumeDailyQuotaPausedCampaigns() {
  const settings = await getSystemSettings();
  const timezone = settings.defaultTimezone.replace(/'/g, "");
  const resetObservedAt = await getDatabaseNow();
  const dayStart = sql`date_trunc('day', ${resetObservedAt}::timestamptz AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`;
  const candidates = await db.select({
    id: campaignsTable.id,
    ownerUserId: campaignsTable.ownerUserId,
    pauseReason: campaignsTable.pauseReason,
    scheduleAnchorAt: campaignsTable.scheduleAnchorAt,
    scheduledAt: campaignsTable.scheduledAt,
    createdAt: campaignsTable.createdAt,
    timezone: campaignsTable.timezone,
  }).from(campaignsTable)
    .innerJoin(campaignTargetsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
    .where(and(
      eq(campaignsTable.status, "paused"),
      or(
        isNull(campaignsTable.pauseReason),
        inArray(campaignsTable.pauseReason, DAILY_QUOTA_CAMPAIGN_PAUSE_REASONS),
      ),
      eq(campaignTargetsTable.status, "pending"),
      inArray(campaignTargetsTable.lastError, DAILY_QUOTA_PAUSE_REASONS),
      lt(campaignTargetsTable.updatedAt, dayStart),
    ));

  const uniqueCandidates = new Map(candidates.map((campaign) => [campaign.id, campaign]));
  for (const candidate of uniqueCandidates.values()) {
    const subscription = await getSubscription(candidate.ownerUserId);
    if (subscription.status !== "active") continue;
    const scheduleAnchorAt = candidate.scheduleAnchorAt ?? candidate.scheduledAt ?? candidate.createdAt;
    const nextRunAt = nextCampaignDailyStart(scheduleAnchorAt, resetObservedAt, candidate.timezone);
    const rebase = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM ${campaignsTable} WHERE ${campaignsTable.id} = ${candidate.id} FOR UPDATE`);
      const [currentCampaign] = await tx.select({
        status: campaignsTable.status,
        pauseReason: campaignsTable.pauseReason,
      }).from(campaignsTable).where(eq(campaignsTable.id, candidate.id));
      if (!currentCampaign || currentCampaign.status !== "paused" || (
        currentCampaign.pauseReason !== null
        && !DAILY_QUOTA_CAMPAIGN_PAUSE_REASONS.includes(currentCampaign.pauseReason)
      )) return null;

      await tx.execute(sql`SELECT 1 FROM ${campaignTargetsTable} WHERE ${campaignTargetsTable.campaignId} = ${candidate.id} FOR UPDATE`);
      const targets = await tx.select({
        id: campaignTargetsTable.id,
        status: campaignTargetsTable.status,
        lastError: campaignTargetsTable.lastError,
        nextAttemptAt: campaignTargetsTable.nextAttemptAt,
        updatedAt: campaignTargetsTable.updatedAt,
      }).from(campaignTargetsTable).where(eq(campaignTargetsTable.campaignId, candidate.id));
      const scheduleRebase = rebaseQuotaPausedSchedule(targets, nextRunAt, DAILY_QUOTA_PAUSE_REASONS);
      if (!scheduleRebase) return null;

      for (const update of scheduleRebase.updates) {
        const [updated] = await tx.update(campaignTargetsTable).set({
          nextAttemptAt: update.nextAttemptAt,
          ...(update.clearQuotaPauseMarker ? { lastError: null } : {}),
          updatedAt: resetObservedAt,
        }).where(and(
          eq(campaignTargetsTable.id, update.id),
          eq(campaignTargetsTable.status, "pending"),
          update.previousLastError === null
            ? isNull(campaignTargetsTable.lastError)
            : eq(campaignTargetsTable.lastError, update.previousLastError),
          update.previousNextAttemptAt === null
            ? isNull(campaignTargetsTable.nextAttemptAt)
            : eq(campaignTargetsTable.nextAttemptAt, update.previousNextAttemptAt),
        )).returning({ id: campaignTargetsTable.id });
        if (!updated) {
          throw new Error(`Quota reset schedule changed concurrently for target ${update.id}`);
        }
      }

      const [resumed] = await tx.update(campaignsTable).set({
        status: "queued",
        pauseReason: null,
        updatedAt: resetObservedAt,
      }).where(and(
        eq(campaignsTable.id, candidate.id),
        eq(campaignsTable.status, "paused"),
      )).returning({ id: campaignsTable.id });
      return resumed ? scheduleRebase : null;
    });
    if (!rebase) continue;
    await recordActivity({
      ownerUserId: candidate.ownerUserId,
      event: "campaign.resumed.daily_quota_reset",
      level: "info",
      campaignId: candidate.id,
      message: "Campaign was scheduled automatically after the daily message limit reset.",
      metadata: { automaticResume: true, nextRunAt: rebase.nextRunAt.toISOString(), scheduleRebased: true },
    });
  }
}

export async function resumeQuotaPausedCampaignsAfterSettingsUpdate(input: {
  ownerUserId?: string;
  pauseReasons?: readonly string[];
  trigger?: "system_settings_updated" | "admin_quota_exemption";
} = {}): Promise<number> {
  const pauseReasons = input.pauseReasons ?? DAILY_QUOTA_PAUSE_REASONS;
  const trigger = input.trigger ?? "system_settings_updated";
  const settings = await getSystemSettings();
  const timezone = settings.defaultTimezone.replace(/'/g, "");
  const candidates = await db.select({
    id: campaignsTable.id,
    ownerUserId: campaignsTable.ownerUserId,
  }).from(campaignsTable)
    .innerJoin(campaignTargetsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
    .where(and(
      eq(campaignsTable.status, "paused"),
      eq(campaignTargetsTable.status, "pending"),
      inArray(campaignTargetsTable.lastError, pauseReasons),
      ...(input.ownerUserId ? [eq(campaignsTable.ownerUserId, input.ownerUserId)] : []),
    ));

  const uniqueCandidates = new Map(candidates.map((campaign) => [campaign.id, campaign]));
  let resumedCount = 0;
  for (const candidate of uniqueCandidates.values()) {
    const subscription = await getSubscription(candidate.ownerUserId);
    if (subscription.status !== "active") continue;
    if (subscription.messageDailyLimit !== null) {
      const usage = await getCampaignDailyQuotaState({ campaignId: candidate.id, timezone });
      if (!canReserveDailyQuota(usage, subscription.messageDailyLimit)) continue;
    }
    if (subscription.userMessageDailyLimit !== null) {
      const usage = await getUserDailyQuotaUsage({ ownerUserId: candidate.ownerUserId, timezone });
      if (!canReserveDailyQuota({ sentToday: usage, reservedToday: 0 }, subscription.userMessageDailyLimit)) continue;
    }
    const resumedAt = new Date();
    const [resumed] = await db.update(campaignsTable).set({
      status: "queued",
      pauseReason: null,
      updatedAt: resumedAt,
    }).where(and(
      eq(campaignsTable.id, candidate.id),
      eq(campaignsTable.status, "paused"),
    )).returning({ id: campaignsTable.id });
    if (!resumed) continue;
    await db.update(campaignTargetsTable).set({
      lastError: null,
      nextAttemptAt: resumedAt,
      updatedAt: resumedAt,
    }).where(and(
      eq(campaignTargetsTable.campaignId, candidate.id),
      eq(campaignTargetsTable.status, "pending"),
      inArray(campaignTargetsTable.lastError, pauseReasons),
    ));
    await recordActivity({
      ownerUserId: candidate.ownerUserId,
      event: "campaign.resumed.daily_quota_settings_updated",
      level: "info",
      campaignId: candidate.id,
      message: trigger === "admin_quota_exemption"
        ? "Campaign resumed after an administrator removed the daily user message limit."
        : "Campaign resumed after the daily message limit was increased.",
      metadata: { automaticResume: true, trigger },
    });
    resumedCount += 1;
  }
  return resumedCount;
}

/**
 * A lower setting takes effect before the next worker poll. Completed
 * deliveries remain intact; only a pending delivery is marked as the durable
 * auto-resume trigger and the campaign stops accepting new claims.
 */
export async function pauseCampaignsOverCurrentQuotaAfterSettingsUpdate(): Promise<number> {
  const settings = await getSystemSettings();
  const timezone = settings.defaultTimezone.replace(/'/g, "");
  const activeCampaigns = await db.select().from(campaignsTable)
    .where(inArray(campaignsTable.status, ["queued", "running"]));
  const userQuotaReached = new Map<string, boolean>();
  let pausedCount = 0;

  for (const campaign of activeCampaigns) {
    const subscription = await getSubscription(campaign.ownerUserId);
    if (subscription.status !== "active") continue;

    let quotaScope: "campaign" | "user" | null = null;
    let limit: number | null = null;
    if (subscription.messageDailyLimit !== null) {
      const usage = await getCampaignDailyQuotaState({ campaignId: campaign.id, timezone });
      if (!canReserveDailyQuota(usage, subscription.messageDailyLimit)) {
        quotaScope = "campaign";
        limit = subscription.messageDailyLimit;
      }
    }
    if (!quotaScope && subscription.userMessageDailyLimit !== null) {
      let reached = userQuotaReached.get(campaign.ownerUserId);
      if (reached === undefined) {
        const usage = await getUserDailyQuotaUsage({ ownerUserId: campaign.ownerUserId, timezone });
        reached = !canReserveDailyQuota({ sentToday: usage, reservedToday: 0 }, subscription.userMessageDailyLimit);
        userQuotaReached.set(campaign.ownerUserId, reached);
      }
      if (reached) {
        quotaScope = "user";
        limit = subscription.userMessageDailyLimit;
      }
    }
    if (!quotaScope) continue;

    const pauseReason = quotaScope === "user"
      ? USER_DAILY_QUOTA_PAUSE_REASON
      : DAILY_QUOTA_PAUSE_REASON;
    const now = new Date();
    const paused = await db.transaction(async (tx) => {
      const [nextTarget] = await tx.select({ id: campaignTargetsTable.id })
        .from(campaignTargetsTable)
        .where(and(
          eq(campaignTargetsTable.campaignId, campaign.id),
          eq(campaignTargetsTable.status, "pending"),
        ))
        .orderBy(asc(campaignTargetsTable.nextAttemptAt))
        .limit(1);
      if (!nextTarget) return false;
      const [trigger] = await tx.update(campaignTargetsTable).set({
        lastError: pauseReason,
        nextAttemptAt: null,
        quotaReservedAt: null,
        updatedAt: now,
      }).where(and(
        eq(campaignTargetsTable.id, nextTarget.id),
        eq(campaignTargetsTable.status, "pending"),
      )).returning({ id: campaignTargetsTable.id });
      if (!trigger) return false;
      const [pausedCampaign] = await tx.update(campaignsTable).set({
        status: "paused",
        pauseReason: quotaScope === "user" ? "user_daily_quota" : "daily_quota",
        updatedAt: now,
      }).where(and(
        eq(campaignsTable.id, campaign.id),
        inArray(campaignsTable.status, ["queued", "running"]),
      )).returning({ id: campaignsTable.id });
      return Boolean(pausedCampaign);
    });
    if (!paused) continue;
    pausedCount += 1;
    await recordActivity({
      ownerUserId: campaign.ownerUserId,
      event: "campaign.paused.daily_quota_settings_reduced",
      level: "warning",
      campaignId: campaign.id,
      message: quotaScope === "user"
        ? `Daily user message limit of ${limit} reached after the settings update. Campaign will resume automatically on a new day.`
        : `Daily message limit of ${limit} reached after the settings update. Campaign will resume automatically on a new day.`,
      metadata: {
        quotaScope,
        campaignDailyMessageLimit: subscription.messageDailyLimit,
        userMessageDailyLimit: subscription.userMessageDailyLimit,
        automaticResume: true,
        trigger: "system_settings_reduced",
      },
    });
  }
  return pausedCount;
}

/**
 * Requeue only campaigns whose persisted pause reason was subscription expiry.
 * This deliberately excludes manual and quota pauses, even if a subscription
 * has since become active.
 */
async function resumeSubscriptionExpiryPausedCampaigns() {
  const resumedAt = await getDatabaseNow();
  const candidates = await db.select({
    id: campaignsTable.id,
    ownerUserId: campaignsTable.ownerUserId,
  }).from(campaignsTable).where(and(
    eq(campaignsTable.status, "paused"),
    eq(campaignsTable.pauseReason, "subscription_expired"),
  ));

  let resumedCount = 0;
  for (const candidate of candidates) {
    const subscription = await getSubscription(candidate.ownerUserId, resumedAt);
    if (subscription.status !== "active") continue;

    const scheduleRebase = await rebaseCampaignScheduleForResume(candidate.id, resumedAt);
    const [resumed] = await db.update(campaignsTable).set({
      status: "queued",
      pauseReason: null,
      updatedAt: resumedAt,
    }).where(and(
      eq(campaignsTable.id, candidate.id),
      eq(campaignsTable.status, "paused"),
      eq(campaignsTable.pauseReason, "subscription_expired"),
    )).returning({ id: campaignsTable.id });
    if (!resumed) continue;

    resumedCount += 1;
    await recordActivity({
      ownerUserId: candidate.ownerUserId,
      event: "campaign.resumed.subscription_recovered",
      level: "info",
      campaignId: candidate.id,
      message: "Campaign resumed after the subscription became active again.",
      metadata: {
        automaticResume: true,
        pauseReason: "subscription_expired",
        rebasedPendingTargetCount: scheduleRebase.rebasedTargetCount,
      },
    });
  }
  return resumedCount;
}

export type CampaignCloneMode = "admin" | "user" | null;

export function campaignCloneMode(campaign: Pick<typeof campaignsTable.$inferSelect, "ownerUserId" | "clonedFromCampaignId" | "clonedFromUserId">): CampaignCloneMode {
  if (!campaign.clonedFromCampaignId) return null;
  return campaign.clonedFromUserId === campaign.ownerUserId ? "user" : "admin";
}

export async function campaignSummary(campaign: typeof campaignsTable.$inferSelect) {
  const [targets, subscription, settings, account] = await Promise.all([
    db.select({
    target: campaignTargetsTable,
    destinationTitle: destinationsTable.title,
  }).from(campaignTargetsTable)
    .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .where(eq(campaignTargetsTable.campaignId, campaign.id)),
    getSubscription(campaign.ownerUserId),
    getSystemSettings(),
    campaign.telegramAccountId
      ? db.select({ cooldownUntil: telegramAccountsTable.cooldownUntil })
        .from(telegramAccountsTable)
        .where(and(
          eq(telegramAccountsTable.id, campaign.telegramAccountId),
          eq(telegramAccountsTable.ownerUserId, campaign.ownerUserId),
          isNull(telegramAccountsTable.deletedAt),
        ))
        .limit(1)
      : Promise.resolve([]),
  ]);
  const timezone = settings.defaultTimezone;
  const today = new Date();
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayDate = dateFormatter.format(today);
  const isToday = (value: Date | null) => Boolean(value && dateFormatter.format(value) === todayDate);
  const sentToday = targets.filter(({ target }) => target.status === "sent" && (
    isToday(target.quotaReservedAt) || (!target.quotaReservedAt && isToday(target.sentAt))
  )).length;
  const reservedToday = targets.filter(({ target }) =>
    ["sending", "requires_review"].includes(target.status) && isToday(target.quotaReservedAt),
  ).length;
  const quotaUsed = sentToday + reservedToday;
  const quotaLimit = subscription.messageDailyLimit;
  const nextPendingByDestination = new Map<string, typeof targets[number]>();
  for (const row of targets) {
    if (row.target.status !== "pending" || row.target.lastError || !row.target.nextAttemptAt) continue;
    const current = nextPendingByDestination.get(row.target.destinationId);
    if (!current || row.target.nextAttemptAt.getTime() < current.target.nextAttemptAt!.getTime()) {
      nextPendingByDestination.set(row.target.destinationId, row);
    }
  }
  const errorTargets = targets.filter(({ target }) => Boolean(target.lastError));
  const waitingTargets = [...nextPendingByDestination.values()];
  return {
    ...campaign,
    cloneMode: campaignCloneMode(campaign),
    cooldownUntil: account[0]?.cooldownUntil ?? null,
    targetCount: targets.length,
    destinationIds: [...new Set(targets.map(({ target }) => target.destinationId))],
    sentCount: targets.filter(({ target }) => target.status === "sent").length,
    failedCount: targets.filter(({ target }) => ["failed", "requires_review"].includes(target.status)).length,
    dailyQuota: {
      limit: quotaLimit,
      used: quotaLimit === null ? quotaUsed : Math.min(quotaUsed, quotaLimit),
      remaining: quotaLimit === null ? null : Math.max(0, quotaLimit - quotaUsed),
      sentToday,
      reservedToday,
    },
    errors: [...errorTargets, ...waitingTargets]
      .map(({ target, destinationTitle }) => ({
        destinationId: target.destinationId,
        destinationTitle,
        status: target.status,
        attempts: target.attempts,
        lastError: target.lastError,
        nextAttemptAt: target.nextAttemptAt,
      }))
      .sort((a, b) => {
        const aTime = a.nextAttemptAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.nextAttemptAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime || a.destinationTitle.localeCompare(b.destinationTitle);
      }),
  };
}

async function finalizeCampaignIfTerminal(campaignId: string) {
  const remaining = await db.select().from(campaignTargetsTable)
    .where(and(eq(campaignTargetsTable.campaignId, campaignId), inArray(campaignTargetsTable.status, ["pending", "sending"])));
  if (remaining.length > 0) return;
  const reviewOrFailure = await db.select().from(campaignTargetsTable)
    .where(and(eq(campaignTargetsTable.campaignId, campaignId), inArray(campaignTargetsTable.status, ["failed", "requires_review"])));
  await db.update(campaignsTable).set({
    status: reviewOrFailure.length > 0 ? "completed_with_errors" : "completed",
    updatedAt: new Date(),
  }).where(and(
    eq(campaignsTable.id, campaignId),
    inArray(campaignsTable.status, ["queued", "running"]),
  ));
}

async function markTargetForReview(targetId: string, reason: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [target] = await db.update(campaignTargetsTable).set({
        status: "requires_review",
        nextAttemptAt: null,
        lastError: reason,
        updatedAt: new Date(),
      }).where(and(eq(campaignTargetsTable.id, targetId), eq(campaignTargetsTable.status, "sending")))
        .returning({ campaignId: campaignTargetsTable.campaignId });
      if (target) await finalizeCampaignIfTerminal(target.campaignId);
      return;
    } catch (error) {
      logger.warn({ err: error, targetId, attempt }, "Could not persist manual-review status");
    }
  }
}

export async function processNextCampaignTarget() {
  const now = await getDatabaseNow();
  const candidates = await db.select({
    target: campaignTargetsTable,
    campaign: campaignsTable,
    destination: destinationsTable,
    account: telegramAccountsTable,
  })
    .from(campaignTargetsTable)
    .innerJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
    .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .innerJoin(telegramAccountsTable, eq(destinationsTable.accountId, telegramAccountsTable.id))
    .where(and(
      inArray(campaignsTable.status, ["queued", "running"]),
      eq(campaignTargetsTable.status, "pending"),
      or(
        lte(campaignTargetsTable.nextAttemptAt, now),
        isNull(campaignTargetsTable.nextAttemptAt),
      ),
      or(
        lte(campaignsTable.scheduledAt, now),
        isNull(campaignsTable.scheduledAt),
      ),
      or(
        lte(telegramAccountsTable.cooldownUntil, now),
        isNull(telegramAccountsTable.cooldownUntil),
      ),
      or(
        lte(telegramAccountsTable.deliveryLeaseUntil, now),
        isNull(telegramAccountsTable.deliveryLeaseUntil),
      ),
      eq(telegramAccountsTable.status, "connected"),
      isNull(telegramAccountsTable.deletedAt),
    ))
    .orderBy(asc(campaignTargetsTable.nextAttemptAt))
    .limit(1);
  const job = candidates[0];
  if (!job) return false;

  const leaseToken = randomUUID();
  const [accountLease] = await db.update(telegramAccountsTable).set({
    deliveryLeaseUntil: new Date(Date.now() + DELIVERY_LEASE_MS),
    deliveryLeaseToken: leaseToken,
    updatedAt: now,
  }).where(and(
    eq(telegramAccountsTable.id, job.destination.accountId),
    or(
      isNull(telegramAccountsTable.deliveryLeaseUntil),
      lte(telegramAccountsTable.deliveryLeaseUntil, now),
    ),
    or(
      isNull(telegramAccountsTable.cooldownUntil),
      lte(telegramAccountsTable.cooldownUntil, now),
    ),
    isNull(telegramAccountsTable.deletedAt),
  )).returning();
  if (!accountLease) return false;

  const [claimed] = await db.update(campaignTargetsTable).set({
    status: "sending",
    attempts: job.target.attempts + 1,
    quotaReservedAt: null,
    updatedAt: now,
  }).where(and(
    eq(campaignTargetsTable.id, job.target.id),
    eq(campaignTargetsTable.status, "pending"),
    sql`EXISTS (
      SELECT 1 FROM ${campaignsTable}
      WHERE ${campaignsTable.id} = ${campaignTargetsTable.campaignId}
      AND ${campaignsTable.status} IN ('queued', 'running')
    )`,
  )).returning();
  if (!claimed) {
    await db.update(telegramAccountsTable).set({ deliveryLeaseUntil: null, deliveryLeaseToken: null, updatedAt: new Date() })
      .where(and(eq(telegramAccountsTable.id, job.destination.accountId), eq(telegramAccountsTable.deliveryLeaseToken, leaseToken)));
    return false;
  }
  await db.update(campaignsTable).set({ status: "running", updatedAt: now })
    .where(and(eq(campaignsTable.id, job.campaign.id), inArray(campaignsTable.status, ["queued", "running"])));

  let telegramAcceptedDelivery = false;
  let userQuotaReservation: UserDailyQuotaReservation | undefined;
  let leaseActive = true;
  const heartbeat = setInterval(() => {
    void db.update(telegramAccountsTable).set({
      deliveryLeaseUntil: new Date(Date.now() + DELIVERY_LEASE_MS),
      updatedAt: new Date(),
    }).where(and(
      eq(telegramAccountsTable.id, job.destination.accountId),
      eq(telegramAccountsTable.deliveryLeaseToken, leaseToken),
    )).returning({ id: telegramAccountsTable.id })
      .then((renewed) => { if (renewed.length === 0) leaseActive = false; })
      .catch(() => { leaseActive = false; });
  }, DELIVERY_LEASE_RENEW_MS);
  try {
    const [currentCampaign] = await db.select({ status: campaignsTable.status }).from(campaignsTable)
      .where(eq(campaignsTable.id, job.campaign.id));
    if (!currentCampaign || !["queued", "running"].includes(currentCampaign.status)) {
      await db.update(campaignTargetsTable).set({
        status: currentCampaign?.status === "cancelled" ? "cancelled" : "pending",
        quotaReservedAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(campaignTargetsTable.id, job.target.id),
        eq(campaignTargetsTable.status, "sending"),
      ));
      return true;
    }
    const subscription = await getSubscription(job.campaign.ownerUserId, now);
    if (subscription.status !== "active") {
      await db.update(campaignTargetsTable).set({
        status: "pending",
        quotaReservedAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(campaignTargetsTable.id, job.target.id),
        eq(campaignTargetsTable.status, "sending"),
      ));
      await db.update(campaignsTable).set({
        status: "paused",
        pauseReason: "subscription_expired",
        updatedAt: new Date(),
      }).where(eq(campaignsTable.id, job.campaign.id));
      await recordActivity({
        ownerUserId: job.campaign.ownerUserId,
        event: "campaign.paused.subscription_expired",
        level: "warning",
        campaignId: job.campaign.id,
        targetId: job.target.id,
        message: "Campaign paused because the trial or subscription expired.",
      });
      return true;
    }
    if (!leaseActive) {
      await markTargetForReview(
        job.target.id,
        "Account delivery lease was lost before sending; manual review is required.",
      );
      return true;
    }
    const quota = await withOwnerDeliveryLock(
      job.campaign.ownerUserId,
      () => pauseForDailyQuota(job.campaign, job.target.id, job.target.attempts),
    );
    if (quota.pausedForQuota) return true;
    userQuotaReservation = quota.userQuotaReservation;

    const messageId = isDevelopmentDemoTelegramAccount(job.account)
      ? `development-demo-${job.target.id}`
      : job.campaign.templateMode === "forward" && job.campaign.templateSourceMessageId
        ? await forwardTelegramSavedMessage(job.destination.accountId, job.destination.id, job.campaign.templateSourceMessageId, job.campaign.ownerUserId)
        : await sendTelegramMessage(job.destination.accountId, job.destination.id, job.campaign.content, job.campaign.ownerUserId);
    telegramAcceptedDelivery = true;
    const [persisted] = await db.update(campaignTargetsTable).set({
      status: "sent",
      sentMessageId: messageId,
      sentAt: new Date(),
      nextAttemptAt: null,
      lastError: null,
      updatedAt: new Date(),
    }).where(and(
      eq(campaignTargetsTable.id, job.target.id),
      eq(campaignTargetsTable.status, "sending"),
    )).returning({ id: campaignTargetsTable.id });
    if (!persisted) {
      await markTargetForReview(
        job.target.id,
        "Telegram accepted delivery but database confirmation was interrupted; manual review is required to avoid a duplicate send.",
      );
      logger.warn({ targetId: job.target.id }, "Telegram accepted delivery after target state changed; automatic retry is disabled");
      return true;
    }
    try {
      await recordActivity({
        event: "campaign.target.sent",
        message: isDevelopmentDemoTelegramAccount(job.account)
          ? `Recorded development demo delivery for campaign "${job.campaign.name}" to "${job.destination.title}"`
          : `Sent campaign "${job.campaign.name}" to "${job.destination.title}"`,
        level: "success",
        campaignId: job.campaign.id,
        targetId: job.target.id,
        accountId: job.destination.accountId,
        ownerUserId: job.campaign.ownerUserId,
      });
    } catch (error) {
      logger.error({ err: error, targetId: job.target.id }, "Delivery activity log failed after a successful send");
    }
  } catch (error) {
    if (telegramAcceptedDelivery) {
      await markTargetForReview(
        job.target.id,
        "Telegram accepted delivery but post-send processing failed; manual review is required to avoid a duplicate send.",
      );
      logger.error({ err: error, targetId: job.target.id }, "Post-send processing failed; refusing an automatic retry");
      return true;
    }
    const message = error instanceof Error ? error.message : "Telegram delivery failed";
    const floodSeconds = Number((error as { seconds?: number }).seconds);
    const hasSupportedFloodWait = Number.isFinite(floodSeconds) && floodSeconds > 0 && floodSeconds <= MAX_FLOOD_WAIT_SECONDS;
    const hasSafePreSendTimeout = isTelegramSafePreSendTimeout(error);
    const ownerDeliveryBusy = error instanceof OwnerDeliveryBusyError;
    // FLOOD_WAIT is a known Telegram pre-send rejection. Other errors may
    // have accepted the message before the client lost its response, so their
    // reservations remain until a human resolves the target.
    const knownPreSendRejection = hasSupportedFloodWait || hasSafePreSendTimeout || ownerDeliveryBusy;
    if (knownPreSendRejection && userQuotaReservation) {
      await releaseUserDailyQuota({
        ownerUserId: job.campaign.ownerUserId,
        quotaDate: userQuotaReservation.quotaDate,
      }).catch((releaseError) => {
        logger.warn({ err: releaseError, targetId: job.target.id }, "Could not release daily user quota after a rejected delivery");
      });
      userQuotaReservation = undefined;
    }
    const retryAt = hasSupportedFloodWait
      ? new Date(Date.now() + floodSeconds * 1000)
      : hasSafePreSendTimeout
        ? new Date(Date.now() + 60_000)
        : ownerDeliveryBusy
          ? new Date(Date.now() + 5_000)
          : new Date(Date.now() + Math.min(60 * 60, 30 * 2 ** job.target.attempts) * 1000);
    const canRetry = ownerDeliveryBusy
      || (job.target.attempts + 1 < job.campaign.maxRetries && knownPreSendRejection);
    if (hasSupportedFloodWait || hasSafePreSendTimeout) {
      await db.update(telegramAccountsTable).set({
        cooldownUntil: retryAt,
        updatedAt: new Date(),
      }).where(eq(telegramAccountsTable.id, job.destination.accountId));
    }
    const targetUpdate = {
      status: knownPreSendRejection && canRetry ? "pending" : "requires_review",
      ...(ownerDeliveryBusy ? { attempts: job.target.attempts } : {}),
      ...(knownPreSendRejection ? { quotaReservedAt: null } : {}),
      nextAttemptAt: knownPreSendRejection && canRetry ? retryAt : null,
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    };
    await db.update(campaignTargetsTable).set(targetUpdate).where(and(
      eq(campaignTargetsTable.id, job.target.id),
      eq(campaignTargetsTable.status, "sending"),
    ));
    await recordActivity({
      event: hasSupportedFloodWait
        ? "campaign.target.rate_limited"
        : hasSafePreSendTimeout
          ? "campaign.target.retry_scheduled"
          : ownerDeliveryBusy
            ? "campaign.target.retry_scheduled"
            : "campaign.target.failed",
      message: hasSupportedFloodWait
        ? `Telegram requested a ${floodSeconds}s delay; delivery was postponed.`
        : hasSafePreSendTimeout
          ? "Telegram connection timed out before delivery; retry scheduled in 60 seconds."
          : ownerDeliveryBusy
            ? "Another delivery for this owner is in progress; retry scheduled in 5 seconds."
            : `Delivery to "${job.destination.title}" could not be confirmed; manual review is required to avoid a duplicate send.`,
      level: hasSupportedFloodWait || canRetry ? "warning" : "error",
      campaignId: job.campaign.id,
      targetId: job.target.id,
      accountId: job.destination.accountId,
      ownerUserId: job.campaign.ownerUserId,
      metadata: {
        retryAt: knownPreSendRejection && canRetry ? retryAt.toISOString() : null,
        quotaReservationRetained: !knownPreSendRejection,
      },
    });
  } finally {
    clearInterval(heartbeat);
    await db.update(telegramAccountsTable).set({ deliveryLeaseUntil: null, deliveryLeaseToken: null, updatedAt: new Date() })
      .where(and(eq(telegramAccountsTable.id, job.destination.accountId), eq(telegramAccountsTable.deliveryLeaseToken, leaseToken)));
    try {
      await finalizeCampaignIfTerminal(job.campaign.id);
    } catch (error) {
      logger.error({ err: error, campaignId: job.campaign.id }, "Campaign finalization failed");
    }
  }
  return true;
}

let interval: NodeJS.Timeout | undefined;
export function startCampaignWorker() {
  if (interval) return;
  const tick = async () => {
    try {
      const stalled = await db.update(campaignTargetsTable).set({
        status: "requires_review",
        nextAttemptAt: null,
        lastError: "Delivery state is unknown after an interrupted worker; manual review is required to avoid duplicate sends.",
        updatedAt: new Date(),
      }).where(and(
        eq(campaignTargetsTable.status, "sending"),
        lte(campaignTargetsTable.updatedAt, new Date(Date.now() - 10 * 60_000)),
      )).returning({ campaignId: campaignTargetsTable.campaignId });
      await Promise.all([...new Set(stalled.map((target) => target.campaignId))].map(finalizeCampaignIfTerminal));
      await resumeDailyQuotaPausedCampaigns();
       await resumeSubscriptionExpiryPausedCampaigns();
       await resumeDailyQuotaPausedCampaigns();
      while (await processNextCampaignTarget()) {
        // Process one delivery at a time to honor Telegram limits.
      }
    } catch (err) {
      logger.error({ err }, "Campaign worker failed");
    }
  };
  interval = setInterval(() => { void tick(); }, 5_000);
  void tick();
  logger.info("Campaign worker started");
}