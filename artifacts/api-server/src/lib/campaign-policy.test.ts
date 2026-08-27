import assert from "node:assert/strict";
import { canReserveDailyQuota, isWithinDailyQuota } from "./campaign-policy";
import { rebasePastPendingSchedule, resolveCampaignScheduleStart } from "./campaign-schedule";
import { isSubscriptionActiveAt } from "./subscription-time";

function reserveSlot(state: { sentToday: number; reservedToday: number }, limit: number | null) {
  if (!canReserveDailyQuota(state, limit)) return false;
  state.reservedToday += 1;
  return true;
}

const quotaState = { sentToday: 2, reservedToday: 0 };
const reservationResults = Array.from({ length: 4 }, () => reserveSlot(quotaState, 5));
assert.deepEqual(reservationResults, [true, true, true, false]);
assert.deepEqual(quotaState, { sentToday: 2, reservedToday: 3 });
assert.equal(canReserveDailyQuota({ sentToday: 100, reservedToday: 10 }, null), true);
assert.equal(canReserveDailyQuota({ sentToday: 5, reservedToday: 0 }, 5), false);
assert.equal(isWithinDailyQuota({ sentToday: 4, reservedToday: 1 }, 5), true);
assert.equal(isWithinDailyQuota({ sentToday: 5, reservedToday: 1 }, 5), false);

const configuredAt = new Date("2026-08-23T08:00:00.000Z");
const futureStart = new Date("2026-08-23T09:00:00.000Z");
assert.deepEqual(resolveCampaignScheduleStart(futureStart, configuredAt), {
  scheduledAt: futureStart,
  roundStartAt: futureStart,
});
assert.deepEqual(resolveCampaignScheduleStart(new Date("2026-08-23T07:00:00.000Z"), configuredAt), {
  scheduledAt: null,
  roundStartAt: configuredAt,
});

const resumeAt = new Date("2026-08-23T12:00:00.000Z");
const rebasedSchedule = rebasePastPendingSchedule([
  { id: "sent", status: "sent", lastError: null, nextAttemptAt: new Date("2026-08-23T08:00:00.000Z") },
  { id: "round-one-a", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-23T10:00:00.000Z") },
  { id: "round-one-b", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-23T10:00:00.000Z") },
  { id: "round-two-a", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-23T11:00:00.000Z") },
  { id: "round-two-b", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-23T11:00:00.000Z") },
  { id: "retry", status: "pending", lastError: "Telegram flood wait", nextAttemptAt: new Date("2026-08-23T10:30:00.000Z") },
  { id: "review", status: "requires_review", lastError: "Manual review", nextAttemptAt: null },
], resumeAt);
assert.equal(rebasedSchedule.shiftMs, 2 * 60 * 60 * 1000);
assert.equal(rebasedSchedule.nextRunAt?.toISOString(), resumeAt.toISOString());
assert.deepEqual(
  rebasedSchedule.updates.map((target) => [target.id, target.nextAttemptAt.toISOString()]),
  [
    ["round-one-a", "2026-08-23T12:00:00.000Z"],
    ["round-one-b", "2026-08-23T12:00:00.000Z"],
    ["round-two-a", "2026-08-23T13:00:00.000Z"],
    ["round-two-b", "2026-08-23T13:00:00.000Z"],
  ],
);
assert.deepEqual(
  rebasePastPendingSchedule([
    { id: "future", status: "pending", lastError: null, nextAttemptAt: futureStart },
  ], configuredAt),
  { shiftMs: 0, nextRunAt: null, updates: [] },
);
const subscriptionExpiry = new Date("2026-08-24T00:00:00.000Z");
assert.equal(isSubscriptionActiveAt(subscriptionExpiry, new Date("2026-08-23T23:59:59.999Z")), true);
assert.equal(isSubscriptionActiveAt(subscriptionExpiry, subscriptionExpiry), false);
assert.equal(isSubscriptionActiveAt(null, subscriptionExpiry), true);

console.log("Campaign quota and schedule safety checks passed.");