export function isPrivateAdminChatType(chatType: string | null | undefined): boolean {
  return chatType === "private";
}

export function isAuthorizedAdminMessage(input: {
  configuredChatId: string | null | undefined;
  chatType: string | null | undefined;
  chatId: number | string | null | undefined;
  senderId: number | string | null | undefined;
}): boolean {
  const { configuredChatId, chatType, chatId, senderId } = input;
  if (!configuredChatId || !isPrivateAdminChatType(chatType) || chatId == null || senderId == null) return false;

  return String(chatId) === configuredChatId && String(senderId) === configuredChatId;
}