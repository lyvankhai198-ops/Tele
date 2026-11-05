import {useEffect,useState} from "react";
import {AlertCircle,CheckCircle2,LoaderCircle} from "lucide-react";
import type {BackgroundOperation} from "@workspace/api-client-react";
import {useOperations} from "@/lib/operations";
import {useLanguage} from "@/lib/i18n";

export function CampaignDeletionProgress({initialJob,label,error,onClose}:{
  initialJob:BackgroundOperation|null;label:string;error:string|null;onClose:()=>void;
}){
  const {t}=useLanguage();
  const [settled,setSettled]=useState(false);
  const operations=useOperations({follow:!!initialJob&&!settled});
  const job=operations.data?.find(item=>item.id===initialJob?.id)??initialJob;
  const completed=job?.state==="completed"&&job.phase!=="cancelled";
  const failed=job?.state==="failed"||job?.phase==="cancelled"||!!error;
  const percent=completed?100:job?.total&&job.total>0?Math.max(0,Math.min(100,Math.floor(job.processed/job.total*100))):null;
  useEffect(()=>{if(initialJob)void operations.refetch();},[initialJob?.id]);
  useEffect(()=>{if(completed||failed)setSettled(true);},[completed,failed]);
  return <div className="space-y-4" data-testid="campaign-deletion-progress" aria-live="polite">
    <div className={`rounded-xl border p-4 ${failed?"border-amber-200 bg-amber-50":completed?"border-emerald-200 bg-emerald-50":"border-indigo-200 bg-indigo-50"}`}>
      <div className="flex items-center gap-2">
        {failed?<AlertCircle className="h-5 w-5 shrink-0 text-amber-700"/>:completed?<CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700"/>:<LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-indigo-600"/>}
        <p role="status" className="text-sm font-bold">{completed?t("Completed"):failed?t("Deletion incomplete — needs investigation"):t("Deleting…")}</p>
      </div>
      <p className="mt-2 truncate text-sm text-slate-600">{label}</p>
      {percent!==null&&<p className="mt-3 text-right text-xs font-semibold tabular-nums">{`${percent}%`}</p>}
      {(!failed||job)&&<div role="progressbar" aria-label={t("Delete campaigns")} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={percent??undefined} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full bg-indigo-600 transition-[width] ${percent===null&&!failed?"animate-pulse":""}`}
          style={{width:percent===null?"30%":`${percent}%`}}/>
      </div>}
      {failed&&<p role="alert" className="mt-3 text-sm text-amber-900">{error??t("Your deletion request and completed work are retained. This error needs investigation; do not resume repeatedly or submit another deletion.")}
        {job?.error&&<code dir="ltr" className="mt-1 block break-all text-xs">{job.error}</code>}
      </p>}
    </div>
    {(operations.isError||(!initialJob&&error))&&!completed&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {t("Progress is unavailable. Work may still be running; do not submit deletion again.")}
      <button type="button" onClick={()=>void operations.refetch()} className="ml-2 font-bold underline">{t("Check again")}</button>
    </div>}
    <div className="flex justify-end">
      <button type="button" data-testid="campaign-deletion-close" disabled={!initialJob&&!error} onClick={onClose}
        className="rounded-xl bg-[#1a2b88] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{t("Close")}</button>
    </div>
  </div>;
}
