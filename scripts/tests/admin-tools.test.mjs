// Synthetic fixtures only. No database, credentials, network or live bot.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";
import * as core from "../../artifacts/api-server/src/lib/admin-tools-core.ts";
import * as access from "../../artifacts/api-server/src/lib/telegram-admin-access.ts";
import * as menu from "../../artifacts/api-server/src/lib/telegram-admin-menu.ts";
import { purchaseReviewNotification } from "../../artifacts/api-server/src/lib/purchase-review-notification.ts";

test("Payment notices distinguish key/renewal, currency and reported versus verified money", () => {
  for (const currency of ["VND", "USDT"]) for (const orderType of ["license", "renewal"]) {
    const text = purchaseReviewNotification({ id: "fixture", ownerUserId: "user", reference: "TCFIXTURE",
      plan: "plus", durationDays: 30, amount: "1000", currency, orderType, network: currency === "USDT" ? "BEP20" : null }, "fixture_user", true);
    assert.ok(text.includes("CHƯA XÁC MINH") && text.includes(currency));
    assert.ok(text.includes(orderType === "license" ? "Mua key" : "Gia hạn"));
    assert.ok(text.includes("tự đối chiếu"));
  }
});

const fixtureSecret = core.base32Encode(Buffer.from("12345678901234567890"));
test("RFC HOTP/TOTP vector, base32 encoding and 6 digit output", () => {
  assert.ok(fixtureSecret === "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.ok(core.totpCode(fixtureSecret, 1) === "287082");
});
test("TOTP allows neighboring time windows, rejects stale and replayed codes", () => {
  const now = 300_000;
  assert.ok(core.validTotpCounter(fixtureSecret, core.totpCode(fixtureSecret, 9), now) === 9);
  assert.ok(core.validTotpCounter(fixtureSecret, core.totpCode(fixtureSecret, 11), now) === 11);
  assert.ok(core.validTotpCounter(fixtureSecret, core.totpCode(fixtureSecret, 8), now) === null);
  assert.ok(core.validTotpCounter(fixtureSecret, core.totpCode(fixtureSecret, 10), now, 10) === null);
  assert.ok(core.validTotpCounter(fixtureSecret, "not-a-code", now) === null);
});
test("Recovery hashes normalize separators but are bound to the user", () => {
  assert.ok(core.recoveryHash("a", "AB-CD") === core.recoveryHash("a", "ab cd"));
  assert.ok(core.recoveryHash("a", "ABCD") !== core.recoveryHash("b", "ABCD"));
});
test("CSV preserves commas/quotes/newlines and neutralizes spreadsheet formulas", () => {
  assert.ok(core.csvCell('a,"b"') === '"a,""b"""');
  for (const cell of ["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", "  =A1", "\tcommand"]) {
    assert.ok(core.csvCell(cell).startsWith('"\''));
  }
  const csv = core.csvDocument(["field"], [["a\nb"]]);
  assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.endsWith("\r\n")); assert.ok(csv.includes('"a\nb"'));
});
test("Profile links only use trusted HTTP(S) base and an encoded real route", () => {
  assert.ok(core.adminProfileLink("javascript:alert(1)", "a") === null);
  assert.ok(core.adminProfileLink("https://u:p@example.invalid", "a") === null);
  assert.ok(core.adminProfileLink("https://example.invalid/path?q=x#z", "a/b") === "https://example.invalid/admin/users/a%2Fb/support");
});
test("Admin HTML is escaped and bounded", () => {
  const result = core.escapeAdminHtml("<script>&\"".repeat(1000));
  assert.ok(!result.includes("<script>")); assert.ok(result.length <= 160 * 6);
});
test("Updates process in order, skip acknowledged duplicates, persist only after handling", async () => {
  const trace = [];
  const result = await core.processTelegramBatch([{ update_id: 4 }, { update_id: 2 }, { update_id: 3 }], 3,
    async u => { trace.push(`handle:${u.update_id}`); }, async next => { trace.push(`save:${next}`); });
  assert.deepEqual(trace, ["handle:3", "save:4", "handle:4", "save:5"]);
  assert.equal(result.offset, 5); assert.equal(result.failedUpdateId, null);
});
test("Handler failure retains cursor and does not skip later updates", async () => {
  const persisted = [];
  const result = await core.processTelegramBatch([{ update_id: 8 }, { update_id: 9 }], 8,
    async () => { throw Error("synthetic failure"); }, async next => { persisted.push(next); });
  assert.equal(result.offset, 8); assert.equal(result.failedUpdateId, 8); assert.equal(persisted.length, 0);
});
test("Persistence failure does not acknowledge a message", async () => {
  const result = await core.processTelegramBatch([{ update_id: 8 }], 8,
    async () => {}, async () => { throw Error("synthetic persistence failure"); });
  assert.equal(result.offset, 8); assert.equal(result.failedUpdateId, 8);
});
async function loadUserFlow() {
  const modules = {
    "./telegram-admin-access": access,
    "./telegram-admin-menu": menu,
    "./telegram-admin-tools": { validUserLookup: value => /^@?[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(value.trim()) },
  };
  const source = await readFile(new URL("../../artifacts/api-server/src/lib/telegram-user-lookup-flow.ts", import.meta.url), "utf8");
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(source));
  await mod.link(async name => {
    const exports = modules[name];
    if (!exports) throw Error("Unknown fixture module");
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); });
  });
  await mod.evaluate();
  return mod.namespace.createAdminUserLookupFlow;
}
test("User lookup is private admin-only and preserves support replies", async () => {
  const create = await loadUserFlow();
  let searches = 0, now = 100;
  const responses = [];
  const flow = create({ lookup: async () => { searches++; return true; },
    respond: async text => { responses.push(text); return { message_id: 7 }; }, onStart() {}, onError() {}, now: () => now });
  const message = text => ({ chat: { id: 99, type: "private" }, from: { id: 99 }, text });
  assert.equal(await flow({ ...message("/finduser sample"), from: { id: 3 } }, "99"), false);
  assert.equal(searches, 0);
  assert.equal(await flow(message("🔎 Tìm người dùng"), "99"), true);
  assert.equal(await flow({ ...message("reply to customer"), reply_to_message: { message_id: 88 } }, "99"), false);
  assert.equal(searches, 0);
  await flow(message("🔎 Tìm người dùng"), "99");
  now += 300001;
  assert.equal(await flow(message("sample"), "99"), false);
  await flow(message("/finduser sample"), "99");
  assert.equal(searches, 1);
});
test("User lookup cancel/navigation clear state; generic errors never echo input", async () => {
  const create = await loadUserFlow();
  const responses = [];
  const flow = create({ lookup: async () => { throw Error("private fixture detail"); },
    respond: async text => { responses.push(text); return { message_id: 7 }; }, onStart() {}, onError() {} });
  const msg = text => ({ chat: { id: 99, type: "private" }, from: { id: 99 }, text });
  await flow(msg("🔎 Tìm người dùng"), "99");
  await flow(msg("/cancel"), "99");
  assert.equal(await flow(msg("sample"), "99"), false);
  await flow(msg("/finduser sample"), "99");
  assert.ok(!responses.join("").includes("private fixture detail"));
  await flow(msg("🔎 Tìm người dùng"), "99");
  await flow(msg("💰 Doanh thu"), "99");
  assert.equal(await flow(msg("sample"), "99"), false);
});
