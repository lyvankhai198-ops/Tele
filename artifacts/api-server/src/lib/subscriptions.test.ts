import assert from "node:assert/strict";
import { canRedeemLicensePlan, isActiveUnclaimedPlusTrial, TRIAL_DURATION_DAYS } from "./subscriptions";

const now = new Date("2026-08-27T05:00:00.000Z");
const trialStartedAt = new Date(now.getTime() - 19 * 60 * 60 * 1000);
const trialExpiresAt = new Date(trialStartedAt.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

assert.equal(
  isActiveUnclaimedPlusTrial(
    { plan: "plus", startedAt: trialStartedAt, expiresAt: trialExpiresAt },
    false,
    now,
  ),
  true,
);

assert.equal(
  isActiveUnclaimedPlusTrial(
    { plan: "plus", startedAt: trialStartedAt, expiresAt: trialExpiresAt },
    true,
    now,
  ),
  false,
);

assert.equal(
  isActiveUnclaimedPlusTrial(
    { plan: "plus", startedAt: new Date("2026-08-01T05:00:00.000Z"), expiresAt: new Date("2026-08-31T05:00:00.000Z") },
    false,
    now,
  ),
  false,
);

assert.equal(
  isActiveUnclaimedPlusTrial(
    { plan: "pro", startedAt: trialStartedAt, expiresAt: trialExpiresAt },
    false,
    now,
  ),
  false,
);

assert.equal(
  isActiveUnclaimedPlusTrial(
    { plan: "plus", startedAt: trialStartedAt, expiresAt: trialExpiresAt },
    false,
    new Date("2026-08-28T05:00:00.000Z"),
  ),
  false,
);

assert.equal(canRedeemLicensePlan("plus", "plus", true), true);
assert.equal(canRedeemLicensePlan("plus", "plus", false), false);
assert.equal(canRedeemLicensePlan(null, "plus", false), true);
assert.equal(canRedeemLicensePlan("plus", "pro", false), true);
assert.equal(canRedeemLicensePlan("pro", "plus", false), false);

console.log("Trial PLUS activation policy checks passed.");