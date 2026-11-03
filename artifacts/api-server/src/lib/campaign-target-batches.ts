import type { campaignTargetsTable } from "@workspace/db";

/** Legacy schedules remain unchanged; round schedules use a separate intra-round gap. */
export function* campaignTargetBatches(input: {
  campaignId: string; destinationIds: string[]; repeatCount: number;
  startAt: Date; nextDelaySeconds: () => number;
  timingMode?: "legacy" | "round";
  groupIntervalSeconds?: number;
  remainingByDestination?: ReadonlyMap<string, number>;
}): Generator<(typeof campaignTargetsTable.$inferInsert)[]> {
  if (!input.destinationIds.length) return;
  let nextDeliveryAt = input.startAt.getTime();
  let deliveryOrder = 0;
  let waitBeforeSeconds = 0;
  const roundMode = input.timingMode === "round";
  const groupGap = input.destinationIds.length > 1 ? (input.groupIntervalSeconds ?? 0) : 0;
  const remainingByDestination = new Map(input.destinationIds.map(id => [
    id, input.remainingByDestination ? (input.remainingByDestination.get(id) ?? 0) : input.repeatCount,
  ]));
  let remainingDeliveries = [...remainingByDestination.values()].reduce((total, count) => total + count, 0);
  if (remainingDeliveries === 0) return;
  let rows: (typeof campaignTargetsTable.$inferInsert)[] = [];
  for (let round = 0; round < input.repeatCount; round++) {
    const roundDestinations = input.destinationIds.filter(id => (remainingByDestination.get(id) ?? 0) > 0);
    for (let index = 0; index < roundDestinations.length; index++) {
      const destinationId = roundDestinations[index];
      rows.push({
        campaignId: input.campaignId, destinationId,
        status: "pending", attempts: 0, quotaReservedAt: null,
        nextAttemptAt: new Date(nextDeliveryAt), lastError: null, sentMessageId: null, sentAt: null,
        ...(roundMode ? { deliveryOrder, waitBeforeSeconds } : {}),
      });
      deliveryOrder++;
      remainingByDestination.set(destinationId, (remainingByDestination.get(destinationId) ?? 0) - 1);
      remainingDeliveries--;
      if (remainingDeliveries > 0) {
        waitBeforeSeconds = roundMode && index < roundDestinations.length - 1
          ? groupGap
          : input.nextDelaySeconds();
        nextDeliveryAt += waitBeforeSeconds * 1000;
      }
      if (rows.length === 500) { yield rows; rows = []; }
    }
  }
  if (rows.length) yield rows;
}

/** Shift the remaining schedule after a late actual completion without shortening waits. */
export function deliveryScheduleShiftMs(plannedNext: Date, completedAt: Date, waitBeforeSeconds: number) {
  return Math.max(0, completedAt.getTime() + waitBeforeSeconds * 1000 - plannedNext.getTime());
}
