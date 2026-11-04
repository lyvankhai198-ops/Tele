import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/campaign-list-feedback.tsx",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/campaigns.tsx",import.meta.url),"utf8");
function node(type,props){return typeof type==="function"?type(props):{type,props:props??{}};}
const context={exports:{},require(name){assert.equal(name,"react/jsx-runtime");return{jsx:node,jsxs:node,Fragment:"fragment"};}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
  jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText,context);
function render(props={}){return context.exports.CampaignListFeedback({
  language:"vi",hasData:false,fetching:true,failed:false,empty:false,loaded:25,total:60,
  children:node("CampaignRows",{children:"COMPLETE DATA"}),...props,
});}
function all(tree,predicate){
  if(tree==null||typeof tree==="boolean")return[];
  if(Array.isArray(tree))return tree.flatMap(n=>all(n,predicate));
  return[...(predicate(tree)?[tree]:[]),...all(tree?.props?.children,predicate)];
}
const text=tree=>all(tree,n=>typeof n==="string").join(" ");
for(const language of ["vi","en"]){
  test(`${language}: completed cached list offers explicit refresh and its update time without restarting progress`,()=>{
    let calls=0;
    const done=render({language,hasData:true,fetching:false,updatedAt:1700000000000,onRetry:()=>calls++});
    assert.match(text(done),language==="vi"?/Cập nhật lúc/:/Updated at/);
    assert.match(text(done),language==="vi"?/Làm mới/:/Refresh/);
    assert.match(text(done),/COMPLETE DATA/);
    const button=all(done,n=>n?.props?.["data-testid"]==="campaign-list-refresh")[0];
    button.props.onClick();assert.equal(calls,1);
    assert.equal(all(done,n=>n?.props?.["data-testid"]==="campaign-load-counter").length,0);
    assert.equal(all(render({language,hasData:true,fetching:true,onRetry:()=>calls++}),n=>n?.props?.["data-testid"]==="campaign-list-refresh").length,0);
  });
  test(`${language}: only the actual count is visible until a complete dataset exists`,()=>{
    const tree=render({language}),copy=text(tree);
    assert.match(copy,language==="vi"?/Đã tải 25\/60 chiến dịch/:/Loaded 25\/60 campaigns/);
    assert.doesNotMatch(copy,/COMPLETE DATA|%/);
    assert.equal(all(tree,n=>n?.props?.["data-testid"]==="campaign-list-skeleton").length,0);
    assert.equal(tree.props["aria-busy"],true);
    assert.match(text(render({language,total:null,loaded:0})),/0\/…/);
  });
  test(`${language}: old complete rows remain visible during refresh; empty state waits for completion`,()=>{
    assert.match(text(render({language,hasData:true})),/COMPLETE DATA/);
    assert.doesNotMatch(text(render({language,hasData:true,empty:true})),/COMPLETE DATA/);
    const done=render({language,hasData:true,fetching:false,empty:true});
    assert.match(text(done),/COMPLETE DATA/);
    assert.equal(all(done,n=>n?.props?.["data-testid"]==="campaign-load-counter").length,0);
  });
}
test("load errors preserve old rows, never reveal staging data, and offer a read-only retry",()=>{
  let retried=0;
  const failed=render({failed:true,fetching:false,onRetry:()=>retried++});
  assert.doesNotMatch(text(failed),/COMPLETE DATA/);
  all(failed,n=>n?.type==="button")[0].props.onClick();assert.equal(retried,1);
  assert.match(text(render({failed:true,fetching:false,hasData:true})),/COMPLETE DATA/);
});
test("page gates every bulk entry/submit on a complete, current dataset and uses the scoped loader",()=>{
  assert.match(page,/useCompleteCampaigns\(user \?/);
  assert.match(page,/const campaignDataBlocked=campaigns\.isFetching\|\|!campaigns\.data\|\|campaigns\.isError/);
  for(const name of ["pauseAllCampaigns","submitBulkResume","submitBulkTemplate","removeFilteredCampaigns"]){
    assert.match(page,new RegExp(`async function ${name}\\(\\) \\{\\s+if\\(campaignDataBlocked\\)return;`));
  }
  assert.match(page,/loaded=\{campaigns\.loadProgress\.loaded\} total=\{campaigns\.loadProgress\.total\}/);
  assert.match(page,/disabled=\{\(campaignDataBlocked&&!bulkJob\)/);
  assert.doesNotMatch(source,/<progress|animate-pulse|setTimeout|%/);
});
