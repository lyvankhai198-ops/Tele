import { asc, inArray, lt } from "drizzle-orm";
import { db, activityLogsTable } from "@workspace/db";
import { logger } from "./logger";

export const ACTIVITY_LOG_RETENTION_DAYS = 30;
export const ACTIVITY_LOG_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const ACTIVITY_LOG_CLEANUP_BATCH_SIZE = 1_000;
const ACTIVITY_LOG_CLEANUP_MAX_BATCHES = 100;

export function activityLogCutoff(
  now = new Date(),
  retentionDays = ACTIVITY_LOG_RETENTION_DAYS,
): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new TypeError("Activity-log retention must be a positive integer.");
  }

  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
}

export async function recordActivity(input: {
  ownerUserId: string;
  event: string;
  message: string;
  level?: "info" | "success" | "warning" | "error";
  accountId?: string;
  campaignId?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(activityLogsTable).values({
    ownerUserId: input.ownerUserId,
    event: input.event,
    message: input.message,
    level: input.level ?? "info",
    accountId: input.accountId,
    campaignId: input.campaignId,
    targetId: input.targetId,
    metadata: input.metadata,
  });
}

export async function cleanupExpiredActivityLogs(options: {
  now?: Date;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
} = {}): Promise<number> {
  const batchSize = options.batchSize ?? ACTIVITY_LOG_CLEANUP_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? ACTIVITY_LOG_CLEANUP_MAX_BATCHES;

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new TypeError("Activity-log cleanup batch size must be a positive integer.");
  }
  if (!Number.isInteger(maxBatches) || maxBatches < 1) {
    throw new TypeError("Activity-log cleanup batch count must be a positive integer.");
  }

  const cutoff = activityLogCutoff(options.now, options.retentionDays);
  let deletedCount = 0;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const expiredIds = db
      .select({ id: activityLogsTable.id })
      .from(activityLogsTable)
      .where(lt(activityLogsTable.createdAt, cutoff))
      .orderBy(asc(activityLogsTable.createdAt), asc(activityLogsTable.id))
      .limit(batchSize);
    const deleted = await db
      .delete(activityLogsTable)
      .where(inArray(activityLogsTable.id, expiredIds))
      .returning({ id: activityLogsTable.id });

    deletedCount += deleted.length;
    if (deleted.length < batchSize) break;
  }

  if (deletedCount > 0) {
    logger.info({ deletedCount, cutoff: cutoff.toISOString() }, "Expired activity logs cleaned up");
  }
  return deletedCount;
}

export function startActivityLogCleanup(): () => void {
  let running = false;

  const runCleanup = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupExpiredActivityLogs();
    } catch (err) {
      logger.error({ err }, "Activity log cleanup failed");
    } finally {
      running = false;
    }
  };

  void runCleanup();
  const timer = setInterval(() => {
    void runCleanup();
  }, ACTIVITY_LOG_CLEANUP_INTERVAL_MS);
  timer.unref?.();

  return () => clearInterval(timer);
}
