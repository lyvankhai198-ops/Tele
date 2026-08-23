import { useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  Menu,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";

type Toast = string;

export function OperationsMapCreateCampaign() {
  const [name, setName] = useState("Founder community / May");
  const [account, setAccount] = useState("Alex / AM-03 · connected");
  const [template, setTemplate] = useState("Founder community / May");
  const [date, setDate] = useState("2024-05-14");
  const [time, setTime] = useState("14:30");
  const [toast, setToast] = useState<Toast>("");
  const [saved, setSaved] = useState(false);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  return (
    <div className="min-h-[100dvh] bg-[#f6f7f4] text-[#18221f]" style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui" }}>
      <style>{`
        .oc-shell{background:radial-gradient(circle at 85% 0%,rgba(226,235,213,.72),transparent 36%),#f6f7f4}
        .oc-grid{background-image:linear-gradient(rgba(24,34,31,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(24,34,31,.035) 1px,transparent 1px);background-size:28px 28px}
        .oc-button{transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease}.oc-button:hover{transform:translateY(-1px);box-shadow:0 8px 16px rgba(31,61,49,.13)}
        .oc-nav{transition:background-color .2s ease,transform .2s ease}.oc-nav:hover{transform:translateX(3px)}
        @keyframes oc-in{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}.oc-in{animation:oc-in .42s ease-out both}
      `}</style>
      <div className="oc-shell flex min-h-[100dvh]">
        <aside className="hidden w-[242px] shrink-0 border-r border-[#dfe6dc] bg-[#edf1e9]/90 px-5 py-6 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#183d31] text-[#e9f3dc] shadow-[0_5px_0_#a7bd91]"><Radio size={19}/></div><div><div className="text-[15px] font-extrabold tracking-[-.04em]">telecampaign</div><div className="mt-0.5 font-mono text-[9px] uppercase tracking-[.18em] text-[#718074]">operator desk</div></div></div>
          <div className="mt-12 px-2 font-mono text-[9px] font-bold uppercase tracking-[.18em] text-[#89958a]">Workspace</div>
          <nav className="mt-3 space-y-1">{[["Overview",Gauge],["Campaigns",Send],["Accounts",UsersRound],["Destinations",Layers3],["Templates",FileText],["Proxy network",Globe2]].map(([label,Icon],i)=><button key={label as string} onClick={()=>notify(`${label} view selected`)} className={`oc-nav flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-bold ${i===1?"bg-[#dbe8d1] text-[#1c4c3a]":"text-[#6d796e] hover:bg-[#e3eadd]"}`}><Icon size={16}/><span>{label as string}</span>{i===1&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#d15c40]"/>}</button>)}</nav>
          <div className="mt-auto"><div className="rounded-2xl border border-[#d2ddcc] bg-[#f7faf4] p-4"><div className="flex items-center gap-2 text-[11px] font-extrabold text-[#315640]"><ShieldCheck size={15}/> Safety checks</div><p className="mt-2 text-[11px] font-medium leading-relaxed text-[#7a887c]">All account limits are within the configured guardrails.</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dce6d7]"><div className="h-full w-[92%] rounded-full bg-[#6d9a64]"/></div><div className="mt-2 flex justify-between font-mono text-[9px] font-bold text-[#809080]"><span>HEALTH SCORE</span><span>92 / 100</span></div></div><button onClick={()=>notify("Settings opened")} className="oc-nav mt-4 flex w-full items-center gap-3 px-3 py-2 text-left text-[12px] font-bold text-[#778277]"><Settings2 size={16}/>Workspace settings</button></div>
        </aside>
        <main className="min-w-0 flex-1">
          <header className="flex h-[76px] items-center justify-between border-b border-[#e0e6de] bg-[#f8faf6]/80 px-5 backdrop-blur md:px-9"><div className="flex items-center gap-3"><button onClick={()=>notify("Navigation menu")} className="rounded-lg p-2 text-[#718074] lg:hidden"><Menu size={20}/></button><div className="font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[#8a968b]">Workspace / <span className="text-[#284b3b]">Campaigns</span></div></div><div className="flex items-center gap-4"><button onClick={()=>notify("No new alerts")} className="relative rounded-xl p-2 text-[#718074]"><Bell size={18}/><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#d15c40]"/></button><div className="hidden h-7 w-px bg-[#dde5da] sm:block"/><button onClick={()=>notify("Operator profile")} className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#d5e4cb] font-mono text-[11px] font-bold text-[#315640]">AM</span><span className="hidden text-left sm:block"><span className="block text-[11px] font-extrabold">Alex Morgan</span><span className="block font-mono text-[9px] text-[#839083]">operator</span></span><ChevronDown size={14} className="text-[#849084]"/></button></div></header>
          <div className="oc-grid min-h-[calc(100dvh-76px)] px-5 py-8 md:px-9 md:py-10"><div className="max-w-[820px]"><div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#b35a45]"><span className="h-1.5 w-1.5 rounded-full bg-[#d15c40]"/>Campaigns / new operation</div><h1 className="text-[31px] font-extrabold tracking-[-.055em] md:text-[42px]">Prepare the next route<span className="text-[#d15c40]">.</span></h1><p className="mt-2 max-w-xl text-[13px] font-medium leading-relaxed text-[#718074]">A scheduled campaign is ready for one final review before it enters the queue.</p><div className="mt-10 hidden rounded-2xl border border-[#dfe6dc] bg-[#fbfcf8]/80 p-6 md:block"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e2eedf] text-[#528051]"><CircleCheck size={19}/></span><div><div className="text-[13px] font-extrabold">Route dependencies ready</div><div className="mt-1 text-[11px] font-semibold text-[#849084]">4 accounts online · 28 destinations approved · template verified</div></div></div><div className="mt-8 flex items-center gap-4 text-[10px] font-bold text-[#7d8a7e]"><span className="h-2 flex-1 rounded-full bg-[#6e9865]"/><span className="h-2 flex-1 rounded-full bg-[#6e9865]"/><span className="h-2 flex-1 rounded-full bg-[#6e9865]"/><span className="h-2 flex-1 rounded-full bg-[#dcae3e]"/><span className="font-mono">3 / 4 complete</span></div></div></div></div>
        </main>
        <div className="fixed inset-0 z-50 flex justify-end bg-[#203028]/25 backdrop-blur-[2px]">
          <section className="oc-in h-full w-full max-w-[472px] overflow-y-auto border-l border-[#dfe6dc] bg-[#fbfcf8] p-6 shadow-2xl md:p-8" aria-label="Create campaign panel">
            <div className="flex items-start justify-between"><div><div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#b35a45]">New operation · step 1 of 1</div><h2 className="mt-2 text-[25px] font-extrabold tracking-[-.05em]">Create campaign</h2><p className="mt-2 text-[12px] font-medium leading-relaxed text-[#7b887c]">Set the route, then choose when the first message leaves.</p></div><button onClick={()=>notify("Panel stays open until saved")} className="rounded-xl p-2 text-[#849084] hover:bg-[#edf2e9]"><X size={19}/></button></div>
            <div className="mt-9 space-y-5">
              <label className="block"><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Campaign name</span><input value={name} onChange={e=>setName(e.target.value)} className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white px-3 text-[13px] font-bold outline-none focus:border-[#b35a45]"/></label>
              <label className="block"><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Telegram account</span><select value={account} onChange={e=>setAccount(e.target.value)} className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white px-3 text-[13px] font-bold outline-none"><option>Alex / AM-03 · connected</option><option>Studio / AM-01 · connected</option><option>Support / AM-04 · connected</option></select></label>
              <label className="block"><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Message template</span><select value={template} onChange={e=>setTemplate(e.target.value)} className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white px-3 text-[13px] font-bold outline-none"><option>Founder community / May</option><option>Q2 partner update</option><option>Product waitlist follow-up</option></select></label>
              <div><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Destinations</span><span className="font-mono text-[10px] font-bold text-[#6e9865]">28 approved</span></div><div className="rounded-xl border border-[#d6e0d2] bg-white p-3"><div className="flex items-center gap-2 border-b border-[#edf0ea] pb-3"><Search size={15} className="text-[#9aa69b]"/><span className="text-[12px] font-semibold text-[#a0aaa1]">Search groups or topics</span></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-lg bg-[#e2eedf] px-2.5 py-1.5 text-[10px] font-bold text-[#477047]">Partners · 12</span><span className="rounded-lg bg-[#e2eedf] px-2.5 py-1.5 text-[10px] font-bold text-[#477047]">Community · 9</span><span className="rounded-lg bg-[#e2eedf] px-2.5 py-1.5 text-[10px] font-bold text-[#477047]">Topics · 7</span></div></div></div>
              <div className="grid grid-cols-2 gap-3"><label><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Start date</span><div className="relative"><CalendarDays size={14} className="pointer-events-none absolute left-3 top-3.5 text-[#849084]"/><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white pl-9 pr-2 text-[12px] font-bold"/></div></label><label><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Start time</span><div className="relative"><Clock3 size={14} className="pointer-events-none absolute left-3 top-3.5 text-[#849084]"/><input type="time" value={time} onChange={e=>setTime(e.target.value)} className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white pl-9 pr-2 text-[12px] font-bold"/></div></label></div>
              <div className="rounded-xl border border-[#e8dfbd] bg-[#fffaf0] p-3.5"><div className="flex items-center gap-2 text-[11px] font-extrabold text-[#8e6b1c]"><Clock3 size={14}/>Scheduled delivery</div><p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-[#9b8754]">Tuesday, 14 May at {time}. The campaign will begin after review.</p></div>
            </div>
            <div className="mt-10 flex gap-3 border-t border-[#e5ebe1] pt-5"><button onClick={()=>{setSaved(true);notify(`Draft saved: ${name}`)}} className="h-11 flex-1 rounded-xl border border-[#d6e0d2] text-[12px] font-extrabold text-[#617063] hover:bg-[#f1f5ee]">{saved?"Draft saved":"Save draft"}</button><button onClick={()=>notify(`Reviewing ${name} for ${date} at ${time}`)} className="oc-button h-11 flex-1 rounded-xl bg-[#d15c40] text-[12px] font-extrabold text-[#fff8f1]">Review campaign <ArrowRight className="ml-1 inline" size={14}/></button></div>
          </section>
        </div>
      </div>
      {toast&&<div className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-xl bg-[#193e31] px-4 py-3 text-[12px] font-bold text-[#eff8e9] shadow-xl"><Check size={15} className="text-[#b4d5a6]"/>{toast}</div>}
    </div>
  );
}

export default OperationsMapCreateCampaign;