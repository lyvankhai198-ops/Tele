// Run only on the dedicated VPS with its protected environment already sourced.
// No configuration values, token, chat ID or raw network errors are printed.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TELEGRAM_ADMIN_MENU } from "../artifacts/api-server/src/lib/telegram-admin-menu.ts";
let databaseCheckPassed = false;

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
    text: "💡 TeleCamp đã cập nhật Góp ý & thảo luận.\n\nChỉ còn Đề xuất tính năng và Tham gia nhóm thảo luận. Khách có thể gửi kèm ảnh; ảnh được gửi trực tiếp vào bot riêng này cùng nút cập nhật trạng thái.\n\nKhi admin chọn Hoàn thành trên bot hoặc website, khách nhận một thông báo riêng tại chuông thông báo trên web (VI/EN), kể cả khi đăng nhập lại sau đó. Bấm lại không tạo thông báo trùng.\n\nLink nhóm vẫn chỉnh trong Cài đặt quản trị của trang Góp ý. Khung chat hỗ trợ, 🔎 Tìm key / Tìm người dùng và 💳 Đơn chờ giữ nguyên.",
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
    // Exercise PostgreSQL's real column/operator types without real keys, user
    // data output or writes. In particular UUID ids join historical text ids.
    await client.query(`
      SELECT k.id, u.id AS user_id, s.id AS subscription_id
      FROM license_keys k
      LEFT JOIN app_users u ON u.id::text = k.claimed_by
      LEFT JOIN subscriptions s ON s.owner_user_id = k.claimed_by
      WHERE k.key_hash = $1 LIMIT 1
    `, ["0".repeat(64)]);
    await client.query(`SELECT u.id FROM subscriptions s JOIN app_users u ON u.id::text=s.owner_user_id LIMIT 0`);
    await client.query(`SELECT u.id FROM license_keys k LEFT JOIN app_users u ON u.id::text=k.claimed_by LIMIT 0`);
    await client.query(`SELECT o.currency,sum(o.amount) FROM purchase_orders o
      LEFT JOIN system_settings r ON r.key='order_receipt:'||o.id::text
      WHERE o.status IN ('paid','revoked') AND
      (COALESCE((r.value::jsonb->>'paidAt')::timestamptz,CASE WHEN o.status='paid' THEN o.reviewed_at END)
        AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=current_date GROUP BY o.currency`);
    await client.query(`SELECT key FROM system_settings WHERE key LIKE 'admin_audit:%' LIMIT 0`);
    databaseCheckPassed = true;
    console.log("license_lookup_database_check=passed");
    console.log("admin_tools_database_check=passed");
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
    process.exitCode = databaseCheckPassed ? 3 : 2;
  });
}
