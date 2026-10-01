import assert from "node:assert/strict";
import { isAuthorizedAdminMessage, isPrivateAdminChatType } from "./telegram-admin-access";

const adminChatId = "6824510";
const adminMessage = {
  configuredChatId: adminChatId,
  chatType: "private",
  chatId: 6824510,
  senderId: 6824510,
};

assert.equal(isAuthorizedAdminMessage(adminMessage), true);
assert.equal(isAuthorizedAdminMessage({ ...adminMessage, chatId: 8921173 }), false);
assert.equal(isAuthorizedAdminMessage({ ...adminMessage, senderId: 8921173 }), false);
assert.equal(isAuthorizedAdminMessage({ ...adminMessage, chatType: "group" }), false);
assert.equal(isAuthorizedAdminMessage({ ...adminMessage, chatType: "supergroup" }), false);
assert.equal(isAuthorizedAdminMessage({ ...adminMessage, configuredChatId: null }), false);
assert.equal(isAuthorizedAdminMessage({ ...adminMessage, senderId: undefined }), false);

assert.equal(isPrivateAdminChatType("private"), true);
assert.equal(isPrivateAdminChatType("group"), false);
assert.equal(isPrivateAdminChatType("supergroup"), false);
assert.equal(isPrivateAdminChatType("channel"), false);
assert.equal(isPrivateAdminChatType(undefined), false);
assert.equal(isPrivateAdminChatType(null), false);

console.log("Telegram admin chat privacy checks passed.");