import assert from "node:assert/strict";
import { classifyTelegramError } from "./telegram-errors";

const cases = [
  [{ errorMessage: "FLOOD_WAIT_120", seconds: 120 }, "flood_wait", "wait"],
  [{ errorMessage: "CHAT_WRITE_FORBIDDEN" }, "permission", "check_permissions"],
  [{ errorMessage: "SESSION_REVOKED" }, "session", "reconnect_account"],
  [Object.assign(new Error("Proxy password secret-value timed out"), { name: "TelegramProxyError" }), "proxy_network", "check_proxy"],
  [{ errorMessage: "CHANNEL_PRIVATE" }, "destination", "refresh_destination"],
  [new Error("secret session-string phone +84901234567 unknown failure"), "unknown", "review"],
] as const;

for (const [error, category, recoveryAction] of cases) {
  const classified = classifyTelegramError(error);
  assert.equal(classified.category, category);
  assert.equal(classified.recoveryAction, recoveryAction);
  assert.doesNotMatch(classified.safeMessage, /secret-value|session-string|\+84901234567|password/i);
}

assert.equal(classifyTelegramError({ errorMessage: "FLOOD_WAIT_120", seconds: 120 }).floodWaitSeconds, 120);
assert.equal(classifyTelegramError(new Error("socket timeout")).safeToRetry, false);
assert.equal(classifyTelegramError(Object.assign(new Error("proxy refused"), { name: "TelegramProxyError" })).safeToRetry, true);

console.log("Telegram error classification checks passed.");