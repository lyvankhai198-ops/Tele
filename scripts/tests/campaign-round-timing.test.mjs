import test from "node:test";
import assert from "node:assert/strict";
import { campaignTargetBatches, deliveryScheduleShiftMs } from "../../artifacts/api-server/src/lib/campaign-target-batches.ts";

const startAt = new Date("2026-11-03T08:00:00Z");
function schedule({groups=["A","B","C"], mode="round", gap=0, rounds=2, wait=3600, ...rest}={}) {
  return [...campaignTargetBatches({
    campaignId:"fixture",destinationIds:groups,repeatCount:rounds,startAt,
    nextDelaySeconds:typeof wait==="function"?wait:()=>wait,timingMode:mode,groupIntervalSeconds:gap,...rest,
  })].flat();
}
const minutes = rows => rows.map(row=>(row.nextAttemptAt-startAt)/60000);
test("one group waits between repeats and ignores a stale hidden group gap",()=>{
  assert.deepEqual(minutes(schedule({groups:["A"],gap:600,rounds:3})),[0,60,120]);
});
test("zero group gap schedules all groups in the same round",()=>{
  const rows=schedule();
  assert.deepEqual(minutes(rows),[0,0,0,60,60,60]);
  assert.deepEqual(rows.map(row=>row.waitBeforeSeconds),[0,0,0,3600,0,0]);
  assert.deepEqual(rows.map(row=>row.deliveryOrder),[0,1,2,3,4,5]);
});
for(const gap of [300,600])test(`group gap ${gap/60} minutes is independent of a full hour after round completion`,()=>{
  const m=gap/60;
  assert.deepEqual(minutes(schedule({gap})),[0,m,2*m,2*m+60,3*m+60,4*m+60]);
});
test("random round delay is sampled once per boundary, never between groups",()=>{
  let calls=0;
  const rows=schedule({rounds:3,gap:300,wait:()=>{calls++;return calls===1?10800:18000;}});
  assert.equal(calls,2);
  assert.deepEqual(minutes(rows),[0,5,10,190,195,200,500,505,510]);
});
test("legacy schedules and the absence of new metadata are preserved",()=>{
  const rows=schedule({mode:"legacy",gap:300});
  assert.deepEqual(minutes(rows),[0,60,120,180,240,300]);
  assert.ok(rows.every(row=>row.deliveryOrder===undefined&&row.waitBeforeSeconds===undefined));
});
test("editing preserves differing remaining delivery counts without recreating sent deliveries",()=>{
  const rows=schedule({gap:300,rounds:3,remainingByDestination:new Map([["A",1],["B",2],["C",0]])});
  assert.deepEqual(rows.map(row=>row.destinationId),["A","B","B"]);
  assert.deepEqual(minutes(rows),[0,5,65]);
});
test("batch boundaries retain full order and count without imposing a five-group cap",()=>{
  const rows=schedule({groups:["A","B","C","D","E","F"],rounds:300});
  assert.equal(rows.length,1800);
  assert.equal(rows[500].deliveryOrder,500);
  assert.deepEqual(minutes(rows.slice(498,504)),[83*60,83*60,83*60,83*60,83*60,83*60]);
});
test("late actual completion shifts future work without shortening the selected wait",()=>{
  assert.equal(deliveryScheduleShiftMs(new Date("2026-11-03T09:10:00Z"),new Date("2026-11-03T08:12:00Z"),3600),120000);
  assert.equal(deliveryScheduleShiftMs(new Date("2026-11-03T09:10:00Z"),new Date("2026-11-03T08:09:00Z"),3600),0);
});
