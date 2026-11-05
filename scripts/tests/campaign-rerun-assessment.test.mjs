import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes, createRequire } from "node:module";
import { UNAVAILABLE_TELEGRAM_DESTINATION_REASON as unavailable } from "../../artifacts/api-server/src/lib/telegram-destination-state.ts";
import { isLongPostingRestriction, telegramPostingPermissionSnapshot, LONG_POSTING_RESTRICTION_MS,
  INDEFINITE_POSTING_RESTRICTION, DATED_POSTING_RESTRICTION } from "../../artifacts/api-server/src/lib/telegram-posting-permissions.ts";

const source=fs.readFileSync(new URL("../../artifacts/api-server/src/lib/campaign-rerun-assessment.ts",import.meta.url),"utf8");
const module=new vm.SourceTextModule(stripTypeScriptTypes(source.replace(/^import .*;\n/gm,""),{mode:"transform"}),{
  context:vm.createContext({UNAVAILABLE_TELEGRAM_DESTINATION_REASON:unavailable,isLongPostingRestriction,Date}),
});
await module.link(()=>{throw Error("Unexpected import");});await module.evaluate();
const assess=module.namespace.assessCampaignRerun;
const earlier=new Date("2026-11-04T00:00:00Z"),later=new Date("2026-11-04T01:00:00Z");
const group=(extra={})=>({id:"a",title:"Fixture",exists:true,canPost:true,permissionReason:null,
  permissionCheckedAt:later,restrictedUntil:null,pending:0,sending:0,uncertain:0,sent:0,failed:0,
  cancelled:0,attempted:0,lastSentAt:null,lastFailedAt:null,...extra});
const invalid=()=>group({canPost:false,permissionReason:unavailable,failed:1,attempted:1,lastFailedAt:earlier});
const result=(groups,extra={})=>assess({connected:true,terminal:true,groups,...extra});

test("long restrictions use remaining 30 days inclusively, not old 403 text or an unknown expiry",()=>{
  const now=Date.now(),checked=new Date(now-1000);
  const base=group({canPost:false,permissionCheckedAt:checked,permissionReason:DATED_POSTING_RESTRICTION});
  for(const delta of [-1,0,1]){
    const r=result([{...base,restrictedUntil:new Date(now+LONG_POSTING_RESTRICTION_MS+delta)}],{now});
    assert.equal(r.groups[0].category,delta<0?"temporary":"invalid");
  }
  assert.equal(result([{...base,restrictedUntil:null}],{now}).groups[0].category,"temporary");
  assert.equal(result([{...base,permissionReason:"403: CHAT_SEND_PLAIN_FORBIDDEN"}],{now}).groups[0].category,"temporary");
  assert.equal(result([{...base,permissionReason:INDEFINITE_POSTING_RESTRICTION}],{now}).groups[0].category,"invalid");
  assert.equal(result([{...base,permissionReason:INDEFINITE_POSTING_RESTRICTION,lastSentAt:new Date(now)}],{now}).groups[0].category,"temporary");
  assert.equal(result([{...base,canPost:true,permissionReason:INDEFINITE_POSTING_RESTRICTION}],{now}).groups[0].category,"sendable");
});

test("fresh sendPlain rights recognize finite, indefinite, expired and unknown restrictions without bypassing admins",()=>{
  const now=Date.now();
  for(const field of ["sendPlain","sendMessages"]){
    const snapshot=telegramPostingPermissionSnapshot({bannedRights:{[field]:true,untilDate:Math.floor(now/1000)+32*86400}},now);
    assert.equal(snapshot.canPost,false);assert.equal(snapshot.permissionReason,DATED_POSTING_RESTRICTION);
    assert.equal(telegramPostingPermissionSnapshot({bannedRights:{[field]:true,untilDate:0}},now).permissionReason,INDEFINITE_POSTING_RESTRICTION);
    assert.equal(telegramPostingPermissionSnapshot({bannedRights:{[field]:true,untilDate:1}},now).canPost,true);
    assert.notEqual(telegramPostingPermissionSnapshot({bannedRights:{[field]:true}},now).permissionReason,INDEFINITE_POSTING_RESTRICTION);
  }
  assert.equal(telegramPostingPermissionSnapshot({defaultBannedRights:{sendPlain:true,untilDate:0}},now).canPost,false);
  assert.equal(telegramPostingPermissionSnapshot({creator:true,defaultBannedRights:{sendPlain:true,untilDate:0}},now).canPost,true);
  assert.equal(telegramPostingPermissionSnapshot({adminRights:{},defaultBannedRights:{sendPlain:true,untilDate:0}},now).canPost,true);
});

test("only confirmed and fresh membership absence after an attempted terminal run permits deletion",()=>{
  assert.equal(result([invalid()]).canDelete,true);
  for(const extra of [{terminal:false},{connected:false}])assert.equal(result([invalid()],extra).canDelete,false);
  for(const g of [group({canPost:false}),group({canPost:false,permissionReason:"CHAT_WRITE_FORBIDDEN"}),
    group({canPost:false,permissionReason:unavailable,permissionCheckedAt:null}),
    {...invalid(),permissionCheckedAt:earlier,lastFailedAt:later},
    {...invalid(),attempted:0},{...invalid(),sent:1},{...invalid(),pending:1},{...invalid(),sending:1},
    {...invalid(),uncertain:1},{...invalid(),restrictedUntil:later}])assert.equal(result([g]).canDelete,false);
});
test("repeated failures and unknown destinations are never deletion evidence",()=>{
  const failed=group({failed:300,attempted:300,lastFailedAt:later});
  assert.equal(result([failed]).category,"temporary");assert.equal(result([failed]).canDelete,false);
  assert.equal(result([group({exists:false})]).category,"review");
  assert.equal(result([]).canDelete,false);
});
test("mixed groups preserve usable destinations and never delete the whole campaign",()=>{
  const r=result([group({sent:1,attempted:1,lastSentAt:earlier}),{...invalid(),id:"b"}]);
  assert.equal(r.category,"sendable");assert.equal(r.canDelete,false);
  assert.equal(r.groups[1].category,"invalid");
});
test("uncertain or sending targets block the whole campaign even if another group succeeded",()=>{
  for(const field of ["uncertain","sending"]) {
    const r=result([group({sent:1}),group({id:"b",[field]:1})]);
    assert.equal(r.category,"review");assert.equal(r.canDelete,false);
  }
});
test("a later successful delivery supersedes an older known failure; no success is fabricated",()=>{
  assert.equal(result([group({sent:1,failed:1,attempted:2,lastSentAt:later,lastFailedAt:earlier})]).category,"sendable");
  const r=result([group()]);assert.equal(r.sentCount,0);assert.equal(r.groups[0].reason,"ready_not_tested");
});
test("an expired session or temporary posting limit never permits deletion",()=>{
  for(const g of [invalid(),group({restrictedUntil:later}),group({canPost:false,permissionReason:"FLOOD_WAIT_600"})]) {
    assert.equal(result([g],{connected:false}).category,"temporary");
    assert.equal(result([g],{connected:false}).canDelete,false);
  }
});

// Render the actual TSX without a browser or production sign-in. Mock only the
// JSX runtime/hooks, so copy, input wiring and conditional warning are exercised.
const require=createRequire(new URL("../../package.json",import.meta.url));
const ts=require("typescript");
const ui=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/campaign-rerun-options.tsx",import.meta.url),"utf8");
const rendered=ts.transpileModule(ui,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const context=vm.createContext({});
const runtime=new vm.SyntheticModule(["jsx","jsxs","Fragment"],function(){const make=(type,props)=>({type,props});this.setExport("jsx",make);this.setExport("jsxs",make);this.setExport("Fragment","fragment");},{context});
const react=new vm.SyntheticModule(["useState"],function(){this.setExport("useState",v=>[v,()=>{}]);},{context});
const component=new vm.SourceTextModule(rendered,{context});
await component.link(name=>name==="react"?react:runtime);await component.evaluate();
const flatten=node=>node==null?[]:Array.isArray(node)?node.flatMap(flatten):typeof node==="object"
  ?[node,...flatten(node.props?.children)]:[String(node)];
test("VI and EN retain readiness control but require a separate deletion preview even for legacy flags",()=>{
  for(const language of ["vi","en"]){
    let safe=true,del=false;
    const props={language,onlySendable:true,autoDeleteInvalid:false,onOnlySendable:v=>safe=v,onAutoDelete:v=>del=v};
    let nodes=flatten(component.namespace.CampaignRerunOptions(props));
    assert.equal(nodes.filter(n=>n?.props?.role==="alert").length,0);
    const inputs=nodes.filter(n=>n?.type==="input");assert.equal(inputs.length,1);
    inputs[0].props.onChange({target:{checked:false}});
    assert.equal(safe,false);assert.equal(del,false);
    nodes=flatten(component.namespace.CampaignRerunOptions({...props,autoDeleteInvalid:true}));
    assert.equal(nodes.filter(n=>n?.props?.role==="alert").length,0);
    assert.equal(nodes.filter(n=>n?.type==="input").length,1);
    assert.ok(nodes.join(" ").includes(language==="vi"?"Chưa xác nhận thì không xoá":"Nothing is deleted or blocked until you confirm"));
  }
});
test("result copy distinguishes scheduling from actual delivery and supports both languages",()=>{
  const job={updatedCount:1,deletedCount:0,results:[{id:"a",name:"Fixture",outcome:"skipped",reason:"temporary_failure",
    assessment:result([invalid()])}],reviews:[]};
  for(const language of ["vi","en"]){
    const text=flatten(component.namespace.CampaignRerunResults({job,language})).join(" ");
    assert.ok(text.includes(language==="vi"?"không phải số tin đã gửi":"not sent-message counts"));
    assert.ok(text.includes(language==="vi"?"Kết quả gửi đã rà soát":"Reviewed delivery results"));
  }
});
