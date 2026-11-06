import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const hook=fs.readFileSync(new URL("../../artifacts/telecampaign/src/lib/use-template-job.ts",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/campaigns.tsx",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../../artifacts/api-server/src/lib/campaign-template-jobs.ts",import.meta.url),"utf8");
function harness(storage=new Map()){
  let states=[],refs=[],cursor=0,rc=0,effects=[],written=[],calls=[],finished=0;
  let answer={id:"accepted",status:"running",createdAt:"2026-11-04T00:00:00Z",skipped:[]};
  const context={
    exports:{},require(name){return name==="react"?{
      useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=typeof v==="function"?v(states[i]):v;}];},
      useRef(value){const i=rc++;return refs[i]??=( {current:value});},
      useEffect(fn){effects.push(fn);},
    }:name==="./campaign-completion-receipt"?receiptModule:{
      async bulkUpdateCampaignTemplate(input){calls.push(input);assert.ok(storage.has("telecamp-template-job:owner"));if(answer instanceof Error)throw answer;return answer;},
      async getCampaignTemplateJob(){return answer;},async getLatestCampaignTemplateJob(){return answer;},async retryCampaignTemplateJob(){return answer;},
    };},
    localStorage:{getItem:k=>storage.get(k)??null,setItem(k,v){storage.set(k,v);written.push(JSON.parse(v));},removeItem:k=>storage.delete(k)},
    crypto:{randomUUID:()=> "11111111-1111-4111-8111-111111111111"},
    setInterval:()=>1,clearInterval(){},
  };
  const receiptContext={exports:{},localStorage:context.localStorage};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../../artifacts/telecampaign/src/lib/campaign-completion-receipt.ts",import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,receiptContext);
  const receiptModule=receiptContext.exports;
  vm.runInNewContext(ts.transpileModule(hook,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  function render(){cursor=0;rc=0;effects=[];return context.exports.useTemplateJob("owner",true,()=>{finished++;});}
  return {render,calls,written,states,storage,answer:v=>{answer=v;},finished:()=>finished,effects:()=>effects};
}
test("completed template jobs restored on remount do not repeatedly refresh the campaign list",async()=>{
  const storage=new Map(),done={id:"done-before-navigation",status:"completed",processed:20,updatedCount:20,finishedAt:"2026-11-04T00:00:00Z",createdAt:"2026-11-03T00:00:00Z"};
  const first=harness(storage);first.answer(done);await first.render().start("template","");
  assert.equal(first.finished(),1);
  const back=harness(storage);back.answer(done);back.render();back.effects()[0]();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(back.finished(),0);assert.equal(back.render().job.id,done.id);
  back.answer({...done,id:"a-real-new-completion"});await back.render().start("template","");
  assert.equal(back.finished(),1);
});
test("rerun completion receipts survive navigation and distinguish a retried job with new progress",()=>{
  const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/lib/campaign-completion-receipt.ts",import.meta.url),"utf8");
  const storage=new Map(),context={exports:{},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
  const {claimCampaignCompletion:claim,wasCampaignCompletionHandled:seen}=context.exports;
  const job={id:"rerun",status:"failed",processed:5,updatedCount:3};
  assert.equal(claim("owner","rerun",job),true);
  assert.equal(seen("owner","rerun",job),true);assert.equal(claim("owner","rerun",job),false);
  assert.equal(claim("owner","rerun",{...job,processed:10,updatedCount:8}),true);
  assert.equal(claim("other-owner","rerun",job),true);
  assert.equal(claim("owner","template",job),true);
  assert.equal(claim("owner","rerun",{...job,status:"running"}),false);
  assert.match(page,/if\(!wasCampaignCompletionHandled\(bulkStorageKey,"rerun",job\)\)setBulkResumeOpen\(true\)/);
  assert.match(page,/if \(claimCampaignCompletion\(bulkStorageKey,"rerun",next\)\)/);
});
test("actual hook saves chosen inputs and id before sending; lost response recovers the same request",async()=>{
  const h=harness();h.answer(new Error("network"));await h.render().start("template","account",["selected-1","selected-2"]);
  assert.equal(h.render().uncertain,true);
  assert.equal(h.written[0].input.telegramAccountId,"account");
  assert.deepEqual(Array.from(h.written[0].input.campaignIds),["selected-1","selected-2"]);
  h.answer({id:"11111111-1111-4111-8111-111111111111",status:"running"});
  await h.render().recover();
  assert.equal(h.calls.length,2);
  assert.deepEqual(h.calls[0],h.calls[1]);
  assert.equal(h.render().uncertain,false);assert.equal(h.render().blocked,true);
});
test("actual hook retains failed operation for retry and does not erase its identity",async()=>{
  const h=harness();h.answer({id:"failed",status:"failed"});await h.render().start("template","");
  assert.equal(h.render().blocked,true);h.render().clear();assert.equal(h.render().job.id,"failed");
  h.answer({id:"failed",status:"completed"});await h.render().retry();
  assert.equal(h.render().blocked,false);assert.equal(h.finished(),2);
  h.render().clear();assert.equal(h.render().job,null);
});
test("a definite rejected input is not treated as an unknown accepted operation",async()=>{
  const h=harness();h.answer(Object.assign(new Error("missing"),{status:404}));
  await h.render().start("template","account");
  assert.equal(h.render().uncertain,false);assert.equal(h.render().problem,true);
  assert.equal(h.storage.size,0);
});
test("progress can be reopened during processing and closed without cancelling the server task",()=>{
  const workspace=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/campaigns/CampaignsWorkspaceView.tsx",import.meta.url),"utf8");
  assert.match(page,/onTemplate=\{openBulkTemplate\}/);
  assert.match(page,/hasTemplateJob=\{Boolean\(templateProgress\.job\)\} templateUncertain=\{templateProgress\.uncertain\}/);
  assert.match(workspace,/onClick=\{p\.onTemplate\}[\s\S]*?disabled=\{\(!p\.hasTemplateJob && !p\.templateUncertain && p\.dataBlocked\)/);
  assert.match(page,/onClose=\{\(\) => setBulkTemplateOpen\(false\)\}/);
  assert.match(page,/CampaignTemplateProgress/);
  assert.match(hook,/getLatestCampaignTemplateJob/);
});
test("worker is durable and atomic, and never changes shared defaults",()=>{
  assert.match(worker,/FOR UPDATE SKIP LOCKED/);
  assert.match(worker,/SET LOCAL statement_timeout/);
  assert.match(worker,/await processCampaign\(tx,job,id\)/);
  assert.match(worker,/await save\(tx,job\)/);
  assert.doesNotMatch(worker,/jsonb_set|SYSTEM_SETTINGS_KEY|postJoinCampaign/);
  assert.doesNotMatch(worker,/api\.telegram\.org|sendMessage|updateSystemSettings\(/);
});
test("selected IDs are bound to the owner/account and the legacy prefix rule is absent",()=>{
  assert.match(worker,/id=ANY\(\$3::uuid\[\]\)/);
  assert.match(worker,/candidates\.rows\.length!==selectedIds\.length/);
  assert.doesNotMatch(worker,/WHERE id=\$1 AND role='admin'/);
  assert.doesNotMatch(worker,/name LIKE|name\.startsWith|updateGlobalDefault/);
  assert.match(worker,/defaultStatus:"not_applicable"/);
  assert.match(worker,/campaign\.pause_reason==="deletion_pending"/);
});
