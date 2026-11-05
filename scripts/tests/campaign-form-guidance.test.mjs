test("support-session campaign controls stay explicitly allowlisted", async () => {
  const fsModule = await import("node:fs");
  const vmModule = await import("node:vm");
  const source = fsModule.readFileSync(new URL("../../artifacts/api-server/src/routes/telecampaign.ts", import.meta.url), "utf8");
  const start = source.indexOf("router.use((req, res, next): void => {");
  const end = source.indexOf('\nrouter.get("/notifications"', start);
  assert.ok(start >= 0 && end > start);
  const guard = vmModule.runInNewContext("let guard;const router={use(fn){guard=fn}};"
    + source.slice(start, end).replace(": void =>", " =>") + ";guard;");
  const allowed = (body, support = true, method = "PATCH", path = "/campaigns/fixture") => {
    let passed = false;
    const res = {status(){return this;},json(){}};
    guard({body,supportSession:support?{}:undefined,method,path},res,()=>{passed=true;});
    return passed;
  };
  assert.equal(allowed({name:"edited",timingMode:"round",groupIntervalSeconds:300}),true);
  assert.equal(allowed({timingMode:"round",groupIntervalSeconds:600,role:"admin"}),false);
  assert.equal(allowed({timingMode:"round",status:"queued"}),false);
  assert.equal(allowed({timingMode:"round"},true,"POST"),false);
  assert.equal(allowed({timingMode:"round"},false),true);
  assert.equal(allowed({status:"queued"}),true);
  assert.equal(allowed({status:"paused"}),true);
  assert.equal(allowed({status:"cancelled"}),false);
  assert.equal(allowed({},true,"POST","/campaigns"),true);
  assert.equal(allowed({action:"resume"},true,"POST","/campaigns/bulk-control"),true);
  assert.equal(allowed({action:"pause"},true,"POST","/campaigns/bulk-control"),true);
  assert.equal(allowed({action:"unknown"},true,"POST","/campaigns/bulk-control"),false);
  assert.equal(allowed({kind:"delete_campaigns"},true,"POST","/operations"),true);
  assert.equal(allowed({kind:"delete_account"},true,"POST","/operations"),false);
  assert.equal(allowed({},true,"DELETE","/campaigns/fixture"),true);
  assert.equal(allowed({},true,"DELETE","/telegram/accounts/fixture"),false);
  assert.equal(allowed({},true,"POST","/operations/fixture/retry"),false);
  assert.equal(allowed({},true,"POST","/campaigns/bulk-control/jobs/fixture/retry"),true);
  assert.equal(allowed({},true,"POST","/campaigns/bulk-control/jobs/fixture/cleanup-preview"),true);
  assert.equal(allowed({},true,"POST","/campaigns/bulk-control/jobs/fixture/cleanup-confirm"),true);
  assert.equal(allowed({},true,"POST","/campaigns/bulk-template"),false);
  assert.equal(allowed({},true,"POST","/campaigns/fixture/clone"),false);
});
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const components = new URL("../../artifacts/telecampaign/src/components/", import.meta.url);
const sources = Object.fromEntries(["campaign-field-guidance", "campaign-form-modal", "quick-send-wizard"]
  .map(name => [name, fs.readFileSync(new URL(name + ".tsx", components), "utf8")]));
const jsx = (type, props) => ({ type, props: props ?? {} });
const compiled = Object.fromEntries(Object.entries(sources).map(([name, source]) => {
  const result = ts.transpileModule(source, { reportDiagnostics:true, compilerOptions: {
    module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX,
  } });
  assert.equal(result.diagnostics?.length ?? 0, 0, name);
  return [name,result.outputText];
}));
function load(name, mocks) {
  const exports = {};
  vm.runInNewContext(compiled[name], { exports, require:dep => {
    if (!(dep in mocks)) throw Error("UNMOCKED_IMPORT_" + dep);
    return mocks[dep];
  }, Date, Intl, Map, Set, Number, crypto:globalThis.crypto, window:mocks.window });
  return exports;
}
const guidance = load("campaign-field-guidance", {"react/jsx-runtime":{jsx,jsxs:jsx}});
const expand = node => {
  if (!node || typeof node !== "object") return node;
  if (typeof node.type === "function" && ["CampaignFieldNote","CampaignGroupInterval","GroupCountRecommendation","DelayExamples","DelayFields","ReviewItem"].includes(node.type.name)) return expand(node.type(node.props));
  return {...node,props:{...node.props,children:[node.props.children].flat(Infinity).map(expand)}};
};
const nodes = node => !node || typeof node !== "object" ? [] : [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
const textOf = node => typeof node === "string" || typeof node === "number" ? String(node) : [node?.props?.children].flat(Infinity).map(textOf).join(" ");
const baseDraft = {accountId:"account",destinationIds:["A","B"],mode:"text",content:"Fixture content",sourceMessageId:"",
  campaignName:"Saved draft name",scheduleMode:"later",scheduleDate:"2026-12-04",scheduleTime:"08:15",repeatCount:"777",delayMin:"10800",delayMax:"18000"};

function fixture(name,{language="vi",plan="pro",step=3,draft=baseDraft,editing=null}={}) {
  let index=0, state=[], lang=language;
  const mutations=[];
  const react = {
    useState(initial){const n=index++;if(!(n in state))state[n]=typeof initial==="function"?initial():initial;
      // Render a wizard step without performing any network mutation.
      if(name==="quick-send-wizard" && typeof initial==="number" && initial===1 && state[n]===1)state[n]=step;
      return [state[n],value=>{state[n]=typeof value==="function"?value(state[n]):value;}];},
    useRef(initial){const n=index++;return state[n]??(state[n]={current:initial});},
    useMemo:fn=>fn(),useEffect(){},
  };
  const data = {
    useListTelegramAccounts:[{id:"account",name:"Fixture account",status:"connected"}],
    useListDestinations:["A","B","C","D","E","F","G"].map(id=>({id,accountId:"account",telegramId:id,title:id,canPost:true,kind:"group",topicId:null})),
    useListCampaigns:[], useListMessageTemplates:[{id:"template",name:"Fixture template",mode:"text"}],
    useGetAccountSummary:{subscription:{plan}},useGetSystemDefaults:{campaignDefaults:{roundDelayMinSeconds:3600,roundDelayMaxSeconds:3600}},
    useListTelegramSavedMessages:[],useGetGroupLibraryAccess:{canView:false,canOpenLinks:false},useGetGroupLibrary:{groups:[]},
  };
  const api = new Proxy({}, {get:(_,key)=>String(key).startsWith("get")?()=>[key]:()=>({
    data:data[key],isLoading:false,isFetching:false,isPending:false,
    refetch:async()=>{},mutate:(...args)=>mutations.push(args),mutateAsync:async(...args)=>{mutations.push(args);return{};},
  })});
  const other = new Proxy({}, {get:(_,key)=>String(key)});
  const mocks = {
    react,"react/jsx-runtime":{jsx,jsxs:jsx},"lucide-react":other,
    "@workspace/api-client-react":api,"@/components/layout/AppLayout":other,
    "@/lib/i18n":{useLanguage:()=>({language:lang}),localizedErrorMessage:(_e,_l,f)=>f},
    "@/lib/auth":{useAuth:()=>({user:{id:"fixture",role:"user"}})},
    "@/lib/use-complete-campaigns":{useCompleteCampaigns:()=>({data:[],isLoading:false,isFetching:false,upsert(){}})},
    "@/components/campaign-creation-progress":{CampaignCreationProgress:()=>null},
    "@/components/campaign-field-guidance":guidance,
    "@/lib/telegram-restrictions":{canChooseRestrictedDestination:()=>true,temporaryRestrictionUntil:()=>null,
      suggestedRestrictionSchedule:()=>null,localScheduleFields:()=>({}),scheduleMeetsRestrictionSuggestion:()=>true},
    "@/lib/telegram-sync":{DESTINATION_SYNC_TTL_MS:60000,destinationSyncIsFresh:()=>true},
    "@/lib/quick-send-groups":{filterDestinationsForAccount:d=>d,splitGroupLibrary:()=>({visibleGroups:[],hiddenCount:0}),getLibraryGroupStatus:()=>""},
    wouter:{useLocation:()=>["/dashboard",()=>{}]},
    window:{localStorage:{getItem:()=>draft?JSON.stringify(draft):null,setItem(){},removeItem(){}}},
  };
  const module=load(name,mocks);
  return {render(){index=0;return expand(name==="quick-send-wizard"?
    module.QuickSendWizard({onClose(){},onCreated(){}}):
    module.CampaignFormModal({editingCampaign:editing,onClose(){},onSaved(){}}));},language(value){lang=value;},mutations};
}
for(const language of ["vi","en"]) {
  test(`delay examples are collapsed, accurate, bilingual and do not promise daily counts (${language})`,()=>{
    const tree=expand(guidance.DelayExamples({language}));
    assert.equal(tree.type,"details");assert.equal(tree.props.open,undefined);
    assert.equal(nodes(tree).filter(n=>n.type==="summary").length,1);
    const rows=nodes(tree).filter(n=>n.type==="tbody")[0].props.children;
    assert.equal(rows.length,7);
    const expected=[3600,7200,14400,21600,28800,43200,86400];
    rows.forEach((row,i)=>assert.deepEqual(nodes(row).filter(n=>n.type==="td").map(n=>n.props.children[0]),[expected[i],expected[i]]));
    const text=textOf(tree);
    for(const term of ["10800","18000","A","B","C","Telegram"])assert.ok(text.includes(term));
    assert.match(text,language==="vi"?/không đảm bảo chính xác/:/not guaranteed/);
    assert.match(text,language==="vi"?/gửi xong vòng này/:/after completing this round/);
    assert.ok(text.includes("08:05") && text.includes("09:10"));
  });
  test(`create/edit campaign helpers retain controlled values, package limits and default 300 (${language})`,()=>{
    const editing={id:"existing",name:"Untouched name",telegramAccountId:"account",templateId:"template",destinationIds:["A"],
      repeatCount:777,roundDelayMinSeconds:10800,roundDelayMaxSeconds:18000,scheduledAt:"2026-12-04T08:15:00Z",status:"paused"};
    for(const plan of ["plus","pro","business"]) {
      const f=fixture("campaign-form-modal",{language,plan,editing});
      let tree=f.render(), all=nodes(tree);
      const values=()=>nodes(tree).filter(n=>["input","select"].includes(n.type)).map(n=>n.props.value);
      const before=values();
      assert.equal(all.find(n=>n.props["data-testid"]==="campaign-name").props.value,"Untouched name");
      const repeat=all.find(n=>n.type==="input"&&n.props["aria-describedby"]==="campaign-repeat-count-hint");
      assert.equal(repeat.props.value,"777");assert.equal(repeat.props.max,plan==="plus"?300:undefined);
      for(const field of ["name","account","template","destinations","repeat","delayMin","delayMax","dateOptional","timeOptional"])assert.ok(all.some(n=>n.props["data-guidance"]===field),field);
      f.language(language==="vi"?"en":"vi");tree=f.render();assert.deepEqual(values(),before);
      assert.equal(f.mutations.length,0);
    }
    const create=nodes(fixture("campaign-form-modal",{language}).render());
    assert.equal(create.find(n=>n.type==="input"&&n.props["aria-describedby"]==="campaign-repeat-count-hint").props.value,"300");
  });
  test(`Quick Send includes notes on all three steps and preserves saved/input values (${language})`,()=>{
    for(const [step,fields] of [[1,["account","destinations"]],[2,["text"]],[3,["name","repeat","delayMin","delayMax","schedule","dateRequired","timeRequired"]]]) {
      const f=fixture("quick-send-wizard",{language,step});
      let tree=f.render(),all=nodes(tree);
      for(const field of fields)assert.ok(all.some(n=>n.props["data-guidance"]===field),field);
      if(step===3) {
        const inputs=()=>nodes(tree).filter(n=>n.type==="input");
        const repeat=inputs().find(n=>n.props.type==="number"&&n.props.min==="1");
        assert.equal(repeat.props.value,"777");assert.equal(repeat.props.max,undefined);
        repeat.props.onChange({target:{value:"900"}});
        tree=f.render();f.language(language==="vi"?"en":"vi");tree=f.render();
        assert.equal(inputs().find(n=>n.props.min==="1").props.value,"900");
        for(const value of ["Saved draft name","10800","18000","2026-12-04","08:15"])assert.ok(inputs().some(n=>n.props.value===value),value);
      }
      assert.equal(f.mutations.length,0);
    }
    const forward=fixture("quick-send-wizard",{language,step:2,draft:{...baseDraft,mode:"forward"}});
    assert.ok(nodes(forward.render()).some(n=>n.props["data-guidance"]==="saved"));
    const fresh=nodes(fixture("quick-send-wizard",{language,draft:null,step:3,plan:"plus"}).render());
    const repeat=fresh.find(n=>n.type==="input"&&n.props.min==="1");
    assert.equal(repeat.props.value,"300");assert.equal(repeat.props.max,300);
  });
  test(`group spacing is hidden for one group and the five-group advice is not a cap (${language})`,()=>{
    for (const count of [1,2,4,5,6]) {
      const ids=["A","B","C","D","E","F"].slice(0,count);
      const campaign={id:"edit",name:"Fixture",telegramAccountId:"account",templateId:"template",destinationIds:ids,
        timingMode:"round",groupIntervalSeconds:300,repeatCount:300,roundDelayMinSeconds:3600,roundDelayMaxSeconds:3600,status:"paused"};
      const cf=fixture("campaign-form-modal",{language,editing:campaign});
      let tree=cf.render(),all=nodes(tree);
      assert.equal(all.some(n=>n.props["data-testid"]==="campaign-group-interval"),count>1);
      assert.equal(all.some(n=>n.props["data-testid"]==="campaign-group-recommendation"),count>=5);
      if(count>1) {
        const field=all.find(n=>n.props["data-testid"]==="campaign-group-interval");
        assert.equal(field.props.value,"5");
        field.props.onChange({target:{value:"10"}});
        tree=cf.render();cf.language(language==="vi"?"en":"vi");tree=cf.render();
        assert.equal(nodes(tree).find(n=>n.props["data-testid"]==="campaign-group-interval").props.value,"10");
      }
      const qs=fixture("quick-send-wizard",{language,step:3,draft:{...baseDraft,destinationIds:ids,groupIntervalMinutes:"10"}});
      const qnodes=nodes(qs.render());
      assert.equal(qnodes.some(n=>n.props["data-testid"]==="quick-send-group-interval"),count>1);
      const groups=fixture("quick-send-wizard",{language,step:1,draft:{...baseDraft,destinationIds:ids}});
      assert.equal(nodes(groups.render()).some(n=>n.props["data-testid"]==="campaign-group-recommendation"),count>=5);
      if(count>=5) {
        const advice=all.find(n=>n.props["data-testid"]==="campaign-group-recommendation");
        assert.match(textOf(advice),language==="vi"?/vẫn có thể tiếp tục/:/still continue/);
      }
      assert.equal(cf.mutations.length,0);assert.equal(qs.mutations.length,0);
    }
  });
}
