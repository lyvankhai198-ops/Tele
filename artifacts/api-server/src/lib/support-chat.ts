import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import {
  appUsersTable,
  db,
  supportConversationsTable,
  supportMessagesTable,
} from "@workspace/db";
import { supportMediaStorage } from "./supportMediaStorage";

export const SUPPORT_MESSAGE_MAX_LENGTH = 2000;
export const SUPPORT_CONVERSATION_STATUSES = ["open", "closed"] as const;
export type SupportConversationStatus = (typeof SUPPORT_CONVERSATION_STATUSES)[number];

export type SupportMessageDto = {
  id: string;
  senderType: "user" | "admin" | "system";
  source: "web" | "telegram" | "system";
  body: string;
  mediaUrl: string | null;
  createdAt: Date;
};

export type SupportConversationDto = {
  id: string;
  userId: string;
  username: string;
  status: SupportConversationStatus;
  unreadForUser: number;
  unreadForAdmin: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: SupportMessageDto[];
};

export type SupportTelegramMessageRef = {
  chatId: string;
  telegramMessageId: number;
};

function toMessageDto(
  message: typeof supportMessagesTable.$inferSelect,
  viewer: "user" | "admin",
): SupportMessageDto {
  return {
    id: message.id,
    senderType: message.senderType as SupportMessageDto["senderType"],
    source: message.source as SupportMessageDto["source"],
    body: viewer === "user" && message.translatedBody ? message.translatedBody : message.body,
    mediaUrl: message.mediaPath ? `/api/support-chat/media/${message.id}` : null,
    createdAt: message.createdAt,
  };
}

function toConversationDto(
  conversation: typeof supportConversationsTable.$inferSelect,
  username: string,
  messages?: typeof supportMessagesTable.$inferSelect[],
  viewer: "user" | "admin" = "admin",
): SupportConversationDto {
  return {
    id: conversation.id,
    userId: conversation.userId,
    username,
    status: conversation.status as SupportConversationStatus,
    unreadForUser: conversation.unreadForUser,
    unreadForAdmin: conversation.unreadForAdmin,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: (messages?.filter((message) => viewer === "admin" || message.visibleToUser) ?? [])
      .map((message) => toMessageDto(message, viewer)),
  };
}

export async function ensureSupportConversation(userId: string): Promise<typeof supportConversationsTable.$inferSelect> {
  await db.insert(supportConversationsTable)
    .values({ userId })
    .onConflictDoNothing({ target: supportConversationsTable.userId });
  const [conversation] = await db.select().from(supportConversationsTable)
    .where(eq(supportConversationsTable.userId, userId))
    .limit(1);
  if (!conversation) throw new Error("Support conversation could not be created");
  return conversation;
}

async function conversationWithUser(conversationId: string): Promise<{
  conversation: typeof supportConversationsTable.$inferSelect;
  username: string;
} | null> {
  const [row] = await db.select({
    conversation: supportConversationsTable,
    username: appUsersTable.username,
  })
    .from(supportConversationsTable)
    .innerJoin(appUsersTable, eq(appUsersTable.id, supportConversationsTable.userId))
    .where(eq(supportConversationsTable.id, conversationId))
    .limit(1);
  return row ?? null;
}

export async function getSupportConversationForUser(userId: string): Promise<SupportConversationDto> {
  const conversation = await ensureSupportConversation(userId);
  const [user] = await db.select({ username: appUsersTable.username })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, userId))
    .limit(1);
  const messages = await db.select().from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.conversationId, conversation.id),
      eq(supportMessagesTable.visibleToUser, true),
    ))
    .orderBy(asc(supportMessagesTable.createdAt));
  return toConversationDto(conversation, user?.username ?? "user", messages, "user");
}

export async function listSupportConversations(): Promise<SupportConversationDto[]> {
  const rows = await db.select({
    conversation: supportConversationsTable,
    username: appUsersTable.username,
  })
    .from(supportConversationsTable)
    .innerJoin(appUsersTable, eq(appUsersTable.id, supportConversationsTable.userId))
    .orderBy(desc(supportConversationsTable.lastMessageAt), desc(supportConversationsTable.createdAt));
  return rows.map((row) => toConversationDto(row.conversation, row.username));
}

export async function getSupportConversationForAdmin(conversationId: string): Promise<SupportConversationDto | null> {
  const row = await conversationWithUser(conversationId);
  if (!row) return null;
  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conversationId))
    .orderBy(asc(supportMessagesTable.createdAt));
  return toConversationDto(row.conversation, row.username, messages, "admin");
}

export async function getSupportMessageMedia(messageId: string, userId?: string): Promise<{
  mediaPath: string;
  mediaContentType: string | null;
} | null> {
  const conditions = [eq(supportMessagesTable.id, messageId)];
  if (userId) conditions.push(eq(supportConversationsTable.userId, userId));
  const [row] = await db.select({
    mediaPath: supportMessagesTable.mediaPath,
    mediaContentType: supportMessagesTable.mediaContentType,
  })
    .from(supportMessagesTable)
    .innerJoin(supportConversationsTable, eq(supportConversationsTable.id, supportMessagesTable.conversationId))
    .where(and(...conditions))
    .limit(1);
  if (!row?.mediaPath) return null;
  return {
    mediaPath: row.mediaPath,
    mediaContentType: row.mediaContentType,
  };
}

export async function appendSupportMessage(input: {
  conversationId: string;
  senderType: "user" | "admin" | "system";
  senderUserId?: string;
  source: "web" | "telegram" | "system";
  body: string;
  mediaPath?: string;
  mediaContentType?: string;
  translatedBody?: string;
  visibleToUser?: boolean;
}): Promise<{ conversation: SupportConversationDto; message: SupportMessageDto; telegramMessageId?: number | null }> {
  const body = input.body.trim();
  if ((!body && !input.mediaPath) || body.length > SUPPORT_MESSAGE_MAX_LENGTH) {
    throw new Error("Support message must contain text or an image, with up to 2000 characters");
  }
  const result = await db.transaction(async (tx) => {
    const [conversation] = await tx.select().from(supportConversationsTable)
      .where(eq(supportConversationsTable.id, input.conversationId))
      .limit(1);
    if (!conversation) throw new Error("Support conversation not found");
    const now = new Date();
    const [message] = await tx.insert(supportMessagesTable).values({
      conversationId: input.conversationId,
      senderType: input.senderType,
      senderUserId: input.senderUserId ?? null,
      source: input.source,
      body,
      translatedBody: input.translatedBody?.trim() || null,
      mediaPath: input.mediaPath ?? null,
      mediaContentType: input.mediaContentType ?? null,
      visibleToUser: input.visibleToUser ?? true,
      createdAt: now,
    }).returning();
    const unreadColumn = input.senderType === "user"
      ? sql`${supportConversationsTable.unreadForAdmin} + 1`
      : input.senderType === "admin"
        ? sql`${supportConversationsTable.unreadForUser} + 1`
        : sql`${supportConversationsTable.unreadForAdmin}`;
    const [updated] = await tx.update(supportConversationsTable)
      .set({
        lastMessageAt: now,
        updatedAt: now,
        status: input.senderType === "user" ? "open" : conversation.status,
        unreadForAdmin: input.senderType === "user" ? unreadColumn : conversation.unreadForAdmin,
        unreadForUser: input.senderType === "admin" ? unreadColumn : conversation.unreadForUser,
      })
      .where(eq(supportConversationsTable.id, input.conversationId))
      .returning();
    return { conversation: updated, message };
  });
  const row = await conversationWithUser(input.conversationId);
  if (!row) throw new Error("Support conversation disappeared");
  return {
    conversation: toConversationDto(
      row.conversation,
      row.username,
      undefined,
      input.senderType === "user" ? "user" : "admin",
    ),
    message: toMessageDto(result.message, input.senderType === "user" ? "user" : "admin"),
    telegramMessageId: result.message.telegramMessageId,
  };
}

export async function setSupportMessageTelegramId(messageId: string, chatId: string, telegramMessageId: number): Promise<void> {
  await db.update(supportMessagesTable)
    .set({ telegramChatId: chatId, telegramMessageId })
    .where(eq(supportMessagesTable.id, messageId));
}

export async function findSupportMessageByTelegramReply(chatId: string, telegramMessageId: number): Promise<{
  conversationId: string;
  messageId: string;
} | null> {
  const [message] = await db.select({
    conversationId: supportMessagesTable.conversationId,
    messageId: supportMessagesTable.id,
  })
    .from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.telegramChatId, chatId),
      eq(supportMessagesTable.telegramMessageId, telegramMessageId),
    ))
    .limit(1);
  return message ?? null;
}

export async function markSupportConversationRead(conversationId: string, reader: "user" | "admin"): Promise<void> {
  await db.update(supportConversationsTable)
    .set(reader === "user" ? { unreadForUser: 0 } : { unreadForAdmin: 0 })
    .where(eq(supportConversationsTable.id, conversationId));
}

export async function closeSupportConversation(conversationId: string): Promise<SupportTelegramMessageRef[]> {
  const messages = await db.select({
    mediaPath: supportMessagesTable.mediaPath,
    telegramChatId: supportMessagesTable.telegramChatId,
    telegramMessageId: supportMessagesTable.telegramMessageId,
  })
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conversationId));
  await db.transaction(async (tx) => {
    await tx.delete(supportMessagesTable)
      .where(eq(supportMessagesTable.conversationId, conversationId));
    await tx.update(supportConversationsTable)
      .set({
        status: "closed",
        unreadForUser: 0,
        unreadForAdmin: 0,
        lastMessageAt: null,
        updatedAt: new Date(),
      })
      .where(eq(supportConversationsTable.id, conversationId));
  });
  await Promise.all(messages
    .map(({ mediaPath }) => mediaPath ? supportMediaStorage.deleteImage(mediaPath) : null)
    .filter((mediaPath): mediaPath is Promise<void> => Boolean(mediaPath)));
  return messages
    .filter((message): message is typeof message & {
      telegramChatId: string;
      telegramMessageId: number;
    } => Boolean(message.telegramChatId && message.telegramMessageId))
    .map((message) => ({
      chatId: message.telegramChatId,
      telegramMessageId: message.telegramMessageId,
    }));
}