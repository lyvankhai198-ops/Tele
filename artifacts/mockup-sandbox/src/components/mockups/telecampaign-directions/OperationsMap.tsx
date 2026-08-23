import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";

type Campaign = {
  name: string;
  status: "Running" | "Scheduled" | "Draft";
  sent: string;
  total: string;
  time: string;
  accent: string;
};

const campaigns: Campaign[] = [
  { name: "Q2 partner update", status: "Running", sent: "1,248", total: "2,400", time: "Now · 52%", accent: "#e85d3f" },
  { name: "Founder community / May", status: "Scheduled", sent: "0", total: "1,180", time: "Today · 14:30", accent: "#dcae3e" },
  { name: "Product waitlist follow-up", status: "Draft", sent: "—", total: "860", time: "Not scheduled", accent: "#8e98a8" },
];

const activity = [
  ["10:42", "Q2 partner update", "1 message delivered", "ok"],
  ["10:38", "Q2 partner update", "Rate limit window opened", "wait"],
  ["10:31", "Founder community / May", "Schedule confirmed", "ok"],
  ["09:55", "System", "Proxy rotation completed", "ok"],
];

export function OperationsMap() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [showCreate, setShowCreate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  return (
    <div className="min-h-[100dvh] bg-[#f6f7f4] text-[#18221f]" style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui" }}>
      <style>{`
        .op-shell { background: radial-gradient(circle at 89% 0%, rgba(226,235,213,.66), transparent 34%), #f6f7f4; }
        .op-grid { background-image: linear-gradient(rgba(24,34,31,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(24,34,31,.035) 1px, transparent 1px); background-size: 28px 28px; }
        .op-shadow { box-shadow: 0 12px 34px rgba(43,59,45,.07); }
        .op-nav { transition: background-color .2s ease, color .2s ease, transform .2s ease; }
        .op-nav:hover { transform: translateX(3px); }
        .op-button { transition: transform .2s ease, background-color .2s ease, box-shadow .2s ease; }
        .op-button:hover { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(31,61,49,.13); }
      `}</style>
      <div className="op-shell flex min-h-[100dvh]">
        <aside className="hidden w-[242px] shrink-0 border-r border-[#dfe6dc] bg-[#edf1e9]/90 px-5 py-6 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#183d31] text-[#e9f3dc] shadow-[0_5px_0_#a7bd91]"><Radio size={19} /></div>
            <div><div className="text-[15px] font-extrabold tracking-[-.04em]">telecampaign</div><div className="mt-0.5 font-mono text-[9px] uppercase tracking-[.18em] text-[#718074]">operator desk</div></div>
          </div>
          <div className="mt-12 px-2 font-mono text-[9px] font-bold uppercase tracking-[.18em] text-[#89958a]">Workspace</div>
          <nav className="mt-3 space-y-1">
            {[
              ["Overview", Gauge], ["Campaigns", Send], ["Accounts", UsersRound], ["Destinations", Layers3],
              ["Templates", FileText], ["Proxy network", Globe2],
            ].map(([label, Icon]) => (
              <button key={label as string} onClick={() => { setActiveNav(label as string); notify(`${label} view selected`); }} className={`op-nav flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-bold ${activeNav === label ? "bg-[#dbe8d1] text-[#1c4c3a]" : "text-[#6d796e] hover:bg-[#e3eadd] hover:text-[#294235]"}`}>
                <Icon size={16} strokeWidth={activeNav === label ? 2.4 : 1.8} /><span>{label as string}</span>{activeNav === label && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#d15c40]" />}
              </button>
            ))}
          </nav>
          <div className="mt-auto">
            <div className="rounded-2xl border border-[#d2ddcc] bg-[#f7faf4] p-4">
              <div className="flex items-center gap-2 text-[11px] font-extrabold text-[#315640]"><ShieldCheck size={15} /> Safety checks</div>
              <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#7a887c]">All account limits are within the configured guardrails.</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dce6d7]"><div className="h-full w-[92%] rounded-full bg-[#6d9a64]" /></div>
              <div className="mt-2 flex justify-between font-mono text-[9px] font-bold text-[#809080]"><span>HEALTH SCORE</span><span>92 / 100</span></div>
            </div>
            <button onClick={() => notify("Settings opened")} className="op-nav mt-4 flex w-full items-center gap-3 px-3 py-2 text-left text-[12px] font-bold text-[#778277] hover:text-[#294235]"><Settings2 size={16} />Workspace settings</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-[76px] items-center justify-between border-b border-[#e0e6de] bg-[#f8faf6]/80 px-5 backdrop-blur md:px-9">
            <div className="flex items-center gap-3"><button onClick={() => notify("Navigation menu")} className="rounded-lg p-2 text-[#718074] lg:hidden"><Menu size={20} /></button><div className="font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[#8a968b]">Workspace / <span className="text-[#284b3b]">{activeNav}</span></div></div>
            <div className="flex items-center gap-4"><button onClick={() => notify("No new alerts")} className="relative rounded-xl p-2 text-[#718074] hover:bg-[#e8eee4]"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#d15c40]" /></button><div className="hidden h-7 w-px bg-[#dde5da] sm:block" /><button onClick={() => notify("Operator profile")} className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#d5e4cb] font-mono text-[11px] font-bold text-[#315640]">AM</span><span className="hidden text-left sm:block"><span className="block text-[11px] font-extrabold">Alex Morgan</span><span className="block font-mono text-[9px] text-[#839083]">operator</span></span><ChevronDown size={14} className="text-[#849084]" /></button></div>
          </header>

          <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-10">
            <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#b35a45]"><span className="h-1.5 w-1.5 rounded-full bg-[#d15c40]" />Tuesday, 14 May 2024</div><h1 className="text-[31px] font-extrabold tracking-[-.055em] text-[#1b2822] md:text-[42px]">Good morning, Alex<span className="text-[#d15c40]">.</span></h1><p className="mt-2 max-w-xl text-[13px] font-medium leading-relaxed text-[#718074]">Your operation is quiet, healthy, and ready. Here is the route from account to delivery.</p></div>
              <button onClick={() => setShowCreate(true)} className="op-button inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#d15c40] px-5 text-[12px] font-extrabold text-[#fff8f1]"><Plus size={17} /> Create campaign <ArrowRight size={15} /></button>
            </section>

            <section className="mt-9 grid gap-4 md:grid-cols-3">
              <div className="op-shadow rounded-2xl border border-[#dfe6dc] bg-[#fbfcf8] p-5"><div className="flex items-center justify-between"><span className="font-mono text-[10px] font-bold uppercase tracking-[.15em] text-[#8a968b]">Delivery today</span><Send size={17} className="text-[#d15c40]" /></div><div className="mt-5 flex items-end justify-between"><strong className="flex items-baseline gap-1 text-[30px] font-extrabold tracking-[-.06em]">1,248 <span className="text-[13px] font-bold tracking-normal text-[#879287]">/ 2,000</span></strong><span className="font-mono text-[11px] font-bold text-[#6e9865]">62.4%</span></div><div className="mt-4 h-2 rounded-full bg-[#e8ede5]"><div className="h-full w-[62.4%] rounded-full bg-[#d15c40]" /></div><p className="mt-2 text-[11px] font-semibold text-[#8a968b]">752 messages remaining · resets in 08:14:22</p></div>
              <div className="op-shadow rounded-2xl border border-[#dfe6dc] bg-[#fbfcf8] p-5"><div className="flex items-center justify-between"><span className="font-mono text-[10px] font-bold uppercase tracking-[.15em] text-[#8a968b]">Account health</span><Activity size={17} className="text-[#6e9865]" /></div><div className="mt-5 flex items-end justify-between"><strong className="flex items-baseline gap-1 text-[30px] font-extrabold tracking-[-.06em]">4 <span className="text-[13px] font-bold tracking-normal text-[#879287]">/ 4 online</span></strong><span className="font-mono text-[11px] font-bold text-[#6e9865]">100%</span></div><div className="mt-4 flex gap-1.5">{[1,2,3,4].map((n) => <span key={n} className="h-2 flex-1 rounded-full bg-[#6e9865]" />)}</div><p className="mt-2 text-[11px] font-semibold text-[#8a968b]">No restrictions · last checked 2 min ago</p></div>
              <div className="op-shadow rounded-2xl border border-[#dfe6dc] bg-[#fbfcf8] p-5"><div className="flex items-center justify-between"><span className="font-mono text-[10px] font-bold uppercase tracking-[.15em] text-[#8a968b]">Scheduled next</span><Clock3 size={17} className="text-[#c2912b]" /></div><div className="mt-5 flex items-end justify-between"><strong className="text-[30px] font-extrabold tracking-[-.06em]">14:30</strong><span className="font-mono text-[11px] font-bold text-[#b08124]">in 03h 18m</span></div><div className="mt-4 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#dcae3e]" /><span className="text-[12px] font-bold text-[#556358]">Founder community / May</span></div><p className="mt-2 text-[11px] font-semibold text-[#8a968b]">1,180 destinations · account AM-03</p></div>
            </section>

            <section className="mt-9 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
              <div className="op-shadow overflow-hidden rounded-2xl border border-[#dfe6dc] bg-[#fbfcf8]">
                <div className="flex items-center justify-between border-b border-[#e5ebe1] px-5 py-5"><div><div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#8a968b]">Operations map / 01</div><h2 className="mt-1.5 text-[17px] font-extrabold tracking-[-.03em]">The delivery route</h2></div><button onClick={() => notify("Route details opened")} className="text-[11px] font-extrabold text-[#b35a45] hover:underline">View details</button></div>
                <div className="op-grid relative overflow-x-auto px-5 py-8 md:px-9">
                  <div className="absolute left-[13%] right-[13%] top-[101px] hidden h-px bg-[#b8cbb2] md:block" /><div className="relative grid min-w-[650px] grid-cols-4 gap-5">
                    {[
                      ["01", "Telegram accounts", "4 connected", UsersRound, "green"],
                      ["02", "Groups & topics", "28 approved", Layers3, "green"],
                      ["03", "Message template", "Q2 partner update", FileText, "terra"],
                      ["04", "Campaign delivery", "1,248 sent", Send, "terra"],
                    ].map(([num, title, detail, Icon, tone], i) => <div key={title as string} className="relative text-center"><div className={`relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-2xl border-4 border-[#fbfcf8] ${tone === "green" ? "bg-[#dbe8d1] text-[#315d45]" : "bg-[#f4ddd4] text-[#bd553c]"}`}><Icon size={20} /></div><div className="mt-4 font-mono text-[9px] font-bold tracking-[.16em] text-[#a0aaa0]">{num as string}</div><h3 className="mt-1 text-[12px] font-extrabold">{title as string}</h3><p className="mt-1 text-[11px] font-semibold text-[#7d8a7e]">{detail as string}</p>{i < 3 && <div className="absolute right-[-16px] top-[25px] z-20 hidden text-[#90aa89] md:block"><ArrowRight size={15} /></div>}</div>)}
                  </div>
                </div>
                <div className="border-t border-[#e5ebe1] bg-[#f4f7f1] px-5 py-4 md:px-9"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-[11px] font-bold text-[#617063]"><span className="grid h-6 w-6 place-items-center rounded-lg bg-[#dbe8d1] text-[#315d45]"><CircleCheck size={13} /></span>All dependencies ready for delivery</div><button onClick={() => setPaused(!paused)} className="op-button inline-flex items-center gap-2 rounded-lg border border-[#d8e0d4] bg-[#fbfcf8] px-3 py-2 text-[11px] font-extrabold text-[#607064]">{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? "Resume monitor" : "Pause monitor"}</button></div></div>
              </div>

              <div className="op-shadow rounded-2xl border border-[#dfe6dc] bg-[#fbfcf8] p-5"><div className="flex items-start justify-between"><div><div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#8a968b]">Connection health</div><h2 className="mt-1.5 text-[17px] font-extrabold tracking-[-.03em]">Network pulse</h2></div><button onClick={() => notify("Connection details opened")} className="rounded-lg p-1 text-[#849084] hover:bg-[#edf2e9]"><MoreHorizontal size={18} /></button></div><div className="mt-6 flex items-center gap-5"><div className="relative grid h-[108px] w-[108px] shrink-0 place-items-center rounded-full" style={{ background: "conic-gradient(#6e9865 0deg 331deg, #e5ebe1 331deg 360deg)" }}><div className="grid h-[83px] w-[83px] place-items-center rounded-full bg-[#fbfcf8]"><strong className="text-[23px] font-extrabold">92<span className="text-[12px] text-[#839083]">%</span></strong></div></div><div><div className="flex items-center gap-2 text-[12px] font-extrabold"><span className="h-2 w-2 rounded-full bg-[#6e9865]" />Stable</div><p className="mt-2 text-[11px] font-medium leading-relaxed text-[#7d8a7e]">4 proxies active<br />0 connection drops<br />Latency avg. 188ms</p></div></div><div className="mt-6 border-t border-[#e5ebe1] pt-4"><div className="flex justify-between text-[10px] font-bold text-[#879287]"><span>LAST 24 HOURS</span><span>98.2% uptime</span></div><div className="mt-3 flex h-7 items-end gap-1">{[18,23,13,22,19,25,27,20,28,22,24,30,26,31,28,25,29,32,30,28,31,32,33,30].map((h, i) => <span key={i} className={`flex-1 rounded-t-sm ${i === 5 ? "bg-[#dcae3e]" : "bg-[#a8c39e]"}`} style={{ height: `${h}%` }} />)}</div></div></div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
              <div className="op-shadow rounded-2xl border border-[#dfe6dc] bg-[#fbfcf8]"><div className="flex items-center justify-between border-b border-[#e5ebe1] px-5 py-5"><div><div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#8a968b]">Campaign queue / 02</div><h2 className="mt-1.5 text-[17px] font-extrabold tracking-[-.03em]">What is moving</h2></div><button onClick={() => { setActiveNav("Campaigns"); notify("Campaigns view selected"); }} className="text-[11px] font-extrabold text-[#b35a45] hover:underline">All campaigns <ArrowRight className="ml-1 inline" size={13} /></button></div><div className="divide-y divide-[#edf0ea]">{campaigns.map((campaign) => <div key={campaign.name} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[#f3f6ef]"><span className="h-9 w-1 rounded-full" style={{ backgroundColor: campaign.accent }} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-[12px] font-extrabold">{campaign.name}</h3><span className={`shrink-0 rounded-md px-2 py-1 font-mono text-[9px] font-bold uppercase ${campaign.status === "Running" ? "bg-[#f4ddd4] text-[#b7533c]" : campaign.status === "Scheduled" ? "bg-[#f6ebc9] text-[#a17620]" : "bg-[#e9ede8] text-[#7d887d]"}`}>{campaign.status}</span></div><div className="mt-2 flex items-center gap-3 text-[10px] font-semibold text-[#89958a]"><span>{campaign.sent} / {campaign.total} destinations</span><span>·</span><span>{campaign.time}</span></div></div>{campaign.status === "Running" ? <button onClick={() => notify("Campaign paused")} className="rounded-lg p-2 text-[#929d91] opacity-0 transition group-hover:opacity-100 hover:bg-[#f2ddd7] hover:text-[#b7533c]"><Pause size={15} /></button> : <button onClick={() => notify(campaign.status === "Draft" ? "Campaign editor opened" : "Schedule details opened")} className="rounded-lg p-2 text-[#929d91] opacity-0 transition group-hover:opacity-100 hover:bg-[#e5ede1] hover:text-[#315d45]"><ArrowRight size={15} /></button>}</div>)}</div></div>

              <div className="op-shadow rounded-2xl border border-[#dfe6dc] bg-[#fbfcf8]"><div className="border-b border-[#e5ebe1] px-5 py-5"><div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#8a968b]">Activity stream / 03</div><h2 className="mt-1.5 text-[17px] font-extrabold tracking-[-.03em]">Latest signals</h2></div><div className="px-5 py-3">{activity.map(([time, title, detail, kind]) => <div key={`${time}-${title}`} className="flex gap-3 border-b border-[#edf0ea] py-3.5 last:border-0"><div className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${kind === "wait" ? "bg-[#f6ebc9] text-[#a17620]" : "bg-[#e2eedf] text-[#528051]"}`}>{kind === "wait" ? <Clock3 size={12} /> : <Check size={12} />}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><span className="truncate text-[11px] font-extrabold">{title}</span><span className="font-mono text-[9px] font-bold text-[#9ba59b]">{time}</span></div><p className="mt-1 text-[10px] font-medium text-[#849084]">{detail}</p></div></div>)}</div><button onClick={() => { setActiveNav("Overview"); notify("Activity log opened"); }} className="w-full border-t border-[#e5ebe1] px-5 py-3.5 text-left text-[11px] font-extrabold text-[#b35a45] hover:bg-[#f4f7f1]">Open activity log <ArrowRight className="ml-1 inline" size={13} /></button></div>
            </section>
          </div>
        </main>
      </div>

      {showCreate && <div className="fixed inset-0 z-50 flex justify-end bg-[#203028]/25 backdrop-blur-[2px]" onClick={() => setShowCreate(false)}><div className="h-full w-full max-w-[440px] overflow-y-auto border-l border-[#dfe6dc] bg-[#fbfcf8] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#b35a45]">New operation</div><h2 className="mt-2 text-[25px] font-extrabold tracking-[-.05em]">Create campaign</h2><p className="mt-2 text-[12px] font-medium leading-relaxed text-[#7b887c]">Set the route, then choose when the first message leaves.</p></div><button onClick={() => setShowCreate(false)} className="rounded-xl p-2 text-[#849084] hover:bg-[#edf2e9]"><X size={19} /></button></div><div className="mt-9 space-y-5"><label className="block"><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Campaign name</span><input defaultValue="Untitled operation" className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white px-3 text-[13px] font-bold outline-none focus:border-[#b35a45]" /></label><label className="block"><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Telegram account</span><select className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white px-3 text-[13px] font-bold outline-none"><option>Alex / AM-03 · connected</option><option>Studio / AM-01 · connected</option><option>Support / AM-04 · connected</option></select></label><label className="block"><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Message template</span><select className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white px-3 text-[13px] font-bold outline-none"><option>Q2 partner update</option><option>Founder community / May</option><option>Product waitlist follow-up</option></select></label><div><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Destinations</span><span className="font-mono text-[10px] font-bold text-[#6e9865]">28 approved</span></div><div className="rounded-xl border border-[#d6e0d2] bg-white p-3"><div className="flex items-center gap-2 border-b border-[#edf0ea] pb-3"><Search size={15} className="text-[#9aa69b]" /><span className="text-[12px] font-semibold text-[#a0aaa1]">Search groups or topics</span></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-lg bg-[#e2eedf] px-2.5 py-1.5 text-[10px] font-bold text-[#477047]">Partners · 12</span><span className="rounded-lg bg-[#e2eedf] px-2.5 py-1.5 text-[10px] font-bold text-[#477047]">Community · 9</span><span className="rounded-lg bg-[#e2eedf] px-2.5 py-1.5 text-[10px] font-bold text-[#477047]">Topics · 7</span></div></div></div><div className="grid grid-cols-2 gap-3"><label><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Start date</span><input type="date" defaultValue="2024-05-14" className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white px-3 text-[12px] font-bold" /></label><label><span className="mb-2 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#6f7d70]">Start time</span><input type="time" defaultValue="14:30" className="h-11 w-full rounded-xl border border-[#d6e0d2] bg-white px-3 text-[12px] font-bold" /></label></div></div><div className="mt-10 flex gap-3 border-t border-[#e5ebe1] pt-5"><button onClick={() => setShowCreate(false)} className="h-11 flex-1 rounded-xl border border-[#d6e0d2] text-[12px] font-extrabold text-[#617063] hover:bg-[#f1f5ee]">Save draft</button><button onClick={() => { setShowCreate(false); notify("Campaign queued for review"); }} className="op-button h-11 flex-1 rounded-xl bg-[#d15c40] text-[12px] font-extrabold text-[#fff8f1]">Review campaign <ArrowRight className="ml-1 inline" size={14} /></button></div></div></div>}
      {toast && <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-xl bg-[#193e31] px-4 py-3 text-[12px] font-bold text-[#eff8e9] shadow-xl"><CircleCheck size={15} className="text-[#b4d5a6]" />{toast}</div>}
    </div>
  );
}

export default OperationsMap;