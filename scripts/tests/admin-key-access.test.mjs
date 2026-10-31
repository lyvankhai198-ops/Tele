import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { licenseKeyHash } from "../../artifacts/api-server/src/lib/license-key-identity.ts";

const source = fs.readFileSync(new URL("../../artifacts/api-server/src/lib/subscriptions.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function revealAdminLicenseKey(");
const end = source.indexOf("\nfunction generateLicenseKey(", start);
assert.ok(start >= 0 && end > start);
const compiled = stripTypeScriptTypes(source.slice(start, end).replace("export async function", "async function"), {
  mode: "strip",
}) + "\nexports.revealAdminLicenseKey = revealAdminLicenseKey;";

function reader(record, decrypt = () => "TC-FIXTURE-ORIGINAL") {
  let decryptCalls = 0;
  const context = {
    exports: {},
    licenseKeysTable: { id: "id", keyEncrypted: "encrypted", keyHash: "hash" },
    eq: () => true,
    db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => record ? [record] : [] }) }) }) },
    decryptSecret: value => { decryptCalls++; return decrypt(value); },
    licenseKeyHash,
  };
  vm.runInNewContext(compiled, context);
  return { reveal: context.exports.revealAdminLicenseKey, decryptCalls: () => decryptCalls };
}

test("reveals only the original plaintext matching this key's activation hash", async () => {
  const r = reader({ keyEncrypted: "fixture-cipher", keyHash: licenseKeyHash("TC-FIXTURE-ORIGINAL") });
  const result = await r.reveal("fixture-record");
  assert.equal(result.ok, true);
  assert.equal(result.licenseKey, "TC-FIXTURE-ORIGINAL");
  assert.equal(r.decryptCalls(), 1);
});
test("a decryptable but mismatched stored key is never returned", async () => {
  const r = reader({ keyEncrypted: "fixture-cipher", keyHash: licenseKeyHash("ANOTHER-KEY") });
  const result = await r.reveal("fixture-record");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unavailable");
  assert.equal("licenseKey" in result, false);
});
test("legacy records without ciphertext remain unavailable and are not regenerated", async () => {
  const r = reader({ keyEncrypted: null, keyHash: licenseKeyHash("HISTORICAL") });
  const result = await r.reveal("fixture-record");
  assert.equal(result.reason, "unavailable");
  assert.equal(r.decryptCalls(), 0);
});
test("missing records are not found without attempting decryption", async () => {
  const r = reader(null);
  assert.equal((await r.reveal("missing")).reason, "not_found");
  assert.equal(r.decryptCalls(), 0);
});
test("corrupt or unreadable ciphertext gives a generic unavailable result", async () => {
  const r = reader({ keyEncrypted: "bad", keyHash: "fixture" }, () => { throw Error("private cryptographic detail"); });
  const result = await r.reveal("fixture-record");
  assert.equal(result.reason, "unavailable");
  assert.equal(JSON.stringify(result).includes("private"), false);
});
test("secret no-store middleware runs before authorization and never writes license ownership", () => {
  const routes = fs.readFileSync(new URL("../../artifacts/api-server/src/routes/admin.ts", import.meta.url), "utf8");
  const middleware = routes.indexOf('router.use("/admin/license-keys/:licenseKeyId/secret"');
  assert.ok(middleware >= 0 && middleware < routes.indexOf('router.use("/admin", requireAdmin)'));
  assert.match(routes.slice(middleware, routes.indexOf('router.use("/admin", requireAdmin)')), /private, no-store/);
  assert.doesNotMatch(source.slice(start, end), /\.update\(|\.insert\(|generateLicenseKey\(/);
});
