import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {createRequire} from "node:module";
const dependencies=createRequire(new URL("../../artifacts/telecampaign/package.json",import.meta.url));
const {QueryClient,QueryObserver}=dependencies("@tanstack/react-query");
function compile(file,imports){
  const context={exports:{},require:name=>{if(!(name in imports))throw Error("Unexpected module "+name);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,context);return context.exports;
}
const api={getListCampaignsQueryKey:()=>["/api/campaigns"]};
const entities=compile("../../artifacts/telecampaign/src/lib/campaign-cache-entities.ts",{"@workspace/api-client-react":api});
const loader=compile("../../artifacts/telecampaign/src/lib/load-complete-campaigns.ts",{"@workspace/api-client-react":api});
const queries=compile("../../artifacts/telecampaign/src/lib/campaign-load-query.ts",{"@workspace/api-client-react":api,"./load-complete-campaigns":loader,"./campaign-cache-entities":entities});
const sync=compile("../../artifacts/telecampaign/src/lib/reconcile-campaign-deletions.ts",{"@workspace/api-client-react":api,"./campaign-load-query":queries,"./load-complete-campaigns":loader,"./campaign-cache-entities":entities});
const row=(id,account="a",status="queued")=>({id,telegramAccountId:account,status,createdAt:"2026-01-01T00:00:00Z"});
const client=()=>new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false}}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test("selected account is passed to every initial-load and manual-refresh request",async()=>{
  const calls=[];api.getCampaignLoadManifest=async params=>{calls.push(["manifest",params?.telegramAccountId]);return{campaignIds:["one"],total:1,revisions:{one:"v1"}};};
  api.getCampaignLoadBatch=async params=>{calls.push(["batch",params.telegramAccountId]);return{campaigns:[row("one")],missingIds:[]};};
  const c=client(),options=queries.completeCampaignQuery(c,"owner:self","a");
  await c.fetchQuery(options);
  const observer=new QueryObserver(c,options),stop=observer.subscribe(()=>{});
  await c.invalidateQueries({queryKey:api.getListCampaignsQueryKey()});
  await tick();
  assert.equal(calls.length,2);
  await queries.refreshCompleteCampaigns(c,"owner:self",()=>observer.refetch(),"a");
  assert.deepEqual(calls,[["manifest","a"],["batch","a"],["manifest","a"],["batch","a"]]);
  stop();c.clear();
});
test("revision synchronization reads only the changed campaign in the selected account",async()=>{
  const c=client(),scope="owner:self",a=queries.completeCampaignKey(scope,"a"),b=queries.completeCampaignKey(scope,"b");
  const untouched=[row("other","b")];
  c.setQueryData(a,[row("one"),row("two")]);c.setQueryData(b,untouched);
  c.setQueryData(queries.campaignRevisionKey(scope,"a"),{one:"v1",two:"v1"});
  const requests=[];
  await sync.reconcileCampaignDeletions(c,scope,()=>true,{
    manifest:async params=>{assert.equal(params.telegramAccountId,"a");return{campaignIds:["one","two"],total:2,revisions:{one:"v2",two:"v1"}};},
    batch:async params=>{requests.push(params);return{campaigns:[row("one","a","paused")],missingIds:[]};},
  },"a");
  assert.equal(requests.length,1);assert.equal(requests[0].ids,"one");assert.equal(requests[0].telegramAccountId,"a");
  assert.equal(c.getQueryData(a)[0].status,"paused");assert.equal(c.getQueryData(b),untouched);
  let reads=0;
  await sync.reconcileCampaignDeletions(c,scope,()=>true,{
    manifest:async()=>({campaignIds:["one","two"],total:2,revisions:{one:"v2",two:"v1"}}),
    batch:async()=>{reads++;throw Error("UNCHANGED_SUMMARIES_MUST_NOT_LOAD");},
  },"a");
  assert.equal(reads,0);c.clear();
});
test("creating or editing one campaign patches complete matching caches without any reload",()=>{
  const c=client(),scope="owner:self";
  const all=queries.completeCampaignKey(scope),a=queries.completeCampaignKey(scope,"a"),b=queries.completeCampaignKey(scope,"b");
  c.setQueryData(all,[row("old","b")]);c.setQueryData(a,[]);c.setQueryData(b,[row("old","b")]);
  const before=c.getQueryData(b);
  entities.patchCampaignCaches(c,scope,[row("new")]);
  assert.equal(c.getQueryData(all).length,2);assert.equal(c.getQueryData(a).length,1);
  assert.deepEqual(c.getQueryData(b),before);
  entities.patchCampaignCaches(c,scope,[row("new","a","paused")]);
  assert.equal(c.getQueryData(a).length,1);assert.equal(c.getQueryData(a)[0].status,"paused");
  assert.notDeepEqual(queries.completeCampaignKey(scope,"a"),queries.completeCampaignKey("owner:customer","a"));
  c.clear();
});
test("account seeds inherit stale-source freshness without restarting a full load",async()=>{
  const c=client(),scope="owner:self";
  c.setQueryData(queries.completeCampaignKey(scope),[row("one"),row("other","b")]);
  await c.invalidateQueries({queryKey:queries.completeCampaignKey(scope),exact:true,refetchType:"none"});
  const options=queries.completeCampaignQuery(c,scope,"a");
  const observer=new QueryObserver(c,options),stop=observer.subscribe(()=>{});
  assert.equal(observer.getCurrentResult().data.length,1);
  assert.equal(c.getQueryState(options.queryKey).dataUpdatedAt,0);
  assert.equal(observer.getCurrentResult().isFetching,false);
  stop();c.clear();
});
test("a creation response during the first load is retained when its older manifest finishes",async()=>{
  const c=client(),gate=deferred(),scope="owner:self";
  api.getCampaignLoadManifest=async()=>({campaignIds:["old"],total:1,revisions:{old:"v1"}});
  api.getCampaignLoadBatch=async()=>{await gate.promise;return{campaigns:[row("old")],missingIds:[]};};
  const options=queries.completeCampaignQuery(c,scope,"a"),pending=c.fetchQuery(options);
  await tick();entities.patchCampaignCaches(c,scope,[row("new")]);
  assert.equal(c.getQueryData(options.queryKey),undefined);
  gate.resolve();await pending;
  assert.equal(c.getQueryData(options.queryKey).length,2);
  c.clear();
});
test("actual campaign submit prevents duplicates while posting and while its progress popup remains open",async()=>{
  const file=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/campaign-form-modal.tsx",import.meta.url),"utf8");
  const source=ts.createSourceFile("form.tsx",file,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let node;function find(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==="submit")node=n;else ts.forEachChild(n,find);}find(source);
  const post=deferred(),busy=[];let count=0,savedCalls=0;
  const context={submitLock:{current:false},createdCampaign:null,setCreatedCampaign:value=>{context.createdCampaign=value;},
    setSubmitting:value=>busy.push(value),setFormError:()=>{},
    form:{name:"fixture",accountId:"a",templateId:"t",destinationIds:["d"],repeatCount:"300",roundDelayMinSeconds:"3600",roundDelayMaxSeconds:"3600",groupIntervalMinutes:"0",scheduleDate:""},
    language:"en",c:{},suggestedScheduleAt:null,scheduleMeetsRestrictionSuggestion:()=>true,editingCampaign:null,
    createCampaign:{mutateAsync:()=>{count++;return post.promise;}},selectedTemplate:{content:"fixture"},
    systemDefaults:{data:{defaultTimezone:"UTC"}},campaigns:{upsert:()=>{}},onSaved:()=>{savedCalls++;},
    localizedErrorMessage:()=>"",Intl,Date};
  vm.runInNewContext(ts.transpileModule(node.getText(source)+";globalThis.run=submit;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const first=context.run({preventDefault(){}});await context.run({preventDefault(){}});
  assert.equal(count,1);assert.equal(context.submitLock.current,true);assert.deepEqual(busy,[true]);
  post.resolve(row("created"));await first;
  assert.equal(context.createdCampaign.id,"created");
  assert.equal(savedCalls,0,"receiving the campaign must not close its progress popup");
  await context.run({preventDefault(){}});assert.equal(count,1);
  assert.equal(context.submitLock.current,false);assert.deepEqual(busy,[true,false]);
});
