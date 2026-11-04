import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/OperationsProgress.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const node=(type,props)=>({type,props:props??{}});
function render(language,job,scope="owner:self"){
  const module={exports:{}},calls=[];
  const require=name=>name==="react"?{useEffect(){},useRef:x=>({current:x}),useState:x=>[x,()=>{}]}
    :name==="react/jsx-runtime"?{jsx:node,jsxs:node}
    :name==="@tanstack/react-query"?{useQueryClient:()=>({invalidateQueries(){}})}
    :name==="@/lib/operations"?{useOperations:()=>({data:[job],scope,retry:async id=>calls.push(id)})}
    :name==="@/lib/i18n"?{useLanguage:()=>({language})}
    :{LoaderCircle:"Loader",CheckCircle2:"Complete",AlertCircle:"Alert",X:"Close"};
  vm.runInNewContext(compiled,{module,exports:module.exports,require,Map,Date,Math,JSON});
  const tree=module.exports.OperationsProgress(),nodes=[];
  function visit(n){if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==="object"){nodes.push(n);visit(n.props.children);}}visit(tree);
  const text=nodes.flatMap(n=>[n.props.children].flat().filter(v=>typeof v==="string"||typeof v==="number")).join(" ");
  return {nodes,text,calls};
}
const base={id:"fixture",kind:"delete_account",label:"Account A",state:"running",phase:"targets",processed:120,total:null,unit:"records"};
for(const language of ["vi","en"]){
  test(`${language}: actual progress component shows measured count without invented percentage`,()=>{
    const r=render(language,base);assert.ok(r.text.includes("120"));assert.ok(!r.text.includes("%"));assert.ok(!r.nodes.some(n=>n.props.role==="progressbar"));
  });
  test(`${language}: actual component renders exact preparation percentage`,()=>{
    const r=render(language,{...base,kind:"prepare_campaign",phase:"preparing",processed:500,total:1500,unit:"deliveries"});
    assert.ok(r.text.includes("33%"));assert.equal(r.nodes.find(n=>n.props.role==="progressbar").props["aria-valuenow"],33);
  });
  test(`${language}: non-deletion retry resumes the same job and cannot be hidden`,async()=>{
    const r=render(language,{...base,kind:"sync_groups",state:"failed"});
    const button=r.nodes.find(n=>n.type==="button"&&!n.props["aria-label"]);assert.ok(button);await button.props.onClick();assert.deepEqual(r.calls,["fixture"]);
    assert.ok(!r.nodes.some(n=>n.props["aria-label"]===(language==="vi"?"Ẩn thông báo":"Dismiss")));
  });
}
test("read-only support view cannot retry another user's operation",()=>{
  const r=render("en",{...base,kind:"sync_groups",state:"failed"},"admin:target");
  assert.ok(!r.nodes.some(n=>n.type==="button"));
});
for(const language of ["vi","en"])test(`${language}: a blocked deletion retains its receipt without asking for repeated resume clicks`,()=>{
  const r=render(language,{...base,state:"failed"});
  assert.ok(!r.nodes.some(n=>n.type==="button"));
  assert.ok(r.text.includes(language==="vi"?"cần kiểm tra":"needs investigation"));
});
for(const language of ["vi","en"])test(`${language}: transient deletion error continues automatically without a resume button`,()=>{
  const r=render(language,{...base,state:"queued",error:"OPERATION_AUTO_RETRY"});
  assert.ok(r.text.includes(language==="vi"?"tự tiếp tục":"resuming automatically"));
  assert.ok(!r.nodes.some(n=>n.type==="button"));
});
