import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { boundedTelegramCleanup } from "../../artifacts/api-server/src/lib/telegram-rpc-deadline.ts";

const source = fs.readFileSync(new URL("../../artifacts/api-server/src/lib/telegram.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function disconnectQuietly(");
const end = source.indexOf("\nexport { Api,", start);
assert.ok(start >= 0 && end > start);
const cleanup = vm.runInNewContext(
  stripTypeScriptTypes(source.slice(start, end).replace(/^export /, ""), { mode: "transform" }) +
  "\ndisconnectQuietly;",
  { boundedTelegramCleanup, logger: { warn() {} } },
);

test("single-use clients stop their update loop, not just their socket", async () => {
  const client = {
    destroyed: false, handlers: [() => {}], disconnectCalls: 0,
    async disconnect() { this.disconnectCalls += 1; },
    async destroy() {
      this.destroyed = true;
      await this.disconnect();
      this.handlers = [];
    },
  };
  await cleanup(client);
  assert.equal(client.destroyed, true);
  assert.equal(client.disconnectCalls, 1);
  assert.equal(client.handlers.length, 0);
});

test("cleanup failure cannot replace send success or its original failure", async () => {
  const original = new Error("original send error");
  const client = { async destroy() { throw new Error("cleanup failed"); } };
  async function deliver(fail) {
    try {
      if (fail) throw original;
      return "accepted-message";
    } finally {
      await cleanup(client);
    }
  }
  assert.equal(await deliver(false), "accepted-message");
  await assert.rejects(deliver(true), error => error === original);
});

test("every account-client finalizer uses permanent cleanup", () => {
  assert.doesNotMatch(source, /await client\.disconnect\(/);
  assert.match(source, /client\.destroy\(\)/);
  const routes = fs.readFileSync(new URL("../../artifacts/api-server/src/routes/telecampaign.ts", import.meta.url), "utf8");
  assert.doesNotMatch(routes, /await client\.disconnect\(/);
  assert.match(routes, /getAccountClient\(attachedAccount\.id, ownerUserId\);\s*await disconnectQuietly\(client\)/);
});

test("failed initial QR connection is also destroyed", () => {
  assert.match(source, /const client = createTelegramClient\("", credentials, proxy\);\s*try \{\s*await client\.connect\(\);\s*\} catch \(error\) \{\s*await destroyQuietly\(client\);\s*throw error;/);
});
