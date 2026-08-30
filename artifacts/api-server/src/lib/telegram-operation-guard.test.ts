import assert from "node:assert/strict";
import { runTelegramAccountSyncOnce } from "./telegram-operation-guard";

async function testConcurrentSyncsShareOneOperation() {
  let calls = 0;
  let release!: (value: number) => void;
  const operation = () => {
    calls += 1;
    return new Promise<number>((resolve) => { release = resolve; });
  };

  const first = runTelegramAccountSyncOnce("account-a", operation);
  const second = runTelegramAccountSyncOnce("account-a", operation);
  assert.equal(first, second);
  assert.equal(calls, 1);
  release(12);
  assert.deepEqual(await Promise.all([first, second]), [12, 12]);
}

async function testFailedSyncReleasesTheAccount() {
  await assert.rejects(
    runTelegramAccountSyncOnce("account-b", async () => { throw new Error("sync failed"); }),
    /sync failed/,
  );
  const result = await runTelegramAccountSyncOnce("account-b", async () => 7);
  assert.equal(result, 7);
}

async function testDifferentAccountsDoNotBlockEachOther() {
  const results = await Promise.all([
    runTelegramAccountSyncOnce("account-c", async () => 1),
    runTelegramAccountSyncOnce("account-d", async () => 2),
  ]);
  assert.deepEqual(results, [1, 2]);
}

await testConcurrentSyncsShareOneOperation();
await testFailedSyncReleasesTheAccount();
await testDifferentAccountsDoNotBlockEachOther();
console.log("Telegram account sync single-flight checks passed.");