import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/OperationsProgress.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const creationSource=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/campaign-creation-progress.tsx",import.meta.url),"utf8");
const compiledCreation=ts.transpileModule(creationSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const node=(type,props)=>({type,props:props??{}});

function createEnvironment(){
  const storage=new Map(),timers=new Map();
  let now=10000,nextTimer=1;
  return {
    storage,
    localStorage:{
      getItem:key=>storage.get(key)??null,
      setItem:(key,value)=>storage.set(key,String(value)),
    },
    setTimeout(callback,delay){const id=nextTimer++;timers.set(id,{callback,due:now+Number(delay)});return id;},
    clearTimeout(id){timers.delete(id);},
    advance(milliseconds){
      now+=milliseconds;
      while(true){
        const due=[...timers.entries()].filter(([,timer])=>timer.due<=now).sort((a,b)=>a[1].due-b[1].due)[0];
        if(!due)break;
        timers.delete(due[0]);due[1].callback();
      }
    },
    date:{now:()=>now},
    pendingTimers:()=>timers.size,
  };
}

function render(language,jobs,scope="owner:self",environment=createEnvironment(),creation=null){
  const module={exports:{}},calls=[],slots=[],effects=new Map(),client={invalidateQueries(){}};
  let cursor=0,dirty=false,queuedEffects=[],current={nodes:[],text:""};
  const useState=initial=>{
    const index=cursor++;
    if(!(index in slots))slots[index]=typeof initial==="function"?initial():initial;
    return [slots[index],value=>{
      const next=typeof value==="function"?value(slots[index]):value;
      if(!Object.is(next,slots[index])){slots[index]=next;dirty=true;}
    }];
  };
  const useRef=initial=>{
    const index=cursor++;
    if(!slots[index]||slots[index].__fixtureRef!==true)slots[index]={__fixtureRef:true,current:initial};
    return slots[index];
  };
  const useCallback=(callback,deps)=>{
    const index=cursor++,previous=slots[index];
    if(previous?.__fixtureCallback&&deps.every((value,position)=>Object.is(value,previous.deps[position])))return previous.callback;
    slots[index]={__fixtureCallback:true,deps,callback};
    return callback;
  };
  const useEffect=(callback,deps)=>{const index=cursor++;queuedEffects.push({index,callback,deps});};
  const require=name=>name==="react"?{useCallback,useEffect,useRef,useState}
    :name==="react/jsx-runtime"?{jsx:node,jsxs:node,Fragment:"Fragment"}
    :name==="@tanstack/react-query"?{useQueryClient:()=>client}
    :name==="@/lib/operations"?{useOperations:()=>({data:jobs,dataUpdatedAt:0,isError:false,scope,retry:async id=>calls.push(id),refetch:async()=>{}})}
    :name==="@/lib/i18n"?{useLanguage:()=>({language,t:text=>language==="vi"?({"Completed":"Đã hoàn tất","Creating…":"Đang tạo...","Create campaign":"Tạo chiến dịch"}[text]??text):text}),localizedErrorMessage:(_error,_language,fallback)=>fallback}
    :name==="@/lib/reconcile-campaign-deletions"?{
      deletionSyncToken:()=> "token",
      invalidateDeletionDependencies:()=>Promise.resolve(),
      reconcileObservedCampaigns:()=>Promise.resolve(),
    }
    :{AlertCircle:"Alert",CheckCircle2:"Complete",ChevronDown:"Chevron",Clock3:"History",LoaderCircle:"Loader",X:"Close"};
  vm.runInNewContext(creation?compiledCreation:compiled,{module,exports:module.exports,require,Map,Date:environment.date,Math,JSON,Error,setTimeout:environment.setTimeout,clearTimeout:environment.clearTimeout,localStorage:environment.localStorage});

  const flush=()=>{
    let loops=0;
    do{
      dirty=false;cursor=0;queuedEffects=[];
      const tree=creation?module.exports.CampaignCreationProgress(creation):module.exports.OperationsProgress(),nodes=[];
      const visit=value=>{
        if(Array.isArray(value))return value.forEach(visit);
        if(value&&typeof value==="object"){nodes.push(value);if(!value.props.hidden)visit(value.props.children);}
      };
      visit(tree);
      const text=nodes.flatMap(item=>[item.props.children].flat().filter(value=>typeof value==="string"||typeof value==="number")).join(" ");
      current={tree,nodes,text};
      for(const effect of queuedEffects){
        const previous=effects.get(effect.index);
        const changed=!previous||!effect.deps||effect.deps.some((value,index)=>!Object.is(value,previous.deps[index]));
        if(changed){
          previous?.cleanup?.();
          const cleanup=effect.callback();
          effects.set(effect.index,{deps:effect.deps,cleanup});
        }
      }
      loops++;
    }while(dirty&&loops<20);
    assert.ok(loops<20,"fixture effects did not settle");
    return current;
  };
  flush();
  return {
    calls,environment,
    get nodes(){return current.nodes;},get text(){return current.text;},get tree(){return current.tree;},
    find(testId){return current.nodes.find(item=>item.props["data-testid"]===testId);},
    click(testId){const button=this.find(testId);assert.ok(button,`missing ${testId}`);button.props.onClick();flush();return this;},
    rerender(){flush();return this;},
    advance(milliseconds){environment.advance(milliseconds);flush();return this;},
    unmount(){for(const effect of effects.values())effect.cleanup?.();effects.clear();},
  };
}

const base={id:"fixture",kind:"delete_account",label:"Account A",state:"running",phase:"targets",processed:120,total:null,unit:"records"};
for(const language of ["vi","en"]){
  test(`${language}: compact task bar hides raw counts and shows indeterminate progress when total is unknown`,()=>{
    const r=render(language,[base]);
    assert.equal(r.find("operations-disclosure").props["aria-expanded"],false);
    assert.ok(!r.text.includes("120"));
    r.click("operations-disclosure");
    assert.ok(!r.text.includes("120"));assert.ok(!r.text.includes("%"));
    assert.equal(r.nodes.find(item=>item.props.role==="progressbar").props["aria-valuenow"],undefined);
  });
  test(`${language}: expanded preparation keeps exact per-operation progress`,()=>{
    const r=render(language,[{...base,kind:"prepare_campaign",phase:"preparing",processed:500,total:1500,unit:"deliveries"}]);
    assert.equal(r.find("operations-disclosure"),undefined,"creation progress is not shown outside the popup");
    r.click("operations-history-toggle");
    assert.ok(r.text.includes("33%"));assert.equal(r.nodes.find(item=>item.props.role==="progressbar").props["aria-valuenow"],33);
    assert.ok(!r.text.includes("500")&&!r.text.includes("1500"));
  });
  test(`${language}: recent-task history is independently reachable for completed work`,()=>{
    const r=render(language,[{...base,kind:"prepare_campaign",state:"completed",phase:"completed",processed:1500,total:1500,unit:"deliveries"}]);
    assert.equal(r.find("operations-disclosure"),undefined);
    assert.equal(r.find("operations-history-toggle").props["aria-expanded"],false);
    r.click("operations-history-toggle");
    assert.ok(r.text.includes(language==="vi"?"Đã hoàn tất":"Completed"));
    assert.ok(r.text.includes("100%"));
    assert.ok(!r.text.includes("1500"));
    assert.equal(r.find("operations-progress-details").props.hidden,true);
    r.click("operations-history-toggle");
    assert.equal(r.find("operations-history-toggle").props["aria-expanded"],false);
    assert.equal(r.find("operations-progress-history").props.hidden,true);
    assert.equal(r.find("operations-disclosure"),undefined);
    assert.equal(r.nodes.find(item=>item.props["data-testid"]==="operations-progress-history").props.id,"operations-progress-history");
  });
  test(`${language}: non-deletion retry resumes the same job and remains available in details`,async()=>{
    const r=render(language,[{...base,kind:"sync_groups",state:"failed"}]);
    r.click("operations-disclosure");
    await r.find("resume-fixture").props.onClick();
    assert.deepEqual(r.calls,["fixture"]);
  });
}

test("completed work stays only in history with no five-second timer or automatic deletion",()=>{
  const environment=createEnvironment();
  const completed={...base,id:"prepared",kind:"prepare_campaign",state:"completed",phase:"completed",processed:1500,total:1500,unit:"deliveries"};
  const first=render("en",[completed],"owner:self",environment);
  assert.equal(first.find("operations-disclosure"),undefined);
  assert.equal(environment.pendingTimers(),0);
  first.click("operations-history-toggle");
  assert.equal(first.find("operations-progress-details").props.hidden,true);
  first.advance(2500).rerender();
  assert.equal(environment.pendingTimers(),0);
  first.advance(6000);
  assert.equal(first.find("operations-disclosure"),undefined);
  assert.ok(first.find("operation-prepared"),"history does not disappear after five seconds");
  assert.ok(first.find("operations-history-toggle"),"subtle history control remains available");
  first.unmount();

  const returned=render("en",[completed],"owner:self",environment);
  assert.equal(returned.find("operations-disclosure"),undefined,"auto-hidden success does not return on navigation");
  returned.click("operations-history-toggle");
  assert.ok(returned.nodes.some(item=>item.props["data-testid"]==="operation-prepared"),"history retains the operation");
});

test("creation popup follows only its campaign, keeps percent and remains open at completion",()=>{
  let closed=0;
  const creation={campaign:{id:"campaign",name:"Fixture campaign",status:"draft"},name:"Fixture campaign",onClose:()=>closed++};
  const job={...base,kind:"prepare_campaign",campaignId:"campaign",phase:"preparing",processed:500,total:1500,createdAt:"2026-11-05T00:00:00Z"};
  const running=render("vi",[job,{...job,id:"unrelated",campaignId:"other",processed:1500,state:"completed"}],"owner:self",createEnvironment(),creation);
  assert.ok(running.text.includes("Đang tạo..."));
  assert.ok(running.text.includes("33%"));
  assert.ok(!running.text.includes("500")&&!running.text.includes("1500"));
  assert.equal(running.nodes.find(item=>item.props.role==="progressbar").props["aria-valuenow"],33);
  const done=render("vi",[{...job,state:"completed",phase:"completed",processed:1500}],"owner:self",createEnvironment(),creation);
  done.advance(6000);
  assert.ok(done.find("campaign-creation-progress"));
  assert.ok(done.text.includes("Đã hoàn tất")&&done.text.includes("100%"));
  assert.equal(closed,0,"completion must not close the popup automatically");
  done.click("campaign-creation-close");
  assert.equal(closed,1);
});
test("small synchronous creations finish without waiting for a nonexistent background operation",()=>{
  const creation={campaign:{id:"small",name:"Small campaign",status:"queued"},name:"Small campaign",onClose(){}};
  const done=render("en",[],"owner:self",createEnvironment(),creation);
  assert.ok(done.text.includes("Completed")&&done.text.includes("100%"));
});
test("creation popup preserves failure reasons and retries the same operation",async()=>{
  const creation={campaign:{id:"campaign",name:"Fixture",status:"draft"},name:"Fixture",onClose(){}};
  const r=render("en",[{...base,kind:"prepare_campaign",campaignId:"campaign",state:"failed",error:"57014",createdAt:"2026-11-05T00:00:00Z"}],"owner:self",createEnvironment(),creation);
  assert.ok(r.text.includes("57014"));
  await r.find("campaign-creation-retry").props.onClick();
  assert.deepEqual(r.calls,["fixture"]);
});

test("read-only support view cannot retry another user's operation",()=>{
  const r=render("en",[{...base,kind:"sync_groups",state:"failed"}],"admin:target").click("operations-disclosure");
  assert.ok(!r.nodes.some(item=>item.props["data-testid"]==="resume-fixture"));
});
test("clear all removes only completed history and persists through polling and navigation",()=>{
  const environment=createEnvironment();
  const completed={...base,id:"completed",state:"completed",phase:"completed"};
  const running={...base,id:"running",state:"running"};
  const failed={...base,id:"failed",state:"failed"};
  const jobs=[completed,running,failed];
  const first=render("vi",jobs,"owner:self",environment).click("operations-history-toggle");
  first.advance(6000);
  assert.ok(first.find("operation-completed"),"history is not automatically deleted after five seconds");
  first.click("operations-clear-completed");
  assert.equal(first.find("operation-completed"),undefined);
  assert.ok(first.find("operation-running"));
  assert.ok(first.find("operation-failed"));
  assert.equal(first.find("operations-clear-completed"),undefined);
  first.rerender();
  assert.equal(first.find("operation-completed"),undefined);
  first.unmount();
  const returned=render("vi",jobs,"owner:self",environment).click("operations-history-toggle");
  assert.equal(returned.find("operation-completed"),undefined);
  assert.ok(returned.find("operation-running"));
  assert.ok(returned.find("operation-failed"));
  assert.ok(render("vi",jobs,"other:self",environment).click("operations-history-toggle").find("operation-completed"),
    "clearing history must not affect another account scope");
});
test("clearing the last completed task removes the empty history control",()=>{
  const r=render("en",[{...base,state:"completed",phase:"completed"}]).click("operations-history-toggle");
  r.click("operations-clear-completed");
  assert.equal(r.find("operations-history-toggle"),undefined);
  assert.equal(r.find("operations-disclosure"),undefined);
});
for(const language of ["vi","en"])test(`${language}: a blocked deletion remains a persistent needs-attention task`,()=>{
  const r=render(language,[{...base,state:"failed"}]).click("operations-disclosure");
  assert.ok(!r.nodes.some(item=>item.props["data-testid"]==="resume-fixture"));
  assert.ok(r.text.includes(language==="vi"?"cần kiểm tra":"needs investigation"));
});
for(const language of ["vi","en"])test(`${language}: transient deletion errors continue automatically without a resume button`,()=>{
  const r=render(language,[{...base,state:"queued",error:"OPERATION_AUTO_RETRY"}]).click("operations-disclosure");
  assert.ok(r.text.includes(language==="vi"?"tự tiếp tục":"resuming automatically"));
  assert.ok(!r.nodes.some(item=>item.props["data-testid"]==="resume-fixture"));
});
