import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/campaigns.tsx",import.meta.url),"utf8");
const ast=ts.createSourceFile("page.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),parts={};
function visit(n){
  if(ts.isVariableDeclaration(n)&&["copy","templateCampaigns","bulkSelectedIds"].includes(n.name.getText(ast)))parts[n.name.getText(ast)]="const "+n.getText(ast)+";";
  if(ts.isFunctionDeclaration(n)&&["openBulkTemplate","submitBulkTemplate"].includes(n.name?.text))parts[n.name.text]=n.getText(ast);
  if(ts.isBinaryExpression(n)&&n.left.getText(ast)==="bulkTemplateOpen"&&n.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)parts.modal=n.getText(ast);
  ts.forEachChild(n,visit);
}visit(ast);
function run(code,context){return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.None,jsx:ts.JsxEmit.React,jsxFactory:"h",target:ts.ScriptTarget.ES2022}}).outputText,context);}
const h=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity).filter(x=>x!=null&&x!==false)});
function nodes(t){return t&&typeof t==="object"?[t,...(t.children??[]).flatMap(nodes)]:[];}
const find=(t,id)=>nodes(t).find(n=>n.props["data-testid"]===id);
const text=t=>typeof t==="string"?t:(t?.children??[]).map(text).join(" ");
function page(language="vi",account="a",selected=["done"]){
  const state={},context={h,React:{Fragment:"fragment"},Modal:"Modal",PrimaryButton:"button",LoaderCircle:"Loader",CampaignTemplateSelector:"Selector",
    CampaignTemplateProgress:"Progress",language,bulkTemplateOpen:true,bulkTemplateAccountId:account,bulkTemplateCampaignIds:selected,bulkTemplateId:"t",accountFilter:"b",
    bulkTemplate:{isPending:false},templateProgress:{job:null,uncertain:false,problem:false,blocked:false,start:async(...args)=>{state.sent=args;}},
    campaigns:{data:[{id:"done",name:"Ordinary campaign",status:"completed",telegramAccountId:"a"},{id:"live",name:"No prefix",status:"running",telegramAccountId:"a"},{id:"other",name:"Other",status:"draft",telegramAccountId:"b"}]},
    accounts:{data:[{id:"a",name:"A"},{id:"b",name:"B"}]},templates:{data:[{id:"t",name:"New template",content:"Preview content",mode:"text"}]},
    campaignDataBlocked:false,useMemo:f=>f(),setBulkTemplateAccountId:v=>{state.account=v;},setBulkTemplateCampaignIds:v=>{state.selected=v;},
    setBulkTemplateId:v=>{state.template=v;},setBulkTemplateOpen:v=>{state.open=v;},setToast:v=>{state.toast=v;}};
  run(parts.copy+`;globalThis.c=copy.${language};`+parts.templateCampaigns+";globalThis.templateCampaigns=templateCampaigns;"+parts.bulkSelectedIds+";globalThis.bulkSelectedIds=bulkSelectedIds;",context);
  return{context,state,tree:run("("+parts.modal+")",context)};
}
for(const language of ["vi","en"])test(`${language}: actual modal accepts ordinary/completed names, previews template and submits selected IDs only`,async()=>{
  const {context,state,tree}=page(language);
  assert.deepEqual(Array.from(context.templateCampaigns,c=>c.id),["done","live"]);
  assert.equal(find(tree,"campaign-template-preview").children.some(c=>text(c).includes("Preview content")),true);
  assert.ok(text(tree).includes(language==="vi"?"Đổi mẫu cho 1 chiến dịch":"Change templates for 1 campaigns"));
  run(parts.submitBulkTemplate+";globalThis.submit=submitBulkTemplate;",context);await context.submit();
  assert.equal(state.sent[0],"t");assert.equal(state.sent[1],"a");assert.deepEqual(Array.from(state.sent[2]),["done"]);
  find(tree,"campaigns-bulk-template-account-select").props.onChange({target:{value:"b"}});
  assert.equal(state.account,"b");assert.deepEqual(Array.from(state.selected),[]);
});
test("opening starts with no checked campaigns; account is preselected from the page filter",()=>{
  const {context,state}=page();run(parts.openBulkTemplate+";openBulkTemplate();",context);
  assert.equal(state.account,"b");assert.deepEqual(Array.from(state.selected),[]);assert.equal(state.template,"");
});
test("no account, empty selection and stale cross-account IDs cannot be submitted",async()=>{
  for(const [account,selected]of[["",["done"]],["a",[]],["a",["other"]]]){
    const {context,state}=page("vi",account,selected);run(parts.submitBulkTemplate+";globalThis.submit=submitBulkTemplate;",context);
    await context.submit();assert.equal(state.sent,undefined);
  }
});
const selectorSource=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/campaign-template-selector.tsx",import.meta.url),"utf8");
function selector(language="vi"){
  const states=[],props={language,campaigns:Array.from({length:120},(_,i)=>({id:String(i),name:i<3?`Match ${i}`:`Other ${i}`,status:i===0?"completed":"running",templateId:"t"})),
    selected:[],templateNames:{t:"Original"},onChange(ids){props.selected=ids;}};
  let cursor=0;const context={exports:{},h,require:()=>({useMemo:f=>f(),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v;}];}})};
  vm.runInNewContext(ts.transpileModule(selectorSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,jsxFactory:"h",target:ts.ScriptTarget.ES2022}}).outputText,context);
  return{props,render(){cursor=0;return context.exports.CampaignTemplateSelector(props);}};
}
for(const language of ["vi","en"])test(`${language}: real checkboxes, scoped search selection and pagination work for large lists`,()=>{
  const s=selector(language);let tree=s.render();
  assert.equal(nodes(tree).filter(n=>n.type==="input"&&n.props.type==="checkbox").length,50);
  find(tree,"template-campaign-select-all").props.onClick();assert.equal(s.props.selected.length,120);
  find(s.render(),"template-campaign-clear").props.onClick();assert.equal(s.props.selected.length,0);
  tree=s.render();nodes(tree).find(n=>n.props["data-campaign-id"]==="80"); // not rendered on the first page
  s.props.selected=["80"];find(tree,"template-campaign-search").props.onChange({target:{value:"Match"}});
  tree=s.render();assert.ok(text(tree).includes(language==="vi"?"kết quả tìm kiếm":"search results"));
  find(tree,"template-campaign-select-all").props.onClick();assert.deepEqual(Array.from(s.props.selected).sort(),["0","1","2","80"]);
  find(s.render(),"template-campaign-select-all").props.onClick();assert.deepEqual(Array.from(s.props.selected),["80"]);
  find(s.render(),"template-campaign-search").props.onChange({target:{value:""}});
  tree=s.render();nodes(tree).find(n=>n.type==="button"&&text(n)===(language==="vi"?"Tiếp":"Next")).props.onClick();
  tree=s.render();assert.ok(nodes(tree).some(n=>n.props["data-campaign-id"]==="80"));
  nodes(tree).find(n=>n.props["data-campaign-id"]==="80").props.onChange();assert.equal(s.props.selected.length,0);
});
