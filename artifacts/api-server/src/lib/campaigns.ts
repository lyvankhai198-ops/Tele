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
  sendTelegramMessage,
} from "./telegram";
import { logger } from "./logger";
import { getSubscription } from "./subscriptions";
import { getSystemSettings } from "./system-settings";
import { legacyScheduleOffsetMs } from "./campaign-schedule";
import { canReserveDailyQuota, isWithinDailyQuota } from "./campaign-policy";
import {
  releaseUserDailyQuota,
  reserveUserDailyQuota,
  type UserDailyQuotaReservation,
} from "./user-daily-quota";

const MAX_FLOOD_WAIT_SECONDS = 24 * 60 * 60;
const DELIVERY_LEASE_MS = 5 * 60_000;
const DELIVERY_LEASE_RENEW_MS = 60_000;

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

async function withOwnerDeliveryLock<T>(ownerUserId: string, action: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const lockKey = `telecampaign:delivery:${ownerUserId}`;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
    return await action();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
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
  const dayStart = sql`date_trunc('day', ${input.reservedAt}::timestamptz AT TIME ZONE ${input.timezone}) AT TIME ZONE ${input.timezone}`;
  const [sentUsage] = await db.select({ value: count() }).from(campaignTargetsTable)
    .where(and(
      eq(campaignTargetsTable.campaignId, input.campaign.id),
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
      eq(campaignTargetsTable.campaignId, input.campaign.id),
      inArray(campaignTargetsTable.status, ["sending", "requires_review"]),
      gte(campaignTargetsTable.quotaReservedAt, dayStart),
    ));
  const state = {
    sentToday: sentUsage?.value ?? 0,
    reservedToday: reservedUsage?.value ?? 0,
  };
  if (!canReserveDailyQuota(state, input.limit)) return false;

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
      nextAttemptAt: null,
      lastError: pauseReason,
      updatedAt: now,
    }).where(and(
      eq(campaignTargetsTable.id, targetId),
      eq(campaignTargetsTable.status, "sending"),
    )).returning({ id: campaignTargetsTable.id });
    if (!target) return false;

    const [pausedCampaign] = await tx.update(campaignsTable).set({
      status: "paused",
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
  const dayStart = sql`date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`;
  const candidates = await db.select({
    id: campaignsTable.id,
    ownerUserId: campaignsTable.ownerUserId,
  }).from(campaignsTable)
    .innerJoin(campaignTargetsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
    .where(and(
      eq(campaignsTable.status, "paused"),
      eq(campaignTargetsTable.status, "pending"),
      inArray(campaignTargetsTable.lastError, DAILY_QUOTA_PAUSE_REASONS),
      lt(campaignTargetsTable.updatedAt, dayStart),
    ));

  const uniqueCandidates = new Map(candidates.map((campaign) => [campaign.id, campaign]));
  for (const candidate of uniqueCandidates.values()) {
    const subscription = await getSubscription(candidate.ownerUserId);
    if (subscription.status !== "active") continue;
    const [resumed] = await db.update(campaignsTable).set({
      status: "queued",
      updatedAt: new Date(),
    }).where(and(
      eq(campaignsTable.id, candidate.id),
      eq(campaignsTable.status, "paused"),
    )).returning({ id: campaignsTable.id });
    if (!resumed) continue;
    await recordActivity({
      ownerUserId: candidate.ownerUserId,
      event: "campaign.resumed.daily_quota_reset",
      level: "info",
      campaignId: candidate.id,
      message: "Campaign resumed automatically after the daily message limit reset.",
      metadata: { automaticResume: true },
    });
  }
}

export async function resumeQuotaPausedCampaignsAfterSettingsUpdate(): Promise<number> {
  const candidates = await db.select({
    id: campaignsTable.id,
    ownerUserId: campaignsTable.ownerUserId,
  }).from(campaignsTable)
    .innerJoin(campaignTargetsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
    .where(and(
      eq(campaignsTable.status, "paused"),
      eq(campaignTargetsTable.status, "pending"),
      inArray(campaignTargetsTable.lastError, DAILY_QUOTA_PAUSE_REASONS),
    ));

  const uniqueCandidates = new Map(candidates.map((campaign) => [campaign.id, campaign]));
  let resumedCount = 0;
  for (const candidate of uniqueCandidates.values()) {
    const subscription = await getSubscription(candidate.ownerUserId);
    if (subscription.status !== "active") continue;
    const resumedAt = new Date();
    const [resumed] = await db.update(campaignsTable).set({
      status: "queued",
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
      inArray(campaignTargetsTable.lastError, DAILY_QUOTA_PAUSE_REASONS),
    ));
    await recordActivity({
      ownerUserId: candidate.ownerUserId,
      event: "campaign.resumed.daily_quota_settings_updated",
      level: "info",
      campaignId: candidate.id,
      message: "Campaign resumed after the daily message limit was increased.",
      metadata: { automaticResume: true, trigger: "system_settings_updated" },
    });
    resumedCount += 1;
  }
  return resumedCount;
}

export async function campaignSummary(campaign: typeof campaignsTable.$inferSelect) {
  const targets = await db.select({
    target: campaignTargetsTable,
    destinationTitle: destinationsTable.title,
  }).from(campaignTargetsTable)
    .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .where(eq(campaignTargetsTable.campaignId, campaign.id));
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
    targetCount: targets.length,
    destinationIds: [...new Set(targets.map(({ target }) => target.destinationId))],
    sentCount: targets.filter(({ target }) => target.status === "sent").length,
    failedCount: targets.filter(({ target }) => ["failed", "requires_review"].includes(target.status)).length,
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
  const now = new Date();
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
    const subscription = await getSubscription(job.campaign.ownerUserId);
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
    const delivery = await withOwnerDeliveryLock(job.campaign.ownerUserId, async () => {
      const quota = await pauseForDailyQuota(job.campaign, job.target.id, job.target.attempts);
      if (quota.pausedForQuota) return quota;
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
      return { pausedForQuota: false as const, persisted: Boolean(persisted) };
    });
    if (delivery.pausedForQuota) return true;
    if (!delivery.persisted) {
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
    // FLOOD_WAIT is a known Telegram pre-send rejection. Other errors may
    // have accepted the message before the client lost its response, so their
    // reservations remain until a human resolves the target.
    const knownPreSendRejection = hasSupportedFloodWait;
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
      : new Date(Date.now() + Math.min(60 * 60, 30 * 2 ** job.target.attempts) * 1000);
    const canRetry = job.target.attempts + 1 < job.campaign.maxRetries && hasSupportedFloodWait;
    if (hasSupportedFloodWait) {
      await db.update(telegramAccountsTable).set({
        cooldownUntil: retryAt,
        updatedAt: new Date(),
      }).where(eq(telegramAccountsTable.id, job.destination.accountId));
    }
    const targetUpdate = {
      status: knownPreSendRejection && canRetry ? "pending" : "requires_review",
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
      event: hasSupportedFloodWait ? "campaign.target.rate_limited" : "campaign.target.failed",
      message: hasSupportedFloodWait
        ? `Telegram requested a ${floodSeconds}s delay; delivery was postponed.`
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