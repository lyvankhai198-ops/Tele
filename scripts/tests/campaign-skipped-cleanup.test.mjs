import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
const load=(relative,modules)=>{
  const source=fs.readFileSync(new URL(relative,import.meta.url),"utf8");
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(js,{module,exports:module.exports,require:name=>{
    if(name==="react/jsx-runtime")return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
    if(!(name in modules))throw Error(`UNMOCKED_${name}`);return modules[name];
  },Set,Map,Date,Promise,setTimeout:()=>0,clearTimeout:()=>{}});
  return module.exports;
};
const nodes=(node,result=[])=>{
  if(node&&typeof node==="object"&&"type"in node){result.push(node);for(const child of [node.props?.children].flat(Infinity))nodes(child,result);}
  return result;
};
const text=node=>typeof node==="string"||typeof node==="number"?String(node):Array.isArray(node)?node.map(text).join(""):node?.props?text(node.props.children):"";
const previews=id=>({id:`preview-${id}`,jobId:"job-fixture",telegramAccountId:id,accountName:id,expiresAt:new Date(Date.now()+600000).toISOString(),
  campaigns:[...Array.from({length:1200},(_,i)=>({id:`${id}-${i}`,name:`Campaign ${i}`,category:"temporary",reason:"temporary_failure",selectable:true,groups:[{id:`g-${i}`,title:`Group ${i}`,telegramId:`peer-${i}`}]})),
    {id:"ready",name:"Ready",category:"sendable",reason:"cleanup_now_ready",selectable:false,groups:[]},
    {id:"missing",name:"Missing identity",category:"temporary",reason:"cleanup_missing_identity",selectable:false,groups:[]}]});
function harness(language="vi",options={}){
  let si=0,ri=0,ei=0,tree;const states=[],refs=[],effects=[],calls=[],writes=[];
  const react={
    useState(initial){const i=si++;if(!(i in states))states[i]=typeof initial==="function"?initial():initial;return[states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},
    useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial});},
    useEffect(fn,deps){const i=ei++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();effects[i]={fn,deps};}},
  };
  const queryClient={setQueryData(key,updater){writes.push({key,data:updater([])});},invalidateQueries(){throw Error("FULL_RELOAD_FORBIDDEN");}};
  const ops={scope:"owner-fixture",refetch:async()=>{calls.push(["refetch"]);}};
  const rerun=load("../../artifacts/telecampaign/src/components/campaign-rerun-options.tsx",{"react":react});
  const {CampaignSkippedCleanup}=load("../../artifacts/telecampaign/src/components/campaign-skipped-cleanup.tsx",{
    react,"@tanstack/react-query":{useQueryClient:()=>queryClient},
    "@/lib/operations":{useOperations:()=>ops},"@/lib/auth":{useAuth:()=>({user:options.support?{support:{}}:{id:"owner-fixture"}})},
    "./campaign-rerun-options":rerun,
    "@workspace/api-client-react":{
      createCampaignCleanupPreview:async(...args)=>{calls.push(["preview",...args]);return options.load?options.load(...args):previews(args[1].telegramAccountId);},
      confirmCampaignCleanup:async(...args)=>{calls.push(["confirm",...args]);return options.confirm?options.confirm(...args):{id:"operation-fixture",kind:"delete_campaigns",state:"queued"};},
    },
  });
  const props={jobId:"job-fixture",accounts:[{id:"account-a",name:"Account A"},{id:"account-b",name:"Account B"}],
    initialAccountId:"account-a",language,onAccepted:()=>calls.push(["accepted"])};
  const render=()=>{si=ri=ei=0;tree=CampaignSkippedCleanup(props);for(const effect of effects)if(effect.fn){effect.cleanup=effect.fn();delete effect.fn;}return tree;};
  const find=(type,label)=>nodes(tree).find(n=>n.type===type&&text(n).includes(label));
  const button=label=>{const result=find("button",label);assert.ok(result,`BUTTON_${label}`);return result;};
  const click=async label=>{const b=button(label);assert.equal(Boolean(b.props.disabled),false,`ENABLED_${label}`);await b.props.onClick();render();};
  render();
  return{calls,writes,render,click,button,find,get tree(){return tree;},unmount(){for(const effect of effects)effect.cleanup?.();}};
}
for(const language of ["vi","en"])test(`${language}: actual cleanup UI starts unchecked, selects across all pages and only deletes after explicit review`,async()=>{
  const h=harness(language),vi=language==="vi";
  await h.click(vi?"Xem trước /":"Preview /");
  assert.equal(h.calls.filter(c=>c[0]==="confirm").length,0);
  assert.equal(nodes(h.tree).filter(n=>n.type==="input"&&n.props.checked).length,0);
  await h.click(vi?"Chọn tất cả":"Select all");
  assert.ok(text(h.tree).includes("1200/1200"));
  await h.click(vi?"Bỏ chọn tất cả":"Clear selection");
  assert.ok(text(h.tree).includes("0/1200"));
  const input=nodes(h.tree).find(n=>n.type==="input"&&n.props["aria-label"]==="Campaign 2");
  input.props.onChange({target:{checked:true}});h.render();
  await h.click(vi?"Xem xác nhận xoá":"Review deletion");
  assert.equal(h.calls.filter(c=>c[0]==="confirm").length,0);
  assert.ok(text(h.tree).includes(vi?"Không ảnh hưởng tài khoản khác":"Other accounts are unaffected"));
  await h.click(vi?"Xoá và chặn nhóm":"Delete and block groups");
  const call=h.calls.find(c=>c[0]==="confirm");
  assert.deepEqual(JSON.parse(JSON.stringify(call.slice(1))),["job-fixture",{previewId:"preview-account-a",campaignIds:["account-a-2"],confirm:true}]);
  assert.equal(h.writes.length,1);
  assert.deepEqual(Array.from(h.writes[0].key),["telecamp-operations","owner-fixture"]);
  assert.equal(h.calls.filter(c=>c[0]==="accepted").length,1);
  h.unmount();
});
test("account changes clear previous preview/selection and use only the newly selected account",async()=>{
  const h=harness();await h.click("Xem trước /");await h.click("Chọn tất cả");
  h.find("select","").props.onChange({target:{value:"account-b"}});h.render();
  assert.equal(h.calls.filter(c=>c[0]==="confirm").length,0);
  assert.ok(!text(h.tree).includes("1200/1200"));
  await h.click("Xem trước /");
  const call=h.calls.filter(c=>c[0]==="preview").at(-1);
  assert.equal(call[2].telegramAccountId,"account-b");
  assert.ok(text(h.tree).includes("0/1200"));h.unmount();
});
test("lost confirmation retries the identical preview/IDs without duplicate selection or reload",async()=>{
  let attempt=0;const h=harness("vi",{confirm:async()=>{if(++attempt===1)throw Error("network");return{id:"same-operation",kind:"delete_campaigns",state:"queued"};}});
  await h.click("Xem trước /");
  const input=nodes(h.tree).find(n=>n.type==="input");input.props.onChange({target:{checked:true}});h.render();
  await h.click("Xem xác nhận xoá");await h.click("Xoá và chặn nhóm");
  assert.ok(text(h.tree).includes("Có thể yêu cầu đã được tiếp nhận"));
  assert.equal(h.writes.length,0);
  await h.click("Xoá và chặn nhóm");
  const calls=h.calls.filter(c=>c[0]==="confirm");
  assert.deepEqual(JSON.stringify(calls[0]),JSON.stringify(calls[1]));
  assert.equal(h.calls.filter(c=>c[0]==="accepted").length,1);h.unmount();
});
test("support sessions cannot render destructive cleanup controls",()=>{
  const h=harness("en",{support:true});assert.equal(h.tree,null);assert.equal(h.calls.length,0);h.unmount();
});
test("a preview response after unmount cannot insert operations or confirm a deletion",async()=>{
  let resolve;const h=harness("vi",{load:()=>new Promise(r=>{resolve=r;})});
  const promise=h.button("Xem trước /").props.onClick();h.unmount();resolve(previews("account-a"));await promise;
  assert.equal(h.writes.length,0);assert.equal(h.calls.filter(c=>c[0]==="confirm").length,0);
});
test("durable ban keys isolate accounts/owners and preserve Telegram-peer aliases across re-addition",()=>{
  const {destinationBlockKeys}=load("../../artifacts/api-server/src/lib/campaign-destination-blocks.ts",{
    "drizzle-orm":{},"@workspace/db":{},"../schema":{},
  });
  const group={id:"destination-a",telegramId:"-10001",title:"Group"};
  const first=destinationBlockKeys("owner-a",{id:"account-a",telegramUserId:"tg-a"},group);
  const readded=destinationBlockKeys("owner-a",{id:"new-account",telegramUserId:"tg-a"},{...group,id:"new-destination"});
  assert.ok(first.some(key=>readded.includes(key)));
  const otherAccount=destinationBlockKeys("owner-a",{id:"account-b",telegramUserId:"tg-b"},group);
  const otherOwner=destinationBlockKeys("owner-b",{id:"account-a",telegramUserId:"tg-a"},group);
  assert.ok(first.every(key=>!otherAccount.includes(key)&&!otherOwner.includes(key)));
});
