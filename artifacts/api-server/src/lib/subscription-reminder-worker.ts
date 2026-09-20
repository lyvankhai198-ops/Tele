import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, isNotNull, lte, lt, or, sql } from "drizzle-orm";
import {
  appUsersTable,
  db,
  subscriptionReminderDeliveriesTable,
  subscriptionsTable,
  telegramAccountsTable,
} from "@workspace/db";
import { getPurchaseSettings } from "./purchase-settings";
import {
  disconnectQuietly,
  getAccountClient,
  isTelegramSessionRevoked,
  sendDirectTelegramMessageWithClient,
} from "./telegram";
import { getSystemSettings, type SubscriptionReminderSettings } from "./system-settings";
import { logger } from "./logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const WORKER_INTERVAL_MS = 60_000;
const JOB_LEASE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;
const SEND_DELAY_MS = 900;

function errorText(error: unknown): string {
  const value = error as { errorMessage?: unknown; message?: unknown };
  return [value?.errorMessage, value?.message]
    .filter((item): item is string => typeof item === "string")
    .join(" ");
}

function limitedErrorText(error: unknown): string {
  return errorText(error).slice(0, 500) || "Telegram từ chối gửi tin nhắn nhắc gia hạn.";
}

function floodWaitSeconds(error: unknown): number | null {
  const value = error as { seconds?: unknown };
  const directSeconds = Number(value?.seconds);
  if (Number.isFinite(directSeconds) && directSeconds > 0) return Math.ceil(directSeconds);
  const match = errorText(error).match(/FLOOD_WAIT_?(\d+)/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function reminderTypeForExpiry(
  expiresAt: Date,
  now: Date,
  settings: SubscriptionReminderSettings,
): string | null {
  const remainingMs = expiresAt.getTime() - now.getTime();
  const days = [...settings.reminderDays].sort((left, right) => right - left);
  for (const [index, day] of days.entries()) {
    const lowerBoundary = (days[index + 1] ?? 0) * DAY_MS;
    if (remainingMs <= day * DAY_MS && remainingMs > lowerBoundary) return `${day}d`;
  }
  if (settings.sendAfterExpiry && remainingMs <= 0) return "expired";
  return null;
}

function renderReminderMessage(
  template: string,
  input: {
    expiresAt: Date;
    now: Date;
    recipientUsername: string;
    purchaseLink: string | null;
    reminderType: string;
  },
): string {
  const remainingDays = Math.max(0, Math.ceil((input.expiresAt.getTime() - input.now.getTime()) / DAY_MS));
  return template
    .replace(/\{days\}/g, String(remainingDays))
    .replace(/\{expiresAt\}/g, input.expiresAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))
    .replace(/\{username\}/g, `@${input.recipientUsername.replace(/^@+/, "")}`)
    .replace(/\{purchaseLink\}/g, input.purchaseLink ?? "")
    .replace(/\{reminderType\}/g, input.reminderType);
}

async function createDueJobs(settings: SubscriptionReminderSettings, now: Date): Promise<void> {
  if (!settings.senderAccountId) return;

  const recipients = await db.select({
    ownerUserId: subscriptionsTable.ownerUserId,
    expiresAt: subscriptionsTable.expiresAt,
    accountId: telegramAccountsTable.id,
    username: telegramAccountsTable.username,
    telegramUserId: telegramAccountsTable.telegramUserId,
  }).from(subscriptionsTable)
    .innerJoin(appUsersTable, sql`${subscriptionsTable.ownerUserId} = ${appUsersTable.id}::text`)
    .innerJoin(telegramAccountsTable, eq(telegramAccountsTable.ownerUserId, subscriptionsTable.ownerUserId))
    .where(and(
      eq(appUsersTable.role, "user"),
      isNotNull(subscriptionsTable.expiresAt),
      eq(telegramAccountsTable.status, "connected"),
      isNull(telegramAccountsTable.deletedAt),
      isNotNull(telegramAccountsTable.username),
      isNotNull(telegramAccountsTable.telegramUserId),
    ));

  const values = recipients.flatMap((recipient) => {
    if (!recipient.expiresAt || !recipient.username || !recipient.telegramUserId) return [];
    const reminderType = reminderTypeForExpiry(recipient.expiresAt, now, settings);
    if (!reminderType) return [];
    return [{
      ownerUserId: recipient.ownerUserId,
      telegramAccountId: recipient.accountId,
      subscriptionExpiresAt: recipient.expiresAt,
      reminderType,
    }];
  });
  if (!values.length) return;

  await db.insert(subscriptionReminderDeliveriesTable)
    .values(values)
    .onConflictDoNothing({
      target: [
        subscriptionReminderDeliveriesTable.ownerUserId,
        subscriptionReminderDeliveriesTable.telegramAccountId,
        subscriptionReminderDeliveriesTable.subscriptionExpiresAt,
        subscriptionReminderDeliveriesTable.reminderType,
      ],
    });
}

async function claimDueJobs(now: Date) {
  const candidates = await db.select({ id: subscriptionReminderDeliveriesTable.id })
    .from(subscriptionReminderDeliveriesTable)
    .where(and(
      lte(subscriptionReminderDeliveriesTable.nextAttemptAt, now),
      or(
        eq(subscriptionReminderDeliveriesTable.status, "pending"),
        and(
          eq(subscriptionReminderDeliveriesTable.status, "sending"),
          or(
            isNull(subscriptionReminderDeliveriesTable.leaseUntil),
            lt(subscriptionReminderDeliveriesTable.leaseUntil, now),
          ),
        ),
      ),
    ))
    .orderBy(asc(subscriptionReminderDeliveriesTable.nextAttemptAt))
    .limit(20);

  const claimed: Array<typeof subscriptionReminderDeliveriesTable.$inferSelect> = [];
  for (const candidate of candidates) {
    const leaseToken = randomUUID();
    const [job] = await db.update(subscriptionReminderDeliveriesTable).set({
      status: "sending",
      attemptCount: sql`${subscriptionReminderDeliveriesTable.attemptCount} + 1`,
      leaseToken,
      leaseUntil: new Date(now.getTime() + JOB_LEASE_MS),
      updatedAt: now,
    }).where(and(
      eq(subscriptionReminderDeliveriesTable.id, candidate.id),
      or(
        eq(subscriptionReminderDeliveriesTable.status, "pending"),
        and(
          eq(subscriptionReminderDeliveriesTable.status, "sending"),
          or(
            isNull(subscriptionReminderDeliveriesTable.leaseUntil),
            lt(subscriptionReminderDeliveriesTable.leaseUntil, now),
          ),
        ),
      ),
    )).returning();
    if (job) claimed.push(job);
  }
  return claimed;
}

async function finishJob(
  jobId: string,
  leaseToken: string,
  values: {
    status: "sent" | "pending" | "failed";
    nextAttemptAt?: Date;
    sentAt?: Date | null;
    lastError?: string | null;
  },
): Promise<void> {
  await db.update(subscriptionReminderDeliveriesTable).set({
    ...values,
    leaseToken: null,
    leaseUntil: null,
    updatedAt: new Date(),
  }).where(and(
    eq(subscriptionReminderDeliveriesTable.id, jobId),
    eq(subscriptionReminderDeliveriesTable.leaseToken, leaseToken),
  ));
}

async function processJob(
  job: typeof subscriptionReminderDeliveriesTable.$inferSelect,
  senderAccountId: string,
  messageTemplate: string,
  purchaseLink: string | null,
  now: Date,
): Promise<void> {
  const [recipient] = await db.select({
    ownerUserId: subscriptionsTable.ownerUserId,
    expiresAt: subscriptionsTable.expiresAt,
    accountId: telegramAccountsTable.id,
    username: telegramAccountsTable.username,
    telegramUserId: telegramAccountsTable.telegramUserId,
    status: telegramAccountsTable.status,
  }).from(telegramAccountsTable)
    .innerJoin(subscriptionsTable, eq(telegramAccountsTable.ownerUserId, subscriptionsTable.ownerUserId))
    .where(and(
      eq(telegramAccountsTable.id, job.telegramAccountId),
      eq(subscriptionsTable.ownerUserId, job.ownerUserId),
      isNull(telegramAccountsTable.deletedAt),
    ))
    .limit(1);

  if (
    !recipient
    || recipient.status !== "connected"
    || !recipient.username
    || !recipient.telegramUserId
    || !recipient.expiresAt
    || recipient.expiresAt.getTime() !== job.subscriptionExpiresAt.getTime()
  ) {
    await finishJob(job.id, job.leaseToken!, {
      status: "failed",
      lastError: "Tài khoản hoặc kỳ hạn subscription không còn phù hợp để gửi nhắc.",
    });
    return;
  }

  let client: Awaited<ReturnType<typeof getAccountClient>>["client"] | null = null;
  try {
    ({ client } = await getAccountClient(senderAccountId));
    const content = renderReminderMessage(messageTemplate, {
      expiresAt: recipient.expiresAt,
      now,
      recipientUsername: recipient.username,
      purchaseLink,
      reminderType: job.reminderType,
    });
    await sendDirectTelegramMessageWithClient(client, recipient.username, recipient.telegramUserId, content);
    await finishJob(job.id, job.leaseToken!, { status: "sent", sentAt: new Date(), lastError: null });
  } catch (error) {
    const details = limitedErrorText(error);
    const floodWait = floodWaitSeconds(error);
    if (isTelegramSessionRevoked(error)) {
      await db.update(telegramAccountsTable).set({
        status: "saved",
        sessionEncrypted: null,
        telegramUserId: null,
        updatedAt: new Date(),
      }).where(and(
        eq(telegramAccountsTable.id, senderAccountId),
        isNull(telegramAccountsTable.deletedAt),
      ));
    }
    const permanent = isTelegramSessionRevoked(error)
      || /USERNAME_INVALID|USERNAME_NOT_OCCUPIED|PEER_ID_INVALID|username is missing|no longer belongs/i.test(details);
    const nextAttemptAt = floodWait
      ? new Date(Date.now() + (floodWait + 60) * 1000)
      : new Date(Date.now() + RETRY_DELAY_MS);
    await finishJob(job.id, job.leaseToken!, {
      status: permanent || job.attemptCount >= MAX_ATTEMPTS ? "failed" : "pending",
      nextAttemptAt,
      lastError: details,
    });
    logger.warn({
      err: error,
      jobId: job.id,
      recipientUsername: recipient.username,
      attemptCount: job.attemptCount,
    }, "Subscription reminder delivery failed");
  } finally {
    if (client) await disconnectQuietly(client);
  }
}

export async function startSubscriptionReminderWorker(): Promise<() => void> {
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const settings = await getSystemSettings();
      if (!settings.subscriptionReminder.enabled || !settings.subscriptionReminder.senderAccountId) return;
      const now = new Date();
      await createDueJobs(settings.subscriptionReminder, now);
      const jobs = await claimDueJobs(now);
      if (!jobs.length) return;
      const { telegramPurchaseUrl } = await getPurchaseSettings();
      for (const [index, job] of jobs.entries()) {
        await processJob(
          job,
          settings.subscriptionReminder.senderAccountId,
          settings.subscriptionReminder.message,
          telegramPurchaseUrl,
          now,
        );
        if (index < jobs.length - 1) await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
      }
    } catch (error) {
      logger.error({ err: error }, "Subscription reminder worker tick failed");
    } finally {
      ticking = false;
    }
  };

  void tick();
  const interval = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  logger.info("Subscription reminder worker started");
  return () => {
    clearInterval(interval);
    logger.info("Subscription reminder worker stopped");
  };
}
