import type { ReactNode } from "react";
import type { InterfaceLanguage } from "@/lib/locales";

export function CampaignListFeedback({language,hasData,fetching,failed,empty=false,loaded=0,total=null,updatedAt=0,onRetry,children}:{
  language:InterfaceLanguage;hasData:boolean;fetching:boolean;failed:boolean;empty?:boolean;
  loaded?:number;total?:number|null;updatedAt?:number;onRetry?:()=>void;children:ReactNode;
}) {
  const vi=language==="vi",waiting=fetching||(!hasData&&!failed);
  const counter=<p role="status" aria-live="polite" className="text-sm font-extrabold text-[#1839b5]" data-testid="campaign-load-counter">
    {vi?`Đã tải ${loaded}/${total??"…"} chiến dịch`:`Loaded ${loaded}/${total??"…"} campaigns`}
  </p>;
  return <div aria-busy={waiting} data-testid="campaign-list-feedback">
    {hasData&&!waiting&&!failed&&onRetry&&<div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500 sm:px-5">
      <span>{updatedAt>0
        ? `${vi?"Cập nhật lúc":"Updated at"} ${new Intl.DateTimeFormat(vi?"vi-VN":"en-GB",{hour:"2-digit",minute:"2-digit"}).format(new Date(updatedAt))}`
        : (vi?"Danh sách đã tải":"Campaign list loaded")}</span>
      <button type="button" onClick={onRetry} className="shrink-0 rounded-lg px-2 py-1 font-bold text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600" data-testid="campaign-list-refresh">
        {vi?"Làm mới":"Refresh"}
      </button>
    </div>}
    {(waiting||failed)&&<div className={`${hasData?"border-b border-indigo-100 bg-indigo-50/70 px-4 py-3 sm:px-5":"flex min-h-48 flex-col items-center justify-center gap-3 px-4 py-8"}`}>
      {counter}
      {failed&&!fetching&&<div className="text-xs leading-relaxed text-slate-600">
        <p>{hasData
          ?(vi?"Tải chưa hoàn tất. Danh sách đầy đủ trước đó vẫn được giữ nguyên.":"Loading did not finish. The previous complete list is unchanged.")
          :(vi?"Tải chưa hoàn tất; chưa hiển thị danh sách từng phần.":"Loading did not finish; partial results are not displayed.")}</p>
        {onRetry&&<button type="button" onClick={onRetry} className="mt-2 font-bold text-indigo-700 underline">{vi?"Thử tải lại":"Retry loading"}</button>}
      </div>}
    </div>}
    {hasData&&!(waiting&&empty)&&<div>{children}</div>}
  </div>;
}
