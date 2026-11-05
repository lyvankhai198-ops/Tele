import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {createRequire} from "node:module";
const dependencies=createRequire(new URL("../../artifacts/telecampaign/package.json",import.meta.url));
const {QueryClient,QueryObserver}=dependencies("@tanstack/react-query");
function compile(file,imports,jsx=false,extra={}){
  const context={exports:{},...extra,require:name=>{if(!(name in imports))throw Error("Unexpected module "+name);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:jsx?ts.JsxEmit.React:undefined,jsxFactory:"h",
  }}).outputText,context);return context.exports;
}
const api={getListCampaignsQueryKey:()=>["/api/campaigns"]};
const loader=compile("../../artifacts/telecampaign/src/lib/load-complete-campaigns.ts",{"@workspace/api-client-react":api});
const entities=compile("../../artifacts/telecampaign/src/lib/campaign-cache-entities.ts",{"@workspace/api-client-react":api});
const queries=compile("../../artifacts/telecampaign/src/lib/campaign-load-query.ts",{"@workspace/api-client-react":api,"./load-complete-campaigns":loader,"./campaign-cache-entities":entities});
const sync=compile("../../artifacts/telecampaign/src/lib/reconcile-campaign-deletions.ts",{
  "@workspace/api-client-react":api,"./campaign-load-query":queries,"./load-complete-campaigns":loader,"./campaign-cache-entities":entities,
});
const scope="owner:self",key=queries.completeCampaignKey(scope),progress=queries.campaignProgressKey(scope);
const rows=Array.from({length:1133},(_,i)=>({id:`campaign-${i}`,name:`Campaign ${i}`,status:"completed"}));
const manifest=ids=>({campaignIds:ids,total:ids.length});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(r=>setTimeout(r,0));
function cached(){
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
  client.setQueryData(key,rows,{updatedAt:12345});
  client.setQueryData(progress,{loaded:1133,total:1133,phase:"complete",run:9});
  return client;
}
test("single/bulk confirmed deletions reuse 1,133 cached summaries, never reload, retain row contents and timestamp",async()=>{
  for(const removed of [1,400]){
    const client=cached(),gate=deferred(),states=[],options={...queries.completeCampaignQuery(client,scope),gcTime:Infinity};
    const observer=new QueryObserver(client,options),stop=observer.subscribe(r=>states.push(r.isFetching));
    let batches=0;
    const task=sync.reconcileCampaignDeletions(client,scope,()=>true,{manifest:()=>gate.promise,batch:async()=>{batches++;throw Error("SHOULD_NOT_FETCH");}});
    assert.equal(client.getQueryData(key),rows); // acceptance is not deletion proof
    gate.resolve(manifest(rows.slice(removed).map(r=>r.id)));await task;
    const next=client.getQueryData(key);assert.equal(next.length,1133-removed);
    assert.deepEqual(next[0],rows[removed]);assert.equal(batches,0);assert.equal(states.some(Boolean),false);
    assert.equal(client.getQueryState(key).dataUpdatedAt,12345);
    assert.equal(client.getQueryData(progress).phase,"complete");assert.equal(client.getQueryData(progress).loaded,1133-removed);
    assert.equal(client.getQueryData(progress).total,1133-removed);
    stop();client.clear();
  }
});
test("new campaigns from another tab fetch only missing summaries and never publish an incomplete dataset",async()=>{
  const client=cached(),gate=deferred(),calls=[];
  const task=sync.reconcileCampaignDeletions(client,scope,()=>true,{
    manifest:async()=>manifest([...rows.slice(1).map(r=>r.id),"new-a","new-b"]),
    batch:async({ids})=>{calls.push(ids);return gate.promise;},
  });
  await tick();assert.equal(client.getQueryData(key),rows);
  gate.resolve({campaigns:[{id:"new-a",name:"New campaign"}],missingIds:["new-b"]});await task;
  assert.deepEqual(calls,["new-a,new-b"]);assert.equal(client.getQueryData(key).length,1133);
  assert.equal(client.getQueryData(key).at(-1).id,"new-a");client.clear();
});
test("network failures and invalid delta responses retain the complete current list",async()=>{
  for(const response of [null,{campaigns:[{id:"wrong"}],missingIds:[]},{campaigns:[],missingIds:[]}]){
    const client=cached();
    await assert.rejects(sync.reconcileCampaignDeletions(client,scope,()=>true,{
      manifest:async()=>{if(response===null)throw Error("network");return manifest(["campaign-0","new"]);},
      batch:async()=>response,
    }));
    assert.equal(client.getQueryData(key),rows);assert.equal(client.getQueryData(progress).phase,"complete");client.clear();
  }
});
test("initial in-flight full load finishes before reconciliation; deleted rows cannot be resurrected",async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}}),gate=deferred();
  const first=client.fetchQuery({queryKey:key,queryFn:()=>gate.promise});
  const task=sync.reconcileCampaignDeletions(client,scope,()=>true,{manifest:async()=>manifest(["campaign-1"]),batch:async()=>{throw Error("UNEXPECTED_BATCH");}});
  assert.equal(client.getQueryData(key),undefined);gate.resolve(rows);await first;await task;
  assert.deepEqual(Array.from(client.getQueryData(key),r=>r.id),["campaign-1"]);client.clear();
});
test("logout/cache removal and scope changes cannot repopulate another session",async()=>{
  for(const clear of [true,false]){
    const client=cached(),gate=deferred();let active=true;
    const task=sync.reconcileCampaignDeletions(client,scope,()=>active,{manifest:()=>gate.promise,batch:async()=>({campaigns:[],missingIds:[]})});
    if(clear)client.clear();else active=false;
    gate.resolve(manifest([]));await assert.rejects(task,/SESSION_CHANGED/);
    if(clear)assert.equal(client.getQueryData(key),undefined);else assert.equal(client.getQueryData(key),rows);
    client.clear();
  }
});
test("overlapping progress notifications coalesce and recheck after a newer deletion",async()=>{
  const client=cached(),gate=deferred();let calls=0;
  const transport={manifest:async()=>++calls===1?gate.promise:manifest(["campaign-1"]),batch:async()=>{throw Error("UNEXPECTED_BATCH");}};
  const first=sync.reconcileCampaignDeletions(client,scope,()=>true,transport);
  const second=sync.reconcileCampaignDeletions(client,scope,()=>true,transport);assert.equal(first,second);
  gate.resolve(manifest(rows.map(r=>r.id)));await first;
  assert.equal(calls,2);assert.deepEqual(Array.from(client.getQueryData(key),r=>r.id),["campaign-1"]);client.clear();
});
test("a concurrent cache edit is preserved rather than overwritten by an older manifest request",async()=>{
  const client=cached(),gate=deferred();let calls=0;
  const task=sync.reconcileCampaignDeletions(client,scope,()=>true,{
    manifest:async()=>++calls===1?gate.promise:manifest(["campaign-1"]),batch:async()=>{throw Error("UNEXPECTED_BATCH");},
  });
  client.setQueryData(key,[{...rows[1],status:"paused"}]);gate.resolve(manifest(["campaign-1"]));await task;
  assert.equal(client.getQueryData(key)[0].status,"paused");assert.equal(calls,2);client.clear();
});
test("membership changes preserve an existing/concurrent freshness request without starting a full reload",async()=>{
  for(const concurrent of [false,true]){
    const client=cached(),gate=deferred();
    if(!concurrent)await client.invalidateQueries({queryKey:key,exact:true,refetchType:"none"});
    const task=sync.reconcileCampaignDeletions(client,scope,()=>true,{manifest:()=>gate.promise,batch:async()=>{throw Error("UNEXPECTED_BATCH");}});
    if(concurrent)await client.invalidateQueries({queryKey:key,exact:true,refetchType:"none"});
    gate.resolve(manifest(["campaign-1"]));await task;
    assert.equal(client.getQueryState(key).isInvalidated,true);
    assert.equal(client.getQueryState(key).fetchStatus,"idle");
    assert.deepEqual(Array.from(client.getQueryData(key),r=>r.id),["campaign-1"]);client.clear();
  }
});
test("completed deletion refreshes dependent caches, not complete campaign lists, counters or operation polling",async()=>{
  const client=cached(),calls={campaigns:0,calendar:0,operations:0,counter:0},stops=[];
  const observe=(queryKey,name)=>{client.setQueryData(queryKey,[]);const o=new QueryObserver(client,{queryKey,queryFn:async()=>{calls[name]++;return[];},staleTime:Infinity,gcTime:Infinity});stops.push(o.subscribe(()=>{}));};
  observe(key,"campaigns");observe(["/api/calendar"],"calendar");observe(["telecamp-operations",scope],"operations");observe(progress,"counter");
  await sync.invalidateDeletionDependencies(client);
  assert.deepEqual(calls,{campaigns:0,calendar:1,operations:0,counter:0});
  assert.equal(client.getQueryState(key).isInvalidated,false);
  for(const stop of stops)stop();client.clear();
});
test("only campaign-removal progress, phase changes and terminal results need a new membership check",()=>{
  const base={state:"running",phase:"logs",processed:1};
  assert.equal(sync.deletionSyncToken(base),sync.deletionSyncToken({...base,processed:999}));
  assert.notEqual(sync.deletionSyncToken({...base,phase:"campaigns"}),sync.deletionSyncToken({...base,phase:"campaigns",processed:2}));
  assert.notEqual(sync.deletionSyncToken(base),sync.deletionSyncToken({...base,state:"completed"}));
});
test("single-delete acceptance does not invalidate/refetch the list or mark a row deleted",async()=>{
  const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/campaigns.tsx",import.meta.url),"utf8");
  const ast=ts.createSourceFile("page.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let remove;
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==="remove")remove=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
  const trace=[],context={campaignToDelete:{id:"selected"},deleteOne:{isPending:false,mutateAsync:async id=>trace.push(id)},details:null,
    setCampaignToDelete:()=>{},setDetails:()=>{},setToast:t=>trace.push(t),language:"vi",
    queryClient:{invalidateQueries:()=>{throw Error("FULL_RELOAD");}},localizedErrorMessage:()=>{throw Error("DELETE_FAILED");}};
  vm.runInNewContext(ts.transpileModule(remove+";globalThis.run=remove;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  await context.run();assert.equal(trace[0],"selected");assert.ok(trace[1].includes("Đã tiếp nhận"));
});
function operationUi(language="vi"){
  const gate=deferred(),storage=new Map(),states=[],refs=[],deps=[],pending=[],trace={sync:0,global:0,related:0,refetch:0};
  let sc=0,rc=0,ec=0;
  const hooks={useCallback(fn){return fn;},useState(v){const i=sc++;if(!(i in states))states[i]=v;return[states[i],v=>{states[i]=typeof v==="function"?v(states[i]):v;}];},
    useRef(v){const i=rc++;return refs[i]??={current:v};},
    useEffect(fn,next){const i=ec++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j]))pending.push(fn);deps[i]=next;}};
  const h=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity).filter(v=>v!=null&&v!==false)});
  const client={invalidateQueries(){trace.global++;return Promise.resolve();}};
  const job={id:"deletion-id",kind:"delete_campaigns",state:"completed",phase:"completed",processed:1,total:null,unit:"records",label:"Fixture",error:null};
  const operations={scope,data:[job],dataUpdatedAt:1,isError:false,refetch:()=>{trace.refetch++;operations.dataUpdatedAt++;}};
  const exported=compile("../../artifacts/telecampaign/src/components/OperationsProgress.tsx",{
    react:hooks,"@tanstack/react-query":{useQueryClient:()=>client},
    "lucide-react":{LoaderCircle:"icon",CheckCircle2:"icon",AlertCircle:"icon",X:"icon"},
    "@/lib/operations":{useOperations:()=>operations},"@/lib/i18n":{useLanguage:()=>({language})},
    "@/lib/reconcile-campaign-deletions":{deletionSyncToken:sync.deletionSyncToken,
      reconcileObservedCampaigns(){trace.sync++;return gate.promise;},
      invalidateDeletionDependencies(){trace.related++;return Promise.resolve();}},
  },true,{h,React:{Fragment:"fragment"},setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
  const render=()=>{sc=rc=ec=0;const tree=exported.OperationsProgress();const cleanups=pending.splice(0).map(fn=>fn());return{tree,cleanups};};
  return{gate,storage,trace,render};
}
function uiNodes(tree){return tree&&typeof tree==="object"?[tree,...(tree.children??[]).flatMap(uiNodes)]:[];}
function uiText(tree){return typeof tree==="string"?tree:(tree?.children??[]).map(uiText).join(" ");}
test("actual progress component reconciles deletion and records completion only after synchronization, with no full invalidation",async()=>{
  const h=operationUi();h.render();
  assert.equal(h.trace.sync,1);assert.equal(h.trace.global,0);assert.equal(h.storage.has(`telecamp-operation-receipts:${scope}:applied`),false);
  h.gate.resolve();await tick();
  assert.equal(h.trace.global,0);assert.equal(h.trace.related,1);
  assert.ok(h.storage.get(`telecamp-operation-receipts:${scope}:applied`).includes("deletion-id"));
});
for(const language of ["vi","en"])test(`${language}: actual synchronization failure keeps completion unacknowledged and offers a read-only retry`,async()=>{
  const h=operationUi(language);h.render();h.gate.reject(new Error("network"));await tick();
  assert.equal(h.storage.has(`telecamp-operation-receipts:${scope}:applied`),false);assert.equal(h.trace.global,0);assert.equal(h.trace.related,0);
  const tree=h.render().tree;
  assert.ok(uiText(tree).includes(language==="vi"?"Danh sách hiện tại được giữ nguyên":"Your current list is preserved"));
  uiNodes(tree).find(n=>n.type==="button"&&uiText(n)===(language==="vi"?"Kiểm tra lại":"Check again")).props.onClick();
  assert.equal(h.trace.refetch,1);
  h.render();assert.equal(h.trace.sync,2);await tick();
});
test("unmounted progress component does not acknowledge an old-scope deletion",async()=>{
  const h=operationUi();const {cleanups}=h.render();
  cleanups[0]();h.gate.resolve();await tick();
  assert.equal(h.storage.has(`telecamp-operation-receipts:${scope}:applied`),false);assert.equal(h.trace.related,0);
});
