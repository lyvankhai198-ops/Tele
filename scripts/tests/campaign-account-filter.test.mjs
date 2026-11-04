import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const page=fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/campaigns.tsx",import.meta.url),"utf8");
const ast=ts.createSourceFile("campaigns.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),parts={};
function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==="templateProgress")
    parts.templateEnabled=node.initializer.arguments[1].getText(ast);
  if(ts.isVariableDeclaration(node)&&["listedCampaigns","bulkScopeOptions","bulkFilter","accountFilterLabel","bulkDelete"].includes(node.name.getText(ast)))
    parts[node.name.getText(ast)]="const "+node.getText(ast)+";";
  if(ts.isFunctionDeclaration(node)&&["pauseAllCampaigns","removeFilteredCampaigns","submitBulkResume"].includes(node.name?.text))
    parts[node.name.text]=node.getText(ast);
  if(ts.isJsxElement(node)){
    const id=node.openingElement.attributes.properties.find(p=>p.name?.text==="data-testid")?.initializer?.text;
    if(["campaigns-filter-toolbar","campaigns-action-toolbar"].includes(id))parts[id]=node.getText(ast);
  }
  ts.forEachChild(node,visit);
}visit(ast);
function run(source,context){return vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,jsxFactory:"h",module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText,context);}
function setup({account="a",status="all",search="",language="vi",blocked=false,isAdmin=true}={}){
  const rows=[
    {id:"a1",telegramAccountId:"a",name:"News A",status:"running",createdAt:"2026-01-01"},
    {id:"a2",telegramAccountId:"a",name:"News A",status:"completed_with_errors",createdAt:"2026-01-02"},
    {id:"a3",telegramAccountId:"a",name:"Other",status:"draft",createdAt:"2026-01-03"},
    {id:"b1",telegramAccountId:"b",name:"News B",status:"running",createdAt:"2026-01-04"},
    {id:"b2",telegramAccountId:"b",name:"News B",status:"completed",createdAt:"2026-01-05"},
  ],sent=[],state={};
  const context={accountFilter:account,status,search,language,accounts:{data:[{id:"a",name:"A",phone:"+111"},{id:"b",name:"B"}]},
    campaigns:{data:rows,refetch:async()=>{}},useMemo:f=>f(),isActive:s=>["queued","running"].includes(s),
    useMutation:({mutationFn})=>({isPending:false,mutateAsync:mutationFn}),
    operations:{async start(data){sent.push({data});return{id:"operation",state:"queued"};}},
    isAdmin,campaignDataBlocked:blocked,bulkJob:null,bulkTemplate:{isPending:false},bulkDelete:{isPending:false,async mutateAsync(v){sent.push(v);return{deletedCount:1,skippedCount:0};}},
    bulkControl:{isPending:false,async mutateAsync(v){sent.push(v);return{updatedCount:1,skippedCount:0,job:{id:"new",status:"queued"}};}},
    templateProgress:{job:null,uncertain:false,waiting:false},details:null,bulkResumeScope:"completed",bulkIntervalMinutes:"10",
    bulkScheduleDate:"2026-12-01",bulkScheduleTime:"10:00",bulkStorageKey:"fixture",bulkRequestId:"fixture",onlySendable:true,autoDeleteInvalid:false,
    c:{searchPlaceholder:"Search",statusAll:"All",statusDraft:"Draft",statusQueued:"Queued",statusRunning:"Running",statusPaused:"Paused",statusCompleted:"Completed",
      bulkPauseConfirm:n=>String(n),bulkDeleteConfirm:n=>String(n),bulkPausedResult:()=>"",bulkDeleteResult:()=>"",bulkNoActive:"No active",bulkNoEligible:"No eligible"},
    window:{confirm:()=>true},localStorage:{setItem(){}},setToast:v=>{state.toast=v;},setDetails(){},rememberBulkJob:v=>{state.job=v;},
    setAccountFilter:v=>{state.account=v;},setSearch:v=>{state.search=v;},setStatus:v=>{state.status=v;},
    openBulkResume(){},openBulkTemplate(){state.templateOpen=true;},localizedErrorMessage:()=>"",campaignDeleteError:()=>"",
    Search:"Search",CircleStop:"Stop",Play:"Play",Pencil:"Pencil",Trash2:"Trash",LoaderCircle:"Loader",
    h:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity).filter(v=>v!==false&&v!=null)}),
  };
  for(const key of ["listedCampaigns","bulkScopeOptions","bulkFilter","accountFilterLabel","bulkDelete"])run(parts[key]+`;globalThis.${key}=${key};`,context);
  for(const key of ["pauseAllCampaigns","removeFilteredCampaigns","submitBulkResume"])run(parts[key],context);
  return{context,sent,state,rows};
}
function find(tree,pred){if(!tree||typeof tree!=="object")return null;if(pred(tree))return tree;for(const child of tree.children??[]){const found=find(child,pred);if(found)return found;}return null;}
test("account, status and literal name filters intersect; completed includes errors",()=>{
  assert.deepEqual(Array.from(setup().context.listedCampaigns,x=>x.id),["a3","a2","a1"]);
  assert.deepEqual(Array.from(setup({account:"b",search:"news",status:"completed"}).context.listedCampaigns,x=>x.id),["b2"]);
  assert.deepEqual(Array.from(setup({status:"completed"}).context.listedCampaigns,x=>x.id),["a2"]);
  assert.equal(setup({account:"missing"}).context.listedCampaigns.length,0);
  assert.equal(setup({search:"%_"}).context.listedCampaigns.length,0);
  assert.equal(setup({status:"running"}).context.bulkScopeOptions.length,0);
});
function text(tree){return typeof tree==="string"?tree:(tree?.children??[]).map(text).join(" ");}
test("actual template hook is enabled for customers, disabled for support and signed-out viewers",()=>{
  assert.equal(run("("+parts.templateEnabled+")",{user:{id:"customer",role:"user"},isSupportMode:false}),true);
  assert.equal(run("("+parts.templateEnabled+")",{user:{id:"admin",role:"admin"},isSupportMode:true}),false);
  assert.equal(run("("+parts.templateEnabled+")",{user:null,isSupportMode:false}),false);
});
for(const language of ["vi","en"])test(`${language}: customer toolbar has four working actions and the requested labels`,()=>{
  const {context,state}=setup({language,isAdmin:false}),actions=run("("+parts["campaigns-action-toolbar"]+")",context);
  for(const label of language==="vi"
    ?["Chọn bộ lọc tương ứng để thao tác","Dừng chiến dịch","Chạy lại chiến dịch","Xoá chiến dịch","Đổi mẫu tin tự động"]
    :["Choose the corresponding filters before taking action","Pause campaigns","Rerun campaigns","Delete campaigns","Auto templates"])
    assert.ok(text(actions).includes(label),label);
  const button=find(actions,n=>n.props["data-testid"]==="campaigns-bulk-template");
  assert.equal(button.props.disabled,false);button.props.onClick();assert.equal(state.templateOpen,true);
});
for(const language of ["vi","en"])test(`${language}: real toolbar changes account/reset and actions use two mobile columns`,()=>{
  const {context,state}=setup({language}),filters=run("("+parts["campaigns-filter-toolbar"]+")",context);
  const select=find(filters,n=>n.props["data-testid"]==="campaigns-account-filter");
  assert.equal(select.props.value,"a");assert.equal(select.children.length,3);assert.ok(select.props["aria-label"]);
  select.props.onChange({target:{value:"b"}});assert.equal(state.account,"b");
  find(filters,n=>n.props["data-testid"]==="campaigns-clear-filters").props.onClick();
  assert.equal(state.account,"");assert.equal(state.search,"");assert.equal(state.status,"all");
  const actions=run("("+parts["campaigns-action-toolbar"]+")",context);
  assert.ok(find(actions,n=>n.props.className?.includes("grid-cols-2")));
  assert.ok(find(actions,n=>n.props["data-testid"]==="campaigns-delete-filtered").props.className.includes("fff1f2"));
});
test("actual pause/delete/rerun callers send the account, status and search instead of global requests",async()=>{
  for(const [handler,status]of [["pauseAllCampaigns","running"],["removeFilteredCampaigns","completed"],["submitBulkResume","completed"]]){
    const h=setup({status,search:"News"});await h.context[handler]();
    assert.equal(h.sent.length,1);assert.equal(h.sent[0].data.telegramAccountId,"a");
    assert.equal(h.sent[0].data.status,status);assert.equal(h.sent[0].data.search,"News");
  }
  const global=setup({account:"",status:"running"});await global.context.pauseAllCampaigns();
  assert.equal("telegramAccountId" in global.sent[0].data,false);
});
test("loading still blocks all campaign-changing actions",async()=>{
  const h=setup({blocked:true});
  for(const handler of ["pauseAllCampaigns","removeFilteredCampaigns","submitBulkResume"])await h.context[handler]();
  assert.equal(h.sent.length,0);
});
