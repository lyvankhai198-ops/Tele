// Run only on the dedicated VPS with its protected environment already sourced.
// No configuration values, token, chat ID or raw network errors are printed.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseReleaseNote, releaseId } from "../artifacts/api-server/src/lib/release-update-core.ts";
import { createRelease } from "../artifacts/api-server/src/lib/release-update-store.ts";
let databaseCheckPassed = false;

export function adminUpdateText(note = "") {
  if (typeof note !== "string") throw Error("Bilingual release notes are required");
  if (!note.trim()) return "Menu quản trị đã được làm mới.\nAdmin menu refreshed.";
  // The deployed commit body or TELECAMPAIGN_UPDATE_NOTE supplies both
  // translations explicitly. Never invent an English translation or silently
  // send a Vietnamese-only release announcement.
  const match = note.trim().match(/(?:^|\r?\n)\[VI\][ \t]*\r?\n([\s\S]+?)\r?\n\[EN\][ \t]*\r?\n([\s\S]+)$/);
  const vi = match?.[1].trim(), en = match?.[2].trim();
  if (!vi || !en || /\r?\n\[(?:VI|EN)\]/.test(vi + "\n" + en)) {
    throw Error("Both VI and EN release notes are required");
  }
  const bounded = text => text.length <= 1750 ? text
    : text.slice(0, 1749).replace(/[\uD800-\uDBFF]$/, "").trimEnd() + "…";
  return `TELECAMP — CẬP NHẬT / UPDATE\n\nTIẾNG VIỆT\n${bounded(vi)}\n\nENGLISH\n${bounded(en)}`;
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
  // Retain a fail-closed export for older operations scripts. No CLI/automatic
  // path may publish release notes or fall back to the private administrator.
  throw Error("Approve one release update on the admin website before sending");
}

async function main() {
  const token = process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN ?? process.env.TELECAMPAIGN_KGPT_BOT_TOKEN;
  if (!process.env.DATABASE_URL) throw Error("Required protected configuration is missing");
  const call = async (method, payload) => {
    if (!token) throw Error("Bot configuration is missing");
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
    if (configureGroup) {
      // Configuration verifies identity/permissions but never sends an update.
      await verifyReleaseGroup(call, process.argv[3]);
      await client.query(`INSERT INTO system_settings(key,value) VALUES($1,$2)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      ["telecampaign_release_notification_settings", JSON.stringify({chatId:process.argv[3].trim()})]);
      console.log("release_group_configured=passed");
      console.log("release_announcement=not_sent");
      return;
    }
    const root = fileURLToPath(new URL("../", import.meta.url));
    const commit = releaseId(execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
    }).trim());
    const created = await createRelease(client, parseReleaseNote(deployedUpdateNote()), "deployment", commit);
    console.log(created ? "release_draft=saved" : "release_draft=already_recorded");
    console.log("release_announcement=not_sent");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("release_draft=failed");
    process.exitCode = databaseCheckPassed ? 3 : 2;
  });
}
