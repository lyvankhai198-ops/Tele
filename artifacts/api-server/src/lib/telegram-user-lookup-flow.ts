import { isAuthorizedAdminMessage } from "./telegram-admin-access";
import { TELEGRAM_ADMIN_MENU } from "./telegram-admin-menu";
import { validUserLookup } from "./telegram-admin-tools";

type Message = { chat: { id: number | string; type?: string }; from?: { id?: number };
  text?: string; photo?: unknown[]; contact?: unknown; reply_to_message?: { message_id: number } };
export function createAdminUserLookupFlow(deps: {
  lookup: (query: string) => Promise<boolean>;
  respond: (text: string) => Promise<{ message_id: number } | null>;
  onStart: () => void;
  onError: () => void;
  now?: () => number;
}) {
  let pending: { expiresAt: number; promptId: number } | null = null;
  const handle = async (message: Message, configuredChatId: string | null | undefined): Promise<boolean> => {
    if (!isAuthorizedAdminMessage({ configuredChatId, chatType: message.chat.type, chatId: message.chat.id, senderId: message.from?.id })) return false;
    const now = deps.now?.() ?? Date.now();
    if (pending && pending.expiresAt <= now) pending = null;
    const text = message.text?.trim() ?? "";
    const command = /^\/finduser(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]+))?$/i.exec(text);
    if (text === "🔎 Tìm người dùng" || (command && !command[1])) {
      pending = null; deps.onStart();
      const prompt = await deps.respond("👤 Gửi username TeleCamp hoặc User ID cần tra cứu. Chỉ xem, không thay đổi tài khoản.\n/cancel để hủy.");
      if (prompt) pending = { expiresAt: now + 300_000, promptId: prompt.message_id };
      return true;
    }
    if (command) deps.onStart();
    if (text === "/cancel" && pending) { pending = null; await deps.respond("Đã hủy tìm người dùng."); return true; }
    if (TELEGRAM_ADMIN_MENU.keyboard.flat().some(button => button.text === text) || (text.startsWith("/") && !command)) {
      pending = null; return false;
    }
    if (!command && !pending) return false;
    if (!command && (message.photo?.length || message.contact ||
      (message.reply_to_message && message.reply_to_message.message_id !== pending!.promptId))) {
      pending = null; return false;
    }
    const query = command?.[1] ?? text;
    if (!validUserLookup(query)) { await deps.respond("Username/User ID không đúng định dạng. Gửi lại hoặc /cancel."); return true; }
    try {
      if (!(await deps.lookup(query))) { await deps.respond("Không tìm thấy người dùng. Kiểm tra lại hoặc /cancel."); return true; }
      pending = null;
    } catch {
      deps.onError();
      await deps.respond("Không thể tra cứu lúc này. Vui lòng thử lại hoặc /cancel.");
    }
    return true;
  };
  return Object.assign(handle, { cancel: () => { pending = null; } });
}
