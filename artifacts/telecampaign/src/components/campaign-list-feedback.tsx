import type { ReactNode } from "react";

export function CampaignListFeedback({language,hasData,fetching,failed,empty=false,loaded=0,total=null,onRetry,children}:{
  language:"vi"|"en";hasData:boolean;fetching:boolean;failed:boolean;empty?:boolean;
  loaded?:number;total?:number|null;onRetry?:()=>void;children:ReactNode;
}) {
  const vi=language==="vi",waiting=fetching||(!hasData&&!failed);
  const counter=<p role="status" aria-live="polite" className="text-sm font-extrabold text-[#1839b5]" data-testid="campaign-load-counter">
    {vi?`Đã tải ${loaded}/${total??"…"} chiến dịch`:`Loaded ${loaded}/${total??"…"} campaigns`}
  </p>;
  return <div aria-busy={waiting} data-testid="campaign-list-feedback">
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
