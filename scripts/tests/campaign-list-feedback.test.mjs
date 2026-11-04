import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/campaign-list-feedback.tsx",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/campaigns.tsx",import.meta.url),"utf8");
function node(type,props){return typeof type==="function"?type(props):{type,props:props??{}};}
const context={exports:{},require(name){
  assert.equal(name,"react/jsx-runtime");
  return {jsx:node,jsxs:node,Fragment:"fragment"};
}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
  jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText,context);
function render(props={}){
  return context.exports.CampaignListFeedback({
    language:"vi",hasData:false,fetching:true,failed:false,filtered:false,
    children:node("CampaignRows",{children:"REAL CAMPAIGN DATA"}),...props,
  });
}
function all(tree,predicate){
  if(tree==null||typeof tree==="boolean")return[];
  if(Array.isArray(tree))return tree.flatMap(n=>all(n,predicate));
  return [...(predicate(tree)?[tree]:[]),...all(tree?.props?.children,predicate)];
}
const text=tree=>all(tree,n=>typeof n==="string").join(" ");
for(const language of ["vi","en"]){
  test(`${language}: initial loading shows three skeleton cards and a clear explanation, not empty results`,()=>{
    const tree=render({language});
    assert.equal(all(tree,n=>n?.props?.["data-testid"]==="campaign-list-skeleton").length,3);
    assert.match(text(tree),language==="vi"?/Đang tải chiến dịch/:/Loading campaigns/);
    assert.match(text(tree),language==="vi"?/nhiều chiến dịch/:/many campaigns/);
    assert.doesNotMatch(text(tree),/REAL CAMPAIGN DATA|%/);
    assert.equal(tree.props["aria-busy"],true);
    assert.ok(all(tree,n=>n?.props?.["aria-hidden"]==="true").length);
    assert.match(source,/motion-reduce:animate-none/);
  });
  test(`${language}: background refresh retains the exact children and identifies current filters`,()=>{
    const child=node("CampaignRows",{children:"CURRENT FILTER DATA"});
    const plain=render({language,hasData:true,children:child});
    const filtered=render({language,hasData:true,filtered:true,children:child});
    assert.equal(all(plain,n=>n===child).length,1);
    assert.equal(all(filtered,n=>n===child).length,1);
    assert.match(text(filtered),language==="vi"?/bộ lọc hiện tại/:/current filters/);
    assert.match(text(plain),language==="vi"?/Đang cập nhật danh sách/:/Updating campaign list/);
    assert.match(text(filtered),language==="vi"?/dữ liệu gần nhất/:/latest available data/);
    assert.equal(all(filtered,n=>n?.props?.["data-testid"]==="campaign-list-skeleton").length,0);
    const done=render({language,hasData:true,fetching:false,children:child});
    assert.equal(all(done,n=>n===child).length,1);
    assert.equal(all(done,n=>n?.props?.["data-testid"]==="campaign-list-refreshing").length,0);
  });
}
test("empty successful responses and cached failed refreshes stay distinct from initial network failure",()=>{
  const empty=render({hasData:true,fetching:false,children:"ACTUAL EMPTY RESULT"});
  assert.match(text(empty),/ACTUAL EMPTY RESULT/);
  const error=render({failed:true,fetching:false});
  assert.match(text(error),/không phải kết quả danh sách trống/);
  assert.doesNotMatch(text(error),/REAL CAMPAIGN DATA/);
  const stale=render({hasData:true,failed:true,fetching:false});
  assert.match(text(stale),/REAL CAMPAIGN DATA/);
  assert.match(text(stale),/gần nhất vẫn được giữ lại/);
});
test("actual campaign page uses live query fetching state and immediately applies filters to retained data",()=>{
  assert.match(page,/<CampaignListFeedback language=\{language\} hasData=\{campaigns\.data!==undefined\}/);
  assert.match(page,/fetching=\{campaigns\.isFetching\} failed=\{campaigns\.isError\}/);
  assert.match(page,/filtered=\{Boolean\(search\.trim\(\)\|\|status!=="all"\)\}/);
  assert.match(page,/\[campaigns\.data, search, status\]/);
  assert.doesNotMatch(page,/campaigns\.isLoading\s*\?\s*<div/);
  assert.doesNotMatch(source,/setTimeout|refetch\(|fetch\(|useQuery|placeholderData|previousData/);
});
