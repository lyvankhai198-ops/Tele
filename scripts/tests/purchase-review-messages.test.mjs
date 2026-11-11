import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createPurchaseReviewMessages, REVIEW_MESSAGE_PREFIX, reviewMessageOrderId,
} from "../../artifacts/api-server/src/lib/purchase-review-messages.ts";

const id = "7f82894c-1e5b-482c-a08d-eda7f80c23f3";
const chat = "1234";
function fixture(status = "pending", fail = null) {
  const records = new Map(), calls = [], queries = [];
  let clock = 100000, warnings = 0;
  const query = async (sql, args) => {
    queries.push(sql);
    if (sql.startsWith("INSERT")) {
      if (!records.has(args[0])) records.set(args[0], JSON.parse(args[1]));
    } else if (sql.startsWith("UPDATE")) records.set(args[0], JSON.parse(args[1]));
    else if (sql.startsWith("SELECT status")) return { rows: [{ status }] };
    else if (sql.includes("JOIN purchase_orders")) return { rows: [...records].filter(([, r]) =>
      ["paid", "cancelled", "rejected", "revoked"].includes(status) && r.chatId === args[1] &&
      !r.outcome && r.nextAttemptAt <= clock).slice(0, 25).map(([key, value]) => ({
        key, value: JSON.stringify(value), status, reference: "TC-EXAMPLE",
      })) };
    else throw Error("Unexpected SQL");
    return { rows: [] };
  };
  const call = async (method, payload) => {
    calls.push({ method, payload });
    const error = fail?.(method);
    if (error) throw Error(error);
    return method === "deleteMessage" ? true : { message_id: payload.message_id };
  };
  const store = createPurchaseReviewMessages({ query, call, warn: () => warnings++, now: () => clock });
  return { store, records, calls, queries, changeStatus: s => status = s,
    advance: n => clock += n, warnings: () => warnings, query, call };
}

for (const state of ["paid", "cancelled", "rejected", "revoked"]) {
  test(`deletes every linked review card for ${state}, once`, async () => {
    const f = fixture(state);
    await f.store.remember(id, chat, 10);
    await f.store.remember(id, chat, 11);
    const result = await f.store.reconcile(chat);
    assert.equal(result.deleted, 2);
    await f.store.reconcile(chat);
    assert.equal(f.calls.length, 2);
    assert.ok(f.queries.every(sql => !/\b(?:UPDATE|DELETE FROM) purchase_orders|subscriptions|license_keys/i.test(sql)));
  });
}
for (const state of ["pending", "expired", "received"]) {
  test(`never removes a still-reviewable ${state} order`, async () => {
    const f = fixture(state);
    await f.store.remember(id, chat, 10);
    await f.store.reconcile(chat);
    assert.equal(f.calls.length, 0);
    assert.equal(await f.store.isReviewable(id), true);
  });
}
test("a restart and the send/settlement race retain exact message references", async () => {
  const f = fixture();
  await f.store.remember(id, chat, 10);
  f.changeStatus("paid");
  const restarted = createPurchaseReviewMessages({ query: f.query, call: f.call, warn() {}, now: () => 100000 });
  await restarted.reconcile(chat);
  assert.equal(f.calls[0].payload.message_id, 10);
  assert.equal(f.calls[0].payload.chat_id, chat);
});
test("Telegram failure retries later without changing payment or flooding", async () => {
  const f = fixture("paid", () => "network down");
  await f.store.remember(id, chat, 10);
  assert.equal((await f.store.reconcile(chat)).retry, 1);
  await f.store.reconcile(chat);
  assert.equal(f.calls.length, 1);
  f.advance(30000);
  await f.store.reconcile(chat);
  assert.equal(f.calls.length, 2);
});
test("Telegram age limit resolves the card and removes its buttons", async () => {
  const f = fixture("paid", method => method === "deleteMessage" ? "Bad Request: message can't be deleted" : null);
  await f.store.remember(id, chat, 10);
  assert.equal((await f.store.reconcile(chat)).resolved, 1);
  assert.deepEqual(f.calls[1].payload.reply_markup, { inline_keyboard: [] });
  assert.match(f.calls[1].payload.text, /Đã xác minh/);
});
test("already missing messages finish without recurring delete calls", async () => {
  const f = fixture("paid", () => "Bad Request: message to delete not found");
  await f.store.remember(id, chat, 10);
  assert.equal((await f.store.reconcile(chat)).absent, 1);
  await f.store.reconcile(chat);
  assert.equal(f.calls.length, 1);
});
test("an unavailable metadata database never rejects a payment-side cleanup call", async () => {
  let warned = false;
  const store = createPurchaseReviewMessages({
    query: async () => { throw Error("database unavailable"); },
    call: async () => assert.fail("No Telegram request without confirmed references"),
    warn: () => { warned = true; },
  });
  await assert.doesNotReject(store.reconcile(chat));
  assert.equal(warned, true);
});
test("configured chat and validated references prevent cross-chat deletion", async () => {
  const f = fixture("paid");
  await f.store.remember(id, "9999", 10);
  await f.store.reconcile(chat);
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.store.remember("not-an-order", chat, 10));
  await assert.rejects(f.store.remember(id, chat, -1));
});
test("legacy recovery accepts only the exact review-card ID line", () => {
  const text = `🧾 ĐƠN CHỜ XÁC MINH THANH TOÁN\nĐơn: TC-EXAMPLE\nID đơn: ${id}`;
  assert.equal(reviewMessageOrderId(text), id);
  assert.equal(reviewMessageOrderId(`ID đơn: ${id}`), null);
  assert.equal(reviewMessageOrderId(text.replace(id, "not-an-order")), null);
});
test("automatic startup reconciliation is independent from payment transactions", () => {
  const source = fs.readFileSync(new URL("../../artifacts/api-server/src/lib/support-telegram.ts", import.meta.url), "utf8");
  assert.match(source, /setInterval\(\(\) => void reconcilePurchaseReviewMessages\(\), 15_000\)/);
  assert.match(source, /if \(orderId && !\(await purchaseReviewMessages\.isReviewable\(orderId\)\)\) return/);
  assert.match(source, /original\.from\.id\) === String\(me\.id\)/);
});
