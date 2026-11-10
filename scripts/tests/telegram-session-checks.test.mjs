import test from "node:test";
import assert from "node:assert/strict";
import { createTelegramSessionChecks } from "../../artifacts/api-server/src/lib/telegram-session-checks.ts";

const account = id => ({id, ownerUserId:"owner", status:"connected", sessionEncrypted:"fixture"});
const tick = () => new Promise(resolve => setImmediate(resolve));

test("identity checks are deduplicated, bounded to two and preserve ownership", async () => {
  const calls = [], releases = [];
  const schedule = createTelegramSessionChecks((id, owner) => {
    calls.push([id,owner]);
    return new Promise(resolve => releases.push(resolve));
  }, () => {});
  const accounts = ["a","b","c"].map(account);
  schedule(accounts); schedule(accounts);
  await tick();
  assert.deepEqual(calls, [["a","owner"],["b","owner"]]);
  releases.shift()();
  await tick();
  assert.deepEqual(calls[2], ["c","owner"]);
  releases.forEach(resolve => resolve());
  await tick();
  schedule(accounts);
  await tick();
  assert.equal(calls.length,3);
});

test("saved accounts are not probed; failures leave decisions to the Telegram checker and become retryable", async () => {
  let time=0, calls=0, errors=0;
  const schedule = createTelegramSessionChecks(async () => { calls++; throw Error("temporary timeout"); }, () => {errors++;}, () => time);
  const connected=account("a");
  schedule([connected, {...account("b"), status:"saved"}, {...account("c"), sessionEncrypted:null}]);
  await tick();
  assert.equal(calls,1); assert.equal(errors,1);
  assert.equal(connected.status,"connected");
  schedule([connected]); await tick(); assert.equal(calls,1);
  time=120_001;
  schedule([connected]); await tick(); assert.equal(calls,2);
});
