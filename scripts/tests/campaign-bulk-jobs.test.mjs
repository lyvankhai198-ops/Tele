import test from "node:test";
import assert from "node:assert/strict";
import { campaignTargetBatches } from "../../artifacts/api-server/src/lib/campaign-target-batches.ts";
import { campaignBulkError } from "../../artifacts/telecampaign/src/lib/campaign-bulk-error.ts";

test("900 deliveries retain order and exact original schedule across insert chunks", () => {
  const startAt = new Date("2026-11-02T12:00:00Z");
  const chunks = [...campaignTargetBatches({campaignId:"new",destinationIds:["a","b","c"],
    repeatCount:300,startAt,nextDelaySeconds:()=>3})];
  assert.deepEqual(chunks.map(chunk=>chunk.length),[500,400]);
  const rows=chunks.flat();
  rows.forEach((row,index)=>{
    assert.equal(row.campaignId,"new"); assert.equal(row.destinationId,["a","b","c"][index%3]);
    assert.equal(row.nextAttemptAt.getTime(),startAt.getTime()+index*3000);
    assert.equal(row.status,"pending"); assert.equal(row.lastError,null);
  });
});
test("Pro repeats are not capped at 300 and huge repeats are generated lazily", () => {
  const input={campaignId:"new",destinationIds:["a"],startAt:new Date(),nextDelaySeconds:()=>0};
  assert.equal([...campaignTargetBatches({...input,repeatCount:1000})].flat().length,1000);
  const iterator=campaignTargetBatches({...input,repeatCount:1_000_000_000});
  assert.equal(iterator.next().value.length,500);
  iterator.return();
});
test("no targets are created for an empty destination list",()=>{
  assert.deepEqual([...campaignTargetBatches({campaignId:"new",destinationIds:[],repeatCount:300,
    startAt:new Date(),nextDelaySeconds:()=>0})],[]);
});
for (const language of ["vi","en"]) {
  test(`proxy HTML and internal errors are never shown in ${language} bulk feedback`,()=>{
    for (const error of [new Error("<html><head>504 Gateway Time-out</head></html>"),
      new Error("SELECT private_database_customer"), new Error("Failed to fetch")]) {
      const message=campaignBulkError(error,language);
      assert.ok(message.length>30); assert.doesNotMatch(message,/<html|SELECT|private_database_customer/);
    }
  });
}
