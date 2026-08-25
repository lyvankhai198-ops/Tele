import { adminNotificationsTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { NotificationMediaStorage } from "./notificationMediaStorage";

const CLEANUP_INTERVAL_MS = 60 * 60_000;

export async function cleanupOrphanedNotificationMedia(): Promise<number> {
  const deleted = await new NotificationMediaStorage().cleanupUnreferencedAdminNotificationMedia(async (mediaPath) => {
    const reference = await db.select({ id: adminNotificationsTable.id }).from(adminNotificationsTable)
      .where(eq(adminNotificationsTable.mediaPath, mediaPath)).limit(1);
    return reference.length > 0;
  });
  if (deleted) logger.info({ deleted }, "Removed orphaned notification media");
  return deleted;
}

export function startNotificationMediaCleanup(): void {
  const run = () => {
    void cleanupOrphanedNotificationMedia().catch((error) => {
      logger.warn({ err: error }, "Unable to clean orphaned notification media");
    });
  };
  const interval = setInterval(run, CLEANUP_INTERVAL_MS);
  interval.unref();
  run();
}