import { and, asc, count, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
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
import { forwardTelegramSavedMessage, sendTelegramMessage } from "./telegram";
import { logger } from "./logger";
import { getSubscription } from "./subscriptions";
import { getSystemSettings } from "./system-settings";

const MAX_FLOOD_WAIT_SECONDS = 24 * 60 * 60;
const DELIVERY_LEASE_MS = 5 * 60_000;
const DELIVERY_LEASE_RENEW_MS = 60_000;

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

async function deferForDailyQuota(campaign: typeof campaignsTable.$inferSelect, targetId: string) {
  const [subscription, settings] = await Promise.all([
    getSubscription(campaign.ownerUserId),
    getSystemSettings(),
  ]);
  // UNLIMITED must never be deferred by the daily quota guard, even if an
  // older queued target still has a stale quota retry timestamp.
  if (subscription.plan === "unlimited" || subscription.messageDailyLimit === null) return false;
  const timezone = settings.defaultTimezone.replace(/'/g, "");
  const dayStart = sql`date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`;
  const nextDayStart = sql`(date_trunc('day', now() AT TIME ZONE ${timezone}) + interval '1 day') AT TIME ZONE ${timezone}`;
  const [usage] = await db.select({ value: count() }).from(campaignTargetsTable)
    .innerJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
    .where(and(
      eq(campaignsTable.ownerUserId, campaign.ownerUserId),
      eq(campaignTargetsTable.status, "sent"),
      gte(campaignTargetsTable.sentAt, dayStart),
  ));
  if ((usage?.value ?? 0) < subscription.messageDailyLimit) return false;
  const [nextAttempt] = await db.select({ at: nextDayStart }).from(campaignsTable)
    .where(eq(campaignsTable.id, campaign.id)).limit(1);
  await db.update(campaignTargetsTable).set({
    status: "pending",
    nextAttemptAt: nextAttempt?.at instanceof Date ? nextAttempt.at : new Date(Date.now() + 24 * 60 * 60_000),
    lastError: "Daily message quota reached; delivery is scheduled for the next quota window.",
    updatedAt: new Date(),
  }).where(and(eq(campaignTargetsTable.id, targetId), eq(campaignTargetsTable.status, "sending")));
  await recordActivity({
    ownerUserId: campaign.ownerUserId,
    event: "campaign.target.daily_quota_deferred",
    level: "warning",
    campaignId: campaign.id,
    targetId,
    message: "Delivery deferred because the subscription daily message quota was reached.",
    metadata: { messageDailyLimit: subscription.messageDailyLimit },
  });
  return true;
}

export async function campaignSummary(campaign: typeof campaignsTable.$inferSelect) {
  const targets = await db.select({
    target: campaignTargetsTable,
    destinationTitle: destinationsTable.title,
  }).from(campaignTargetsTable)
    .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .where(eq(campaignTargetsTable.campaignId, campaign.id));
  return {
    ...campaign,
    targetCount: targets.length,
    destinationIds: [...new Set(targets.map(({ target }) => target.destinationId))],
    sentCount: targets.filter(({ target }) => target.status === "sent").length,
    failedCount: targets.filter(({ target }) => ["failed", "requires_review"].includes(target.status)).length,
    errors: targets
      .filter(({ target }) => Boolean(target.lastError))
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
      await db.update(campaignTargetsTable).set({
        status: "requires_review",
        lastError: "Account delivery lease was lost before sending; manual review is required.",
        updatedAt: new Date(),
      }).where(and(
        eq(campaignTargetsTable.id, job.target.id),
        eq(campaignTargetsTable.status, "sending"),
      ));
      return true;
    }
    const delivery = await withOwnerDeliveryLock(job.campaign.ownerUserId, async () => {
      if (await deferForDailyQuota(job.campaign, job.target.id)) return { deferred: true as const };
      const messageId = job.campaign.templateMode === "forward" && job.campaign.templateSourceMessageId
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
      return { deferred: false as const, persisted: Boolean(persisted) };
    });
    if (delivery.deferred) return true;
    if (!delivery.persisted) {
      logger.warn({ targetId: job.target.id }, "Telegram accepted delivery after target state changed; automatic retry is disabled");
      return true;
    }
    try {
      await recordActivity({
        event: "campaign.target.sent",
        message: `Sent campaign "${job.campaign.name}" to "${job.destination.title}"`,
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
      logger.error({ err: error, targetId: job.target.id }, "Post-send processing failed; refusing an automatic retry");
      return true;
    }
    const message = error instanceof Error ? error.message : "Telegram delivery failed";
    const floodSeconds = Number((error as { seconds?: number }).seconds);
    const hasSupportedFloodWait = Number.isFinite(floodSeconds) && floodSeconds > 0 && floodSeconds <= MAX_FLOOD_WAIT_SECONDS;
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
    await db.update(campaignTargetsTable).set({
      status: canRetry ? "pending" : "requires_review",
      nextAttemptAt: canRetry ? retryAt : null,
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    }).where(and(
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
      metadata: { retryAt: canRetry ? retryAt.toISOString() : null },
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