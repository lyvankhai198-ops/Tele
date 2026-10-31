// Run: node --experimental-vm-modules --test scripts/tests/manual-order-review.test.mjs
// No production database, real orders, payment provider or Telegram calls.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import * as policy from "../../artifacts/api-server/src/lib/purchase-order-review-policy.ts";
import { getPurchaseOrderActions } from "../../artifacts/telecampaign/src/lib/purchase-order-actions.ts";

const source = await readFile(new URL("../../artifacts/api-server/src/lib/telecampaign-orders.ts", import.meta.url), "utf8");
const predicate = (op, ...args) => ({ op, args });
const eq = (a, b) => predicate("eq", a, b);
const table = (name) => new Proxy({ name }, {
  get(target, key) { return key in target ? target[key] : { table: name, column: key }; },
});
const tables = Object.fromEntries(["appUsersTable", "licenseKeysTable", "purchaseOrdersTable",
  "subscriptionsTable", "systemSettingsTable"].map(name => [name, table(name)]));
function matches(condition, row) {
  if (!condition || condition === true) return true;
  const [a, b] = condition.args;
  const value = a?.column ? row[a.column] : a;
  switch (condition.op) {
    case "eq": return value === b;
    case "in": return b.includes(value);
    case "and": return condition.args.every(c => matches(c, row));
    case "or": return condition.args.some(c => matches(c, row));
    case "null": return value == null;
    case "notnull": return value != null;
    case "lte": return value <= b;
    case "lt": return value < b;
    case "gte": return value >= b;
    case "ne": return value !== b;
    default: throw new Error(`Unexpected predicate ${condition.op}`);
  }
}

async function fixture(overrides = {}, keys = []) {
  const state = {
    purchaseOrdersTable: [{ id: "order-1", ownerUserId: "user-1", status: "pending",
      currency: "VND", automated: true, orderType: "renewal", plan: "PRO",
      durationDays: 30, paymentEventId: null, ...overrides }],
    appUsersTable: [{ id: "user-1" }], subscriptionsTable: [],
    licenseKeysTable: structuredClone(keys), systemSettingsTable: [],
  };
  const calls = [];
  let beforeLock;
  const tx = {
    select(projection) {
      let selectedTable, condition, limit;
      const query = {
        from(t) { selectedTable = t.name; return query; },
        where(c) { condition = c; return query; },
        limit(n) { limit = n; return query; },
        for(mode) {
          calls.push(`lock:${selectedTable}:${mode}`);
          if (selectedTable === "purchaseOrdersTable" && beforeLock) {
            beforeLock(state.purchaseOrdersTable[0]); beforeLock = undefined;
          }
          return query;
        },
        then(resolve, reject) {
          try {
            let rows = state[selectedTable].filter(row => matches(condition, row));
            if (limit) rows = rows.slice(0, limit);
            rows = rows.map(row => projection
              ? Object.fromEntries(Object.entries(projection).map(([key, col]) => [key, row[col.column]]))
              : { ...row });
            return Promise.resolve(rows).then(resolve, reject);
          } catch (err) { return Promise.reject(err).then(resolve, reject); }
        },
      };
      return query;
    },
    update(t) {
      let values, condition;
      const run = () => {
        calls.push(`update:${t.name}`);
        const rows = state[t.name].filter(row => matches(condition, row));
        rows.forEach(row => Object.assign(row, values));
        return rows.map(row => ({ ...row }));
      };
      const query = {
        set(v) { values = v; return query; },
        where(c) { condition = c; return query; },
        returning() { return Promise.resolve(run()); },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      return query;
    },
    insert(t) {
      return { async values(values) {
        calls.push(`insert:${t.name}`);
        state[t.name].push({ id: randomUUID(), ...values });
      } };
    },
    async execute() {},
  };
  let queue = Promise.resolve();
  const db = {
    ...tx,
    transaction(fn) {
      const next = queue.then(async () => {
        const previous = structuredClone(state);
        try { return await fn(tx); }
        catch (err) { Object.assign(state, previous); throw err; }
      });
      queue = next.catch(() => {});
      return next;
    },
  };
  const imports = {
    "drizzle-orm": {
      eq, and: (...args) => predicate("and", ...args), or: (...args) => predicate("or", ...args),
      inArray: (a, b) => predicate("in", a, b), isNull: a => predicate("null", a),
      isNotNull: a => predicate("notnull", a), lte: (a, b) => predicate("lte", a, b),
      lt: (a, b) => predicate("lt", a, b), gte: (a, b) => predicate("gte", a, b),
      asc: a => a, desc: a => a, getTableColumns: () => ({}),
      sql: (parts, ...values) => parts.join("").includes("<>")
        ? predicate("ne", ...values) : true,
    },
    "@workspace/db": { ...tables, db },
    "./logger": { logger: { info() {} } },
    "./subscriptions": { PLAN_ORDER: ["plus", "pro", "unlimited"] },
    "node:crypto": { randomUUID },
    "./verify-usdt": { isValidTronAddress: () => true },
    "./purchase-order-review-policy": policy,
  };
  const context = vm.createContext({ Date, console });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(source), { context });
  await module.link(specifier => {
    const exports = imports[specifier];
    if (!exports) throw new Error(`Unexpected import ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return { api: module.namespace, state, calls, changeAtLock(fn) { beforeLock = fn; } };
}

test("action visibility: both VND flows can verify/reject pending and expired orders", () => {
  for (const automated of [false, true]) {
    for (const status of ["pending", "expired"]) {
      const order = { status, currency: "VND", automated };
      assert.equal(getPurchaseOrderActions(order).canVerifyManually, true);
      assert.equal(getPurchaseOrderActions(order).canReject, true);
      assert.doesNotThrow(() => policy.assertManualApprovalAllowed(order, true));
      assert.throws(() => policy.assertManualApprovalAllowed(order, false),
        /MANUAL_RECEIPT_CONFIRMATION_REQUIRED/);
    }
  }
});

test("terminal orders never expose verify/reject; paid orders keep revoke", () => {
  for (const status of ["paid", "rejected", "cancelled", "revoked"]) {
    const actions = getPurchaseOrderActions({ status, currency: "VND" });
    assert.equal(actions.canVerifyManually, false);
    assert.equal(actions.canReject, false);
    assert.equal(actions.canRevoke, status === "paid");
    assert.throws(() => policy.assertManualApprovalAllowed({ status, currency: "VND" }, true),
      /ORDER_NOT_REVIEWABLE/);
  }
});

test("automated VND can be manually approved and records the reviewing admin", async () => {
  const f = await fixture();
  const result = await f.api.reviewOrder("order-1", "admin-1", "paid", { manualVerification: true });
  assert.equal(result.status, "paid");
  assert.equal(result.reviewedBy, "admin-1");
  assert.ok(result.reviewedAt);
  assert.equal(result.paymentEventId, "manual:vnd:order-1");
  assert.equal(f.state.subscriptionsTable.length, 1);
  assert.equal(f.calls[0], "lock:purchaseOrdersTable:update");
});

test("manual approval requires explicit bank receipt confirmation", async () => {
  const f = await fixture();
  await assert.rejects(f.api.reviewOrder("order-1", "admin-1", "paid"), /MANUAL_RECEIPT_CONFIRMATION_REQUIRED/);
  assert.equal(f.state.purchaseOrdersTable[0].status, "pending");
  assert.equal(f.state.subscriptionsTable.length, 0);
});

test("USDT cannot be manually marked paid, even with the confirmation flag", async () => {
  for (const status of ["pending", "expired"]) {
    const f = await fixture({ currency: "USDT", status });
    assert.equal(getPurchaseOrderActions(f.state.purchaseOrdersTable[0]).canVerifyManually, false);
    await assert.rejects(f.api.reviewOrder("order-1", "admin-1", "paid", { manualVerification: true }),
      /CRYPTO_REQUIRES_CHAIN_VERIFICATION/);
    assert.equal(f.state.subscriptionsTable.length, 0);
  }
});

test("verified USDT fulfillment retry preserves its original provider event", async () => {
  const f = await fixture({ status: "received", currency: "USDT", paymentEventId: "chain:verified" });
  const result = await f.api.reviewOrder("order-1", "admin-1", "paid");
  assert.equal(result.status, "paid");
  assert.equal(result.paymentEventId, "chain:verified");
});

test("expired orders can be rejected with a reason and release only their key reservations", async () => {
  const f = await fixture({ status: "expired" }, [
    { id: "key-1", reservedOrderId: "order-1", reservedUntil: new Date() },
    { id: "key-2", reservedOrderId: "other-order", reservedUntil: new Date() },
  ]);
  const result = await f.api.reviewOrder("order-1", "admin-1", "rejected", { reason: "  No matching bank receipt  " });
  assert.equal(result.status, "rejected");
  assert.equal(result.rejectionReason, "No matching bank receipt");
  assert.equal(result.reviewedBy, "admin-1");
  assert.equal(f.state.licenseKeysTable[0].reservedOrderId, null);
  assert.equal(f.state.licenseKeysTable[1].reservedOrderId, "other-order");
});

test("rejection requires a reason and cannot reject verified/paid/cancelled orders", async () => {
  const f = await fixture();
  await assert.rejects(f.api.reviewOrder("order-1", "admin-1", "rejected", { reason: " " }),
    /ORDER_REVIEW_REASON_REQUIRED/);
  for (const status of ["received", "paid", "rejected", "cancelled", "revoked"]) {
    const other = await fixture({ status });
    await assert.rejects(other.api.reviewOrder("order-1", "admin-1", "rejected", { reason: "Checked" }),
      /ORDER_NOT_REVIEWABLE/);
  }
});

test("manual verification without a matching key records received money and reviewer", async () => {
  const f = await fixture({ orderType: "license" });
  const result = await f.api.reviewOrder("order-1", "admin-1", "paid", { manualVerification: true });
  assert.equal(result.status, "received");
  assert.equal(result.rejectionReason, "NO_MATCHING_KEY");
  assert.equal(result.reviewedBy, "admin-1");
  assert.ok(result.reviewedAt);
  assert.equal(f.state.subscriptionsTable.length, 0);
});

test("expired automatic orders can use an available matching key, not another customer's reservation", async () => {
  const key = { pool: "normal", plan: "pro", durationDays: 30, claimedAt: null, revokedAt: null };
  const f = await fixture({ status: "expired", orderType: "license" }, [
    { ...key, id: "reserved", reservedOrderId: "other-order", reservedUntil: new Date(Date.now() + 600000) },
    { ...key, id: "available", reservedOrderId: null, reservedUntil: null },
  ]);
  const result = await f.api.reviewOrder("order-1", "admin-1", "paid", { manualVerification: true });
  assert.equal(result.status, "paid");
  assert.equal(result.activatedLicenseKeyId, "available");
  assert.equal(f.state.licenseKeysTable[0].claimedAt, null);
  assert.equal(f.state.subscriptionsTable.length, 1);
});

test("state is checked under the same row lock used for fulfillment", async () => {
  const f = await fixture();
  f.changeAtLock(order => { order.status = "paid"; });
  await assert.rejects(f.api.reviewOrder("order-1", "admin-1", "paid", { manualVerification: true }),
    /ORDER_NOT_REVIEWABLE/);
  assert.equal(f.state.subscriptionsTable.length, 0);
});

test("serialized provider/manual race grants a subscription only once", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    f.api.settleVerifiedOrder("order-1", "provider:event-1"),
    f.api.reviewOrder("order-1", "admin-1", "paid", { manualVerification: true }),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(f.state.subscriptionsTable.length, 1);
  assert.equal(f.state.purchaseOrdersTable[0].paymentEventId, "provider:event-1");
});

test("automatic fulfillment retry keeps the original manual reviewer", async () => {
  const reviewedAt = new Date("2026-10-30T10:00:00Z");
  const f = await fixture({ status: "received", paymentEventId: "manual:vnd:order-1",
    reviewedBy: "admin-1", reviewedAt });
  const result = await f.api.settleVerifiedOrder("order-1", "manual:vnd:order-1");
  assert.equal(result.status, "paid");
  assert.equal(result.reviewedBy, "admin-1");
  assert.equal(result.reviewedAt.getTime(), reviewedAt.getTime());
});
