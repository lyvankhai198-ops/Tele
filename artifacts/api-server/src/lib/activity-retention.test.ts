import assert from "node:assert/strict";
import {
  ACTIVITY_LOG_RETENTION_DAYS,
  activityLogCutoff,
} from "./activity";

const now = new Date("2026-08-26T00:00:00.000Z");
const cutoff = activityLogCutoff(now);

assert.equal(ACTIVITY_LOG_RETENTION_DAYS, 30);
assert.equal(cutoff.toISOString(), "2026-07-27T00:00:00.000Z");
assert.throws(
  () => activityLogCutoff(now, 0),
  /retention must be a positive integer/,
);
assert.throws(
  () => activityLogCutoff(now, 1.5),
  /retention must be a positive integer/,
);

console.log("Activity-log retention checks passed.");