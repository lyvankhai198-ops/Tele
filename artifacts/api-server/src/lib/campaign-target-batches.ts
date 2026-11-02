import type { campaignTargetsTable } from "@workspace/db";

/** Preserve the original delivery order and delays with O(500) working memory. */
export function* campaignTargetBatches(input: {
  campaignId: string; destinationIds: string[]; repeatCount: number;
  startAt: Date; nextDelaySeconds: () => number;
}): Generator<(typeof campaignTargetsTable.$inferInsert)[]> {
  if (!input.destinationIds.length) return;
  let nextDeliveryAt = input.startAt.getTime();
  let rows: (typeof campaignTargetsTable.$inferInsert)[] = [];
  for (let round = 0; round < input.repeatCount; round++) {
    for (let index = 0; index < input.destinationIds.length; index++) {
      rows.push({
        campaignId: input.campaignId, destinationId: input.destinationIds[index],
        status: "pending", attempts: 0, quotaReservedAt: null,
        nextAttemptAt: new Date(nextDeliveryAt), lastError: null, sentMessageId: null, sentAt: null,
      });
      if (round < input.repeatCount - 1 || index < input.destinationIds.length - 1) {
        nextDeliveryAt += input.nextDelaySeconds() * 1000;
      }
      if (rows.length === 500) { yield rows; rows = []; }
    }
  }
  if (rows.length) yield rows;
}
