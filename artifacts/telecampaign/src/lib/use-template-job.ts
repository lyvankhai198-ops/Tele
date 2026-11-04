import { useEffect, useRef, useState } from "react";
import { claimCampaignCompletion } from "./campaign-completion-receipt";
import {
  bulkUpdateCampaignTemplate, getCampaignTemplateJob, getLatestCampaignTemplateJob, retryCampaignTemplateJob,
  type BulkCampaignTemplateInput, type BulkCampaignTemplateResult,
} from "@workspace/api-client-react";

type Pending = BulkCampaignTemplateInput & {requestId:string};
export function useTemplateJob(owner: string | undefined, enabled: boolean, onFinished: () => void) {
  const [job,setJob]=useState<BulkCampaignTemplateResult|null>(null);
  const [waiting,setWaiting]=useState(true);
  const [uncertain,setUncertain]=useState(false);
  const [problem,setProblem]=useState(false);
  const [request,setRequest]=useState<Pending|null>(null);
  const completed=useRef(onFinished);completed.current=onFinished;
  const identity=useRef(owner);identity.current=owner;
  const storageKey=`telecamp-template-job:${owner ?? "anonymous"}`;
  const active=job?.status==="queued" || job?.status==="running";
  function remember(next: BulkCampaignTemplateResult) {
    setJob(next);setProblem(false);setUncertain(false);
    try {localStorage.setItem(storageKey,JSON.stringify({id:next.id}));}catch{/* private browsing */}
    if(claimCampaignCompletion(owner??"","template",next))completed.current();
  }
  useEffect(()=>{
    let disposed=false;
    setJob(null);setRequest(null);setUncertain(false);setWaiting(enabled);setProblem(false);
    if (!enabled || !owner) {setWaiting(false);return;}
    void(async()=>{
      try {
        let saved: {id?:string;input?:Pending}|null=null;
        try {saved=JSON.parse(localStorage.getItem(storageKey) ?? "null");}catch{/* invalid storage */}
        let next: BulkCampaignTemplateResult|null=null;
        if(saved?.id) {
          try {next=await getCampaignTemplateJob(saved.id);}
          catch(error) {
            const status=(error as {status?:number}).status;
            if(status!==404) throw error;
            if(saved.input && !disposed) {setRequest(saved.input);setUncertain(true);}
          }
        }
        // Server fallback restores operations submitted from another tab/device.
        const latest=await getLatestCampaignTemplateJob();
        if(latest && (!saved?.input || next || latest.id===saved.id || latest.status!=="completed")
          && (!next || latest.createdAt>next.createdAt)) next=latest;
        if(!disposed && next) remember(next);
      } catch {if(!disposed){setProblem(true);setUncertain(true);}}
      finally {if(!disposed)setWaiting(false);}
    })();
    return()=>{disposed=true;};
  },[storageKey,enabled]);
  useEffect(()=>{
    if(!enabled || !job || !active)return;
    let disposed=false;
    async function poll(){try{const next=await getCampaignTemplateJob(job!.id);if(!disposed)remember(next);}
      catch{if(!disposed)setProblem(true);}}
    const timer=setInterval(()=>{void poll();},2000);void poll();
    return()=>{disposed=true;clearInterval(timer);};
  },[job?.id,active,enabled,storageKey]);
  async function send(input: Pending) {
    const initialOwner=owner;
    setWaiting(true);setProblem(false);setRequest(input);
    // Persist BEFORE submitting, including chosen inputs so a lost acceptance
    // can be retried with exactly the same id rather than starting another job.
    try {localStorage.setItem(storageKey,JSON.stringify({id:input.requestId,input}));}catch{/* server latest remains available */}
    try {const next=await bulkUpdateCampaignTemplate(input);if(identity.current===initialOwner)remember(next);}
    catch(error) {
      if(identity.current!==initialOwner)return;
      const status=(error as {status?:number}).status;
      if(status===409) {
        try {const latest=await getLatestCampaignTemplateJob();if(latest){remember(latest);return;}}catch{/* retain request id */}
      }
      if([400,403,404].includes(status ?? 0)){
        setRequest(null);setUncertain(false);setProblem(true);
        try{localStorage.removeItem(storageKey);}catch{/* private browsing */}
      }else{setUncertain(true);setProblem(true);}
    }
    finally {if(identity.current===initialOwner)setWaiting(false);}
  }
  async function recover() {
    if(request){await send(request);return;}
    const initialOwner=owner;
    setWaiting(true);
    try {
      const latest=await getLatestCampaignTemplateJob();
      if(identity.current!==initialOwner)return;
      if(latest)remember(latest);else{setUncertain(false);setProblem(false);}
    }catch{if(identity.current===initialOwner)setProblem(true);}
    finally{if(identity.current===initialOwner)setWaiting(false);}
  }
  return {
    job,waiting,problem,uncertain,blocked:waiting || uncertain || active || job?.status==="failed",
    start:async(templateId:string,accountId:string)=>send({templateId,...(accountId?{telegramAccountId:accountId}:{}),requestId:crypto.randomUUID()}),
    recover,
    retry:async()=>{
      if(!job)return;const initialOwner=owner;setWaiting(true);
      try{const next=await retryCampaignTemplateJob(job.id);if(identity.current===initialOwner)remember(next);}
      catch{if(identity.current===initialOwner)setProblem(true);}
      finally{if(identity.current===initialOwner)setWaiting(false);}
    },
    clear:()=>{if(waiting || active || uncertain || job?.status==="failed")return;
      setJob(null);setRequest(null);try{localStorage.removeItem(storageKey);}catch{/* private browsing */}},
  };
}
