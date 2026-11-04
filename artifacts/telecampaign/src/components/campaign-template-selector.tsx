import { useMemo, useState } from "react";
import type { Campaign } from "@workspace/api-client-react";

type Props={campaigns:Campaign[];selected:string[];onChange:(ids:string[])=>void;language:"vi"|"en";templateNames:Record<string,string>;disabled?:boolean};
export function CampaignTemplateSelector({campaigns,selected,onChange,language,templateNames,disabled=false}:Props){
  const vi=language==="vi",size=50;
  const [search,setSearch]=useState(""),[page,setPage]=useState(0);
  const matched=useMemo(()=>campaigns.filter(c=>c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),[campaigns,search]);
  const chosen=new Set(selected),all=matched.length>0&&matched.every(c=>chosen.has(c.id));
  const currentPage=Math.min(page,Math.max(0,Math.ceil(matched.length/size)-1));
  const labels:Record<string,string>=vi
    ?{draft:"Bản nháp",queued:"Đang chờ",running:"Đang chạy",paused:"Tạm dừng",completed:"Hoàn thành",completed_with_errors:"Hoàn thành có lỗi",failed:"Lỗi",cancelled:"Đã huỷ"}
    :{draft:"Draft",queued:"Queued",running:"Running",paused:"Paused",completed:"Completed",completed_with_errors:"Completed with errors",failed:"Failed",cancelled:"Cancelled"};
  function toggleAll(){
    if(disabled)return;
    const next=new Set(selected);
    for(const c of matched){if(all)next.delete(c.id);else next.add(c.id);}
    onChange([...next]);
  }
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="template-campaign-selector">
    <p className="text-sm font-bold text-indigo-900" aria-live="polite">{vi?`Đã chọn ${selected.length}/${campaigns.length} chiến dịch`:`Selected ${selected.length}/${campaigns.length} campaigns`}</p>
    <input type="search" value={search} disabled={disabled} onChange={e=>{setSearch(e.target.value);setPage(0);}}
      aria-label={vi?"Tìm chiến dịch để đổi mẫu":"Find campaigns to change templates"} placeholder={vi?"Tìm tên chiến dịch…":"Search campaign names…"}
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" data-testid="template-campaign-search"/>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled||!matched.length} onClick={toggleAll} data-testid="template-campaign-select-all"
        className="min-h-10 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-800 disabled:opacity-40">
        {vi?(all?"Bỏ chọn":"Chọn tất cả"):(all?"Deselect":"Select all")}{search.trim()?(vi?" kết quả tìm kiếm":" search results"):""} ({matched.length})
      </button>
      <button type="button" disabled={disabled||!selected.length} onClick={()=>onChange([])} data-testid="template-campaign-clear"
        className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold disabled:opacity-40">{vi?"Bỏ chọn tất cả":"Clear all selections"}</button>
    </div>
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {matched.slice(currentPage*size,(currentPage+1)*size).map(c=><label key={c.id} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 ${chosen.has(c.id)?"border-indigo-400 ring-1 ring-indigo-100":"border-slate-200"}`}>
        <input type="checkbox" checked={chosen.has(c.id)} disabled={disabled} aria-label={c.name} data-campaign-id={c.id} className="mt-1 h-4 w-4 shrink-0 accent-indigo-700"
          onChange={()=>onChange(chosen.has(c.id)?selected.filter(id=>id!==c.id):[...selected,c.id])}/>
        <span className="min-w-0 space-y-1 text-xs">
          <span className="block break-words text-sm font-semibold text-slate-800">{c.name}</span>
          <span className="block text-slate-500">{labels[c.status]??c.status}</span>
          <span className="block break-words text-slate-500">{vi?"Mẫu hiện tại: ":"Current template: "}{c.templateId?(templateNames[c.templateId]??(vi?"Mẫu đã xoá/không còn truy cập":"Deleted/unavailable template")):(vi?"Nội dung riêng":"Custom content")}</span>
        </span>
      </label>)}
      {!matched.length&&<p className="p-3 text-sm text-slate-500">{vi?"Không có chiến dịch phù hợp.":"No matching campaigns."}</p>}
    </div>
    {matched.length>size&&<div className="flex items-center justify-between text-xs">
      <button type="button" disabled={disabled||currentPage===0} onClick={()=>setPage(currentPage-1)} className="min-h-10 px-3">{vi?"Trước":"Previous"}</button>
      <span>{currentPage*size+1}–{Math.min((currentPage+1)*size,matched.length)} / {matched.length}</span>
      <button type="button" disabled={disabled||(currentPage+1)*size>=matched.length} onClick={()=>setPage(currentPage+1)} className="min-h-10 px-3">{vi?"Tiếp":"Next"}</button>
    </div>}
  </section>;
}
