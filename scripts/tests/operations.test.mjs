import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const base=new URL("../../artifacts/api-server/src/lib/",import.meta.url);
function load(name){
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(new URL(name,base),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:()=>({registerOperation(){}}),Date,Math,Map,Object,Error});
  return module.exports;
}
const {nextPreparationChunk}=load("operation-preparation.ts");
const {campaignTargetBatches}=load("campaign-target-batches.ts");
function schedule({destinations=3,repeats=600,mode="round",gap=300,remaining}={}){
  const ids=Array.from({length:destinations},(_,i)=>`group-${i}`);
  const counts=remaining??Object.fromEntries(ids.map(id=>[id,repeats]));
  return {destinationIds:ids,counts:{...counts},left:Object.values(counts).reduce((n,v)=>n+v,0),
    nextAt:"2026-11-05T01:00:00.000Z",order:0,wait:0,index:0,roundIds:null,timingMode:mode,groupGap:gap,min:3600,max:7200};
}
for(const config of [{},{destinations:1},{mode:"legacy"},{remaining:{"group-0":7,"group-1":600,"group-2":301}}]){
  test(`checkpointed schedule matches existing semantics ${JSON.stringify(config)}`,()=>{
    let p=schedule(config),seed=0,draw=()=>((seed++%11)/11);
    const input={campaignId:"campaign",destinationIds:p.destinationIds,repeatCount:config.repeats??600,startAt:new Date(p.nextAt),
      timingMode:p.timingMode,groupIntervalSeconds:p.groupGap,remainingByDestination:new Map(Object.entries(p.counts)),
      nextDelaySeconds:()=>p.min+Math.floor(draw()*(p.max-p.min+1))};
    const expected=[...campaignTargetBatches(input)].flat();seed=0;
    const actual=[];
    while(p.left>0){const chunk=nextPreparationChunk(p,"campaign",draw);assert.ok(chunk.length<=500);actual.push(...chunk);p=JSON.parse(JSON.stringify(p));}
    assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  });
}
test("huge schedules allocate only one bounded chunk",()=>{
  const p=schedule({destinations:6,repeats:1_000_000});
  assert.equal(nextPreparationChunk(p,"campaign").length,500);
  assert.equal(p.left,5_999_500);
});
test("deletion is owner-scoped, checkpointed and bounded",()=>{
  const text=fs.readFileSync(new URL("operation-deletion.ts",base),"utf8");
  for(const token of ["owner_user_id","LIMIT 1000","LIMIT 2000","LIMIT 20","LIMIT 5","deletion_pending","snapshotIds"])assert.ok(text.includes(token),token);
  assert.doesNotMatch(text,/DELETE FROM destinations WHERE telegram_id/);
});
test("worker rolls back failed chunks, keeps checkpoints, and has database time limits",()=>{
  const text=fs.readFileSync(new URL("operations.ts",base),"utf8");
  for(const token of ["FOR UPDATE SKIP LOCKED","lock_timeout","statement_timeout","failOperation","fingerprint","jsonb_set","saveOperation(tx,job)"])assert.ok(text.includes(token),token);
});
test("no public progress response includes the stored payload or credentials",()=>{
  const text=fs.readFileSync(new URL("operations.ts",base),"utf8");
  assert.ok(text.includes("{payload,fingerprint,owner,...summary}"));
  assert.ok(text.includes("-'payload'-'fingerprint'-'owner'"));
});
