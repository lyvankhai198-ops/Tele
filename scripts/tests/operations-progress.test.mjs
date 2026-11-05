import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source=fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/OperationsProgress.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
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

function render(language,jobs,scope="owner:self",environment=createEnvironment()){
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
    :name==="@/lib/i18n"?{useLanguage:()=>({language})}
    :name==="@/lib/reconcile-campaign-deletions"?{
      deletionSyncToken:()=> "token",
      invalidateDeletionDependencies:()=>Promise.resolve(),
      reconcileObservedCampaigns:()=>Promise.resolve(),
    }
    :{AlertCircle:"Alert",CheckCircle2:"Complete",ChevronDown:"Chevron",Clock3:"History",LoaderCircle:"Loader",X:"Close"};
  vm.runInNewContext(compiled,{module,exports:module.exports,require,Map,Date:environment.date,Math,JSON,setTimeout:environment.setTimeout,clearTimeout:environment.clearTimeout,localStorage:environment.localStorage});

  const flush=()=>{
    let loops=0;
    do{
      dirty=false;cursor=0;queuedEffects=[];
      const tree=module.exports.OperationsProgress(),nodes=[];
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
  test(`${language}: compact task bar starts collapsed and details retain measured counts`,()=>{
    const r=render(language,[base]);
    assert.equal(r.find("operations-disclosure").props["aria-expanded"],false);
    assert.ok(!r.text.includes("120"));
    r.click("operations-disclosure");
    assert.ok(r.text.includes("120"));assert.ok(!r.text.includes("%"));
    assert.ok(!r.nodes.some(item=>item.props.role==="progressbar"));
  });
  test(`${language}: expanded preparation keeps exact per-operation progress`,()=>{
    const r=render(language,[{...base,kind:"prepare_campaign",phase:"preparing",processed:500,total:1500,unit:"deliveries"}]);
    r.click("operations-disclosure");
    assert.ok(r.text.includes("33%"));assert.equal(r.nodes.find(item=>item.props.role==="progressbar").props["aria-valuenow"],33);
  });
  test(`${language}: recent-task history is independently reachable for completed work`,()=>{
    const r=render(language,[{...base,kind:"prepare_campaign",state:"completed",phase:"completed",processed:1500,total:1500,unit:"deliveries"}]);
    assert.equal(r.find("operations-disclosure").props["aria-expanded"],false);
    assert.equal(r.find("operations-history-toggle").props["aria-expanded"],false);
    r.click("operations-history-toggle");
    assert.ok(r.text.includes(language==="vi"?"chưa được gửi tại thời điểm đó":"messages had not yet been sent"));
    assert.equal(r.find("operations-progress-details").props.hidden,true);
    r.click("operations-disclosure");
    assert.equal(r.find("operations-history-toggle").props["aria-expanded"],false);
    assert.equal(r.find("operations-progress-history").props.hidden,true);
    assert.equal(r.find("operations-disclosure").props["aria-expanded"],true);
    assert.equal(r.nodes.find(item=>item.props["data-testid"]==="operations-progress-history").props.id,"operations-progress-history");
  });
  test(`${language}: non-deletion retry resumes the same job and remains available in details`,async()=>{
    const r=render(language,[{...base,kind:"sync_groups",state:"failed"}]);
    r.click("operations-disclosure");
    await r.find("resume-fixture").props.onClick();
    assert.deepEqual(r.calls,["fixture"]);
  });
}

test("completion timer hides only the task bar, persists across remount, and leaves history reachable",()=>{
  const environment=createEnvironment();
  const completed={...base,id:"prepared",kind:"prepare_campaign",state:"completed",phase:"completed",processed:1500,total:1500,unit:"deliveries"};
  const first=render("en",[completed],"owner:self",environment);
  assert.ok(first.text.includes("1 completed"));
  assert.equal(environment.pendingTimers(),1);
  first.click("operations-disclosure");
  first.click("operations-history-toggle");
  assert.equal(first.find("operations-progress-details").props.hidden,true);
  first.advance(2500).rerender();
  assert.equal(environment.pendingTimers(),1,"a poll/render must not restart the completion timer");
  first.advance(2499);
  assert.ok(first.find("operations-disclosure"),"task remains visible before five seconds");
  first.advance(1);
  assert.equal(first.find("operations-disclosure"),undefined,"completed success bar auto-hides at five seconds");
  assert.ok(first.find("operations-history-toggle"),"subtle history control remains available");
  first.unmount();

  const returned=render("en",[completed],"owner:self",environment);
  assert.equal(returned.find("operations-disclosure"),undefined,"auto-hidden success does not return on navigation");
  returned.click("operations-history-toggle");
  assert.ok(returned.nodes.some(item=>item.props["data-testid"]==="operation-prepared"),"history retains the operation");
});

test("read-only support view cannot retry another user's operation",()=>{
  const r=render("en",[{...base,kind:"sync_groups",state:"failed"}],"admin:target").click("operations-disclosure");
  assert.ok(!r.nodes.some(item=>item.props["data-testid"]==="resume-fixture"));
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
