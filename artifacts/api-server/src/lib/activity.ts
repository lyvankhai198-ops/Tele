import { db, activityLogsTable } from "@workspace/db";

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