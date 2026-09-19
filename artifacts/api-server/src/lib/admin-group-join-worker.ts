import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, lt, or, sql } from "drizzle-orm";
import {
  adminGroupJoinJobsTable,
  appUsersTable,
  db,
  campaignTargetsTable,
  campaignsTable,
  destinationsTable,
  groupLibraryEntriesTable,
  telegramAccountsTable,
} from "@workspace/db";
import { logger } from "./logger";
import {
  disconnectQuietly,
  getAccountClient,
  joinTelegramGroupWithClient,
  syncAccountDestinations,
} from "./telegram";
import { getSystemSettings } from "./system-settings";
import { recordActivity } from "./activity";

const JOIN_BATCH_SIZE = 5;
const JOIN_DELAY_MS = 700;
const FLOOD_WAIT_BUFFER_MS = 60_000;
const GENERIC_RETRY_DELAY_MS = 15 * 60_000;
const JOB_LEASE_MS = 10 * 60_000;
const WORKER_INTERVAL_MS = 5_000;

const activeAccounts = new Set<string>();

type JoinJobStatus = "pending" | "joining" | "joined" | "waiting" | "skipped" | "failed";

type AdminAccountRow = {
  id: string;
  ownerUserId: string;
  name: string;
  username: string | null;
  status: string;
};

function errorText(error: unknown): string {
  const value = error as { errorMessage?: unknown; message?: unknown; seconds?: unknown };
  return [value?.errorMessage, value?.message]
    .filter((item): item is string => typeof item === "string")
    .join(" ");
}

function floodWaitSeconds(error: unknown): number | null {
  const value = error as { seconds?: unknown };
  const directSeconds = Number(value?.seconds);
  if (Number.isFinite(directSeconds) && directSeconds > 0) return Math.ceil(directSeconds);
  const match = errorText(error).match(/FLOOD_WAIT_?(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function limitedErrorText(error: unknown): string {
  return errorText(error).slice(0, 500) || "Telegram từ chối thao tác tham gia nhóm.";
}

async function listAdminAccounts(includeDisconnected = false): Promise<AdminAccountRow[]> {
  const conditions = [
    eq(appUsersTable.role, "admin"),
    isNull(telegramAccountsTable.deletedAt),
  ];
  if (!includeDisconnected) conditions.push(eq(telegramAccountsTable.status, "connected"));
  return db.select({
    id: telegramAccountsTable.id,
    ownerUserId: telegramAccountsTable.ownerUserId,
    name: telegramAccountsTable.name,
    username: telegramAccountsTable.username,
    status: telegramAccountsTable.status,
  }).from(telegramAccountsTable)
    .innerJoin(appUsersTable, sql`${telegramAccountsTable.ownerUserId} = ${appUsersTable.id}::text`)
    .where(and(...conditions));
}

export async function ensureAdminGroupJoinJobs(includeDisconnected = false): Promise<number> {
  const [accounts, groups] = await Promise.all([
    listAdminAccounts(includeDisconnected),
    db.select({
      id: groupLibraryEntriesTable.id,
    }).from(groupLibraryEntriesTable),
  ]);
  if (!accounts.length || !groups.length) return 0;

  const values = accounts.flatMap((account) => groups.map((group) => ({
    telegramAccountId: account.id,
    groupLibraryEntryId: group.id,
  })));
  const inserted = await db.insert(adminGroupJoinJobsTable)
    .values(values)
    .onConflictDoNothing({
      target: [adminGroupJoinJobsTable.telegramAccountId, adminGroupJoinJobsTable.groupLibraryEntryId],
    })
    .returning({ id: adminGroupJoinJobsTable.id });
  return inserted.length;
}

async function updateJob(
  jobId: string,
  leaseToken: string,
  values: {
    status: JoinJobStatus;
    nextAttemptAt?: Date;
    joinedAt?: Date | null;
    lastError?: string | null;
    leaseUntil?: Date | null;
  },
): Promise<void> {
  await db.update(adminGroupJoinJobsTable)
    .set({
      ...values,
      leaseToken: null,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(adminGroupJoinJobsTable.id, jobId),
      eq(adminGroupJoinJobsTable.leaseToken, leaseToken),
    ));
}

async function createPostJoinCampaign(input: {
  jobId: string;
  accountId: string;
  ownerUserId: string;
  groupId: string;
  groupTitle: string;
}): Promise<string | null> {
  const settings = await getSystemSettings();
  const config = settings.postJoinCampaign;
  if (!config.enabled || !config.content) return null;

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT 1 FROM ${adminGroupJoinJobsTable}
      WHERE ${adminGroupJoinJobsTable.id} = ${input.jobId}
      FOR UPDATE
    `);
    const [job] = await tx.select({
      autoCampaignId: adminGroupJoinJobsTable.autoCampaignId,
      status: adminGroupJoinJobsTable.status,
    }).from(adminGroupJoinJobsTable).where(eq(adminGroupJoinJobsTable.id, input.jobId)).limit(1);
    if (!job || job.status !== "joined" || job.autoCampaignId) return null;

    const [destination] = await tx.select().from(destinationsTable).where(and(
      eq(destinationsTable.id, input.groupId),
      eq(destinationsTable.accountId, input.accountId),
    )).limit(1);
    if (!destination) {
      logger.warn({ accountId: input.accountId, jobId: input.jobId }, "Joined group has no synced destination for automatic campaign");
      return null;
    }

    const now = new Date();
    const campaignStatus = config.mode === "send" && destination.canPost ? "queued" : "draft";
    const [campaign] = await tx.insert(campaignsTable).values({
      ownerUserId: input.ownerUserId,
      name: `Tự động sau khi tham gia: ${input.groupTitle}`.slice(0, 160),
      content: config.content,
      telegramAccountId: input.accountId,
      templateId: null,
      templateMode: "text",
      templateSourceAccountId: null,
      templateSourceMessageId: null,
      destinationIds: [destination.id],
      mediaUrl: null,
      status: campaignStatus,
      pauseReason: campaignStatus === "draft" && config.mode === "send" ? "destination_not_ready" : null,
      scheduledAt: null,
      scheduleAnchorAt: now,
      timezone: settings.defaultTimezone,
      maxRetries: settings.campaignDefaults.maxRetries,
      repeatCount: config.repeatCount,
      delayMinSeconds: 0,
      delayMaxSeconds: 0,
      roundDelayMinSeconds: config.roundDelayMinSeconds,
      roundDelayMaxSeconds: config.roundDelayMaxSeconds,
    }).returning();

    const targetRows = [];
    let roundStartAt = now.getTime();
    for (let round = 0; round < config.repeatCount; round += 1) {
      targetRows.push({
        campaignId: campaign.id,
        destinationId: destination.id,
        status: "pending",
        nextAttemptAt: new Date(roundStartAt),
      });
      if (round < config.repeatCount - 1) {
        roundStartAt += (
          config.roundDelayMinSeconds
          + Math.floor(Math.random() * (config.roundDelayMaxSeconds - config.roundDelayMinSeconds + 1))
        ) * 1000;
      }
    }
    await tx.insert(campaignTargetsTable).values(targetRows);
    const [linkedJob] = await tx.update(adminGroupJoinJobsTable).set({
      autoCampaignId: campaign.id,
      updatedAt: now,
    }).where(and(
      eq(adminGroupJoinJobsTable.id, input.jobId),
      isNull(adminGroupJoinJobsTable.autoCampaignId),
    )).returning({ id: adminGroupJoinJobsTable.id });
    return linkedJob ? { campaign, targetCount: targetRows.length, campaignStatus } : null;
  });

  if (!result) return null;
  await recordActivity({
    ownerUserId: input.ownerUserId,
    event: "campaign.auto_created_after_group_join",
    level: result.campaignStatus === "queued" ? "success" : "info",
    campaignId: result.campaign.id,
    accountId: input.accountId,
    message: result.campaignStatus === "queued"
      ? `Đã tạo và gửi campaign tự động sau khi tham gia "${input.groupTitle}".`
      : `Đã tạo campaign nháp sau khi tham gia "${input.groupTitle}", đang chờ duyệt.`,
    metadata: {
      source: "admin_group_join",
      joinJobId: input.jobId,
      repeatCount: config.repeatCount,
      targetCount: result.targetCount,
    },
  });
  return result.campaign.id;
}

export async function scanAdminJoinedGroupsWithoutCampaign(): Promise<{
  scannedCount: number;
  createdCount: number;
  skippedCount: number;
}> {
  await ensureAdminGroupJoinJobs(true);
  const candidates = await db.select({
    jobId: adminGroupJoinJobsTable.id,
    accountId: telegramAccountsTable.id,
    ownerUserId: telegramAccountsTable.ownerUserId,
    groupTitle: groupLibraryEntriesTable.title,
    destinationId: destinationsTable.id,
  }).from(adminGroupJoinJobsTable)
    .innerJoin(telegramAccountsTable, eq(adminGroupJoinJobsTable.telegramAccountId, telegramAccountsTable.id))
    .innerJoin(groupLibraryEntriesTable, eq(adminGroupJoinJobsTable.groupLibraryEntryId, groupLibraryEntriesTable.id))
    .innerJoin(destinationsTable, and(
      eq(destinationsTable.accountId, telegramAccountsTable.id),
      eq(destinationsTable.telegramId, groupLibraryEntriesTable.telegramId),
      isNull(destinationsTable.topicId),
    ))
    .where(and(
      isNull(telegramAccountsTable.deletedAt),
      isNull(adminGroupJoinJobsTable.autoCampaignId),
    ));

  let scannedCount = 0;
  let createdCount = 0;
  for (const candidate of candidates) {
    const [marked] = await db.update(adminGroupJoinJobsTable).set({
      status: "joined",
      joinedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    }).where(and(
      eq(adminGroupJoinJobsTable.id, candidate.jobId),
      inArray(adminGroupJoinJobsTable.status, ["pending", "waiting", "failed", "skipped", "joined"]),
      isNull(adminGroupJoinJobsTable.autoCampaignId),
    )).returning({ id: adminGroupJoinJobsTable.id });
    if (!marked) continue;
    scannedCount += 1;
    if (await createPostJoinCampaign({
      jobId: candidate.jobId,
      accountId: candidate.accountId,
      ownerUserId: candidate.ownerUserId,
      groupId: candidate.destinationId,
      groupTitle: candidate.groupTitle,
    })) {
      createdCount += 1;
    }
  }
  return {
    scannedCount,
    createdCount,
    skippedCount: Math.max(0, candidates.length - scannedCount),
  };
}

async function processAccount(accountId: string, ownerUserId: string): Promise<void> {
  if (activeAccounts.has(accountId)) return;
  activeAccounts.add(accountId);

  let client: Awaited<ReturnType<typeof getAccountClient>>["client"] | null = null;
  let shouldSync = false;
  const successfulJoins: Array<{
    id: string;
    groupId: string;
    groupTitle: string;
    groupTelegramId: string;
    username: string | null;
    telegramLink: string | null;
    nextAttemptAt: Date;
    leaseToken: string;
  }> = [];
  try {
    const now = new Date();
    const jobs = await db.select({
      id: adminGroupJoinJobsTable.id,
      groupId: groupLibraryEntriesTable.id,
      groupTitle: groupLibraryEntriesTable.title,
      groupTelegramId: groupLibraryEntriesTable.telegramId,
      username: groupLibraryEntriesTable.username,
      telegramLink: sql<string | null>`null`,
      nextAttemptAt: adminGroupJoinJobsTable.nextAttemptAt,
    }).from(adminGroupJoinJobsTable)
      .innerJoin(groupLibraryEntriesTable, eq(adminGroupJoinJobsTable.groupLibraryEntryId, groupLibraryEntriesTable.id))
      .where(and(
        eq(adminGroupJoinJobsTable.telegramAccountId, accountId),
        inArray(adminGroupJoinJobsTable.status, ["pending", "waiting"]),
        lte(adminGroupJoinJobsTable.nextAttemptAt, now),
        or(
          isNull(adminGroupJoinJobsTable.leaseUntil),
          lt(adminGroupJoinJobsTable.leaseUntil, now),
        ),
      ))
      .orderBy(asc(adminGroupJoinJobsTable.nextAttemptAt))
      .limit(JOIN_BATCH_SIZE);
    if (!jobs.length) return;

    const claimedJobs: Array<typeof jobs[number] & { leaseToken: string }> = [];
    for (const job of jobs) {
      const leaseToken = randomUUID();
      const [claimed] = await db.update(adminGroupJoinJobsTable)
        .set({
          status: "joining",
          attemptCount: sql`${adminGroupJoinJobsTable.attemptCount} + 1`,
          lastAttemptAt: now,
          leaseToken,
          leaseUntil: new Date(now.getTime() + JOB_LEASE_MS),
          updatedAt: now,
        })
        .where(and(
          eq(adminGroupJoinJobsTable.id, job.id),
          inArray(adminGroupJoinJobsTable.status, ["pending", "waiting"]),
          lte(adminGroupJoinJobsTable.nextAttemptAt, now),
          or(
            isNull(adminGroupJoinJobsTable.leaseUntil),
            lt(adminGroupJoinJobsTable.leaseUntil, now),
          ),
        ))
        .returning({ id: adminGroupJoinJobsTable.id });
      if (claimed) claimedJobs.push({ ...job, leaseToken });
    }
    if (!claimedJobs.length) return;

    try {
      ({ client } = await getAccountClient(accountId));
      for (const [index, job] of claimedJobs.entries()) {
        if (!job.username && !job.telegramLink) {
          await updateJob(job.id, job.leaseToken, {
            status: "skipped",
            lastError: "Nhóm không có username hoặc link mời để tự động tham gia.",
          });
          continue;
        }

        try {
          const result = await joinTelegramGroupWithClient(client, {
            username: job.username,
            telegramLink: job.telegramLink,
          });
          await updateJob(job.id, job.leaseToken, {
            status: result.status === "skipped" ? "skipped" : "joined",
            joinedAt: result.status === "skipped" ? null : new Date(),
            lastError: result.reason,
          });
          shouldSync = shouldSync || result.status !== "skipped";
          if (result.status !== "skipped") successfulJoins.push(job);
        } catch (error) {
          const waitSeconds = floodWaitSeconds(error);
          if (waitSeconds !== null) {
            const nextAttemptAt = new Date(Date.now() + waitSeconds * 1000 + FLOOD_WAIT_BUFFER_MS);
            await updateJob(job.id, job.leaseToken, {
              status: "waiting",
              nextAttemptAt,
              lastError: `Telegram yêu cầu chờ ${waitSeconds} giây.`,
            });
            logger.warn({ accountId, groupId: job.groupId, waitSeconds }, "Admin group join paused by Telegram flood wait");
            break;
          }
          await updateJob(job.id, job.leaseToken, {
            status: "failed",
            lastError: limitedErrorText(error),
          });
          logger.warn({ err: error, accountId, groupId: job.groupId }, "Admin group join failed");
        }

        if (index < claimedJobs.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, JOIN_DELAY_MS));
        }
      }
    } catch (error) {
      const retryAt = new Date(Date.now() + GENERIC_RETRY_DELAY_MS);
      await db.update(adminGroupJoinJobsTable)
        .set({
          status: "waiting",
          nextAttemptAt: retryAt,
          lastError: limitedErrorText(error),
          leaseToken: null,
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(adminGroupJoinJobsTable.telegramAccountId, accountId),
          eq(adminGroupJoinJobsTable.status, "joining"),
        ));
      logger.warn({ err: error, accountId }, "Admin group join account client unavailable");
    }
  } finally {
    if (client) {
      await disconnectQuietly(client);
      if (shouldSync) {
        try {
          await syncAccountDestinations(accountId);
           for (const job of successfulJoins) {
             const [destination] = await db.select({ id: destinationsTable.id }).from(destinationsTable).where(and(
               eq(destinationsTable.accountId, accountId),
               eq(destinationsTable.telegramId, job.groupTelegramId),
               isNull(destinationsTable.topicId),
             )).limit(1);
             if (!destination) {
               logger.warn({ accountId, groupId: job.groupId }, "Joined group has no synced destination for automatic campaign");
               continue;
             }
             await createPostJoinCampaign({
               jobId: job.id,
               accountId,
               ownerUserId,
               groupId: destination.id,
               groupTitle: job.groupTitle,
             });
           }
        } catch (error) {
          logger.warn({ err: error, accountId }, "Admin group join succeeded but destination sync failed");
        }
      }
    }
    activeAccounts.delete(accountId);
  }
}

export async function getAdminGroupJoinStatus() {
  const [settings, accounts] = await Promise.all([
    getSystemSettings(),
    listAdminAccounts(true),
  ]);
  await ensureAdminGroupJoinJobs();
  const jobs = await db.select({
    accountId: adminGroupJoinJobsTable.telegramAccountId,
    status: adminGroupJoinJobsTable.status,
    nextAttemptAt: adminGroupJoinJobsTable.nextAttemptAt,
    lastError: adminGroupJoinJobsTable.lastError,
  }).from(adminGroupJoinJobsTable)
    .innerJoin(telegramAccountsTable, eq(adminGroupJoinJobsTable.telegramAccountId, telegramAccountsTable.id))
    .where(isNull(telegramAccountsTable.deletedAt));

  const accountStatuses = accounts.map((account) => {
    const accountJobs = jobs.filter((job) => job.accountId === account.id);
    const waitingJobs = accountJobs
      .filter((job) => job.status === "waiting")
      .sort((left, right) => left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime());
    const pendingCount = accountJobs.filter((job) => job.status === "pending" || job.status === "joining").length;
    const joinedCount = accountJobs.filter((job) => job.status === "joined").length;
    const failedCount = accountJobs.filter((job) => job.status === "failed").length;
    const skippedCount = accountJobs.filter((job) => job.status === "skipped").length;
    return {
      accountId: account.id,
      accountName: account.name,
      accountUsername: account.username,
      accountStatus: account.status,
      workerStatus: activeAccounts.has(account.id)
        ? "running"
        : waitingJobs.length > 0
          ? "waiting"
          : pendingCount > 0
            ? "pending"
            : "idle",
      pendingCount,
      waitingCount: waitingJobs.length,
      joinedCount,
      failedCount,
      skippedCount,
      nextAttemptAt: waitingJobs[0]?.nextAttemptAt ?? null,
      lastError: waitingJobs.find((job) => job.lastError)?.lastError ?? null,
    };
  });

  return {
    enabled: settings.groupLibraryAutoJoinEnabled,
    postJoinCampaign: settings.postJoinCampaign,
    pendingCount: jobs.filter((job) => job.status === "pending" || job.status === "joining").length,
    waitingCount: jobs.filter((job) => job.status === "waiting").length,
    joinedCount: jobs.filter((job) => job.status === "joined").length,
    failedCount: jobs.filter((job) => job.status === "failed").length,
    skippedCount: jobs.filter((job) => job.status === "skipped").length,
    accounts: accountStatuses,
  };
}

export async function startAdminGroupJoinWorker(): Promise<() => void> {
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const settings = await getSystemSettings();
      if (!settings.groupLibraryAutoJoinEnabled) return;
      await ensureAdminGroupJoinJobs();
      const accounts = await listAdminAccounts();
      await Promise.all(accounts.map((account) => processAccount(account.id, account.ownerUserId)));
    } catch (error) {
      logger.error({ err: error }, "Admin group join worker tick failed");
    } finally {
      ticking = false;
    }
  };

  void tick();
  const interval = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  logger.info("Admin group join worker started");
  return () => {
    clearInterval(interval);
    logger.info("Admin group join worker stopped");
  };
}