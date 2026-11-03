import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { approvedSchemaChange, BASE_SCHEMA_SHA, ROUND_SCHEMA_SHA } from "../prepare-round-timing-schema.mjs";

const schemaPath="lib/db/src/schema/index.ts";
test("the exact three additive timing columns and partial index match the reviewed schema",()=>{
  const source=fs.readFileSync(new URL("../../lib/db/src/schema/index.ts",import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"),ROUND_SCHEMA_SHA);
  assert.ok(approvedSchemaChange(BASE_SCHEMA_SHA,ROUND_SCHEMA_SHA,[schemaPath]));
});
test("already upgraded schema is idempotent but no other database package change is allowed",()=>{
  assert.ok(approvedSchemaChange(ROUND_SCHEMA_SHA,ROUND_SCHEMA_SHA,[]));
  for(const paths of [["lib/db/package.json"],[schemaPath,"lib/db/src/index.ts"],[]])
    assert.equal(approvedSchemaChange(BASE_SCHEMA_SHA,ROUND_SCHEMA_SHA,paths),false);
  assert.equal(approvedSchemaChange("a".repeat(64),ROUND_SCHEMA_SHA,[schemaPath]),false);
  assert.equal(approvedSchemaChange(BASE_SCHEMA_SHA,"b".repeat(64),[schemaPath]),false);
});
test("deployment retains the schema safety gate and validates runtime before additive preparation",()=>{
  const source=fs.readFileSync(new URL("../deploy-telecampaign.sh",import.meta.url),"utf8");
  assert.ok(source.includes('release_git diff --quiet HEAD "$target" -- lib/db'));
  assert.ok(source.indexOf("--check-source")<source.indexOf("release_validate_prebuilt"));
  assert.ok(source.indexOf("release_validate_prebuilt")<source.indexOf('--apply "$ROOT" "$target"'));
  assert.ok(source.includes('backup_enabled="${TELECAMPAIGN_DEPLOY_BACKUP:-0}"'));
});
