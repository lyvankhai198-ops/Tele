import {useCallback,useEffect,useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {AlertCircle,CheckCircle2,ChevronDown,Clock3,LoaderCircle,X} from "lucide-react";
import {useOperations} from "@/lib/operations";
import {useLanguage} from "@/lib/i18n";
import {deletionSyncToken,invalidateDeletionDependencies,reconcileObservedCampaigns} from "@/lib/reconcile-campaign-deletions";

type Receipts={scope:string;hidden:string[];autoHidden:string[]};
type Operation=NonNullable<ReturnType<typeof useOperations>["data"]>[number];
const COMPLETION_DELAY=5000;

export function OperationsProgress(){
  const operations=useOperations(),{language}=useLanguage(),client=useQueryClient(),vi=language==="vi";
  const seen=useRef(new Map<string,string>()),activeScope=useRef(operations.scope);
  const completionTimes=useRef(new Map<string,number>()),completionTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const [receipts,setReceipts]=useState<Receipts>({scope:"",hidden:[],autoHidden:[]});
  const [retrying,setRetrying]=useState<string|null>(null),[expanded,setExpanded]=useState(false),[showHistory,setShowHistory]=useState(false);
  const [syncFailed,setSyncFailed]=useState(false);
  const storage=`telecamp-operation-receipts:${operations.scope}`;
  activeScope.current=operations.scope;

  useEffect(()=>{
    activeScope.current=operations.scope;
    setSyncFailed(false);
    return()=>{activeScope.current="";};
  },[operations.scope]);
  useEffect(()=>{
    for(const timer of completionTimers.current.values())clearTimeout(timer);
    completionTimers.current.clear();completionTimes.current.clear();seen.current.clear();
    let hidden:string[]=[],autoHidden:string[]=[],times:Record<string,number>={};
    try{hidden=JSON.parse(localStorage.getItem(storage)??"[]");}catch{}
    try{autoHidden=JSON.parse(localStorage.getItem(storage+":auto-hidden")??"[]");}catch{}
    try{times=JSON.parse(localStorage.getItem(storage+":completed-at")??"{}");}catch{}
    Object.entries(times).forEach(([id,time])=>completionTimes.current.set(id,time));
    setReceipts({scope:storage,hidden,autoHidden});
    setExpanded(false);setShowHistory(false);
    return()=>{for(const timer of completionTimers.current.values())clearTimeout(timer);completionTimers.current.clear();};
  },[storage]);

  const recordAutoHidden=useCallback((id:string,operationScope:string,receiptKey:string)=>{
    if(activeScope.current!==operationScope)return;
    setReceipts(current=>{
      const base=current.scope===receiptKey?current:{scope:receiptKey,hidden:[],autoHidden:[]};
      const next={...base,autoHidden:[...new Set([...base.autoHidden,id])]};
      try{localStorage.setItem(receiptKey+":auto-hidden",JSON.stringify(next.autoHidden));}catch{}
      return next;
    });
  },[]);
  useEffect(()=>{
    const operationScope=operations.scope,receiptKey=storage;
    for(const job of operations.data??[]){
      if(job.state!=="completed")continue;
      let time=completionTimes.current.get(job.id);
      if(time===undefined){
        time=Date.now();completionTimes.current.set(job.id,time);
        try{
          const times=JSON.parse(localStorage.getItem(receiptKey+":completed-at")??"{}");
          times[job.id]=time;localStorage.setItem(receiptKey+":completed-at",JSON.stringify(times));
        }catch{}
      }
      const isHidden=(receipts.scope===receiptKey&&(receipts.autoHidden.includes(job.id)||receipts.hidden.includes(job.id)));
      if(isHidden||completionTimers.current.has(job.id))continue;
      const remaining=COMPLETION_DELAY-(Date.now()-time);
      if(remaining<=0)recordAutoHidden(job.id,operationScope,receiptKey);
      else completionTimers.current.set(job.id,setTimeout(()=>{
        completionTimers.current.delete(job.id);recordAutoHidden(job.id,operationScope,receiptKey);
      },remaining));
    }
  },[operations.data,storage,operations.scope,receipts.scope,receipts.hidden,receipts.autoHidden,recordAutoHidden]);

  useEffect(()=>{
    const preparing=(operations.data??[]).some(j=>j.kind==="prepare_campaign"&&(j.state==="queued"||j.state==="running"));
    let invalidate=false;
    for(const job of operations.data??[]){
      let applied:string[]=[];try{applied=JSON.parse(localStorage.getItem(storage+":applied")??"[]");}catch{}
      if(job.kind==="delete_account"||job.kind==="delete_campaigns"){
        if(applied.includes(job.id)||seen.current.get(job.id)==="applied")continue;
        const token=deletionSyncToken(job),scope=operations.scope;
        if(seen.current.get(job.id)===token)continue;
        seen.current.set(job.id,token);
        void reconcileObservedCampaigns(client,scope,()=>activeScope.current===scope).then(()=>{
          if(activeScope.current!==scope)return;
          setSyncFailed(false);
          if(job.state==="completed"){
            seen.current.set(job.id,"applied");
            let latest:string[]=[];try{latest=JSON.parse(localStorage.getItem(storage+":applied")??"[]");}catch{}
            try{localStorage.setItem(storage+":applied",JSON.stringify([...new Set([...latest,job.id])].slice(-100)));}catch{}
            void invalidateDeletionDependencies(client);
          }
        }).catch(()=>{
          if(activeScope.current!==scope)return;
          if(seen.current.get(job.id)===token)seen.current.delete(job.id);
          setSyncFailed(true);
        });
        continue;
      }
      if(job.state==="completed"&&!applied.includes(job.id)&&seen.current.get(job.id)!=="applied"
        &&(job.kind!=="prepare_campaign"||!preparing)){
        invalidate=true;seen.current.set(job.id,"applied");
        try{localStorage.setItem(storage+":applied",JSON.stringify([...applied,job.id].slice(-100)));}catch{}
      }
    }
    if(invalidate){
      void invalidateDeletionDependencies(client);
      const scope=operations.scope;
      void reconcileObservedCampaigns(client,scope,()=>activeScope.current===scope).catch(()=>{});
    }
  },[operations.data,operations.dataUpdatedAt,client,storage,operations.scope]);

  const allJobs=operations.data??[];
  const scopeReceipts=receipts.scope===storage?receipts:{scope:storage,hidden:[],autoHidden:[]};
  const activeJobs=allJobs.filter(job=>job.state==="queued"||job.state==="running");
  const failedJobs=allJobs.filter(job=>job.state==="failed");
  const recentCompletions=allJobs.filter(job=>job.state==="completed"
    &&!scopeReceipts.hidden.includes(job.id)&&!scopeReceipts.autoHidden.includes(job.id));
  const otherJobs=allJobs.filter(job=>job.state!=="queued"&&job.state!=="running"&&job.state!=="failed"&&job.state!=="completed");
  const hasTaskBar=activeJobs.length>0||failedJobs.length>0||recentCompletions.length>0;
  useEffect(()=>{if(!hasTaskBar)setExpanded(false);},[hasTaskBar]);
  if(!allJobs.length&&!operations.isError&&!syncFailed)return null;

  const names:Record<string,string>=vi
    ?{delete_account:"Xoá tài khoản Telegram",delete_campaigns:"Xoá chiến dịch",sync_groups:"Đồng bộ nhóm",prepare_campaign:"Chuẩn bị lượt gửi"}
    :{delete_account:"Delete Telegram account",delete_campaigns:"Delete campaigns",sync_groups:"Sync groups",prepare_campaign:"Prepare deliveries"};
  const phases:Record<string,string>=vi
    ?{queued:"Đang chờ xử lý",logs:"Đang xoá nhật ký liên quan",targets:"Đang xoá lượt gửi",campaigns:"Đang xoá chiến dịch",groups:"Đang xoá nhóm đồng bộ",account:"Đang hoàn tất xoá tài khoản",sync:"Đang đọc nhóm từ Telegram",preparing:"Đang tạo lượt gửi",reset:"Đang chuẩn bị lại lịch gửi",retiming:"Đang khôi phục lịch gửi",completed:"Đã hoàn tất",cancelled:"Đã dừng theo yêu cầu xoá"}
    :{queued:"Waiting to process",logs:"Removing related logs",targets:"Removing deliveries",campaigns:"Removing campaigns",groups:"Removing synced groups",account:"Finishing account removal",sync:"Reading Telegram groups",preparing:"Preparing deliveries",reset:"Preparing the updated schedule",retiming:"Restoring the delivery schedule",completed:"Completed",cancelled:"Stopped by deletion request"};
  const dismiss=(id:string)=>{
    const next=[...new Set([...scopeReceipts.hidden,id])];
    setReceipts(current=>({... (current.scope===storage?current:scopeReceipts),hidden:next}));
    try{localStorage.setItem(storage,JSON.stringify(next));}catch{}
  };
  const countSummary=vi
    ?`${activeJobs.length} đang chạy · ${recentCompletions.length} đã hoàn tất · ${failedJobs.length} cần chú ý`
    :`${activeJobs.length} active · ${recentCompletions.length} completed · ${failedJobs.length} need attention`;
  const detailsLabel=vi?"Xem chi tiết":"View details";
  const historyLabel=vi?"Tác vụ gần đây":"Recent tasks";
  const earlierJobs=allJobs.filter(job=>job.state!=="completed");
  const completedJobs=allJobs.filter(job=>job.state==="completed");

  const renderJob=(job:Operation)=> {
    const active=job.state==="queued"||job.state==="running",failed=job.state==="failed";
    const deletion=job.kind==="delete_account"||job.kind==="delete_campaigns";
    const percent=job.total!==null&&job.total>0?Math.min(100,Math.floor(job.processed/job.total*100)):null;
    const unit=job.unit==="groups"?(vi?"nhóm":"groups"):job.unit==="deliveries"?(vi?"lượt gửi":"deliveries"):(vi?"bản ghi":"records");
    const preparationComplete=job.kind==="prepare_campaign"&&job.state==="completed";
    return <article key={job.id} data-testid={`operation-${job.id}`} className={`rounded-xl border p-3 ${failed?"border-amber-200 bg-amber-50":active?"border-indigo-200 bg-indigo-50/70":"border-emerald-200 bg-emerald-50/70"}`}>
      <div className="flex items-start gap-3">
        {active?<LoaderCircle size={19} className="mt-0.5 shrink-0 animate-spin text-indigo-600"/>:failed?<AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-700"/>:<CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-700"/>}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">{names[job.kind]??job.kind}</h2>
          <p className="truncate text-xs text-slate-600">{job.label}</p>
          <p role="status" className="mt-2 text-sm font-semibold text-slate-800">{job.error==="OPERATION_AUTO_RETRY"
            ?(vi?"Đang chờ dữ liệu — sẽ tự tiếp tục":"Waiting for data — resuming automatically")
            :preparationComplete
              ?(vi?"Khi hoàn tất bước chuẩn bị, lượt gửi vẫn chờ đến lịch; tin nhắn chưa được gửi tại thời điểm đó.":"At preparation completion, delivery was still waiting for its schedule; messages had not yet been sent.")
              :failed?(deletion?(vi?"Xoá chưa hoàn tất — cần kiểm tra":"Deletion incomplete — needs investigation"):(vi?"Tạm dừng — cần tiếp tục":"Paused — resume required")):(phases[job.phase]??(vi?"Đang xác định dữ liệu liên quan":"Finding related data"))}</p>
          <p className="mt-1 text-xs tabular-nums text-slate-600">{job.processed.toLocaleString()}{job.total!==null?` / ${job.total.toLocaleString()}`:""} {unit}{percent!==null?` · ${percent}%`:""}</p>
          {job.phase==="reset"&&<p className="mt-1 text-xs text-slate-600">{vi?"Đã dọn":"Cleared"} {(job.stageProcessed??0).toLocaleString()} {vi?"lượt cũ":"previous deliveries"}</p>}
          {percent!==null&&<div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-600 transition-[width]" style={{width:`${percent}%`}}/></div>}
          {(active||failed)&&<p className="mt-2 text-xs leading-relaxed text-slate-600">{failed
            ?deletion?(vi?"Yêu cầu xoá đã được ghi nhận và phần đã xử lý được giữ nguyên. Lỗi này cần được kiểm tra; không cần bấm tiếp tục hay gửi lại lệnh xoá.":"Your deletion request and completed work are retained. This error needs investigation; do not resume repeatedly or submit another deletion.")
              :(vi?"Phần đã xử lý được giữ nguyên. Tiếp tục chính tác vụ này, không tạo yêu cầu mới.":"Completed work is retained. Resume this operation instead of submitting another request.")
            :deletion
              ?(vi?"Hệ thống tự xử lý đến khi hoàn tất; không cần bấm tiếp tục hay gửi lại yêu cầu xoá. Có thể rời trang.":"Deletion continues automatically. No resume click or duplicate request is needed. You may leave this page.")
              :(vi?"Có thể rời trang; tác vụ vẫn chạy nền. Mở lại để xem tiến trình.":"You may leave this page. Work continues in the background and progress is available when you return.")}</p>}
          {failed&&!deletion&&!userReadOnly(operations.scope)&&<button type="button" data-testid={`resume-${job.id}`} disabled={retrying===job.id} className="mt-3 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold disabled:opacity-50"
            onClick={async()=>{setRetrying(job.id);try{await operations.retry(job.id);}catch{}finally{setRetrying(null);}}}>{retrying===job.id?(vi?"Đang tiếp tục…":"Resuming…"):(vi?"Tiếp tục tác vụ":"Resume operation")}</button>}
        </div>
        {job.state==="completed"&&!showHistory&&<button type="button" data-testid={`dismiss-${job.id}`} onClick={()=>dismiss(job.id)} aria-label={vi?"Ẩn thông báo":"Dismiss"} className="rounded-lg p-1 text-slate-500"><X size={17}/></button>}
      </div>
    </article>;
  };

  return <section aria-label={vi?"Tiến trình tác vụ":"Background progress"} className="mb-5" data-testid="operations-progress">
    {syncFailed&&<div role="status" className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {vi?"Chưa đồng bộ được kết quả xoá. Danh sách hiện tại được giữ nguyên; hệ thống sẽ thử lại, không cần gửi lại lệnh xoá.":"Deletion results could not be synchronized. Your current list is preserved and synchronization will retry; do not submit deletion again."}
      <button type="button" className="ml-2 font-bold underline" onClick={()=>{seen.current.clear();void operations.refetch();}}>{vi?"Kiểm tra lại":"Check again"}</button>
    </div>}
    {operations.isError&&<div role="status" className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {vi?"Chưa lấy được tiến trình. Tác vụ có thể vẫn đang chạy; không gửi lại lệnh xoá.":"Progress is unavailable. Work may still be running; do not submit deletion again."}
      <button type="button" className="ml-2 font-bold underline" onClick={()=>void operations.refetch()}>{vi?"Kiểm tra lại":"Check again"}</button>
    </div>}
    {hasTaskBar&&<div className={`overflow-hidden rounded-2xl border ${failedJobs.length?"border-amber-300 bg-amber-50/80":activeJobs.length?"border-indigo-200 bg-indigo-50/60":"border-emerald-200 bg-emerald-50/60"}`}>
      <div className="flex min-h-12 items-center gap-2 p-2">
        <button type="button" data-testid="operations-disclosure" aria-label={detailsLabel} aria-expanded={expanded} aria-controls="operations-progress-details"
          onClick={()=>{if(!expanded)setShowHistory(false);setExpanded(!expanded);}} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left text-sm font-semibold text-slate-800 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600">
          {failedJobs.length?<AlertCircle size={18} className="shrink-0 text-amber-700"/>:activeJobs.length?<LoaderCircle size={18} className="shrink-0 animate-spin text-indigo-600"/>:<CheckCircle2 size={18} className="shrink-0 text-emerald-700"/>}
          <span className="min-w-0 flex-1 break-words text-xs leading-5 sm:text-sm">{countSummary}</span>
          <span className="hidden shrink-0 text-xs font-medium text-slate-500 sm:inline">{detailsLabel}</span>
          <ChevronDown size={17} className={`shrink-0 text-slate-500 transition-transform ${expanded?"rotate-180":""}`}/>
        </button>
        <button type="button" data-testid="operations-history-toggle" aria-expanded={showHistory} aria-controls="operations-progress-history"
          onClick={()=>{if(!showHistory)setExpanded(false);setShowHistory(!showHistory);}} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-slate-700 hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600">
          <Clock3 size={16}/><span>{historyLabel}</span>
        </button>
      </div>
    </div>}
    {!hasTaskBar&&!!allJobs.length&&<div className="flex justify-end">
      <button type="button" data-testid="operations-history-toggle" aria-expanded={showHistory} aria-controls="operations-progress-history"
        onClick={()=>setShowHistory(value=>!value)} className="rounded-md px-2 py-1 text-xs text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">{historyLabel}</button>
    </div>}
    <div id="operations-progress-details" data-testid="operations-progress-details" hidden={!expanded||!hasTaskBar} className="mt-2 max-h-[min(60dvh,28rem)] space-y-2 overflow-y-auto overscroll-contain pr-1">
      {[...activeJobs,...failedJobs,...otherJobs].map(renderJob)}
      {!!recentCompletions.length&&<section aria-label={vi?"Đã hoàn tất":"Completed"} className="space-y-2">
        <h3 className="px-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{vi?"Đã hoàn tất":"Completed"}</h3>
        {recentCompletions.map(renderJob)}
      </section>}
      {!activeJobs.length&&!failedJobs.length&&!otherJobs.length&&!recentCompletions.length&&<p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{vi?"Đã hoàn tất":"Completed"}</p>}
    </div>
    <div id="operations-progress-history" data-testid="operations-progress-history" hidden={!showHistory} className="mt-2 max-h-[min(60dvh,28rem)] space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white/70 p-2">
      {allJobs.length
        ?<>{earlierJobs.map(renderJob)}
          {!!completedJobs.length&&<section aria-label={vi?"Đã hoàn tất":"Completed"} className="space-y-2">
            <h3 className="px-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{vi?"Đã hoàn tất":"Completed"}</h3>
            {completedJobs.map(renderJob)}
          </section>}</>
        :<p className="p-2 text-sm text-slate-600">{vi?"Đã hoàn tất":"Completed"}</p>}
    </div>
  </section>;
}

function userReadOnly(scope:string){return !scope.endsWith(":self");}
