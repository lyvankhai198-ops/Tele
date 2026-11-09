import test from "node:test";
import assert from "node:assert/strict";
import { boundedTelegramCleanup, guardTelegramClient } from "../../artifacts/api-server/src/lib/telegram-rpc-deadline.ts";

const never = () => new Promise(() => {});
function fixture(overrides = {}) {
  const state = { destroyed: 0, invoked: 0 };
  const client = {
    async connect() { return true; },
    async invoke(value) { state.invoked += 1; return value; },
    async destroy() { state.destroyed += 1; },
    ...overrides,
  };
  return { state, client: guardTelegramClient(client, { connectMs: 15, rpcMs: 15 }) };
}

test("normal connect/RPC preserve results and do not close a healthy client", async () => {
  const { client, state } = fixture();
  assert.equal(await client.connect(), true);
  assert.equal(await client.invoke("message-id"), "message-id");
  assert.equal(state.destroyed, 0);
});
test("stuck RPC closes the client, releases caller, and cannot start another send", async () => {
  const { client, state } = fixture({ invoke: never });
  await assert.rejects(client.invoke(), { code: "TELEGRAM_OPERATION_TIMEOUT", phase: "rpc" });
  assert.equal(state.destroyed, 1);
  await assert.rejects(client.invoke(), { code: "TELEGRAM_OPERATION_TIMEOUT" });
  await assert.rejects(client.connect(), { code: "TELEGRAM_OPERATION_TIMEOUT" });
});
test("a stuck connection is bounded before identity lookup or payload submission", async () => {
  const { client, state } = fixture({ connect: never });
  await assert.rejects(client.connect(), { phase: "connect" });
  await assert.rejects(client.invoke("must-not-send"), { code: "TELEGRAM_OPERATION_TIMEOUT" });
  assert.equal(state.invoked, 0);
});
test("a late successful connection is closed again and never used", async () => {
  let finish;
  const { client, state } = fixture({ connect: () => new Promise(resolve => { finish = resolve; }) });
  await assert.rejects(client.connect(), { phase: "connect" });
  finish(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.destroyed, 2);
  await assert.rejects(client.invoke("must-not-send"), { code: "TELEGRAM_OPERATION_TIMEOUT" });
});
test("accepted delivery survives stuck cleanup without triggering a retry", async () => {
  let failed = 0;
  async function send() {
    try { return "accepted-id"; }
    finally { await boundedTelegramCleanup(never, 10, () => { failed += 1; }); }
  }
  assert.equal(await send(), "accepted-id");
  assert.equal(failed, 1);
});
test("cleanup failures cannot mask the original Telegram rejection", async () => {
  const original = new Error("original");
  async function send() {
    try { throw original; }
    finally { await boundedTelegramCleanup(async () => { throw Error("cleanup"); }, 10); }
  }
  await assert.rejects(send(), error => error === original);
});
test("a subsequent independent client remains usable after a stalled client", async () => {
  const first = fixture({ invoke: never });
  await assert.rejects(first.client.invoke(), { phase: "rpc" });
  const second = fixture();
  assert.equal(await second.client.invoke("next-target"), "next-target");
});
