import assert from "node:assert/strict";
import { canReserveDailyQuota, isWithinDailyQuota } from "./campaign-policy";
import {
  nextCampaignDailyStart,
  rebasePendingScheduleFromStart,
  rebasePastPendingSchedule,
  rebaseQuotaPausedSchedule,
  resolveCampaignScheduleStart,
} from "./campaign-schedule";
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

const adminStartAt = new Date("2026-08-30T14:00:00.000Z");
const adminScheduleRebase = rebasePendingScheduleFromStart([
  { id: "sent", status: "sent", lastError: null, nextAttemptAt: new Date("2026-08-30T08:00:00.000Z") },
  { id: "sending", status: "sending", lastError: null, nextAttemptAt: new Date("2026-08-30T10:00:00.000Z") },
  { id: "round-one", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-30T10:00:00.000Z") },
  { id: "round-two", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-30T11:00:00.000Z") },
  { id: "unscheduled", status: "pending", lastError: null, nextAttemptAt: null },
  { id: "quota-marker", status: "pending", lastError: "Daily message limit reached", nextAttemptAt: new Date("2026-08-30T10:00:00.000Z") },
  { id: "failed", status: "failed", lastError: "Telegram rejected delivery", nextAttemptAt: null },
  { id: "review", status: "requires_review", lastError: "Outcome unknown", nextAttemptAt: null },
], adminStartAt);
assert.equal(adminScheduleRebase.nextRunAt?.toISOString(), adminStartAt.toISOString());
assert.deepEqual(
  adminScheduleRebase.updates.map((target) => [
    target.id,
    target.previousNextAttemptAt?.toISOString() ?? null,
    target.nextAttemptAt.toISOString(),
  ]),
  [
    ["round-one", "2026-08-30T10:00:00.000Z", "2026-08-30T14:00:00.000Z"],
    ["round-two", "2026-08-30T11:00:00.000Z", "2026-08-30T15:00:00.000Z"],
    ["unscheduled", null, "2026-08-30T14:00:00.000Z"],
  ],
);
assert.equal(
  adminScheduleRebase.updates.some((target) => ["sent", "sending", "quota-marker", "failed", "review"].includes(target.id)),
  false,
);

const campaignAAnchor = new Date("2026-08-27T08:00:00.000Z"); // 15:00 Asia/Ho_Chi_Minh
const campaignBAnchor = new Date("2026-08-27T12:00:00.000Z"); // 19:00 Asia/Ho_Chi_Minh
const quotaResetAt = new Date("2026-08-27T17:05:00.000Z"); // 00:05 on August 28 locally
assert.equal(
  nextCampaignDailyStart(campaignAAnchor, quotaResetAt, "Asia/Ho_Chi_Minh").toISOString(),
  "2026-08-28T08:00:00.000Z",
);
assert.equal(
  nextCampaignDailyStart(campaignBAnchor, quotaResetAt, "Asia/Ho_Chi_Minh").toISOString(),
  "2026-08-28T12:00:00.000Z",
);

const quotaResumeAt = new Date("2026-08-28T08:00:00.000Z");
const quotaRebase = rebaseQuotaPausedSchedule([
  { id: "quota-marker", status: "pending", lastError: "Daily message limit reached. Campaign paused and will resume automatically on a new day.", nextAttemptAt: new Date("2026-08-27T15:00:00.000Z"), updatedAt: new Date("2026-08-27T15:00:00.000Z") },
  { id: "same-round", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-27T15:00:00.000Z"), updatedAt: new Date("2026-08-27T15:00:00.000Z") },
  { id: "next-round", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-27T16:00:00.000Z"), updatedAt: new Date("2026-08-27T15:00:00.000Z") },
  // A 2,220-second interval sampled from a campaign-specific 1,800–3,600 range.
  { id: "variable-round", status: "pending", lastError: null, nextAttemptAt: new Date("2026-08-27T15:37:00.000Z"), updatedAt: new Date("2026-08-27T15:00:00.000Z") },
  { id: "retry", status: "pending", lastError: "Telegram flood wait", nextAttemptAt: new Date("2026-08-27T15:30:00.000Z"), updatedAt: new Date("2026-08-27T15:30:00.000Z") },
  { id: "sent", status: "sent", lastError: null, nextAttemptAt: new Date("2026-08-27T14:00:00.000Z"), updatedAt: new Date("2026-08-27T14:00:00.000Z") },
  { id: "review", status: "requires_review", lastError: "Needs operator review", nextAttemptAt: null, updatedAt: new Date("2026-08-27T15:00:00.000Z") },
  { id: "sending", status: "sending", lastError: null, nextAttemptAt: new Date("2026-08-27T15:00:00.000Z"), updatedAt: new Date("2026-08-27T15:00:00.000Z") },
], quotaResumeAt, ["Daily message limit reached. Campaign paused and will resume automatically on a new day."]);
assert.ok(quotaRebase);
assert.equal(quotaRebase.nextRunAt.toISOString(), quotaResumeAt.toISOString());
assert.deepEqual(
  quotaRebase.updates.map((target) => [target.id, target.nextAttemptAt.toISOString(), target.clearQuotaPauseMarker]),
  [
    ["quota-marker", "2026-08-28T08:00:00.000Z", true],
    ["same-round", "2026-08-28T08:00:00.000Z", false],
    ["next-round", "2026-08-28T09:00:00.000Z", false],
    ["variable-round", "2026-08-28T08:37:00.000Z", false],
  ],
);
assert.equal(
  quotaRebase.updates.find((target) => target.id === "variable-round")!.nextAttemptAt.getTime()
    - quotaRebase.updates.find((target) => target.id === "same-round")!.nextAttemptAt.getTime(),
  2_220_000,
);
assert.equal(quotaRebase.updates.some((target) => ["retry", "sent", "review", "sending"].includes(target.id)), false);
const subscriptionExpiry = new Date("2026-08-24T00:00:00.000Z");
assert.equal(isSubscriptionActiveAt(subscriptionExpiry, new Date("2026-08-23T23:59:59.999Z")), true);
assert.equal(isSubscriptionActiveAt(subscriptionExpiry, subscriptionExpiry), false);
assert.equal(isSubscriptionActiveAt(null, subscriptionExpiry), true);

console.log("Campaign quota and schedule safety checks passed.");