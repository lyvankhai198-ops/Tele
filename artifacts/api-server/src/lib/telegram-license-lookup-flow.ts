import { isAuthorizedAdminMessage } from "./telegram-admin-access";
import { formatLicenseLookup, validLookupKey, type LicenseLookupRecord } from "./telegram-license-lookup";

type LookupMessage = {
  chat: { id: number | string; type?: string };
  from?: { id?: number };
  text?: string;
  photo?: unknown[];
  contact?: unknown;
  reply_to_message?: { message_id: number };
};
type Dependencies = {
  lookup: (rawKey: string) => Promise<LicenseLookupRecord | null>;
  respond: (text: string, parseMode?: "HTML") => Promise<{ message_id: number } | null>;
  onError: () => void;
  onStart?: () => void;
  afterLookup?: (record: LicenseLookupRecord) => Promise<void>;
  now?: () => number;
};
const OTHER_MENU_ACTIONS = new Set([
  "/start", "/menu", "/chatid", "🏠 Menu", "📊 Tổng quan", "🔄 Làm mới",
  "💰 Doanh thu", "👥 Người dùng", "🔑 License keys", "⏳ Sắp hết hạn", "🧾 Key hôm nay",
  "🔎 Tìm người dùng", "📋 Báo cáo ngày", "🛠 Vận hành",
]);
const LOOKUP_WINDOW_MS = 5 * 60_000;

export function createAdminLicenseLookupFlow(deps: Dependencies) {
  // Only conversation metadata, never keys or customer data, is kept in memory.
  const pending = new Map<string, { expiresAt: number; promptId: number }>();
  const handle = async (message: LookupMessage, configuredChatId: string | null | undefined, timezone: string): Promise<boolean> => {
    if (!isAuthorizedAdminMessage({
      configuredChatId, chatType: message.chat.type, chatId: message.chat.id, senderId: message.from?.id,
    })) return false;
    const now = deps.now?.() ?? Date.now();
    for (const [key, session] of pending) if (session.expiresAt <= now) pending.delete(key);
    const conversation = `${message.chat.id}:${message.from!.id}`;
    const text = message.text?.trim() ?? "";
    const command = /^\/findkey(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]+))?$/i.exec(text);
    if (OTHER_MENU_ACTIONS.has(text)) {
      pending.delete(conversation);
      return false;
    }
    if (text === "/cancel" && pending.has(conversation)) {
      pending.delete(conversation);
      await deps.respond("Đã hủy tìm key.");
      return true;
    }
    if (text === "🔎 Tìm key" || (command && !command[1])) {
      deps.onStart?.();
      pending.delete(conversation);
      const prompt = await deps.respond(
        "🔎 Gửi chính xác một key cần kiểm tra.\nBot chỉ tra cứu, không kích hoạt hay thu hồi key.\n\nGửi /cancel hoặc bấm một mục menu khác để hủy.",
      );
      if (prompt) {
        if (pending.size >= 20) pending.delete(pending.keys().next().value!);
        pending.set(conversation, { expiresAt: now + LOOKUP_WINDOW_MS, promptId: prompt.message_id });
      }
      return true;
    }
    const session = pending.get(conversation);
    if (!command && !session) return false;
    // Never divert a normal support reply or photo into the lookup flow.
    if (!command && (message.photo?.length || message.contact
      || (message.reply_to_message && message.reply_to_message.message_id !== session!.promptId))) {
      pending.delete(conversation);
      return false;
    }
    if (!command && text.startsWith("/")) {
      pending.delete(conversation);
      return false;
    }
    const rawKey = command?.[1] ?? text;
    if (command) deps.onStart?.();
    if (!validLookupKey(rawKey)) {
      await deps.respond("Key không đúng định dạng. Gửi lại key đầy đủ sau khi bấm 🔎 Tìm key, hoặc dùng /findkey <key>.");
      return true;
    }
    let record: LicenseLookupRecord | null;
    try {
      record = await deps.lookup(rawKey);
    } catch {
      // Do not attach the exception: database errors can contain key hashes.
      deps.onError();
      await deps.respond("Không thể tra cứu lúc này. Vui lòng thử lại sau hoặc /cancel.");
      return true;
    }
    if (!record) {
      await deps.respond("Không tìm thấy key trong hệ thống. Kiểm tra lại rồi bấm 🔎 Tìm key để thử lại, hoặc /cancel.");
      return true;
    }
    pending.delete(conversation);
    await deps.respond(formatLicenseLookup(record, timezone, now), "HTML");
    await deps.afterLookup?.(record);
    return true;
  };
  return Object.assign(handle, { cancel: () => pending.clear() });
}
