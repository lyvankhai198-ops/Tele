import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/campaigns.tsx",import.meta.url),"utf8");
const ast=ts.createSourceFile("campaigns.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const snippets={};
let modal="";
function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&["copy","automaticCampaigns"].includes(node.name.text))
    snippets[node.name.text]="const "+node.getText(ast)+";";
  if(ts.isFunctionDeclaration(node)&&["openBulkTemplate","submitBulkTemplate"].includes(node.name?.text))
    snippets[node.name.text]=node.getText(ast);
  if(ts.isBinaryExpression(node)&&node.left.getText(ast)==="bulkTemplateOpen"&&node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)
    modal=node.getText(ast);
  ts.forEachChild(node,visit);
}
visit(ast);
assert.ok(modal&&Object.keys(snippets).length===4,"Actual page controls must be found");
function evaluate(code,context){
  const js=ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,jsxFactory:"h",target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  return vm.runInNewContext(js,context);
}
function setup(selected="",language="en",pending=false,isAdmin=true){
  const fixtures=[
    {id:"a1",name:"Tự động A",telegramAccountId:"a",status:"draft"},
    {id:"a2",name:"Tự động A",telegramAccountId:"a",status:"queued"},
    {id:"b1",name:"Tự động B",telegramAccountId:"b",status:"running"},
    {id:"done",name:"Tự động old",telegramAccountId:"a",status:"completed"},
    {id:"manual",name:"Manual",telegramAccountId:"a",status:"paused"},
  ];
  const state={selected,template:"template",open:true,toast:null,sent:null,refetched:0};
  const context={
    bulkTemplateAccountId:selected,bulkTemplateId:"template",bulkTemplateOpen:true,isAdmin,
    bulkTemplate:{isPending:pending,async mutateAsync(request){state.sent=request;return{updatedCount:2,skippedCount:1};}},
    campaignDataBlocked:false,templateProgress:{job:null,uncertain:false,blocked:pending,async start(templateId,accountId){
      state.sent={templateId,...(accountId?{telegramAccountId:accountId}:{})};
    }},
    accountFilter:"",
    campaigns:{data:fixtures,async refetch(){state.refetched++;}},
    accounts:{isLoading:false,data:[{id:"a",name:"Account A",phone:"+111"},{id:"b",name:"Account B"}]},
    templates:{data:[{id:"template",name:"Template"}]},useMemo:fn=>fn(),
    setBulkTemplateAccountId:v=>{state.selected=v;},setBulkTemplateId:v=>{state.template=v;},
    setBulkTemplateOpen:v=>{state.open=v;},setToast:v=>{state.toast=v;},
    localizedErrorMessage:()=>{throw Error("Unexpected failed request");},
    React:{Fragment:"fragment"},Modal:"Modal",PrimaryButton:"button",LoaderCircle:"Loader",
    h:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity).filter(x=>x!==false&&x!=null)}),
  };
  evaluate(snippets.copy+`;globalThis.c=copy.${language};`,context);
  evaluate(snippets.automaticCampaigns+";globalThis.preview=automaticCampaigns;",context);
  const tree=evaluate("("+modal+")",context);
  return{context,state,tree,preview:context.preview};
}
function find(tree,predicate){if(!tree||typeof tree!=="object")return null;if(predicate(tree))return tree;for(const c of tree.children??[]){const match=find(c,predicate);if(match)return match;}return null;}
function text(tree){return typeof tree==="string"?tree:typeof tree==="number"?String(tree):(tree?.children??[]).map(text).join(" ");}

test("actual page filters the preview count/list by account, name and allowed statuses",()=>{
  assert.deepEqual(Array.from(setup("a").preview,x=>x.id),["a1","a2"]);
  assert.deepEqual(Array.from(setup("b").preview,x=>x.id),["b1"]);
  assert.deepEqual(Array.from(setup().preview,x=>x.id),["a1","a2","b1"]);
  assert.equal(setup("missing").preview.length,0);
});
for(const language of ["vi","en"])test(`${language}: customer all-account scope does not claim permission to change the shared default`,()=>{
  const {tree}=setup("",language,false,false);
  assert.ok(text(tree).includes(language==="vi"?"Không đổi mẫu mặc định chung":"system-wide default template stays unchanged"));
  assert.ok(!text(tree).includes(language==="vi"?"đổi cả mẫu mặc định chung":"also changes the shared template default"));
});
for(const language of ["vi","en"])test(`actual ${language} modal renders all/owned accounts, hint, empty state and disabled apply`,()=>{
  const {tree,state}=setup("a",language);
  const select=find(tree,node=>node.props["data-testid"]==="campaigns-bulk-template-account-select");
  assert.equal(select.props.value,"a");assert.equal(select.children.length,3);
  assert.equal(select.children[0].props.value,"");
  select.props.onChange({target:{value:"b"}});assert.equal(state.selected,"b");
  assert.ok(text(tree).includes(language==="vi"?"không đổi mẫu mặc định chung":"shared default for future campaigns stays unchanged"));
  const empty=setup("missing",language);
  assert.equal(find(empty.tree,node=>node.props.onClick&&String(node.props.onClick).includes("submitBulkTemplate"))?.props.disabled,true);
  assert.ok(text(empty.tree).includes(language==="vi"?"không có chiến dịch tự động đủ điều kiện":"No eligible automatic campaigns"));
  assert.ok(text(setup("",language).tree).includes(language==="vi"?"đổi cả mẫu mặc định chung":"also changes the shared template default"));
});
test("account and template controls cannot change while the request is pending",()=>{
  const {tree}=setup("a","en",true);
  assert.equal(find(tree,n=>n.props["data-testid"]==="campaigns-bulk-template-account-select").props.disabled,true);
  assert.equal(find(tree,n=>n.props["data-testid"]==="campaigns-bulk-template-select").props.disabled,true);
});
test("reopening resets account scope even after the previous account had no matches",()=>{
  const {context,state}=setup("missing");
  evaluate(snippets.openBulkTemplate+";openBulkTemplate();",context);
  assert.equal(state.selected,"");assert.equal(state.template,"");assert.equal(state.open,true);assert.equal(state.toast,null);
});
test("opening the template dialog starts with the account selected in the list filter",()=>{
  const {context,state}=setup();
  context.accountFilter="b";
  evaluate(snippets.openBulkTemplate+";openBulkTemplate();",context);
  assert.equal(state.selected,"b");
});
test("actual submit starts a durable operation without closing or pretending all campaigns are already changed",async()=>{
  for(const selected of ["a",""]){
    const {context,state}=setup(selected);
    await evaluate(snippets.submitBulkTemplate+";submitBulkTemplate();",context);
    assert.deepEqual(JSON.parse(JSON.stringify(state.sent)),{templateId:"template",...(selected?{telegramAccountId:selected}:{})});
    assert.equal(state.refetched,0);assert.equal(state.open,true);
  }
});
