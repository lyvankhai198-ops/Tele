// Explicit one-shot recovery of pre-tracking bot cards. Defaults to read-only.
// Uses only the configured admin's own stored, admin-owned Telegram session.
// Never dumps messages, identifiers, credentials, orders or sessions to stdout.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createPurchaseReviewMessages, reviewMessageOrderId } from "../artifacts/api-server/src/lib/purchase-review-messages.ts";
const root = process.cwd();
if (root !== "/opt/telecampaign") throw new Error("UNEXPECTED_APPLICATION");
const { decryptSecret } = await import(pathToFileURL(root + "/artifacts/api-server/src/lib/crypto.ts").href);
const requireDb = createRequire(pathToFileURL(root + "/lib/db/package.json"));
const requireApi = createRequire(pathToFileURL(root + "/artifacts/api-server/package.json"));
const { Client } = requireDb("pg");
const { TelegramClient } = requireApi("telegram");
const { StringSession } = requireApi("telegram/sessions/index.js");
const apply = process.argv.includes("--apply");
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
const result = { apply, scanned: 0, matched: 0, reviewable: 0, final: 0,
  deleted: 0, resolved: 0, absent: 0, retry: 0, historyLimit: 3000, limitReached: false, warning: null };
let client, stage = "database";
try {
  await db.connect();
  await db.query("SET statement_timeout='5s'");
  if (!apply) await db.query("SET default_transaction_read_only=on");
  const row = await db.query("SELECT value FROM system_settings WHERE key=$1", ["admin_system_settings"]);
  const chatId = String(JSON.parse(row.rows[0]?.value ?? "{}").supportChat?.adminTelegramChatId ?? "");
  const token = process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN ?? process.env.TELECAMPAIGN_KGPT_BOT_TOKEN;
  if (!/^\d+$/.test(chatId) || !token) throw new Error("ADMIN_BOT_NOT_CONFIGURED");
  const accounts = await db.query(
    `SELECT a.session_encrypted,a.api_id,a.api_hash_encrypted,a.proxy_id
     FROM telegram_accounts a JOIN app_users u ON u.id::text=a.owner_user_id
     WHERE a.telegram_user_id=$1 AND a.deleted_at IS NULL AND a.status='connected'
       AND a.session_encrypted IS NOT NULL AND u.role='admin' LIMIT 1`, [chatId]);
  const account = accounts.rows[0];
  if (!account) throw new Error("NO_AUTHORIZED_HISTORY_SESSION");
  // Never bypass an account's configured proxy to recover history.
  if (account.proxy_id) throw new Error("HISTORY_REQUIRES_CONFIGURED_PROXY");
  async function botCall(method, payload) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.description ?? "BOT_REQUEST_FAILED");
    return body.result;
  }
  stage = "bot_identity";
  const me = await botCall("getMe", {});
  if (!me?.is_bot || !me.username) throw new Error("BOT_IDENTITY_UNCONFIRMED");
  stage = "telegram_client";
  client = new TelegramClient(new StringSession(decryptSecret(account.session_encrypted)),
    Number(account.api_id), decryptSecret(account.api_hash_encrypted), { connectionRetries: 1, useWSS: false });
  client.setLogLevel("none");
  stage = "telegram_connect";
  await client.connect();
  stage = "admin_identity";
  const self = await client.getMe();
  if (String(self.id) !== chatId) throw new Error("ADMIN_SESSION_IDENTITY_MISMATCH");
  stage = "bot_peer";
  const peer = await client.getEntity(me.username);
  if (String(peer.id) !== String(me.id)) throw new Error("BOT_PEER_IDENTITY_MISMATCH");
  const store = createPurchaseReviewMessages({ query: (q, values) => db.query(q, values), call: botCall,
    warn: () => { result.warning = "RECONCILIATION_DEFERRED"; } });
  const started = Date.now();
  stage = "history";
  for await (const message of client.iterMessages(peer, { limit: result.historyLimit })) {
    result.scanned++;
    if (Date.now() - started > 90000) { result.limitReached = true; break; }
    if (String(message.senderId) !== String(me.id)) continue;
    const orderId = reviewMessageOrderId(message.message ?? "");
    if (!orderId) continue;
    const order = (await db.query("SELECT status,reference FROM purchase_orders WHERE id=$1", [orderId])).rows[0];
    const reference = message.message.match(/^Đơn: (.+)$/m)?.[1]?.trim();
    if (!order || reference !== order.reference) continue;
    const actions = (message.replyMarkup?.rows ?? []).flatMap(r => r.buttons ?? [])
      .map(button => button.data ? Buffer.from(button.data).toString("utf8") : "");
    if (!actions.includes(`purchase:paid:${orderId}`) || !actions.includes(`purchase:rejected:${orderId}`)) continue;
    result.matched++;
    if (["pending", "expired", "received"].includes(order.status)) result.reviewable++;
    else if (["paid", "cancelled", "rejected", "revoked"].includes(order.status)) result.final++;
    else continue;
    if (apply) await store.remember(orderId, chatId, message.id);
  }
  result.limitReached ||= result.scanned >= result.historyLimit;
  stage = "reconcile";
  if (apply) {
    for (let batch = 0; batch < 300; batch++) {
      const stats = await store.reconcile(chatId);
      for (const name of ["deleted", "resolved", "absent", "retry"]) result[name] += stats[name];
      if (!Object.values(stats).some(Number) || Date.now() - started > 150000) break;
    }
  }
} catch (error) {
  const safeCodes = ["ADMIN_BOT_NOT_CONFIGURED", "NO_AUTHORIZED_HISTORY_SESSION",
    "HISTORY_REQUIRES_CONFIGURED_PROXY", "BOT_IDENTITY_UNCONFIRMED", "ADMIN_SESSION_IDENTITY_MISMATCH",
    "BOT_PEER_IDENTITY_MISMATCH"];
  result.warning = safeCodes.includes(error.message) ? error.message : "HISTORY_RECOVERY_FAILED";
  result.stage = stage;
  result.errorKind = ["TypeError", "SyntaxError", "Error"].includes(error.name) ? error.name : "OTHER";
  if (/^[A-Z_0-9]{1,64}$/.test(error.errorMessage ?? "")) result.telegramError = error.errorMessage;
  if (Number.isSafeInteger(error.seconds) && error.seconds > 0) result.retryAfterSeconds = error.seconds;
  process.exitCode = 1;
} finally {
  if (client) await client.destroy().catch(() => {});
  await db.end();
  console.log("ORDER_REVIEW_HISTORY_RESULT=" + JSON.stringify(result));
}
