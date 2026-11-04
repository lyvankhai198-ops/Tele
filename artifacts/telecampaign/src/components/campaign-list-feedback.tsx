import type { ReactNode } from "react";

export function CampaignListFeedback({language,hasData,fetching,failed,filtered,children}:{
  language:"vi"|"en";hasData:boolean;fetching:boolean;failed:boolean;filtered:boolean;children:ReactNode;
}) {
  const vi=language==="vi";
  const initial=!hasData&&!failed;
  return <div aria-busy={initial||fetching} data-testid="campaign-list-feedback">
    {initial ? <>
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5" role="status" aria-live="polite">
        <p className="text-sm font-extrabold text-[#1839b5]">{vi?"Đang tải chiến dịch…":"Loading campaigns…"}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{vi
          ?"Tài khoản có nhiều chiến dịch có thể cần thêm thời gian."
          :"Accounts with many campaigns may take a little longer to load."}</p>
      </div>
      <div aria-hidden="true" className="divide-y divide-slate-100">
        {[0,1,2].map(index=><div key={index} className="space-y-3 p-4 sm:p-5" data-testid="campaign-list-skeleton">
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 motion-reduce:animate-none"/>
          <div className="flex gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none"/>
            <div className="h-6 w-14 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none"/>
          </div>
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100 motion-reduce:animate-none"/>
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none"/>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="h-9 rounded-xl bg-slate-100"/><div className="h-9 rounded-xl bg-slate-100"/>
          </div>
        </div>)}
      </div>
    </> : <ViewWithData language={language} hasData={hasData} fetching={fetching} failed={failed} filtered={filtered}>
      {children}
    </ViewWithData>}
  </div>;
}

function ViewWithData({language,hasData,fetching,failed,filtered,children}:{
  language:"vi"|"en";hasData:boolean;fetching:boolean;failed:boolean;filtered:boolean;children:ReactNode;
}) {
  const vi=language==="vi";
  if(!hasData)return <p role="status" className="px-4 py-8 text-center text-sm leading-relaxed text-slate-600">
    {vi?"Chưa tải được danh sách chiến dịch. Đây không phải kết quả danh sách trống.":"The campaign list could not be loaded. This does not mean there are no campaigns."}
  </p>;
  return <>
    <div aria-live="polite" role="status">
      {fetching&&<div className="flex items-start gap-2 border-b border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs leading-relaxed text-indigo-900 sm:px-5" data-testid="campaign-list-refreshing">
        <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-indigo-500 motion-reduce:animate-none"/>
        <div><p className="font-bold">{filtered
          ?(vi?"Đang cập nhật kết quả theo bộ lọc hiện tại…":"Updating results for the current filters…")
          :(vi?"Đang cập nhật danh sách…":"Updating campaign list…")}</p>
          <p className="mt-0.5 text-indigo-800/80">{vi
            ?"Đang hiển thị dữ liệu gần nhất. Danh sách sẽ tự cập nhật khi có kết quả mới."
            :"Showing the latest available data. The list will update when fresh results arrive."}</p>
        </div>
      </div>}
      {!fetching&&failed&&<p className="border-b border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-500 sm:px-5">
        {vi?"Chưa cập nhật được dữ liệu mới; danh sách gần nhất vẫn được giữ lại.":"Fresh data is temporarily unavailable; the last available list is still displayed."}
      </p>}
    </div>
    <div>{children}</div>
  </>;
}
