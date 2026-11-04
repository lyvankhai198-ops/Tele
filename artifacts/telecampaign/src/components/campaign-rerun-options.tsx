import { useState } from "react";
import type { CampaignBulkJobProgress } from "@workspace/api-client-react";

type Language = "vi" | "en";
export const rerunReason = (reason:string, language:Language) => {
  const labels:Record<string,[string,string]> = {
    uncertain_delivery:["Có lượt gửi chưa xác minh; không tự gửi lại để tránh trùng.","A delivery is unverified; automatic rerun is blocked to prevent duplicates."],
    missing_destination:["Thiếu dữ liệu nhóm; cần kiểm tra, không tự xoá.","Destination data is missing; check manually. It will not be deleted automatically."],
    no_destination:["Chưa có đích gửi hợp lệ để đánh giá.","There are no destinations to assess."],
    account_disconnected:["Tài khoản cần kết nối hoặc xác minh lại.","The Telegram account needs reconnection or verification."],
    posting_restricted:["Nhóm đang bị hạn chế gửi; không tự xoá.","Posting is restricted; this is not a reason for automatic deletion."],
    last_delivery_failed:["Lần gửi gần nhất lỗi; tạm loại, giữ dữ liệu.","The latest delivery failed; temporarily excluded, with data retained."],
    membership_needs_refresh:["Cần đồng bộ nhóm lại để xác nhận trạng thái mới nhất.","Sync groups again to confirm the latest membership status."],
    membership_unavailable:["Đồng bộ nhóm đã xác nhận tài khoản không còn đích gửi này.","Group synchronization confirmed this destination is no longer available to this account."],
    delivery_confirmed:["Đã có bằng chứng gửi thành công.","Confirmed successful delivery exists."],
    ready_not_tested:["Nhóm sẵn sàng nhưng chưa có lần gửi thành công; không phải bảo đảm gửi được.","Ready but not yet successfully tested; delivery is not guaranteed."],
    ready_destinations:["Có nhóm còn sẵn sàng để gửi.","There are destinations ready for sending."],
    temporary_failure:["Lỗi tạm thời; giữ chiến dịch và tạm loại khỏi lượt chạy lại.","Temporary problem; retain the campaign and exclude it from this rerun."],
    "Trạng thái campaign đã thay đổi.":["Trạng thái chiến dịch đã thay đổi.","The campaign status has changed."],
    "Không còn lượt gửi đang chờ để tiếp tục.":["Không còn lượt gửi đang chờ để tiếp tục.","There are no pending deliveries to resume."],
    "Đã đạt giới hạn số campaign của gói hiện tại.":["Đã đạt giới hạn số chiến dịch của gói.","The plan's campaign limit has been reached."],
    "Campaign thiếu tài khoản Telegram.":["Chiến dịch thiếu tài khoản Telegram.","The campaign has no Telegram account."],
    "Campaign text chưa có nội dung.":["Chiến dịch chưa có nội dung.","The campaign has no message content."],
    "Campaign forward thiếu mẫu tin.":["Chiến dịch thiếu mẫu chuyển tiếp.","The campaign has no forwarding template."],
    "Tài khoản Telegram chưa kết nối.":["Tài khoản Telegram chưa kết nối.","The Telegram account is disconnected."],
    "Mẫu tin không còn tồn tại.":["Mẫu tin không còn tồn tại.","The message template no longer exists."],
    "Campaign clone admin phải dùng mẫu forward.":["Chiến dịch sao chép phải dùng mẫu chuyển tiếp.","The cloned campaign requires a forwarding template."],
    "Mẫu forward chưa chọn đúng Tin nhắn đã lưu.":["Mẫu chưa chọn đúng Tin nhắn đã lưu.","The template does not reference the correct Saved Message."],
    "Có destination chưa sẵn sàng để gửi.":["Có nhóm chưa sẵn sàng theo lịch đã chọn.","A destination is not ready for the selected schedule."],
    "Gói PLUS giới hạn tối đa 300 lần lặp cho mỗi chiến dịch.":["Gói PLUS giới hạn 300 lần lặp.","The PLUS plan allows up to 300 repeats."],
    "Campaign không còn destination để tạo lượt chạy mới.":["Không còn nhóm để tạo lượt chạy mới.","There are no destinations for a new run."],
    "Không xác định được lịch gửi còn lại.":["Không xác định được lịch gửi còn lại.","The remaining schedule could not be determined."],
    "Campaign đã được xử lý bởi thao tác khác.":["Chiến dịch đã được thao tác khác xử lý.","Another operation has already handled this campaign."],
  };
  return labels[reason]?.[language==="vi"?0:1] ?? (language==="vi"
    ? "Không thể xử lý; kiểm tra cấu hình chiến dịch." : "Could not process this campaign; check its configuration.");
};
const categories = {
  vi:{sendable:"Còn sẵn sàng",temporary:"Tạm loại",review:"Cần xác minh",invalid:"Không còn đích hợp lệ"},
  en:{sendable:"Ready",temporary:"Temporarily excluded",review:"Needs verification",invalid:"No valid destinations"},
};

export function CampaignRerunOptions(props:{
  language:Language;onlySendable:boolean;autoDeleteInvalid:boolean;
  onOnlySendable:(value:boolean)=>void;onAutoDelete:(value:boolean)=>void;
}) {
  const vi=props.language==="vi";
  return <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="campaign-rerun-options">
    <label className="flex items-start gap-2 text-sm font-semibold text-slate-800">
      <input type="checkbox" checked={props.onlySendable} onChange={e=>props.onOnlySendable(e.target.checked)} className="mt-1" />
      <span>{vi?"Chỉ chạy các nhóm còn sẵn sàng":"Only rerun destinations that are ready"}
        <small className="mt-1 block font-normal text-slate-500">{vi
          ?"Tạm loại lỗi tạm thời. Lượt chưa xác minh luôn bị chặn để tránh gửi trùng."
          :"Temporarily exclude transient failures. Unverified deliveries are always blocked to prevent duplicates."}</small></span>
    </label>
    <label className="flex items-start gap-2 text-sm font-semibold text-slate-800">
      <input type="checkbox" checked={props.autoDeleteInvalid} onChange={e=>props.onAutoDelete(e.target.checked)} className="mt-1" />
      <span>{vi?"Tự dọn đích không còn hợp lệ":"Automatically clean up invalid destinations"}
        <small className="mt-1 block font-normal text-slate-500">{vi
          ?"Nhiều nhóm: chỉ gỡ đích đã xác nhận không còn hợp lệ. Chỉ xoá cả chiến dịch khi mọi đích đều mất, đã kết thúc lượt thử và không có tin gửi thành công."
          :"For multiple groups, detach only confirmed-invalid destinations. Delete the whole campaign only when all destinations are gone, an attempted run has ended, and no messages succeeded."}</small></span>
    </label>
    {props.autoDeleteInvalid && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
      {vi?"Xoá chiến dịch sẽ mất các lượt gửi và không thể hoàn tác. Không xoá vì mất mạng, giới hạn tốc độ, hạn chế tạm thời hoặc cần đăng nhập lại. Lựa chọn chỉ áp dụng cho lượt chạy này."
        :"Deleting a campaign removes its targets and cannot be undone. Network failures, rate limits, temporary restrictions or expired login sessions never authorize deletion. This choice applies only to this operation."}
    </p>}
  </div>;
}

export function CampaignRerunResults({job,language}:{job:CampaignBulkJobProgress;language:Language}) {
  const vi=language==="vi", [limit,setLimit]=useState(50);
  const results=job.results ?? [], reports=job.reviews ?? [];
  const c=categories[language];
  const outcomes={created:vi?"Đã tạo lượt":"Run created",resumed:vi?"Đã tiếp tục":"Resumed",
    skipped:vi?"Bỏ qua":"Skipped",deleted:vi?"Đã xoá":"Deleted"};
  return <div className="space-y-3" data-testid="campaign-rerun-results">
    {results.length>0 && <>
      <p className="text-xs text-slate-600">{vi
        ?"Đánh giá trước khi tạo lịch — không phải số tin đã gửi:"
        :"Assessment before scheduling — these are not sent-message counts:"}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {(["sendable","temporary","review","invalid"] as const).map(category=><div key={category}
          className="rounded-lg border border-slate-200 bg-white p-2">{c[category]}:
          <b className="ml-1">{results.filter(r=>r.assessment?.category===category).length}</b></div>)}
      </div>
      <p className="text-xs font-semibold text-rose-700">{vi?"Đã xoá chiến dịch":"Deleted campaigns"}: {job.deletedCount ?? 0}</p>
      <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-semibold">{vi?"Danh sách và lý do":"Campaigns and reasons"} ({results.length})</summary>
        <ul className="mt-2 max-h-80 space-y-3 overflow-y-auto">
          {results.slice(0,limit).map(r=><li key={r.id} className="border-t border-slate-100 pt-2">
            <b className="break-words">{r.name || r.id}</b><span className="ml-2 text-xs">{outcomes[r.outcome]}</span>
            <p className="mt-1 text-xs text-slate-600">{rerunReason(r.reason,language)}</p>
            {(r.assessment?.groups.length ?? 0)>0 && <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-indigo-700">{vi?"Chi tiết nhóm":"Destination details"}</summary>
              <ul className="mt-1 max-h-40 overflow-y-auto">{r.assessment?.groups.map(g=><li key={g.id} className="py-1">
                <b>{g.name}</b> · {c[g.category]}<p>{rerunReason(g.reason,language)}</p>
              </li>)}</ul>
            </details>}
          </li>)}
        </ul>
        {results.length>limit && <button type="button" onClick={()=>setLimit(v=>v+100)} className="mt-2 font-semibold text-indigo-700">
          {vi?"Xem thêm":"Show more"}</button>}
      </details>
    </>}
    <details className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-indigo-900">{vi?"Kết quả gửi đã rà soát":"Reviewed delivery results"} ({reports.length}/{job.updatedCount})</summary>
      <p className="mt-2 text-xs text-slate-600">{vi
        ?"Chỉ xuất hiện sau khi lượt gửi thực sự kết thúc. Có thể đóng cửa sổ rồi mở lại; lựa chọn và kết quả vẫn được lưu."
        :"Available only after the actual delivery run ends. You can close and reopen this dialog; choices and results are saved."}</p>
      <ul className="mt-2 max-h-80 space-y-3 overflow-y-auto">{reports.slice(0,limit).map(r=><li key={r.id}>
        <b>{r.name}</b><p className="text-xs">{c[r.category]} · {vi?"Đã gửi":"Sent"}: {r.sentCount} · {vi?"Lỗi":"Failed"}: {r.failedCount}</p>
        <p className="text-xs">{rerunReason(r.reason,language)}</p>
        <p className="text-xs">{r.deleted?(vi?"Đã xoá chiến dịch không còn đích hợp lệ.":"Deleted campaign with no valid destinations.")
          :`${vi?"Đích không hợp lệ đã gỡ":"Invalid destinations detached"}: ${r.removedDestinationCount}`}</p>
      </li>)}</ul>
      {reports.length>limit && <button type="button" onClick={()=>setLimit(v=>v+100)} className="mt-2 font-semibold text-indigo-700">
        {vi?"Xem thêm":"Show more"}</button>}
    </details>
  </div>;
}
