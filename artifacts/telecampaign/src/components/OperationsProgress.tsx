import {useEffect,useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {LoaderCircle,CheckCircle2,AlertCircle,X} from "lucide-react";
import {useOperations} from "@/lib/operations";
import {useLanguage} from "@/lib/i18n";
export function OperationsProgress(){
  const operations=useOperations(),{language}=useLanguage(),client=useQueryClient(),vi=language==="vi";
  const seen=useRef(new Map<string,string>()),[hidden,setHidden]=useState<string[]>([]),[retrying,setRetrying]=useState<string|null>(null),[limit,setLimit]=useState(5);
  const storage=`telecamp-operation-receipts:${operations.scope}`;
  useEffect(()=>{try{setHidden(JSON.parse(localStorage.getItem(storage)??"[]"));}catch{setHidden([]);}seen.current.clear();},[storage]);
  useEffect(()=>{
    const preparing=(operations.data??[]).some(j=>j.kind==="prepare_campaign"&&(j.state==="queued"||j.state==="running"));
    let invalidate=false;
    for(const job of operations.data??[]){
      let applied:string[]=[];try{applied=JSON.parse(localStorage.getItem(storage+":applied")??"[]");}catch{}
      if(job.state==="completed"&&!applied.includes(job.id)&&seen.current.get(job.id)!=="applied"
        &&(job.kind!=="prepare_campaign"||!preparing)){
        // Invalidate after an actual mutation, not on every poll or page visit.
        invalidate=true;seen.current.set(job.id,"applied");
        try{localStorage.setItem(storage+":applied",JSON.stringify([...applied,job.id].slice(-100)));}catch{}
      }
    }
    if(invalidate)void client.invalidateQueries({predicate:q=>q.queryKey[0]!=="telecamp-operations"});
  },[operations.data,client,storage]);
  const jobs=(operations.data??[]).filter(j=>!hidden.includes(j.id));
  if(!jobs.length&&!operations.isError)return null;
  const names=vi?{delete_account:"Xoá tài khoản Telegram",delete_campaigns:"Xoá chiến dịch",sync_groups:"Đồng bộ nhóm",prepare_campaign:"Chuẩn bị lượt gửi"}
    :{delete_account:"Delete Telegram account",delete_campaigns:"Delete campaigns",sync_groups:"Sync groups",prepare_campaign:"Prepare deliveries"};
  const phases:Record<string,string>=vi?{queued:"Đang chờ xử lý",logs:"Đang xoá nhật ký liên quan",targets:"Đang xoá lượt gửi",campaigns:"Đang xoá chiến dịch",
    groups:"Đang xoá nhóm đồng bộ",account:"Đang hoàn tất xoá tài khoản",sync:"Đang đọc nhóm từ Telegram",preparing:"Đang tạo lượt gửi",
    reset:"Đang chuẩn bị lại lịch gửi",retiming:"Đang khôi phục lịch gửi",completed:"Đã hoàn tất",cancelled:"Đã dừng theo yêu cầu xoá"}
    :{queued:"Waiting to process",logs:"Removing related logs",targets:"Removing deliveries",campaigns:"Removing campaigns",groups:"Removing synced groups",
      account:"Finishing account removal",sync:"Reading Telegram groups",preparing:"Preparing deliveries",reset:"Preparing the updated schedule",retiming:"Restoring the delivery schedule",completed:"Completed",cancelled:"Stopped by deletion request"};
  const dismiss=(id:string)=>{const next=[...hidden,id].slice(-100);setHidden(next);try{localStorage.setItem(storage,JSON.stringify(next));}catch{}};
  return <section aria-label={vi?"Tiến trình tác vụ":"Background progress"} className="mb-5 space-y-3" data-testid="operations-progress">
    {operations.isError&&<div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {vi?"Chưa lấy được tiến trình. Tác vụ có thể vẫn đang chạy; không gửi lại lệnh xoá.":"Progress is unavailable. Work may still be running; do not submit deletion again."}
      <button className="ml-2 font-bold underline" onClick={()=>void operations.refetch()}>{vi?"Kiểm tra lại":"Check again"}</button>
    </div>}
    {jobs.slice(0,limit).map(job=>{
      const active=job.state==="queued"||job.state==="running",failed=job.state==="failed";
      const percent=job.total!==null&&job.total>0?Math.min(100,Math.floor(job.processed/job.total*100)):null;
      const unit=job.unit==="groups"?(vi?"nhóm":"groups"):job.unit==="deliveries"?(vi?"lượt gửi":"deliveries"):(vi?"bản ghi":"records");
      return <article key={job.id} className={`rounded-2xl border p-4 ${failed?"border-amber-200 bg-amber-50":active?"border-indigo-200 bg-indigo-50/70":"border-emerald-200 bg-emerald-50/70"}`}>
        <div className="flex items-start gap-3">
          {active?<LoaderCircle size={20} className="mt-0.5 shrink-0 animate-spin text-indigo-600"/>:failed?<AlertCircle size={20} className="mt-0.5 shrink-0 text-amber-700"/>:<CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-700"/>}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">{names[job.kind]}</h2>
            <p className="truncate text-xs text-slate-600">{job.label}</p>
            <p role="status" className="mt-2 text-sm font-semibold text-slate-800">{failed?(vi?"Tạm dừng — cần tiếp tục":"Paused — resume required"):(phases[job.phase]??(vi?"Đang xác định dữ liệu liên quan":"Finding related data"))}</p>
            <p className="mt-1 text-xs tabular-nums text-slate-600">{job.processed.toLocaleString()}{job.total!==null?` / ${job.total.toLocaleString()}`:""} {unit}{percent!==null?` · ${percent}%`:""}</p>
            {job.phase==="reset"&&<p className="mt-1 text-xs text-slate-600">{vi?"Đã dọn":"Cleared"} {(job.stageProcessed??0).toLocaleString()} {vi?"lượt cũ":"previous deliveries"}</p>}
            {percent!==null&&<div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-600 transition-[width]" style={{width:`${percent}%`}}/></div>}
            {(active||failed)&&<p className="mt-2 text-xs leading-relaxed text-slate-600">{failed
              ?(vi?"Phần đã xử lý được giữ nguyên. Tiếp tục chính tác vụ này, không tạo lệnh xoá mới.":"Completed work is retained. Resume this operation instead of submitting another deletion.")
              :(vi?"Có thể rời trang; tác vụ vẫn chạy nền. Mở lại để xem tiến trình.":"You may leave this page. Work continues in the background and progress is available when you return.")}</p>}
            {failed&&!userReadOnly(operations.scope)&&<button disabled={retrying===job.id} className="mt-3 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold disabled:opacity-50"
              onClick={async()=>{setRetrying(job.id);try{await operations.retry(job.id);}catch{}finally{setRetrying(null);}}}>{retrying===job.id?(vi?"Đang tiếp tục…":"Resuming…"):(vi?"Tiếp tục tác vụ":"Resume operation")}</button>}
          </div>
          {job.state==="completed"&&<button onClick={()=>dismiss(job.id)} aria-label={vi?"Ẩn thông báo":"Dismiss"} className="rounded-lg p-1 text-slate-500"><X size={17}/></button>}
        </div>
      </article>;
    })}
    {jobs.length>limit&&<button onClick={()=>setLimit(n=>n+20)} className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-bold text-indigo-700">
      {vi?`Xem thêm (${jobs.length-limit} tác vụ)`:`Show more (${jobs.length-limit} operations)`}</button>}
  </section>;
}
function userReadOnly(scope:string){return !scope.endsWith(":self");}
