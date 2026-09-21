import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import {
  appUsersTable,
  db,
  supportConversationsTable,
  supportMessagesTable,
} from "@workspace/db";

export const SUPPORT_MESSAGE_MAX_LENGTH = 2000;
export const SUPPORT_CONVERSATION_STATUSES = ["open", "closed"] as const;
export type SupportConversationStatus = (typeof SUPPORT_CONVERSATION_STATUSES)[number];

export type SupportMessageDto = {
  id: string;
  senderType: "user" | "admin" | "system";
  source: "web" | "telegram" | "system";
  body: string;
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

function toMessageDto(message: typeof supportMessagesTable.$inferSelect): SupportMessageDto {
  return {
    id: message.id,
    senderType: message.senderType as SupportMessageDto["senderType"],
    source: message.source as SupportMessageDto["source"],
    body: message.body,
    createdAt: message.createdAt,
  };
}

function toConversationDto(
  conversation: typeof supportConversationsTable.$inferSelect,
  username: string,
  messages?: typeof supportMessagesTable.$inferSelect[],
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
    messages: (messages?.filter((message) => message.visibleToUser) ?? []).map(toMessageDto),
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
  return toConversationDto(conversation, user?.username ?? "user", messages);
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
  return toConversationDto(row.conversation, row.username, messages);
}

export async function appendSupportMessage(input: {
  conversationId: string;
  senderType: "user" | "admin" | "system";
  senderUserId?: string;
  source: "web" | "telegram" | "system";
  body: string;
  visibleToUser?: boolean;
}): Promise<{ conversation: SupportConversationDto; message: SupportMessageDto; telegramMessageId?: number | null }> {
  const body = input.body.trim();
  if (!body || body.length > SUPPORT_MESSAGE_MAX_LENGTH) {
    throw new Error("Support message must contain 1-2000 characters");
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
    conversation: toConversationDto(row.conversation, row.username),
    message: toMessageDto(result.message),
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

export async function closeSupportConversation(conversationId: string): Promise<void> {
  await db.update(supportConversationsTable)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(supportConversationsTable.id, conversationId));
}