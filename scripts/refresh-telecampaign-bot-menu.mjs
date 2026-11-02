// Run only on the dedicated VPS with its protected environment already sourced.
// No configuration values, token, chat ID or raw network errors are printed.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TELEGRAM_ADMIN_MENU } from "../artifacts/api-server/src/lib/telegram-admin-menu.ts";
let databaseCheckPassed = false;

export function adminUpdateText(note = "") {
  const detail = typeof note === "string" ? note.trim().slice(0, 3500) : "";
  return detail ? `TeleCamp — nội dung cập nhật:\n\n${detail}` : "Menu quản trị đã được làm mới.";
}

function deployedUpdateNote() {
  const configured = process.env.TELECAMPAIGN_UPDATE_NOTE?.trim();
  if (configured) return configured;
  try {
    return execFileSync("git", ["log", "-1", "--format=%B"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8", timeout: 5_000, maxBuffer: 16_384,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return ""; }
}

export async function verifyReleaseGroup(call, configuredChatId) {
  const chatId = typeof configuredChatId === "string" ? configuredChatId.trim() : "";
  if (!/^-[1-9][0-9]{1,19}$/.test(chatId)) throw Error("A group chat ID is required");
  const me = await call("getMe", {});
  if (!me?.is_bot || !Number.isSafeInteger(me.id)) throw Error("Bot identity was not verified");
  const chat = await call("getChat", { chat_id: chatId });
  if (!["group", "supergroup"].includes(chat?.type) || String(chat.id) !== chatId) {
    throw Error("The exact release group was not verified");
  }
  const member = await call("getChatMember", { chat_id: chatId, user_id: me.id });
  if (!["administrator", "creator"].includes(member?.status) || member.user?.id !== me.id) {
    throw Error("Bot administrator membership was not verified");
  }
  return chatId;
}

export async function refreshAdminMenu(settings, call, updateNote = "", options = {}) {
  const support = settings?.supportChat;
  if (support?.telegramBridgeEnabled === false) throw Error("Bridge is disabled");
  if (options.announcementChatId !== undefined) {
    const chatId = await verifyReleaseGroup(call, options.announcementChatId);
    const sent = await call("sendMessage", { chat_id: chatId, text: adminUpdateText(updateNote) });
    if (!sent?.message_id || String(sent.chat?.id) !== chatId) throw Error("Group delivery was not confirmed");
    return "group";
  }
  const chatId = typeof support?.adminTelegramChatId === "string" ? support.adminTelegramChatId.trim() : "";
  if (!/^[0-9]{1,20}$/.test(chatId)) throw Error("Private admin configuration required");
  const me = await call("getMe", {});
  if (!me?.is_bot) throw Error("Bot identity was not verified");
  const chat = await call("getChat", { chat_id: chatId });
  if (chat?.type !== "private" || String(chat.id) !== chatId) throw Error("Private admin chat was not verified");
  const sent = await call("sendMessage", {
    chat_id: chatId,
    text: adminUpdateText(updateNote),
    reply_markup: TELEGRAM_ADMIN_MENU,
  });
  if (!sent?.message_id || String(sent.chat?.id) !== chatId) throw Error("Admin menu delivery was not confirmed");
  return "private";
}

async function main() {
  const token = process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN ?? process.env.TELECAMPAIGN_KGPT_BOT_TOKEN;
  if (!token || !process.env.DATABASE_URL) throw Error("Required protected configuration is missing");
  const call = async (method, payload) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) throw Error("Telegram operation failed");
    return body.result;
  };
  if (process.argv[2] === "--check-release-group") {
    await verifyReleaseGroup(call, process.argv[3]);
    console.log("release_group_check=passed");
    return;
  }
  const configureGroup = process.argv[2] === "--configure-release-group";
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
    const storedGroup = await client.query("SELECT value FROM system_settings WHERE key=$1 LIMIT 1",
      ["telecampaign_release_notification_settings"]);
    const currentGroup = storedGroup.rows[0] ? JSON.parse(storedGroup.rows[0].value).chatId : undefined;
    const announcementChatId = configureGroup ? process.argv[3] : currentGroup;
    // An invalid configured group or a delivery failure must never fall back to
    // a private chat, nor change the support/order-confirmation recipient.
    if ((configureGroup || storedGroup.rows[0]) && announcementChatId === undefined) {
      throw Error("Invalid release recipient configuration");
    }
    const destination = await refreshAdminMenu(settings, call, deployedUpdateNote(), { announcementChatId });
    if (configureGroup) {
      // Persist only after Telegram confirms delivery to the exact group.
      await client.query(`INSERT INTO system_settings(key,value) VALUES($1,$2)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
      ["telecampaign_release_notification_settings", JSON.stringify({chatId:announcementChatId.trim()})]);
      console.log("release_group_configured=passed");
    }
    console.log(destination === "group" ? "release_announcement=passed" : "admin_menu_refresh=passed");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("admin_menu_refresh=failed");
    process.exitCode = databaseCheckPassed ? 3 : 2;
  });
}
