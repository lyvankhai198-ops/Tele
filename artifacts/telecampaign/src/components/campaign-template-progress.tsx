import type { BulkCampaignTemplateResult } from "@workspace/api-client-react";
import { getCampaignTemplateJob } from "@workspace/api-client-react";
import { useEffect, useState } from "react";

export function CampaignTemplateProgress({job,vi,waiting,problem,onRetry,onNew}:{
  job:BulkCampaignTemplateResult;vi:boolean;waiting:boolean;problem:boolean;
  onRetry:()=>void;onNew:()=>void;
}) {
  const [offset,setOffset]=useState(0);
  const [rows,setRows]=useState(job.skipped);
  const [loading,setLoading]=useState(false);
  const [pageError,setPageError]=useState(false);
  useEffect(()=>{setOffset(0);setRows(job.skipped);setPageError(false);},[job.id,job.skippedCount]);
  const active=job.status==="queued"||job.status==="running";
  const reasons:Record<string,[string,string]>={
    missing_account:["Chiến dịch không có tài khoản Telegram.","Campaign has no Telegram account."],
    account_unavailable:["Tài khoản đã xoá hoặc không còn thuộc phạm vi.","Account was deleted or is no longer in scope."],
    scope_changed:["Tên, tài khoản hoặc trạng thái chiến dịch đã thay đổi.","Campaign name, account or status changed."],
    template_unavailable:["Mẫu tin đã xoá hoặc không còn thuộc quyền quản lý.","Template was deleted or is no longer owned."],
    admin_clone_requires_forward:["Chiến dịch clone admin cần mẫu forward.","Admin clone requires a forward template."],
    forward_account_mismatch:["Mẫu forward không đúng tài khoản hoặc thiếu tin nhắn nguồn.","Forward source does not match the account or is missing."],
  };
  async function page(nextOffset:number){
    setLoading(true);setPageError(false);
    try{const result=await getCampaignTemplateJob(job.id,{offset:nextOffset});setRows(result.skipped);setOffset(nextOffset);}
    catch{setPageError(true);}finally{setLoading(false);}
  }
  return <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm" data-testid="campaign-template-progress" aria-live="polite">
    <h3 className="font-extrabold">{active?(vi?"Đang đổi mẫu tin":"Updating templates"):job.status==="failed"
      ?(vi?"Tác vụ tạm dừng do lỗi":"Operation paused after an error"):(vi?"Đã hoàn tất đổi mẫu tin":"Template update completed")}</h3>
    <p>{job.processed}/{job.total} · {vi?"Đã đổi":"Updated"}: {job.updatedCount} · {vi?"Bỏ qua":"Skipped"}: {job.skippedCount}</p>
    <progress className="h-2 w-full accent-indigo-600" value={job.processed} max={Math.max(1,job.total)}/>
    {active&&<p className="text-xs text-slate-600">{vi?"Có thể đóng cửa sổ. Tác vụ vẫn tiếp tục; không cần gửi yêu cầu mới. Mẫu tin được cố định theo lúc bắt đầu.":"You may close this window. Processing continues; do not submit again. Template content is fixed at the start."}</p>}
    {problem&&<p className="text-xs text-amber-800">{vi?"Chưa lấy được tiến độ mới; kết quả đã xử lý được giữ nguyên.":"Progress is temporarily unavailable; committed results are preserved."}</p>}
    {job.status==="failed"&&<><p className="text-xs">{vi?"Phần đã đổi được giữ nguyên. Tiếp tục từ vị trí đã lưu, không tạo tác vụ khác.":"Completed changes are preserved. Resume from the saved position, not a new operation."}</p>
      <button type="button" disabled={waiting} onClick={onRetry} className="rounded-xl bg-indigo-700 px-4 py-2 font-bold text-white disabled:opacity-50">{vi?"Tiếp tục tác vụ":"Resume operation"}</button></>}
    {job.status==="completed"&&<p className="text-xs">{job.defaultStatus==="updated"
      ?(vi?"Đã cập nhật mẫu mặc định chung một lần.":"Shared future-campaign default updated once.")
      :job.defaultStatus==="skipped"?(vi?"Không đổi mẫu mặc định chung vì mẫu gốc đã thay đổi hoặc bị xoá.":"Shared default unchanged because the original template changed or was deleted.")
      :(vi?"Không thay đổi mẫu mặc định chung.":"Shared future-campaign default unchanged.")}</p>}
    {job.skippedCount>0&&<div className="space-y-2 border-t border-indigo-200 pt-3">
      <h4 className="font-bold">{vi?"Chiến dịch bỏ qua và lý do":"Skipped campaigns and reasons"}</h4>
      <div className="max-h-48 space-y-2 overflow-y-auto">{rows.map(row=><div key={row.id} className="rounded-lg bg-white p-2 text-xs">
        <p className="break-words font-bold">{row.name||row.id}</p><p>{reasons[row.reason]?.[vi?0:1] ?? (vi?"Không còn đủ điều kiện.":"No longer eligible.")}</p>
      </div>)}</div>
      {pageError&&<p className="text-xs text-amber-800">{vi?"Chưa tải được danh sách; hãy thử lại.":"Could not load this page; retry."}</p>}
      <div className="flex items-center justify-between text-xs">
        <button type="button" disabled={offset===0||loading} onClick={()=>void page(Math.max(0,offset-50))}>{vi?"Trước":"Previous"}</button>
        <span>{offset+1}–{Math.min(offset+50,job.skippedCount)}/{job.skippedCount}</span>
        <button type="button" disabled={offset+50>=job.skippedCount||loading} onClick={()=>void page(offset+50)}>{vi?"Tiếp":"Next"}</button>
      </div>
    </div>}
    {job.status==="completed"&&<button type="button" onClick={onNew} className="rounded-xl border border-indigo-300 bg-white px-4 py-2 font-bold">{vi?"Đổi mẫu lượt mới":"Start another update"}</button>}
  </section>;
}
