import test from "node:test";
import "./campaign-deletion-cache.test.mjs";
import "./campaign-scoped-cache.test.mjs";
import "./campaign-skipped-cleanup.test.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {createRequire} from "node:module";

const dependencies=createRequire(new URL("../../artifacts/telecampaign/package.json",import.meta.url));
const {QueryClient,QueryObserver}=dependencies("@tanstack/react-query");
function compile(path,imports){
  const context={exports:{},require:name=>{if(!(name in imports))throw Error("Unexpected module "+name);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,context);
  return context.exports;
}
const api={getListCampaignsQueryKey:()=>["/api/campaigns"]};
const loader=compile("../../artifacts/telecampaign/src/lib/load-complete-campaigns.ts",{"@workspace/api-client-react":api});
const entities=compile("../../artifacts/telecampaign/src/lib/campaign-cache-entities.ts",{"@workspace/api-client-react":api});
const queryModule=compile("../../artifacts/telecampaign/src/lib/campaign-load-query.ts",{
  "@workspace/api-client-react":api,"./load-complete-campaigns":loader,"./campaign-cache-entities":entities,
});
const reconciliation=compile("../../artifacts/telecampaign/src/lib/reconcile-campaign-deletions.ts",{
  "@workspace/api-client-react":api,"./campaign-load-query":queryModule,"./load-complete-campaigns":loader,"./campaign-cache-entities":entities,
});
const ids=Array.from({length:60},(_,i)=>`campaign-${i}`);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function fakeApi(){
  const calls=[],gate=deferred();
  return{calls,gate,manifest:async()=>({campaignIds:ids,total:ids.length}),batch:async({ids:csv})=>{
    const selected=csv.split(",");calls.push(selected);
    if(calls.length===2)await gate.promise;
    return{campaigns:selected.map(id=>({id,name:id})),missingIds:[]};
  }};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test("real loader reports received summaries only and resolves no partial dataset",async()=>{
  const fake=fakeApi(),states=[];let settled=false;
  const task=loader.loadCompleteCampaigns(p=>states.push(p),()=>true,fake).then(value=>{settled=true;return value;});
  await tick();
  assert.equal(states.at(-1).loaded,25);assert.equal(states.at(-1).total,60);
  assert.equal(settled,false);assert.equal(fake.calls.length,2);
  fake.gate.resolve();
  const result=await task;
  assert.equal(result.length,60);assert.deepEqual(Array.from(result,x=>x.id),ids);
  assert.deepEqual(Array.from(states,x=>x.loaded),[0,0,25,50,60,60]);
});
test("deleted/unavailable records reduce total; new records cannot enter the fixed manifest",async()=>{
  const seen=[];
  const result=await loader.loadCompleteCampaigns(p=>seen.push(p),()=>true,{
    manifest:async()=>({campaignIds:ids.slice(0,3),total:3}),
    batch:async()=>({campaigns:[{id:ids[2]},{id:ids[0]}],missingIds:[ids[1]]}),
  });
  assert.deepEqual(Array.from(result,x=>x.id),[ids[0],ids[2]]);
  assert.equal(seen.at(-1).loaded,2);assert.equal(seen.at(-1).total,2);
});
test("errors, malformed batches and duplicate manifests reject rather than returning partial data",async()=>{
  const fake=fakeApi(),states=[];const pending=loader.loadCompleteCampaigns(p=>states.push(p),()=>true,fake);
  await tick();fake.gate.reject(new Error("network"));
  await assert.rejects(pending,/network/);assert.equal(states.at(-1).phase,"error");
  assert.equal(states.at(-1).loaded,25);
  await assert.rejects(loader.loadCompleteCampaigns(()=>{},()=>true,{
    manifest:async()=>({campaignIds:["same","same"],total:2}),
  }),/INVALID_MANIFEST/);
  await assert.rejects(loader.loadCompleteCampaigns(()=>{},()=>true,{
    manifest:async()=>({campaignIds:["one"],total:1}),
    batch:async()=>({campaigns:[],missingIds:[]}),
  }),/INCOMPLETE_BATCH/);
});
function configureFake(fake){
  api.getCampaignLoadManifest=fake.manifest;api.getCampaignLoadBatch=fake.batch;
}
test("actual TanStack observer navigation keeps loading in background and commits all rows once",async()=>{
  const fake=fakeApi();configureFake(fake);
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
  const options={...queryModule.completeCampaignQuery(client,"owner:self"),gcTime:Infinity};
  const observer=new QueryObserver(client,options),unsubscribe=observer.subscribe(()=>{});
  await tick();
  assert.equal(client.getQueryData(queryModule.campaignProgressKey("owner:self")).loaded,25);
  assert.equal(client.getQueryData(options.queryKey),undefined);
  unsubscribe(); // navigating away must not abort this request
  fake.gate.resolve();await tick();await tick();
  assert.equal(client.getQueryData(options.queryKey).length,60);
  const back=new QueryObserver(client,options),stop=back.subscribe(()=>{});
  assert.equal(back.getCurrentResult().data.length,60);assert.equal(fake.calls.length,3);
  stop();client.clear();
});
test("cached list is replaced only after completion and survives a failed reload",async()=>{
  const fake=fakeApi();configureFake(fake);
  const client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}}),options={...queryModule.completeCampaignQuery(client,"owner:self"),gcTime:Infinity};
  const previous=[{id:"old-complete"}];client.setQueryData(options.queryKey,previous);
  const loading=client.fetchQuery({...options,staleTime:0});
  await tick();assert.equal(client.getQueryData(options.queryKey),previous);
  fake.gate.reject(new Error("temporary"));
  await assert.rejects(loading,/temporary/);
  assert.equal(client.getQueryData(options.queryKey),previous);
  client.clear();
});
test("stale cached data survives remount, focus and reconnect without restarting the counted load",async()=>{
  let calls=0;
  api.getCampaignLoadManifest=async()=>{calls++;return{campaignIds:["fresh"],total:1};};
  api.getCampaignLoadBatch=async()=>({campaigns:[{id:"fresh"}],missingIds:[]});
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
  const options={...queryModule.completeCampaignQuery(client,"owner:self"),gcTime:Infinity};
  const old=[{id:"already-complete"}];
  client.setQueryData(options.queryKey,old,{updatedAt:Date.now()-5*60_000});
  const observer=new QueryObserver(client,options),stop=observer.subscribe(()=>{});
  await tick();
  assert.equal(observer.getCurrentResult().data,old);
  assert.equal(observer.getCurrentResult().isFetching,false);
  assert.equal(calls,0);
  const query=client.getQueryCache().find({queryKey:options.queryKey,exact:true});
  assert.equal(query.isStaleByTime(options.staleTime),false);
  assert.equal(observer.shouldFetchOnWindowFocus(),false);
  assert.equal(observer.shouldFetchOnReconnect(),false);
  stop();
  const back=new QueryObserver(client,options),stopBack=back.subscribe(()=>{});
  await tick();assert.equal(calls,0);assert.equal(back.getCurrentResult().data,old);
  const reloaded=await queryModule.refreshCompleteCampaigns(client,"owner:self",()=>back.refetch());
  assert.equal(calls,1);assert.equal(reloaded.data[0].id,"fresh");
  stopBack();client.clear();
});
test("prefix invalidation does not restart a full load; delta reconciliation updates the cached list",async()=>{
  let calls=0;
  api.getCampaignLoadManifest=async()=>{calls++;return{campaignIds:["created-while-away"],total:1};};
  api.getCampaignLoadBatch=async()=>({campaigns:[{id:"created-while-away"}],missingIds:[]});
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
  const options={...queryModule.completeCampaignQuery(client,"owner:self"),gcTime:Infinity};
  client.setQueryData(options.queryKey,[{id:"before-mutation"}],{updatedAt:Date.now()-60_000});
  await client.invalidateQueries({queryKey:api.getListCampaignsQueryKey()});
  assert.equal(calls,0);
  const observer=new QueryObserver(client,options),stop=observer.subscribe(()=>{});
  await tick();await tick();
  assert.equal(calls,0);assert.equal(observer.getCurrentResult().data[0].id,"before-mutation");
  await reconciliation.reconcileCampaignDeletions(client,"owner:self");
  assert.equal(calls,1);assert.equal(observer.getCurrentResult().data[0].id,"created-while-away");
  stop();client.clear();
});
test("logout/cache clear prevents later requests and cannot repopulate another user's cache",async()=>{
  const fake=fakeApi();configureFake(fake);
  const client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}}),options={...queryModule.completeCampaignQuery(client,"first:self"),gcTime:Infinity};
  const loading=client.fetchQuery(options).catch(()=>null);
  await tick();client.clear();fake.gate.resolve();await loading;await tick();
  assert.equal(fake.calls.length,2);
  assert.equal(client.getQueryData(options.queryKey),undefined);
  assert.equal(client.getQueryData(queryModule.campaignProgressKey("first:self")),undefined);
  assert.notDeepEqual(options.queryKey,queryModule.completeCampaignQuery(client,"second:self").queryKey);
  assert.notDeepEqual(options.queryKey,queryModule.completeCampaignQuery(client,"first:customer").queryKey);
});
test("existing campaign prefix invalidation includes the atomic full-list query",async()=>{
  const client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}}),options={...queryModule.completeCampaignQuery(client,"owner:self"),gcTime:Infinity};
  client.setQueryData(options.queryKey,[]);
  await client.invalidateQueries({queryKey:api.getListCampaignsQueryKey(),refetchType:"none"});
  assert.equal(client.getQueryCache().find({queryKey:options.queryKey,exact:true}).state.isInvalidated,true);
  client.clear();
});
test("explicit refresh during the first load includes new campaigns and supersedes the old staging run",async()=>{
  const fake=fakeApi();configureFake(fake);
  const client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}});
  const options={...queryModule.completeCampaignQuery(client,"owner:self"),gcTime:Infinity};
  const first=client.fetchQuery(options).catch(()=>null);
  await tick();assert.equal(fake.calls.length,2);
  api.getCampaignLoadManifest=async()=>({campaignIds:[...ids,"newly-created"],total:61});
  const fresh=await queryModule.refreshCompleteCampaigns(client,"owner:self",()=>client.fetchQuery(options));
  assert.equal(fresh.length,61);assert.equal(fresh.at(-1).id,"newly-created");
  fake.gate.resolve();await first;await tick();
  assert.equal(client.getQueryData(options.queryKey).length,61);
  assert.equal(client.getQueryData(queryModule.campaignProgressKey("owner:self")).loaded,61);
  client.clear();
});
