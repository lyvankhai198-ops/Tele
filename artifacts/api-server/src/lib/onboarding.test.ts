import assert from "node:assert/strict";
import { buildOnboardingSummary } from "./onboarding";

const fresh = buildOnboardingSummary({
  accounts: [],
  destinations: [],
  messageTemplateCount: 0,
  campaigns: [],
});
assert.equal(fresh.visible, true);
assert.equal(fresh.successfulCampaigns, 0);
assert.deepEqual(fresh.steps.map((step) => step.status), Array(6).fill("not_started"));

const inProgress = buildOnboardingSummary({
  accounts: [{ status: "connected", lastSyncAt: new Date() }],
  destinations: [
    { canPost: true, permissionCheckedAt: new Date() },
    { canPost: false, permissionCheckedAt: new Date() },
  ],
  messageTemplateCount: 1,
  campaigns: [{ status: "running" }],
});
assert.equal(inProgress.visible, true);
assert.equal(inProgress.steps.find((step) => step.id === "permissions")?.status, "attention");
assert.equal(inProgress.steps.find((step) => step.id === "first_campaign")?.status, "in_progress");

const completed = buildOnboardingSummary({
  accounts: [{ status: "connected", lastSyncAt: new Date() }],
  destinations: [{ canPost: true, permissionCheckedAt: new Date() }],
  messageTemplateCount: 1,
  campaigns: [{ status: "completed" }],
});
assert.equal(completed.visible, false);
assert.equal(completed.completed, true);
assert.equal(completed.quickSendEligible, true);

const proficient = buildOnboardingSummary({
  accounts: [{ status: "connected", lastSyncAt: new Date() }],
  destinations: [{ canPost: true, permissionCheckedAt: new Date() }],
  messageTemplateCount: 3,
  campaigns: [{ status: "completed" }, { status: "completed_with_errors" }, { status: "completed" }, { status: "completed" }],
});
assert.equal(proficient.successfulCampaigns, 3);
assert.equal(proficient.quickSendEligible, false);

console.log("Onboarding summary checks passed.");