import assert from "node:assert/strict";
import {
  canScheduleTelegramDestination,
  TelegramPostingPermissionError,
  TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS,
  telegramSendRestrictionIsActive,
  telegramPostingPermissionFailureReason,
  telegramPostingPermissionRestrictedUntil,
  telegramPostingPermissionResumeAt,
} from "./telegram-errors";

assert.match(
  telegramPostingPermissionFailureReason(
    new TelegramPostingPermissionError("Telegram posting permission is no longer available for this group."),
  ) ?? "",
  /posting permission/i,
);
assert.match(
  telegramPostingPermissionFailureReason({ errorMessage: "CHAT_WRITE_FORBIDDEN" }) ?? "",
  /sync the account again/i,
);
assert.match(
  telegramPostingPermissionFailureReason(new Error("RPCError: 403 USER_BANNED_IN_CHANNEL")) ?? "",
  /restricted, banned/i,
);
assert.match(
  telegramPostingPermissionFailureReason(
    new Error('Telegram posting permission is no longer available for "SellerHunt Chat".'),
  ) ?? "",
  /deselect this group/i,
);
assert.equal(
  telegramPostingPermissionFailureReason(new Error("Temporary network timeout")),
  null,
);
const restrictedUntil = new Date("2026-09-01T12:05:00.000Z");
assert.equal(
  telegramPostingPermissionRestrictedUntil(new TelegramPostingPermissionError("Temporarily restricted", restrictedUntil)),
  restrictedUntil,
);
assert.equal(
  telegramPostingPermissionRestrictedUntil(new Error("CHAT_WRITE_FORBIDDEN")),
  null,
);
const restrictionCheckAt = new Date("2026-09-01T12:00:00.000Z");
assert.equal(
  telegramPostingPermissionResumeAt(restrictedUntil, restrictionCheckAt)?.toISOString(),
  "2026-09-01T12:10:00.000Z",
);
assert.equal(
  telegramPostingPermissionResumeAt(new Date("2026-09-01T11:59:59.000Z"), restrictionCheckAt),
  null,
);
assert.equal(telegramPostingPermissionResumeAt(null, restrictionCheckAt), null);
assert.equal(
  canScheduleTelegramDestination(
    { canPost: false, restrictedUntil },
    new Date(restrictedUntil.getTime() + TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS - 1),
  ),
  false,
);
assert.equal(
  canScheduleTelegramDestination(
    { canPost: false, restrictedUntil },
    new Date(restrictedUntil.getTime() + TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS),
  ),
  true,
);
assert.equal(
  canScheduleTelegramDestination({ canPost: false, restrictedUntil: null }, restrictedUntil),
  false,
);
assert.equal(
  canScheduleTelegramDestination({ canPost: true, restrictedUntil: null }, null),
  true,
);
const permissionCheckAt = new Date("2026-09-01T12:00:00.000Z");
assert.equal(
  telegramSendRestrictionIsActive(
    { sendMessages: true, untilDate: Math.floor(permissionCheckAt.getTime() / 1000) + 60 },
    permissionCheckAt,
  ),
  true,
);
assert.equal(
  telegramSendRestrictionIsActive(
    { sendMessages: true, untilDate: Math.floor(permissionCheckAt.getTime() / 1000) },
    permissionCheckAt,
  ),
  false,
);
assert.equal(telegramSendRestrictionIsActive({ sendMessages: true, untilDate: 0 }, permissionCheckAt), true);
assert.equal(telegramSendRestrictionIsActive({ sendMessages: true }, permissionCheckAt), true);
assert.equal(telegramSendRestrictionIsActive({ sendMessages: false }, permissionCheckAt), false);

console.log("Telegram posting permission classification checks passed.");