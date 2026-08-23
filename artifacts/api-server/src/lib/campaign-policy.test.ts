import assert from "node:assert/strict";
import { canReserveDailyQuota, isWithinDailyQuota } from "./campaign-policy";
import { resolveCampaignScheduleStart } from "./campaign-schedule";

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

console.log("Campaign quota and schedule safety checks passed.");