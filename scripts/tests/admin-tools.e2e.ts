// Runs only in a disposable local PostgreSQL test database, never on VPS.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { pool, db, systemSettingsTable } from "@workspace/db";
import app from "../../artifacts/api-server/src/app";
import { hashPassword } from "../../artifacts/api-server/src/lib/auth";
import { issueCaptcha } from "../../artifacts/api-server/src/lib/captcha";
import { totpCode } from "../../artifacts/api-server/src/lib/admin-tools-core";
import { pollTelegram } from "../../artifacts/api-server/src/lib/support-telegram";
import { encryptSecret } from "../../artifacts/api-server/src/lib/crypto";
import { settleVerifiedOrder } from "../../artifacts/api-server/src/lib/telecampaign-orders";
import sharp from "sharp";

const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/telecamp_test" || process.env.TELECAMPAIGN_E2E_ONLY !== "1") {
  throw Error("E2E_UNSAFE_DATABASE_REFUSED");
}
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN = randomBytes(20).toString("hex");
process.env.SEPAY_WEBHOOK_SECRET = randomBytes(32).toString("hex");
const actualFetch = globalThis.fetch;
const replies: Array<{ text?: string; reply_markup?: unknown }> = [];
let updates: unknown[] = [];
globalThis.fetch = async (input, init) => {
  if (String(input).startsWith("https://api.telegram.org/")) {
    const method = String(input).split("/").pop();
    const payload = JSON.parse(String(init?.body ?? "{}"));
    if (method === "getUpdates") return Response.json({ ok: true, result: updates.filter((u: any) => u.update_id >= payload.offset) });
    if (method === "getChat") return Response.json({ ok: true, result: { id: 123456789, type: "private" } });
    if (method === "getMe") return Response.json({ ok: true, result: { id: 123456789, is_bot: true, username: "fixture_bot" } });
    replies.push(payload);
    return Response.json({ ok: true, result: { message_id: replies.length, chat: { id: 123456789, type: "private" } } });
  }
  // All nonlocal outgoing requests are forbidden in integration tests.
  if (!String(input).startsWith("http://127.0.0.1:")) throw Error("E2E_EXTERNAL_NETWORK_REFUSED");
  return actualFetch(input, init);
};
const adminId = randomUUID(), userId = randomUUID();
const password = "Fixture" + randomBytes(18).toString("hex");
const rawKey = "FIXTURE-" + randomBytes(12).toString("hex").toUpperCase();
const keyId = randomUUID();
let server: ReturnType<typeof app.listen> | undefined;
let phase = "E2E_SETUP";
function check(condition: unknown, code: string): asserts condition { assert.ok(condition, code); }
try {
  const passwordHash = await hashPassword(password);
  for (const [id, username, role] of [[adminId, "fixture_admin", "admin"], [userId, "fixture_customer", "user"]]) {
    await pool.query("INSERT INTO app_users(id,username,username_normalized,password_hash,role) VALUES($1,$2,$2,$3,$4)", [id,username,passwordHash,role]);
  }
  await pool.query("INSERT INTO subscriptions(owner_user_id,plan,expires_at) VALUES($1,'plus',now()+interval '1 day')", [userId]);
  await pool.query(`INSERT INTO license_keys(id,key_hash,key_encrypted,plan,duration_days,pool)
    VALUES($1,$2,$3,'plus',30,'normal')`, [keyId,createHash("sha256").update(rawKey).digest("hex"),encryptSecret(rawKey)]);
  await db.insert(systemSettingsTable).values([
    { key: "admin_system_settings", value: JSON.stringify({ defaultTimezone: "Asia/Ho_Chi_Minh", publicAppUrl: "https://fixture.invalid",
      supportChat: { enabled: true, telegramBridgeEnabled: true, adminTelegramChatId: "123456789" } }) },
    { key: "telecampaign_order_settings", value: JSON.stringify({ pricesVnd: { PLUS: 1000, PRO: 2000, UNLIMITED: 3000 },
      pricesUsdt: { PLUS: 1, PRO: 2, UNLIMITED: 3 }, durationsDays: { PLUS: 30, PRO: 30, UNLIMITED: 30 },
      vnBankName: "Fixture bank", vnBankCode: "TEST", vnBankAccount: "0000000000", vnAccountName: "TEST ONLY",
      vietQrTemplate: "compact2", usdtBep20Address: "", usdtTrc20Address: "" }) },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  async function request(path: string, cookie = "", body?: unknown, method = "POST") {
    return fetch(base + "/api" + path, {
      method: body === undefined ? "GET" : method,
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1", ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function login(username: string, otp?: string) {
    const challenge = await issueCaptcha("127.0.0.1", { code: "222222" });
    return request("/auth/login", "", { username, password, captchaChallengeId: challenge.challengeId, captchaCode: "222222", otp });
  }
  phase = "E2E_LOGIN_AND_AUTHORIZATION";
  const adminLogin = await login("fixture_admin");
  check(adminLogin.status === 200, "E2E_ADMIN_LOGIN");
  const adminCookie = adminLogin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const userLogin = await login("fixture_customer");
  check(userLogin.status === 200, "E2E_USER_LOGIN");
  const userCookie = userLogin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  check((await request("/admin/tools/summary")).status === 401, "E2E_ANONYMOUS_DENIED");
  check((await request("/admin/tools/summary", userCookie)).status === 403, "E2E_USER_ADMIN_DENIED");
  phase = "E2E_ORDER_PROOF_APPROVAL";
  const created = await request("/purchase-orders", userCookie, { plan: "PLUS", currency: "VND", orderType: "license" });
  check(created.status === 201 || created.status === 200, "E2E_ORDER_CREATE");
  const order = await created.json() as any;
  check(typeof order.id === "string", "E2E_ORDER_ID");
  const proof = await request(`/purchase-orders/${order.id}/proof`, userCookie, {}, "PATCH");
  check(proof.ok, "E2E_PROOF");
  const approved = await request(`/admin/purchase-orders/${order.id}/review`, adminCookie, { decision: "paid", manualVerification: true });
  check(approved.ok, "E2E_APPROVAL");
  const claimed = await pool.query("SELECT claimed_by FROM license_keys WHERE id=$1", [keyId]);
  check(claimed.rows[0]?.claimed_by === userId, "E2E_KEY_ACTIVATED");
  phase = "E2E_BOT_LOOKUPS";
  const message = (id: number, text: string) => ({ update_id: id, message: { message_id: id, chat: { id: 123456789, type: "private" }, from: { id: 123456789 }, text } });
  updates = [message(1, "⏳ Sắp hết hạn"), message(2, "🧾 Key hôm nay"), message(3, `/findkey ${rawKey}`),
    message(4, "/finduser fixture_customer"), message(5, "💰 Doanh thu")];
  await pollTelegram();
  check(replies.some(r => r.text?.includes("KẾT QUẢ TRA CỨU KEY")), "E2E_BOT_KEY");
  check(replies.some(r => r.text?.includes("HỒ SƠ NGƯỜI DÙNG")), "E2E_BOT_USER");
  check(replies.some(r => r.text?.includes("THANH TOÁN ĐÃ XÁC NHẬN")), "E2E_BOT_REVENUE");
  const cursor = await pool.query("SELECT value FROM system_settings WHERE key='telegram_bridge_cursor'");
  check(JSON.parse(cursor.rows[0].value).offset === 6, "E2E_CURSOR_PERSISTED");
  const count = replies.length;
  await pollTelegram();
  check(replies.length === count, "E2E_NO_ACKNOWLEDGED_UPDATE_REPLAY");
  phase = "E2E_REPORT_EXPORT_AUDIT";
  const summary = await (await request("/admin/tools/summary", adminCookie)).json() as any;
  check(summary.report.cash.some((r: any) => r.currency === "VND" && Number(r.amount) === 1000), "E2E_CASH_REPORT");
  for (const kind of ["orders", "keys", "revenue"]) {
    const exported = await request(`/admin/tools/export/${kind}`, adminCookie);
    check(exported.ok && exported.headers.get("content-type")?.includes("text/csv"), "E2E_CSV_EXPORT");
    const text = await exported.text();
    check(!text.includes(rawKey) && !text.includes(passwordHash), "E2E_EXPORT_NO_SECRETS");
  }
  const blockedOrigin = await fetch(base + "/api/admin/tools/daily-report", {
    method: "PUT", headers: { Cookie: adminCookie, Origin: "https://untrusted.invalid", "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false, hour: 20, minute: 30 }),
  });
  check(blockedOrigin.status === 403, "E2E_CROSS_ORIGIN_DENIED");
  const schedule = await fetch(base + "/api/admin/tools/daily-report", {
    method: "PUT", headers: { Cookie: adminCookie, Origin: "https://fixture.invalid", "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false, hour: 20, minute: 30 }),
  });
  check(schedule.ok, "E2E_SCHEDULE");
  const audit = await (await request("/admin/tools/audit", adminCookie)).json() as any[];
  check(audit.some(row => row.metadata.action === "daily_report.update"), "E2E_AUDIT_ACTOR");
  phase = "E2E_MFA_ENROLLMENT_AND_REPLAY";
  const begun = await request("/auth/mfa/begin", adminCookie, { password });
  check(begun.ok, "E2E_MFA_BEGIN");
  const setup = await begun.json() as any;
  const counter = Math.floor(Date.now() / 30000);
  const confirmed = await request("/auth/mfa/confirm", adminCookie, { password, code: totpCode(setup.secret, counter - 1) });
  check(confirmed.ok, "E2E_MFA_CONFIRM");
  const codes = await confirmed.json() as any;
  check(codes.recoveryCodes?.length === 8, "E2E_RECOVERY_CODES");
  check((await login("fixture_admin")).status === 401, "E2E_MFA_REQUIRED");
  const otp = totpCode(setup.secret, Math.floor(Date.now() / 30000));
  check((await login("fixture_admin", otp)).ok, "E2E_MFA_LOGIN");
  check((await login("fixture_admin", otp)).status === 401, "E2E_TOTP_REPLAY_DENIED");
  check((await login("fixture_admin", codes.recoveryCodes[0])).ok, "E2E_RECOVERY_LOGIN");
  check((await login("fixture_admin", codes.recoveryCodes[0])).status === 401, "E2E_RECOVERY_REPLAY_DENIED");
  const storedMfa = await pool.query("SELECT value FROM system_settings WHERE key=$1", [`admin_mfa:${adminId}`]);
  check(!storedMfa.rows[0].value.includes(setup.secret) && !storedMfa.rows[0].value.includes(codes.recoveryCodes[0]), "E2E_MFA_SECRETS_PROTECTED");
  phase = "E2E_REVENUE_AFTER_REVOCATION";
  const revoked = await request(`/admin/purchase-orders/${order.id}/revoke`, adminCookie, { reason: "Fixture revocation, no actual payment" });
  check(revoked.ok, "E2E_REVOKE");
  const after = await (await request("/admin/tools/summary", adminCookie)).json() as any;
  check(after.report.cash.some((r: any) => r.currency === "VND" && Number(r.amount) === 1000), "E2E_REVENUE_RETAINED");
  phase = "E2E_TELEGRAM_MANUAL_PAYMENTS";
  const orderConfigRow = await pool.query("SELECT value FROM system_settings WHERE key='telecampaign_order_settings'");
  const orderConfig = JSON.parse(orderConfigRow.rows[0].value);
  orderConfig.usdtBep20Address = "0x" + "1".repeat(40);
  await pool.query("UPDATE system_settings SET value=$1 WHERE key='telecampaign_order_settings'", [JSON.stringify(orderConfig)]);
  let callbackUpdate = 100;
  async function callback(orderId: string, sender = 123456789, type = "private") {
    const id = callbackUpdate++;
    updates = [{ update_id: id, callback_query: { id: `fixture-${id}`, from: { id: sender },
      data: `purchase:paid:${orderId}`, message: { message_id: id, chat: { id: 123456789, type } } } }];
    await pollTelegram();
  }
  for (const currency of ["VND", "USDT"]) {
    for (const orderType of ["license", "renewal"]) {
      let allocatedKey: string | undefined;
      if (orderType === "license") {
        allocatedKey = randomUUID();
        const fixtureLicense = "FIXTURE-" + randomBytes(12).toString("hex").toUpperCase();
        await pool.query(`INSERT INTO license_keys(id,key_hash,key_encrypted,plan,duration_days,pool)
          VALUES($1,$2,$3,'plus',30,'normal')`,
          [allocatedKey, createHash("sha256").update(fixtureLicense).digest("hex"), encryptSecret(fixtureLicense)]);
      }
      const made = await request("/purchase-orders", userCookie,
        { plan: "PLUS", currency, orderType, ...(currency === "USDT" ? { network: "BEP20" } : {}) });
      check(made.ok, "E2E_BOT_ORDER_CREATE");
      const target = await made.json() as any;
      await callback(target.id, 888);
      await callback(target.id, 123456789, "supergroup");
      const unchanged = await pool.query("SELECT status FROM purchase_orders WHERE id=$1", [target.id]);
      check(unchanged.rows[0].status === "pending", "E2E_BOT_ADMIN_AUTHORIZATION");
      await callback(target.id);
      const paid = await pool.query("SELECT status,payment_event_id,reviewed_by FROM purchase_orders WHERE id=$1", [target.id]);
      check(paid.rows[0].status === "paid" && paid.rows[0].reviewed_by === "123456789", "E2E_BOT_MANUAL_PAID");
      check(paid.rows[0].payment_event_id === `manual:${currency.toLowerCase()}:${target.id}`, "E2E_BOT_MANUAL_AUDIT");
      if (allocatedKey) {
        const key = await pool.query("SELECT claimed_by FROM license_keys WHERE id=$1", [allocatedKey]);
        check(key.rows[0].claimed_by === userId, "E2E_BOT_LICENSE_ACTIVATION");
      }
      const beforeRetry = await pool.query("SELECT expires_at FROM subscriptions WHERE owner_user_id=$1", [userId]);
      await callback(target.id);
      await settleVerifiedOrder(target.id, `fixture-automatic:${target.id}`);
      const afterRetry = await pool.query("SELECT expires_at FROM subscriptions WHERE owner_user_id=$1", [userId]);
      check(beforeRetry.rows[0].expires_at.getTime() === afterRetry.rows[0].expires_at.getTime(), "E2E_BOT_NO_DOUBLE_EXTENSION");
      check(replies.some((r: any) => r.reply_markup?.inline_keyboard?.flat().some((b: any) =>
        b.callback_data === `purchase:paid:${target.id}` && b.text.includes("Xác minh"))), "E2E_BOT_REVIEW_BUTTON");
    }
  }
  const paymentReport = await (await request("/admin/tools/summary", adminCookie)).json() as any;
  check(paymentReport.report.cash.some((r: any) => r.currency === "VND" && Number(r.amount) === 3000), "E2E_BOT_VND_REPORT");
  check(paymentReport.report.cash.some((r: any) => r.currency === "USDT" && Number(r.amount) === 2), "E2E_BOT_USDT_REPORT");
  phase = "E2E_FEEDBACK_PRIVACY_AND_WORKFLOW";
  check((await request("/feedback")).status === 401, "E2E_FEEDBACK_LOGIN_REQUIRED");
  check((await request("/feedback", userCookie, { kind: "invalid", content: "Fixture feedback description" })).status === 400, "E2E_FEEDBACK_CATEGORY_VALIDATED");
  check((await request("/feedback", userCookie, { kind: "bug", content: "Fixture unsupported image input",
    image: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64") })).status === 400, "E2E_FEEDBACK_SVG_REJECTED");
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#123456" } }).png().toBuffer();
  const submitted = await request("/feedback", userCookie, {
    kind: "interface", content: "Fixture feedback about the navigation layout.", source: "/dashboard/settings?private=removed",
    image: png.toString("base64"),
  });
  check(submitted.status === 201, "E2E_FEEDBACK_CREATE");
  const feedback = await submitted.json() as any;
  check(feedback.hasImage && feedback.ownerId === userId && feedback.source === "/dashboard/settings", "E2E_FEEDBACK_OWNERSHIP_AND_IMAGE");
  const ownerImage = await request(`/feedback/${feedback.id}/image`, userCookie);
  check(ownerImage.ok && ownerImage.headers.get("content-type")?.startsWith("image/webp"), "E2E_FEEDBACK_PRIVATE_IMAGE");
  check((await request(`/feedback/${feedback.id}/image`)).status === 401, "E2E_FEEDBACK_IMAGE_LOGIN_REQUIRED");
  const limited = await request("/feedback", userCookie, { kind: "bug", content: "Fixture duplicate rapid submission" });
  check(limited.status === 429, "E2E_FEEDBACK_SPAM_LIMIT");
  check((await request("/admin/feedback", userCookie)).status === 403, "E2E_FEEDBACK_ADMIN_LIST_DENIED");
  check((await request(`/admin/feedback/${feedback.id}/status`, userCookie, { status: "completed" }, "PATCH")).status === 403, "E2E_FEEDBACK_STATUS_ADMIN_ONLY");
  const privateAdmin = await request("/feedback", adminCookie, {
    kind: "feature", content: "Fixture private admin feedback with a screenshot.", image: png.toString("base64"),
  });
  check(privateAdmin.ok, "E2E_FEEDBACK_SECOND_OWNER");
  const adminFeedback = await privateAdmin.json() as any;
  check((await request(`/feedback/${adminFeedback.id}`, userCookie)).status === 404, "E2E_FEEDBACK_OTHER_OWNER_DENIED");
  check((await request(`/feedback/${adminFeedback.id}/image`, userCookie)).status === 404, "E2E_FEEDBACK_OTHER_IMAGE_DENIED");
  check((await request("/admin/feedback/config", userCookie, { groupUrl: "https://t.me/fixture" }, "PUT")).status === 403, "E2E_FEEDBACK_CONFIG_ADMIN_ONLY");
  check((await request("/admin/feedback/config", adminCookie, { groupUrl: "javascript:alert(1)" }, "PUT")).status === 400, "E2E_FEEDBACK_GROUP_SCHEME");
  const groupSaved = await request("/admin/feedback/config", adminCookie, { groupUrl: "https://t.me/fixture_discussion" }, "PUT");
  check(groupSaved.ok, "E2E_FEEDBACK_GROUP_SAVED");
  const visibleGroup = await (await request("/feedback/config", userCookie)).json() as any;
  check(visibleGroup.groupUrl === "https://t.me/fixture_discussion", "E2E_FEEDBACK_GROUP_VISIBLE");
  async function feedbackCallback(sender: number, type = "private") {
    const id = callbackUpdate++;
    updates = [{ update_id: id, callback_query: { id: `fixture-feedback-${id}`, from: { id: sender },
      data: `feedback:reviewing:${feedback.id}`, message: { message_id: id, chat: { id: 123456789, type } } } }];
    await pollTelegram();
  }
  await feedbackCallback(888);
  await feedbackCallback(123456789, "supergroup");
  check((await (await request(`/feedback/${feedback.id}`, userCookie)).json() as any).status === "received", "E2E_FEEDBACK_BOT_UNAUTHORIZED_DENIED");
  await feedbackCallback(123456789);
  check((await (await request(`/feedback/${feedback.id}`, userCookie)).json() as any).status === "reviewing", "E2E_FEEDBACK_BOT_STATUS");
  const completedFeedback = await request(`/admin/feedback/${feedback.id}/status`, adminCookie, { status: "completed" }, "PATCH");
  check(completedFeedback.ok, "E2E_FEEDBACK_WEB_ADMIN_STATUS");
  const history = await (await request("/feedback", userCookie)).json() as any[];
  check(history.some(row => row.id === feedback.id && row.status === "completed") &&
    !history.some(row => row.id === adminFeedback.id), "E2E_FEEDBACK_CUSTOMER_HISTORY");
  check(replies.some((r: any) => r.reply_markup?.inline_keyboard?.flat().some((b: any) =>
    b.callback_data === `feedback:reviewing:${feedback.id}`)), "E2E_FEEDBACK_BOT_NOTICE");
  phase = "E2E_MFA_DISABLE";
  const disabled = await request("/auth/mfa/disable", adminCookie, { password, code: codes.recoveryCodes[1] });
  check(disabled.ok, "E2E_MFA_DISABLE");
  check((await request("/admin/tools/summary", adminCookie)).status === 401, "E2E_MFA_DISABLE_REVOKES_SESSIONS");
  console.log("E2E_ALL_PASSED");
} catch (error) {
  console.error(phase);
  console.error(error instanceof Error && /^E2E_[A-Z_]+$/.test(error.message) ? error.message : "E2E_UNEXPECTED_ERROR");
  const sqlState = (error as any)?.code;
  if (["42703", "42P01", "22P02", "23502", "23503", "23505"].includes(sqlState)) console.error("E2E_PG_" + sqlState);
  process.exitCode = 1;
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await pool.end();
}
