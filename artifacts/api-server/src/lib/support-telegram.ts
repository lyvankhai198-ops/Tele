import { eq } from "drizzle-orm";
import { appUsersTable, db, supportMessagesTable } from "@workspace/db";
import { getSystemSettings } from "./system-settings";
import {
  appendSupportMessage,
  ensureSupportConversation,
  findSupportMessageByTelegramReply,
  getSupportConversationForAdmin,
  setSupportMessageTelegramId,
} from "./support-chat";
import { logger } from "./logger";

type TelegramMessage = {
  message_id: number;
  chat: { id: number | string };
  text?: string;
  reply_to_message?: { message_id: number };
  from?: { username?: string; first_name?: string; last_name?: string };
};

type TelegramUpdate = { update_id: number; message?: TelegramMessage };

const botToken = () => process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN ?? process.env.TELECAMPAIGN_KGPT_BOT_TOKEN;
let polling = false;
let offset = 0;

async function telegramCall<T>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  const token = botToken();
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  });
  const result = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed: ${result.description ?? response.statusText}`);
  }
  return result.result ?? null;
}

async function sendSupportMessage(text: string, replyToMessageId?: number): Promise<TelegramMessage | null> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.telegramBridgeEnabled || !settings.supportChat.adminTelegramChatId) return null;
  return telegramCall<TelegramMessage>("sendMessage", {
    chat_id: settings.supportChat.adminTelegramChatId,
    text,
    reply_to_message_id: replyToMessageId,
    allow_sending_without_reply: true,
  });
}

export async function notifySupportNewRegistration(input: {
  userId: string;
  username: string;
  preferredLanguage: "vi" | "en";
}): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.enabled) return;
  const conversation = await ensureSupportConversation(input.userId);
  await appendSupportMessage({
    conversationId: conversation.id,
    senderType: "admin",
    source: "system",
    body: input.preferredLanguage === "en"
      ? "Hello! If you need any assistance, feel free to send us a message. We are happy to help."
      : "Chào bạn! Nếu cần hỗ trợ, bạn cứ nhắn mình nhé. Đội ngũ hỗ trợ luôn sẵn sàng giúp bạn.",
    visibleToUser: true,
  });
  if (!settings.supportChat.notifyNewRegistrations) return;
  const result = await appendSupportMessage({
    conversationId: conversation.id,
    senderType: "system",
    source: "system",
    body: `Đăng ký mới: ${input.username}`,
    visibleToUser: false,
  });
  const sent = await sendSupportMessage(
    `Người dùng mới đăng ký TeleCampaign\nUsername: ${input.username}\n\nHãy reply tin nhắn này để mở trao đổi hỗ trợ.`,
  );
  if (sent) await setSupportMessageTelegramId(result.message.id, String(sent.chat.id), sent.message_id);
}

export async function notifySupportUserMessage(input: {
  conversationId: string;
  messageId: string;
  username: string;
  body: string;
}): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.enabled || !settings.supportChat.telegramBridgeEnabled) return;
  const sent = await sendSupportMessage(`Tin nhắn hỗ trợ từ ${input.username}\n\n${input.body}`);
  if (sent) await setSupportMessageTelegramId(input.messageId, String(sent.chat.id), sent.message_id);
}

export async function notifySupportConversationClosed(input: { username: string }): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.enabled || !settings.supportChat.telegramBridgeEnabled) return;
  await sendSupportMessage(
    `Khách hàng ${input.username} đã đóng phiên hỗ trợ trên website.\n\nPhiên hỗ trợ hiện tại đã kết thúc.`,
  );
}

async function handleTelegramMessage(message: TelegramMessage): Promise<void> {
  const settings = await getSystemSettings();
  const configuredChatId = settings.supportChat.adminTelegramChatId;
  if (!configuredChatId || String(message.chat.id) !== configuredChatId || !message.text?.trim()) return;

  const text = message.text.trim();
  if (text === "/start" || text === "/chatid") {
    await telegramCall("sendMessage", {
      chat_id: message.chat.id,
      text: `Chat ID hiện tại: ${message.chat.id}\nHãy nhập ID này trong Admin → Cấu hình hệ thống → Hỗ trợ chat.`,
    });
    return;
  }
  const replyId = message.reply_to_message?.message_id;
  if (!replyId) {
    await telegramCall("sendMessage", {
      chat_id: message.chat.id,
      text: "Hãy reply trực tiếp một tin nhắn hỗ trợ để gửi trả lời đúng người dùng.",
    });
    return;
  }
  const mapped = await findSupportMessageByTelegramReply(String(message.chat.id), replyId);
  if (!mapped) return;
  const conversation = await getSupportConversationForAdmin(mapped.conversationId);
  if (!conversation) return;
  const result = await appendSupportMessage({
    conversationId: mapped.conversationId,
    senderType: "admin",
    source: "telegram",
    body: text,
  });
  logger.info({ conversationId: conversation.id, messageId: result.message.id }, "Support reply received from Telegram");
}

async function pollTelegram(): Promise<void> {
  if (polling) return;
  const settings = await getSystemSettings();
  if (!botToken() || !settings.supportChat.enabled || !settings.supportChat.telegramBridgeEnabled || !settings.supportChat.adminTelegramChatId) return;
  polling = true;
  try {
    const updates = await telegramCall<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: 20,
      allowed_updates: ["message"],
    });
    for (const update of updates ?? []) {
      offset = Math.max(offset, update.update_id + 1);
      if (update.message) await handleTelegramMessage(update.message);
    }
  } catch (error) {
    logger.warn({ err: error }, "Support Telegram polling failed");
  } finally {
    polling = false;
  }
}

export function startSupportTelegramBridge(): void {
  if (!botToken()) {
    logger.info("Support Telegram bridge disabled: no support bot token configured");
    return;
  }
  setInterval(() => void pollTelegram(), 1_000);
  void pollTelegram();
}