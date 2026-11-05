import {useEffect,useState} from "react";
import {AlertCircle,CheckCircle2,LoaderCircle} from "lucide-react";
import type {Campaign} from "@workspace/api-client-react";
import {useOperations} from "@/lib/operations";
import {localizedErrorMessage,useLanguage} from "@/lib/i18n";

export function CampaignCreationProgress({campaign,name,onClose}:{
  campaign:Campaign|null;name:string;onClose:()=>void;
}){
  const {language,t}=useLanguage();
  const [settled,setSettled]=useState(false);
  const operations=useOperations({follow:!!campaign&&campaign.status==="draft"&&!settled});
  const [retrying,setRetrying]=useState(false);
  const [retryError,setRetryError]=useState<string|null>(null);
  const job=operations.data?.filter(item=>item.kind==="prepare_campaign"&&item.campaignId===campaign?.id)
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const cancelled=job?.phase==="cancelled";
  const completed=!!campaign&&!cancelled&&(job?.state==="completed"||(!job&&campaign.status!=="draft"));
  const failed=job?.state==="failed"||cancelled;
  const percent=completed?100:job?.total&&job.total>0?Math.max(0,Math.min(100,Math.floor(job.processed/job.total*100))):null;
  useEffect(()=>{if(campaign)void operations.refetch();},[campaign?.id]);
  useEffect(()=>{if(job?.state==="completed"||job?.state==="failed")setSettled(true);},[job?.state]);
  return <div className="space-y-4" data-testid="campaign-creation-progress" aria-live="polite">
    <div className={`rounded-xl border p-4 ${failed?"border-amber-200 bg-amber-50":completed?"border-emerald-200 bg-emerald-50":"border-indigo-200 bg-indigo-50"}`}>
      <div className="flex items-center gap-2">
        {failed?<AlertCircle className="h-5 w-5 shrink-0 text-amber-700"/>:completed?<CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700"/>:<LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-indigo-600"/>}
        <p role="status" className="text-sm font-bold">{completed?t("Completed"):failed?t("Tác vụ cần kiểm tra"):t("Creating…")}</p>
      </div>
      <p className="mt-2 truncate text-sm text-slate-600">{campaign?.name??name}</p>
      {percent!==null&&<p className="mt-3 text-right text-xs font-semibold tabular-nums">{percent}%</p>}
      <div role="progressbar" aria-label={t("Create campaign")} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={percent??undefined} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full bg-indigo-600 transition-[width] ${percent===null&&!failed?"animate-pulse":""}`}
          style={{width:percent===null?"30%":`${percent}%`}}/>
      </div>
      {failed&&<p role="alert" className="mt-3 text-sm text-amber-900">
        {job?.error?localizedErrorMessage(new Error(job.error),language,t("Could not complete the operation. Please try again.")):t("Tác vụ cần kiểm tra")}
        {job?.error&&<code dir="ltr" className="mt-1 block break-all text-xs">{job.error}</code>}
      </p>}
    </div>
    {operations.isError&&!completed&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {t("Progress is unavailable. The campaign may still be processing; do not create it again.")}
      <button type="button" onClick={()=>void operations.refetch()} className="ml-2 font-bold underline">{t("Check again")}</button>
    </div>}
    {retryError&&<p role="alert" className="text-sm text-amber-900">{retryError}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {job?.state==="failed"&&operations.scope.endsWith(":self")&&<button type="button" disabled={retrying}
        data-testid="campaign-creation-retry"
        className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"
        onClick={async()=>{setRetrying(true);setRetryError(null);try{await operations.retry(job.id);}catch(error){
          setRetryError(localizedErrorMessage(error,language,t("Could not complete the operation. Please try again.")));
        }finally{setRetrying(false);}}}>{t("Resume operation")}</button>}
      <button type="button" data-testid="campaign-creation-close" disabled={!campaign} onClick={onClose}
        className="rounded-xl bg-[#1a2b88] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{t("Close")}</button>
    </div>
  </div>;
}
