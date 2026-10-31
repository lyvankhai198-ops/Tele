// Run only on the dedicated VPS with its protected environment already sourced.
// No configuration values, token, chat ID or raw network errors are printed.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TELEGRAM_ADMIN_MENU } from "../artifacts/api-server/src/lib/telegram-admin-menu.ts";

export async function refreshAdminMenu(settings, call) {
  const support = settings?.supportChat;
  if (support?.telegramBridgeEnabled === false) throw Error("Bridge is disabled");
  const chatId = typeof support?.adminTelegramChatId === "string" ? support.adminTelegramChatId.trim() : "";
  if (!/^[0-9]{1,20}$/.test(chatId)) throw Error("Private admin configuration required");
  const me = await call("getMe", {});
  if (!me?.is_bot) throw Error("Bot identity was not verified");
  const chat = await call("getChat", { chat_id: chatId });
  if (chat?.type !== "private" || String(chat.id) !== chatId) throw Error("Private admin chat was not verified");
  const sent = await call("sendMessage", {
    chat_id: chatId,
    text: "🔎 Menu quản trị đã được cập nhật.\n\nBấm 🔎 Tìm key rồi gửi key cần đối chiếu. Bot sẽ báo trạng thái kích hoạt và thông tin tài khoản gắn với key.\n\nĐây chỉ là tra cứu, không kích hoạt hoặc thu hồi key.",
    reply_markup: TELEGRAM_ADMIN_MENU,
  });
  if (!sent?.message_id || String(sent.chat?.id) !== chatId) throw Error("Admin menu delivery was not confirmed");
}

async function main() {
  const token = process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN ?? process.env.TELECAMPAIGN_KGPT_BOT_TOKEN;
  if (!token || !process.env.DATABASE_URL) throw Error("Required protected configuration is missing");
  const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
  const { Client } = require("pg");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  let settings;
  try {
    await client.connect();
    const result = await client.query("SELECT value FROM system_settings WHERE key = $1 LIMIT 1", ["admin_system_settings"]);
    settings = JSON.parse(result.rows[0]?.value ?? "{}");
  } finally {
    await client.end();
  }
  await refreshAdminMenu(settings, async (method, payload) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) throw Error("Telegram operation failed");
    return body.result;
  });
  console.log("admin_menu_refresh=passed");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("admin_menu_refresh=failed");
    process.exitCode = 1;
  });
}
