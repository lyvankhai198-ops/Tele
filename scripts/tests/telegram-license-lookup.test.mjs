// Offline tests only: synthetic records, no real keys, production DB or Telegram.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as identity from "../../artifacts/api-server/src/lib/license-key-identity.ts";
import * as access from "../../artifacts/api-server/src/lib/telegram-admin-access.ts";
import { TELEGRAM_ADMIN_MENU } from "../../artifacts/api-server/src/lib/telegram-admin-menu.ts";
import { refreshAdminMenu } from "../refresh-telecampaign-bot-menu.mjs";

const KEY = "TEST-ONLY-NOT-A-REAL-LICENSE";
const NOW = Date.parse("2026-10-31T06:00:00Z");
const base = {
  id: "license-fixture", plan: "plus", durationDays: 30, createdAt: new Date("2026-10-01Z"),
  claimedAt: null, claimedBy: null, revokedAt: null, reservedUntil: null,
  userId: null, username: null, userCreatedAt: null,
  subscriptionId: null, currentPlan: null, expiresAt: null,
};
const activated = {
  ...base, claimedAt: new Date("2026-10-15Z"), claimedBy: "user-fixture",
  userId: "user-fixture", username: "customer", userCreatedAt: new Date("2026-09-01Z"),
  subscriptionId: "subscription-fixture", currentPlan: "pro", expiresAt: new Date("2026-12-01Z"),
};
const table = name => new Proxy({}, { get: (_, key) => `${name}.${String(key)}` });
async function fixture(row = { ...base }) {
  const queries = [], sent = [], errors = [];
  let clock = NOW, nextId = 100, fail = false;
  const tables = Object.fromEntries(["appUsersTable", "licenseKeysTable", "subscriptionsTable"].map(n => [n, table(n)]));
  const db = { select(projection) {
    const call = { projection, joins: [] }; queries.push(call);
    const query = {
      from(t) { call.from = t; return query; },
      leftJoin(t, predicate) { call.joins.push({ t, predicate }); return query; },
      where(predicate) { call.predicate = predicate; return query; },
      async limit(n) { call.limit = n; if (fail) throw Error("synthetic database failure"); return row ? [{ ...row }] : []; },
    };
    return query;
  } };
  const context = vm.createContext({ Date, Intl, Set, Map, Number, Array });
  const synthetic = exports => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
  const modules = {
    "drizzle-orm": synthetic({
      eq: (column, value) => ({ column, value }),
      sql: (strings, ...values) => ({ template: [...strings], values }),
    }),
    "@workspace/db": synthetic({ db, ...tables }),
    "./license-key-identity": synthetic(identity),
    "./telegram-admin-access": synthetic(access),
  };
  const root = new URL("../../artifacts/api-server/src/lib/", import.meta.url);
  const lookup = new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL("telegram-license-lookup.ts", root), "utf8")), { context });
  await lookup.link(name => modules[name]); await lookup.evaluate();
  modules["./telegram-license-lookup"] = lookup;
  const flowModule = new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL("telegram-license-lookup-flow.ts", root), "utf8")), { context });
  await flowModule.link(name => modules[name]); await flowModule.evaluate();
  const flow = flowModule.namespace.createAdminLicenseLookupFlow({
    lookup: lookup.namespace.findLicenseForTelegram,
    respond: async (text, parseMode) => { const message_id = nextId++; sent.push({ text, parseMode, message_id }); return { message_id }; },
    onError: () => errors.push("generic-error"),
    now: () => clock,
  });
  const message = (text, extra = {}) => ({ chat: { id: 42, type: "private" }, from: { id: 42 }, text, ...extra });
  return {
    queries, sent, errors, lookup: lookup.namespace, flow, message,
    send: (text, extra) => flow(message(text, extra), "42", "Asia/Ho_Chi_Minh"),
    advance: ms => { clock += ms; },
    fail: () => { fail = true; },
  };
}

test("menu keeps existing reports and adds exactly one find-key button", () => {
  const labels = TELEGRAM_ADMIN_MENU.keyboard.flat().map(b => b.text);
  assert.equal(labels.filter(t => t === "🔎 Tìm key").length, 1);
  for (const t of ["📊 Tổng quan", "💰 Doanh thu", "👥 Người dùng", "🔑 License keys", "⏳ Sắp hết hạn", "🧾 Key hôm nay", "🔄 Làm mới", "🏠 Menu"]) assert.ok(labels.includes(t));
});
test("lookup shares the exact activation normalization and SHA-256 identity", () => {
  const input = "  test-only-\nnot-a-real-license  ";
  const before = createHash("sha256").update(input.trim().toUpperCase().replace(/\s+/g, "")).digest("hex");
  assert.equal(identity.licenseKeyHash(input), before);
  assert.equal(identity.licenseKeyHash(input), identity.licenseKeyHash(KEY));
});
test("button prompts, then exact key uses one read-only hashed query and left joins", async () => {
  const f = await fixture(activated);
  assert.equal(await f.send("🔎 Tìm key"), true);
  assert.equal(f.queries.length, 0);
  await f.send(KEY.toLowerCase());
  assert.equal(f.queries.length, 1);
  const q = f.queries[0];
  assert.equal(q.predicate.column, "licenseKeysTable.keyHash");
  assert.equal(q.predicate.value, identity.licenseKeyHash(KEY));
  assert.equal(q.limit, 1);
  assert.equal(q.joins.length, 2);
  assert.equal(q.joins[0].predicate.value, "licenseKeysTable.claimedBy");
  assert.equal(q.joins[0].predicate.column.template.join(""), "::text");
  assert.equal(q.joins[0].predicate.column.values[0], "appUsersTable.id");
  assert.equal(q.joins[1].predicate.value, "licenseKeysTable.claimedBy");
  for (const field of Object.values(q.projection)) assert.doesNotMatch(field, /password|keyEncrypted|keyHash|phone|session/i);
  const result = f.sent.at(-1);
  assert.equal(result.parseMode, "HTML");
  assert.match(result.text, /Đã kích hoạt/);
  assert.match(result.text, /customer/);
  assert.match(result.text, /PRO/);
  assert.match(result.text, /Còn hiệu lực/);
  assert.ok(!result.text.includes(KEY) && !result.text.includes(identity.licenseKeyHash(KEY)));
  assert.equal(await f.send(KEY), false); // one-shot session ends after success
});
test("direct /findkey command works without opening a session", async () => {
  const f = await fixture();
  await f.send(`/findkey@SyntheticBot ${KEY}`);
  assert.equal(f.queries.length, 1);
  assert.match(f.sent.at(-1).text, /Chưa kích hoạt/);
  assert.match(f.sent.at(-1).text, /chưa gắn với người dùng/);
});
test("unknown keys are distinct from unclaimed keys and allow retry", async () => {
  const f = await fixture(null);
  await f.send("🔎 Tìm key"); await f.send(KEY); await f.send(KEY);
  assert.equal(f.queries.length, 2);
  assert.match(f.sent.at(-1).text, /Không tìm thấy key/);
});
test("invalid input never queries the database", async () => {
  const f = await fixture();
  await f.send("🔎 Tìm key");
  for (const value of ["bad", "<script>alert(1)</script>", "X".repeat(129), "X".repeat(1025)]) {
    await f.send(value);
  }
  assert.equal(f.queries.length, 0);
  assert.equal(await f.lookup.findLicenseForTelegram("X".repeat(1025)), null);
  assert.equal(f.queries.length, 0);
});
test("group, channel, wrong sender/chat and missing configuration cannot query or receive results", async () => {
  const f = await fixture(activated);
  for (const [extra, config] of [
    [{ chat: { id: 42, type: "group" } }, "42"],
    [{ chat: { id: 42, type: "supergroup" } }, "42"],
    [{ chat: { id: 42, type: "channel" } }, "42"],
    [{ chat: { id: 43, type: "private" } }, "42"],
    [{ from: { id: 43 } }, "42"], [{ from: undefined }, "42"],
    [{}, null], [{}, ""],
  ]) assert.equal(await f.flow(f.message(`/findkey ${KEY}`, extra), config, "UTC"), false);
  assert.equal(f.queries.length, 0); assert.equal(f.sent.length, 0);
});
test("pending state cannot be borrowed by another sender", async () => {
  const f = await fixture(); await f.send("🔎 Tìm key");
  assert.equal(await f.send(KEY, { from: { id: 99 } }), false);
  assert.equal(f.queries.length, 0);
  await f.send(KEY); assert.equal(f.queries.length, 1);
});
test("search can be cancelled, expires after five minutes and is cleared by navigation", async () => {
  for (const action of ["/cancel", "/menu", "/start", "🏠 Menu", "👥 Người dùng", "🔄 Làm mới"]) {
    const f = await fixture(); await f.send("🔎 Tìm key"); await f.send(action);
    assert.equal(await f.send(KEY), false); assert.equal(f.queries.length, 0);
  }
  const f = await fixture(); await f.send("🔎 Tìm key"); f.advance(5 * 60_000);
  assert.equal(await f.send(KEY), false); assert.equal(f.queries.length, 0);
});
test("normal support replies and photos are not hijacked by a pending search", async () => {
  for (const extra of [{ reply_to_message: { message_id: 999 } }, { photo: [{}] }, { contact: {} }]) {
    const f = await fixture(); await f.send("🔎 Tìm key");
    assert.equal(await f.send("reply to customer", extra), false);
    assert.equal(f.queries.length, 0);
  }
  const f = await fixture(); await f.send("🔎 Tìm key");
  await f.send(KEY, { reply_to_message: { message_id: f.sent[0].message_id } });
  assert.equal(f.queries.length, 1);
});
test("database errors are generic, reveal no input and do not get forwarded to support", async () => {
  const f = await fixture(); f.fail(); await f.send("🔎 Tìm key");
  assert.equal(await f.send(KEY), true);
  assert.equal(f.errors.length, 1);
  assert.match(f.sent.at(-1).text, /Không thể tra cứu/);
  assert.ok(!f.sent.at(-1).text.includes(KEY));
});
test("revocation does not erase the historical activation or claimant", async () => {
  const f = await fixture();
  const text = f.lookup.formatLicenseLookup({ ...activated, revokedAt: new Date("2026-10-30Z") }, "UTC", NOW);
  assert.match(text, /Đã thu hồi/); assert.match(text, /Đã kích hoạt/); assert.match(text, /customer/);
});
test("expired, unlimited and missing subscriptions are shown separately from key activation", async () => {
  const f = await fixture();
  const format = overrides => f.lookup.formatLicenseLookup({ ...activated, ...overrides }, "UTC", NOW);
  assert.match(format({ expiresAt: new Date("2026-10-01Z") }), /Không còn hiệu lực/);
  assert.match(format({ expiresAt: null }), /Không thời hạn/);
  assert.match(format({ subscriptionId: null, currentPlan: null, expiresAt: null }), /Chưa có gói/);
  assert.match(format({ currentPlan: "unlimited" }), /gia hạn hoặc nâng cấp/);
});
test("missing claimant records and inconsistent activation data are not silently marked available", async () => {
  const f = await fixture();
  assert.match(f.lookup.formatLicenseLookup({ ...activated, userId: null }, "UTC", NOW), /Không tìm thấy tài khoản/);
  const text = f.lookup.formatLicenseLookup({ ...base, claimedBy: "historical-user" }, "UTC", NOW);
  assert.match(text, /Cần đối chiếu/); assert.doesNotMatch(text, /Có sẵn/);
});
test("active reservations, HTML escaping, bounded output and invalid timezone fallback", async () => {
  const f = await fixture();
  assert.match(f.lookup.formatLicenseLookup({ ...base, reservedUntil: new Date(NOW + 10000) }, "UTC", NOW), /Đang giữ/);
  const text = f.lookup.formatLicenseLookup({ ...activated, username: "<b>&".repeat(5000) }, "invalid/timezone", NOW);
  assert.ok(text.length < 4096); assert.match(text, /&lt;b&gt;&amp;/); assert.doesNotMatch(text, /<b>&/);
});
test("real message router dispatches lookup only after admin authorization, before support forwarding", async () => {
  const source = await readFile(new URL("../../artifacts/api-server/src/lib/support-telegram.ts", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function handleTelegramMessage"));
  assert.ok(handler.indexOf("isAuthorizedAdminMessage") < handler.indexOf("await handleAdminLicenseLookup"));
  assert.ok(handler.indexOf("await handleAdminLicenseLookup") < handler.indexOf("findSupportMessageByTelegramReply"));
  const activation = await readFile(new URL("../../artifacts/api-server/src/lib/subscriptions.ts", import.meta.url), "utf8");
  assert.match(activation, /import \{ licenseKeyHash, normalizedLicenseKey \} from "\.\/license-key-identity"/);
});

test("menu refresh verifies bot and the exact private admin chat before sending", async () => {
  const calls = [];
  await refreshAdminMenu({ supportChat: { adminTelegramChatId: "42", telegramBridgeEnabled: true } }, async (method, payload) => {
    calls.push({ method, payload });
    if (method === "getMe") return { is_bot: true };
    if (method === "getChat") return { id: 42, type: "private" };
    return { message_id: 123, chat: { id: 42 } };
  });
  assert.deepEqual(calls.map(c => c.method), ["getMe", "getChat", "sendMessage"]);
  assert.equal(calls[2].payload.chat_id, "42");
  assert.equal(calls[2].payload.reply_markup, TELEGRAM_ADMIN_MENU);
});
test("menu refresh refuses disabled/missing/group or mismatched private chat configurations", async () => {
  for (const supportChat of [{}, { adminTelegramChatId: "-10042" }, { adminTelegramChatId: "42", telegramBridgeEnabled: false }]) {
    let called = false;
    await assert.rejects(refreshAdminMenu({ supportChat }, async () => { called = true; }));
    assert.equal(called, false);
  }
  for (const chat of [{ id: 42, type: "group" }, { id: 43, type: "private" }]) {
    const methods = [];
    await assert.rejects(refreshAdminMenu({ supportChat: { adminTelegramChatId: "42" } }, async method => {
      methods.push(method); return method === "getMe" ? { is_bot: true } : chat;
    }));
    assert.ok(!methods.includes("sendMessage"));
  }
});
