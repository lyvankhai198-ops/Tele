import assert from "node:assert/strict";
import {
  canChooseRestrictedDestination,
  localScheduleFields,
  scheduleMeetsRestrictionSuggestion,
  suggestedRestrictionSchedule,
  TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS,
} from "./telegram-restrictions";

const now = new Date("2026-09-01T00:00:00.000Z");
const firstExpiry = new Date("2026-09-01T01:00:12.000Z");
const lastExpiry = new Date("2026-09-01T03:00:45.000Z");
const suggested = suggestedRestrictionSchedule([
  { canPost: false, restrictedUntil: firstExpiry },
  { canPost: false, restrictedUntil: lastExpiry },
], now);

assert.equal(suggested?.toISOString(), "2026-09-01T03:06:00.000Z");
assert.equal(suggested!.getSeconds(), 0);
assert.equal(suggested!.getMilliseconds(), 0);
assert.equal(suggested!.getTime() >= lastExpiry.getTime() + TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS, true);
assert.equal(scheduleMeetsRestrictionSuggestion(new Date("2026-09-01T03:06:00.000Z"), suggested), true);
assert.equal(scheduleMeetsRestrictionSuggestion(lastExpiry, suggested), false);
assert.equal(canChooseRestrictedDestination({ canPost: false, restrictedUntil: null }, now), false);
assert.equal(canChooseRestrictedDestination({ canPost: false, restrictedUntil: firstExpiry }, now), true);
assert.deepEqual(localScheduleFields(new Date(2026, 8, 1, 10, 7)), { date: "2026-09-01", time: "10:07" });

console.log("Telegram restriction scheduling checks passed.");