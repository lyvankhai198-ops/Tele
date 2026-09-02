import assert from "node:assert/strict";
import { shouldShowQuickSend } from "./onboarding.ts";

assert.equal(shouldShowQuickSend(0), true);
assert.equal(shouldShowQuickSend(1), true);
assert.equal(shouldShowQuickSend(2), true);
assert.equal(shouldShowQuickSend(3), false);
assert.equal(shouldShowQuickSend(4), false);