import assert from "node:assert/strict";
import {
  TelegramPostingPermissionError,
  telegramPostingPermissionFailureReason,
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

console.log("Telegram posting permission classification checks passed.");