import { readFile } from "node:fs/promises";
import { and, count, desc, eq, gt, isNotNull, isNull, lte, ne, or, sql, sum } from "drizzle-orm";
import {
  appUsersTable,
  db,
  licenseKeysTable,
  purchaseOrdersTable,
  subscriptionsTable,
  supportMessagesTable,
} from "@workspace/db";
import { getSystemSettings } from "./system-settings";
import { localQuotaDate } from "./user-daily-quota";
import {
  appendSupportMessage,
  ensureSupportConversation,
  findSupportMessageByTelegramReply,
  getSupportConversationForAdmin,
  setSupportMessageTelegramId,
  type SupportTelegramMessageRef,
} from "./support-chat";
import { supportMediaStorage } from "./supportMediaStorage";
import { reviewOrder, verifiedOrderNotification } from "./telecampaign-orders";
import { logger } from "./logger";
import {
  translateAdminReplyForCustomer,
  translateCustomerMessageForAdmin,
} from "./support-translation";

type TelegramMessage = {
  message_id: number;
  chat: { id: number | string; type?: string };
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; width: number; height: number; file_size?: number }>;
  reply_to_message?: { message_id: number };
  from?: { username?: string; first_name?: string; last_name?: string };
};

type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: { id: string; data?: string; from?: { id: number }; message?: TelegramMessage } };

const botToken = () => process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN ?? process.env.TELECAMPAIGN_KGPT_BOT_TOKEN;
let polling = false;
let offset = 0;

const ADMIN_MENU = {
  keyboard: [
    [{ text: "📊 Tổng quan" }, { text: "💰 Doanh thu" }],
    [{ text: "👥 Người dùng" }, { text: "🔑 License keys" }],
    [{ text: "⏳ Sắp hết hạn" }, { text: "🧾 Key hôm nay" }],
    [{ text: "🔄 Làm mới" }, { text: "🏠 Menu" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

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

async function sendAdminMenu(text = "Chọn một thao tác:"): Promise<TelegramMessage | null> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.telegramBridgeEnabled || !settings.supportChat.adminTelegramChatId) return null;
  return telegramCall<TelegramMessage>("sendMessage", {
    chat_id: settings.supportChat.adminTelegramChatId,
    text,
    reply_markup: ADMIN_MENU,
  });
}

export async function notifyPurchaseOrder(text: string, orderId?: string): Promise<void> {
  try {
  const settings = await getSystemSettings();
  if (!settings.supportChat.telegramBridgeEnabled || !settings.supportChat.adminTelegramChatId) return;
  const chat = await telegramCall<{ type?: string }>("getChat", { chat_id: settings.supportChat.adminTelegramChatId });
  await telegramCall("sendMessage", {
    chat_id: settings.supportChat.adminTelegramChatId,
    text,
    reply_markup: orderId && chat?.type === "private" ? {
      inline_keyboard: [[
        { text: "✅ Duyệt", callback_data: `purchase:paid:${orderId}` },
        { text: "❌ Từ chối", callback_data: `purchase:rejected:${orderId}` },
      ]],
    } : undefined,
  });
  } catch (error) {
    logger.warn({ err: error }, "Purchase order Telegram notification failed");
  }
}

async function handlePurchaseCallback(query: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
  const settings = await getSystemSettings();
  const configured = settings.supportChat.adminTelegramChatId;
  const message = query.message;
  const parts = query.data?.split(":") ?? [];
  const authorized = Boolean(configured && message?.chat.type === "private"
    && String(message.chat.id) === String(configured)
    && String(query.from?.id) === String(configured)
    && parts.length === 3 && parts[0] === "purchase" && ["paid", "rejected"].includes(parts[1]));
  if (!authorized) {
    await telegramCall("answerCallbackQuery", { callback_query_id: query.id, text: "Không được phép", show_alert: true });
    return;
  }
  try {
    const order = await reviewOrder(parts[2], String(query.from!.id), parts[1] as "paid" | "rejected");
    await telegramCall("answerCallbackQuery", { callback_query_id: query.id, text: order?.status === "paid" ? "Đã duyệt" : "Đã từ chối" });
    if (order) await telegramCall("editMessageReplyMarkup", { chat_id: message!.chat.id, message_id: message!.message_id, reply_markup: { inline_keyboard: [] } });
    if (order?.status === "paid") {
      await notifyPurchaseOrder(verifiedOrderNotification(order));
    }
  } catch (error) {
    await telegramCall("answerCallbackQuery", { callback_query_id: query.id, text: "Không thể xử lý đơn", show_alert: true });
    logger.warn({ err: error, callbackId: query.id }, "Purchase callback review failed");
  }
}

function localDayCondition(column: typeof licenseKeysTable.claimedAt, timezone: string, date: string) {
  return sql`(${column} AT TIME ZONE ${timezone})::date = ${date}::date`;
}

async function getAdminOverview() {
  const settings = await getSystemSettings();
  const now = new Date();
  const today = localQuotaDate(settings.defaultTimezone, now);
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [
    [userCount],
    [activeCount],
    [expiringCount],
    [soldToday],
    [revenueToday],
    [renewalRevenueToday],
    [soldTotal],
    [inventory],
  ] = await Promise.all([
    db.select({ value: count() }).from(appUsersTable).where(ne(appUsersTable.role, "admin")),
    db.select({ value: count() }).from(subscriptionsTable).where(or(isNull(subscriptionsTable.expiresAt), gt(subscriptionsTable.expiresAt, now))),
    db.select({ value: count() }).from(subscriptionsTable).where(and(
      gt(subscriptionsTable.expiresAt, now),
      lte(subscriptionsTable.expiresAt, sevenDays),
    )),
    db.select({ value: count() }).from(licenseKeysTable).where(and(
      isNull(licenseKeysTable.revokedAt),
      isNotNull(licenseKeysTable.claimedAt),
      localDayCondition(licenseKeysTable.claimedAt, settings.defaultTimezone, today),
    )),
    db.select({ value: sum(licenseKeysTable.salePriceVnd) }).from(licenseKeysTable).where(and(
      isNull(licenseKeysTable.revokedAt),
      isNotNull(licenseKeysTable.claimedAt),
      localDayCondition(licenseKeysTable.claimedAt, settings.defaultTimezone, today),
    )),
    db.select({ value: sum(purchaseOrdersTable.amount) }).from(purchaseOrdersTable).where(and(
      eq(purchaseOrdersTable.orderType, "renewal"),
      eq(purchaseOrdersTable.status, "paid"),
      eq(purchaseOrdersTable.currency, "VND"),
      sql`(COALESCE(${purchaseOrdersTable.reviewedAt}, ${purchaseOrdersTable.updatedAt}) AT TIME ZONE ${settings.defaultTimezone})::date = ${today}::date`,
    )),
    db.select({ value: count() }).from(licenseKeysTable).where(and(
      isNull(licenseKeysTable.revokedAt),
      isNotNull(licenseKeysTable.claimedAt),
    )),
    db.select({ value: count() }).from(licenseKeysTable).where(and(
      isNull(licenseKeysTable.revokedAt),
      isNull(licenseKeysTable.claimedAt),
    )),
  ]);
  return {
    users: Number(userCount?.value ?? 0),
    active: Number(activeCount?.value ?? 0),
    expiring: Number(expiringCount?.value ?? 0),
    soldToday: Number(soldToday?.value ?? 0),
    revenueToday: Number(revenueToday?.value ?? 0) + Number(renewalRevenueToday?.value ?? 0),
    soldTotal: Number(soldTotal?.value ?? 0),
    inventory: Number(inventory?.value ?? 0),
  };
}

function money(value: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

async function sendOverview(): Promise<void> {
  const stats = await getAdminOverview();
  await sendAdminMenu(
    `📊 TỔNG QUAN TELECAMPAIGN\n\n` +
    `👥 Người dùng: ${stats.users}\n` +
    `🟢 Gói đang hoạt động: ${stats.active}\n` +
    `⏳ Hết hạn trong 7 ngày: ${stats.expiring}\n\n` +
    `💰 Doanh thu hôm nay: ${money(stats.revenueToday)}\n` +
    `🔑 Key kích hoạt hôm nay: ${stats.soldToday}\n` +
    `📦 Key đã bán: ${stats.soldTotal}\n` +
    `🗃 Key còn tồn: ${stats.inventory}`,
  );
}

async function sendRevenue(): Promise<void> {
  const stats = await getAdminOverview();
  await sendAdminMenu(
    `💰 DOANH THU & LICENSE\n\n` +
    `Hôm nay: ${money(stats.revenueToday)}\n` +
    `Key hôm nay: ${stats.soldToday}\n` +
    `Tổng key đã kích hoạt: ${stats.soldTotal}\n` +
    `Key còn tồn: ${stats.inventory}\n\n` +
    `⏳ User sắp hết hạn: ${stats.expiring}`,
  );
}

async function sendUsers(): Promise<void> {
  const stats = await getAdminOverview();
  await sendAdminMenu(
    `👥 NGƯỜI DÙNG\n\n` +
    `Tổng user: ${stats.users}\n` +
    `Gói đang hoạt động: ${stats.active}\n` +
    `Sắp hết hạn 7 ngày: ${stats.expiring}\n\n` +
    `Dùng Dashboard để xem và thao tác từng user.`,
  );
}

async function sendLicenseKeys(): Promise<void> {
  const stats = await getAdminOverview();
  await sendAdminMenu(
    `🔑 LICENSE KEYS\n\n` +
    `✅ Đã kích hoạt tổng: ${stats.soldTotal}\n` +
    `🧾 Kích hoạt hôm nay: ${stats.soldToday}\n` +
    `📦 Còn tồn: ${stats.inventory}\n\n` +
    `Dùng Dashboard để tạo hoặc quản lý key.`,
  );
}

async function sendExpiringUsers(): Promise<void> {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const rows = await db.select({
    username: appUsersTable.username,
    plan: subscriptionsTable.plan,
    expiresAt: subscriptionsTable.expiresAt,
  })
    .from(subscriptionsTable)
    .innerJoin(appUsersTable, eq(appUsersTable.id, subscriptionsTable.ownerUserId))
    .where(and(
      ne(appUsersTable.role, "admin"),
      gt(subscriptionsTable.expiresAt, now),
      lte(subscriptionsTable.expiresAt, sevenDays),
    ))
    .orderBy(subscriptionsTable.expiresAt)
    .limit(10);
  const body = rows.length
    ? rows.map((row, index) => `${index + 1}. @${row.username} — ${row.plan.toUpperCase()} — ${row.expiresAt?.toLocaleDateString("vi-VN")}`).join("\n")
    : "Không có user nào hết hạn trong 7 ngày tới.";
  await sendAdminMenu(`⏳ SẮP HẾT HẠN\n\n${body}`);
}

async function sendTodayKeys(): Promise<void> {
  const settings = await getSystemSettings();
  const today = localQuotaDate(settings.defaultTimezone, new Date());
  const rows = await db.select({
    username: appUsersTable.username,
    plan: licenseKeysTable.plan,
    durationDays: licenseKeysTable.durationDays,
    salePriceVnd: licenseKeysTable.salePriceVnd,
    claimedAt: licenseKeysTable.claimedAt,
  })
    .from(licenseKeysTable)
    .leftJoin(appUsersTable, eq(appUsersTable.id, licenseKeysTable.claimedBy))
    .where(and(
      isNotNull(licenseKeysTable.claimedAt),
      isNull(licenseKeysTable.revokedAt),
      localDayCondition(licenseKeysTable.claimedAt, settings.defaultTimezone, today),
    ))
    .orderBy(desc(licenseKeysTable.claimedAt))
    .limit(20);
  const body = rows.length
    ? rows.map((row, index) => `${index + 1}. @${row.username ?? "unknown"} — ${row.plan.toUpperCase()} ${row.durationDays} ngày — ${money(row.salePriceVnd ?? 0)}`).join("\n")
    : "Hôm nay chưa có key nào được kích hoạt.";
  await sendAdminMenu(`🧾 KEY HÔM NAY (${rows.length})\n\n${body}`);
}

async function sendSupportPhoto(input: {
  mediaPath: string;
  caption?: string;
  replyToMessageId?: number;
}): Promise<TelegramMessage | null> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.telegramBridgeEnabled || !settings.supportChat.adminTelegramChatId) return null;
  const token = botToken();
  if (!token) return null;
  const stored = await supportMediaStorage.readImage(input.mediaPath);
  const bytes = await readFile(stored.filePath);
  const form = new FormData();
  form.set("chat_id", settings.supportChat.adminTelegramChatId);
  form.set("allow_sending_without_reply", "true");
  if (input.replyToMessageId) form.set("reply_to_message_id", String(input.replyToMessageId));
  if (input.caption?.trim()) form.set("caption", input.caption.trim().slice(0, 1024));
  form.set("photo", new Blob([bytes], { type: stored.contentType }), "support-image");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  const result = await response.json() as { ok?: boolean; result?: TelegramMessage; description?: string };
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram sendPhoto failed: ${result.description ?? response.statusText}`);
  }
  return result.result ?? null;
}

async function downloadTelegramPhoto(message: TelegramMessage): Promise<{
  objectPath: string;
  contentType: string;
} | null> {
  const largest = message.photo?.at(-1);
  if (!largest) return null;
  const file = await telegramCall<{ file_path?: string }>("getFile", { file_id: largest.file_id });
  if (!file?.file_path) return null;
  const token = botToken();
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Telegram photo download failed: ${response.statusText}`);
  const responseContentType = response.headers.get("content-type");
  return supportMediaStorage.storeTelegramImage({
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: responseContentType?.startsWith("image/") ? responseContentType : undefined,
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
  mediaPath?: string;
}): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.enabled || !settings.supportChat.telegramBridgeEnabled) return;
  const translation = input.body ? await translateCustomerMessageForAdmin(input.body) : null;
  const text = translation
    ? `Tin nhắn hỗ trợ từ ${input.username}\n\n` +
      `🌐 Ngôn ngữ: ${translation.language.toUpperCase()}\n\n` +
      `📝 Bản gốc:\n${input.body}\n\n` +
      `🇻🇳 Dịch cho Admin:\n${translation.translatedText}`
    : `Tin nhắn hỗ trợ từ ${input.username}\n\n${input.body}`;
  const sent = input.mediaPath
    ? await sendSupportPhoto({
      mediaPath: input.mediaPath,
      caption: text,
    })
    : await sendSupportMessage(text);
  if (sent) await setSupportMessageTelegramId(input.messageId, String(sent.chat.id), sent.message_id);
}

export async function notifyAdminLicenseActivated(input: {
  username: string;
  plan: string;
  durationDays: number;
  salePriceVnd: number | null;
}): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.telegramBridgeEnabled || !settings.supportChat.adminTelegramChatId) return;
  await sendAdminMenu(
    `💰 CÓ KHÁCH KÍCH HOẠT KEY\n\n` +
    `👤 User: @${input.username}\n` +
    `📦 Gói: ${input.plan.toUpperCase()}\n` +
    `📅 Thời hạn: ${input.durationDays} ngày\n` +
    `💵 Giá key: ${input.salePriceVnd === null ? "Chưa định giá" : money(input.salePriceVnd)}\n\n` +
    `Đã cập nhật vào doanh thu và số lượng key hôm nay.`,
  );
}

export async function notifySupportConversationClosed(input: {
  username: string;
  telegramMessageRefs: SupportTelegramMessageRef[];
}): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.supportChat.enabled || !settings.supportChat.telegramBridgeEnabled) return;
  const chatId = settings.supportChat.adminTelegramChatId;
  if (!chatId || !botToken()) return;
  const messageIds = [...new Set(input.telegramMessageRefs
    .filter((message) => message.chatId === chatId)
    .map((message) => message.telegramMessageId))];
  const results = await Promise.allSettled(messageIds.map((messageId) => telegramCall("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  })));
  const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed.length > 0) {
    logger.warn({
      username: input.username,
      attempted: messageIds.length,
      failed: failed.length,
      err: failed[0]?.reason,
    }, "Some support Telegram messages could not be deleted after conversation close");
  }
}

async function handleTelegramMessage(message: TelegramMessage): Promise<void> {
  const settings = await getSystemSettings();
  const configuredChatId = settings.supportChat.adminTelegramChatId;
  const text = message.text?.trim() ?? "";
  const caption = message.caption?.trim() ?? "";
  const hasPhoto = Boolean(message.photo?.length);
  if (!configuredChatId || String(message.chat.id) !== configuredChatId || (!text && !caption && !hasPhoto)) return;

  if (text === "/chatid") {
    await telegramCall("sendMessage", {
      chat_id: message.chat.id,
      text: `Chat ID hiện tại: ${message.chat.id}\nHãy nhập ID này trong Admin → Cấu hình hệ thống → Hỗ trợ chat.`,
    });
    return;
  }
  if (text === "/start" || text === "/menu" || text === "🏠 Menu") {
    await sendAdminMenu("👋 TeleCampaign Admin\n\nChọn thao tác bạn muốn xem:");
    return;
  }
  if (text === "📊 Tổng quan" || text === "🔄 Làm mới") {
    await sendOverview();
    return;
  }
  if (text === "💰 Doanh thu") {
    await sendRevenue();
    return;
  }
  if (text === "👥 Người dùng") {
    await sendUsers();
    return;
  }
  if (text === "🔑 License keys") {
    await sendLicenseKeys();
    return;
  }
  if (text === "⏳ Sắp hết hạn") {
    await sendExpiringUsers();
    return;
  }
  if (text === "🧾 Key hôm nay") {
    await sendTodayKeys();
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
  const media = hasPhoto ? await downloadTelegramPhoto(message) : null;
  if (hasPhoto && !media) return;
  const body = caption || text;
  const customerMessage = conversation.messages
    ?.filter((item) => item.senderType === "user" && item.body.trim())
    .at(-1)?.body ?? "";
  const translation = body && customerMessage
    ? await translateAdminReplyForCustomer({ reply: body, customerMessage })
    : null;
  const result = await appendSupportMessage({
    conversationId: mapped.conversationId,
    senderType: "admin",
    source: "telegram",
    body,
    translatedBody: translation?.translatedText,
    mediaPath: media?.objectPath,
    mediaContentType: media?.contentType,
  });
  await setSupportMessageTelegramId(result.message.id, String(message.chat.id), message.message_id);
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
      allowed_updates: ["message", "callback_query"],
    });
    for (const update of updates ?? []) {
      offset = Math.max(offset, update.update_id + 1);
      if (update.message) await handleTelegramMessage(update.message);
      if (update.callback_query) await handlePurchaseCallback(update.callback_query);
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