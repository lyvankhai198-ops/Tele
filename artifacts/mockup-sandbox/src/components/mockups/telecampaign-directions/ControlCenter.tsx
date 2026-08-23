import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  CirclePause,
  Gauge,
  Layers3,
  MessageSquare,
  MoreHorizontal,
  Network,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";

type Status = "Running" | "Scheduled" | "Paused" | "Completed";

const campaigns: Array<{ name: string; account: string; target: string; progress: number; status: Status; time: string; color: string }> = [
  { name: "April product update", account: "@studio_ops", target: "38 groups", progress: 72, status: "Running", time: "Now", color: "#e9b44c" },
  { name: "Community welcome wave", account: "@northstar_team", target: "24 topics", progress: 34, status: "Running", time: "Now", color: "#78b9a5" },
  { name: "Partner briefing — Q2", account: "@studio_ops", target: "12 groups", progress: 0, status: "Scheduled", time: "14:30", color: "#8f9cad" },
  { name: "Re-engagement follow-up", account: "@fieldnotes", target: "19 groups", progress: 100, status: "Completed", time: "09:48", color: "#8f9cad" },
];

const activity = [
  ["10:42", "April product update", "6 deliveries confirmed", "ok"],
  ["10:38", "northstar_team", "Proxy rotation complete", "ok"],
  ["10:31", "Partner briefing — Q2", "Waiting for schedule", "wait"],
  ["10:19", "fieldnotes", "2 delivery retries queued", "warn"],
];

function Badge({ status }: { status: Status }) {
  const cls = status === "Running" ? "bg-[#f8c75a]/15 text-[#f4c461]" : status === "Scheduled" ? "bg-[#93a4b8]/15 text-[#aab8c7]" : status === "Completed" ? "bg-[#7fc4a9]/15 text-[#8ed2b3]" : "bg-[#f29d70]/15 text-[#f1aa85]";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

function Metric({ label, value, note, accent }: { label: string; value: string; note: string; accent: string }) {
  return <div className="border-l border-[#314052] pl-4">
    <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8290a0]">{label}</div>
    <div className="mt-2 flex items-baseline gap-2"><strong className="font-mono text-[27px] font-medium tracking-tight text-[#f1f3ee]">{value}</strong><span className="text-[11px] font-semibold" style={{ color: accent }}>{note}</span></div>
  </div>;
}

export function ControlCenter() {
  const [active, setActive] = useState("Overview");
  const [showComposer, setShowComposer] = useState(false);
  const [running, setRunning] = useState(true);
  const [query, setQuery] = useState("");
  const filtered = campaigns.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const nav = ["Overview", "Campaigns", "Accounts", "Groups & topics", "Templates", "Proxy health"];

  return <div className="min-h-screen bg-[#111a24] font-sans text-[#e9edf0] selection:bg-[#e9b44c] selection:text-[#151d25]">
    <div className="flex min-h-screen">
      <aside className="hidden w-[228px] shrink-0 border-r border-[#2a3745] bg-[#18232e] p-5 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 border-b border-[#2a3745] pb-6">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e9b44c] text-[#17212a]"><Radio className="h-5 w-5" strokeWidth={2.5} /></div>
          <div><div className="text-[14px] font-extrabold tracking-tight text-[#f3f2ec]">TeleCampaign</div><div className="mt-0.5 font-mono text-[9px] uppercase tracking-[.18em] text-[#81909f]">Control center</div></div>
        </div>
        <div className="mt-7 text-[9px] font-bold uppercase tracking-[.18em] text-[#657687]">Workspace</div>
        <nav className="mt-3 space-y-1">
          {nav.map((item, index) => <button key={item} onClick={() => setActive(item)} className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[12px] font-semibold transition-colors ${active === item ? "bg-[#263746] text-[#f1c766]" : "text-[#9aa9b7] hover:bg-[#21303d] hover:text-[#edf0ed]"}`}>
            {index === 0 ? <Gauge className="h-4 w-4" /> : index === 1 ? <Send className="h-4 w-4" /> : index === 2 ? <UsersRound className="h-4 w-4" /> : index === 3 ? <Layers3 className="h-4 w-4" /> : index === 4 ? <MessageSquare className="h-4 w-4" /> : <Network className="h-4 w-4" />}<span>{item}</span>{active === item && <ChevronRight className="ml-auto h-3.5 w-3.5" />}
          </button>)}
        </nav>
        <div className="mt-auto rounded-lg border border-[#384858] bg-[#202e3b] p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#dfe5e6]"><ShieldCheck className="h-4 w-4 text-[#83c4a5]" />Workspace secure</div>
          <p className="mt-2 text-[10px] leading-relaxed text-[#8c9cab]">All delivery controls are operating normally.</p>
        </div>
        <button className="mt-4 flex items-center gap-3 px-2 py-2 text-left text-[11px] font-semibold text-[#93a1af] hover:text-[#f3f1e8]"><Settings2 className="h-4 w-4" />Workspace settings</button>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="flex h-[70px] items-center justify-between border-b border-[#2a3745] px-5 sm:px-8">
          <div className="flex items-center gap-3"><div className="h-2 w-2 rounded-full bg-[#7fc4a9] shadow-[0_0_0_4px_rgba(127,196,169,.1)]" /><span className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#a2afbb]">Live operations</span><span className="hidden text-[11px] text-[#647585] sm:inline">/</span><span className="hidden text-[11px] font-semibold text-[#7e8d9c] sm:inline">Tuesday, 23 April 2024</span></div>
          <div className="flex items-center gap-3"><button className="hidden rounded-md border border-[#354453] p-2 text-[#9aa8b4] hover:border-[#d1a94c] hover:text-[#ebbf5a] sm:block"><Search className="h-4 w-4" /></button><div className="grid h-8 w-8 place-items-center rounded-full bg-[#bf8f54] text-[11px] font-extrabold text-[#17212a]">MK</div></div>
        </header>
        <div className="mx-auto max-w-[1360px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#e9b44c]">Tuesday shift · 10:45 UTC+2</div><h1 className="text-[30px] font-extrabold tracking-[-.04em] text-[#f1f3ee] sm:text-[37px]">Good morning, Maya.</h1><p className="mt-2 text-[13px] text-[#8d9ba8]">Your delivery desk is clear. One campaign needs your attention.</p></div>
            <button onClick={() => setShowComposer(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#e9b44c] px-4 text-[12px] font-extrabold text-[#18212b] transition-transform hover:-translate-y-0.5 hover:bg-[#f3c765] active:translate-y-0"><Plus className="h-4 w-4" />New campaign</button>
          </div>
          <section className="grid gap-5 border-y border-[#2e3c4a] py-5 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Sent today" value="1,284" note="+12.8%" accent="#e9b44c" /><Metric label="Daily quota" value="64.2%" note="716 remaining" accent="#8ed2b3" /><Metric label="Accounts online" value="7 / 8" note="1 reconnecting" accent="#f1aa85" /><Metric label="Delivery health" value="98.7%" note="Last 24 hours" accent="#8ed2b3" />
          </section>
          <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
            <section className="min-w-0 rounded-lg border border-[#2c3a48] bg-[#18232e]">
              <div className="flex flex-col gap-4 border-b border-[#2c3a48] p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-[#e9b44c]" /><h2 className="text-[15px] font-extrabold text-[#eff1ed]">Campaign pulse</h2></div><p className="mt-1 text-[11px] text-[#81909f]">Current delivery windows across your workspace</p></div><div className="flex items-center gap-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6e7f8e]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter campaigns" className="h-8 w-[150px] rounded border border-[#3a4957] bg-[#131e28] pl-8 pr-2 text-[11px] text-[#e9edf0] outline-none placeholder:text-[#697887] focus:border-[#d0a648]" /></div><button className="rounded border border-[#3a4957] p-1.5 text-[#8795a1] hover:text-[#e9b44c]"><MoreHorizontal className="h-4 w-4" /></button></div></div>
              <div className="overflow-x-auto"><div className="min-w-[620px]"><div className="grid grid-cols-[minmax(210px,1.5fr)_110px_110px_110px] gap-4 border-b border-[#2a3745] px-5 py-3 text-[9px] font-bold uppercase tracking-[.16em] text-[#687887]"><span>Campaign</span><span>Progress</span><span>Window</span><span className="text-right">Status</span></div>{filtered.map((campaign) => <div key={campaign.name} className="group grid grid-cols-[minmax(210px,1.5fr)_110px_110px_110px] items-center gap-4 border-b border-[#273541] px-5 py-4 transition-colors last:border-0 hover:bg-[#202e3a]"><div className="flex min-w-0 items-center gap-3"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: campaign.color }} /><div className="min-w-0"><div className="truncate text-[12px] font-bold text-[#e6ebe8]">{campaign.name}</div><div className="mt-1 text-[10px] text-[#778795]">{campaign.account} · {campaign.target}</div></div></div><div><div className="mb-1.5 flex justify-between text-[10px] font-mono text-[#93a3b1]"><span>{campaign.progress}%</span><span>{campaign.progress === 100 ? "Done" : "live"}</span></div><div className="h-1 overflow-hidden rounded-full bg-[#334453]"><div className="h-full rounded-full" style={{ width: `${campaign.progress}%`, backgroundColor: campaign.color }} /></div></div><span className="font-mono text-[11px] text-[#9aa8b3]">{campaign.time}</span><span className="flex justify-end"><Badge status={campaign.status} /></span></div>)}</div></div>
              <div className="flex items-center justify-between border-t border-[#2c3a48] px-5 py-3"><span className="text-[10px] text-[#718190]">Showing {filtered.length} of 12 campaigns</span><button className="flex items-center gap-1 text-[11px] font-bold text-[#e9b44c] hover:text-[#f4d17e]">View all <ArrowUpRight className="h-3.5 w-3.5" /></button></div>
            </section>
            <aside className="rounded-lg border border-[#2c3a48] bg-[#18232e]">
              <div className="border-b border-[#2c3a48] p-5"><div className="flex items-center justify-between"><h2 className="text-[15px] font-extrabold text-[#eff1ed]">Attention needed</h2><span className="grid h-5 w-5 place-items-center rounded-full bg-[#f29d70] text-[10px] font-extrabold text-[#1a252e]">2</span></div><p className="mt-1 text-[11px] text-[#81909f]">Resolve before the next delivery window</p></div>
              <div className="divide-y divide-[#293744]"><div className="p-5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f1aa85]" /><div><div className="text-[12px] font-bold text-[#e7ebe8]">Account reconnecting</div><p className="mt-1 text-[10px] leading-relaxed text-[#8998a6]">@fieldnotes has been offline for 8m.</p><button className="mt-3 text-[10px] font-bold text-[#e9b44c] hover:underline">Review account <ChevronRight className="ml-1 inline h-3 w-3" /></button></div></div></div><div className="p-5"><div className="flex gap-3"><CirclePause className="mt-0.5 h-4 w-4 shrink-0 text-[#e9b44c]" /><div><div className="text-[12px] font-bold text-[#e7ebe8]">2 retries waiting</div><p className="mt-1 text-[10px] leading-relaxed text-[#8998a6]">Community welcome wave has delayed destinations.</p><button className="mt-3 text-[10px] font-bold text-[#e9b44c] hover:underline">Open delivery log <ChevronRight className="ml-1 inline h-3 w-3" /></button></div></div></div></div>
              <div className="m-4 rounded border border-[#304252] bg-[#202e3a] p-3.5"><div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[.12em] text-[#9cabb8]"><span>System status</span><span className="flex items-center gap-1.5 text-[#8ed2b3]"><span className="h-1.5 w-1.5 rounded-full bg-current" />Nominal</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><div className="font-mono text-[14px] text-[#e7ece8]">42ms</div><div className="mt-1 text-[9px] text-[#728391]">API latency</div></div><div><div className="font-mono text-[14px] text-[#e7ece8]">8 / 8</div><div className="mt-1 text-[9px] text-[#728391]">Proxies</div></div><div><div className="font-mono text-[14px] text-[#e7ece8]">0</div><div className="mt-1 text-[9px] text-[#728391]">Incidents</div></div></div></div>
            </aside>
          </div>
          <section className="mt-6 rounded-lg border border-[#2c3a48] bg-[#18232e]"><div className="flex items-center justify-between border-b border-[#2c3a48] px-5 py-4"><div><h2 className="text-[14px] font-extrabold text-[#eff1ed]">Recent activity</h2><p className="mt-1 text-[10px] text-[#81909f]">A concise trail of operator and system events</p></div><button className="text-[11px] font-bold text-[#e9b44c] hover:underline">Open logs</button></div><div className="grid gap-x-8 md:grid-cols-2">{activity.map(([time, title, detail, kind]) => <div key={time} className="flex items-center gap-3 border-b border-[#273541] px-5 py-3.5 last:border-0"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${kind === "warn" ? "bg-[#f29d70]/15 text-[#f1aa85]" : kind === "wait" ? "bg-[#e9b44c]/15 text-[#e9b44c]" : "bg-[#7fc4a9]/15 text-[#8ed2b3]"}`}>{kind === "warn" ? <AlertTriangle className="h-3 w-3" /> : kind === "wait" ? <CalendarClock className="h-3 w-3" /> : <Check className="h-3 w-3" />}</span><span className="w-11 font-mono text-[10px] text-[#748492]">{time}</span><div className="min-w-0 flex-1"><span className="text-[11px] font-bold text-[#dce4e1]">{title}</span><span className="ml-2 text-[10px] text-[#82919e]">{detail}</span></div></div>)}</div></section>
        </div>
      </main>
    </div>
    {showComposer && <div className="fixed inset-0 z-20 grid place-items-center bg-[#101820]/75 p-5 backdrop-blur-sm"><div className="w-full max-w-md rounded-lg border border-[#465666] bg-[#1d2a36] shadow-2xl"><div className="flex items-start justify-between border-b border-[#344554] p-5"><div><div className="font-mono text-[9px] font-bold uppercase tracking-[.18em] text-[#e9b44c]">Campaign setup</div><h2 className="mt-2 text-lg font-extrabold text-[#f0f2ed]">Start a delivery window</h2><p className="mt-1 text-[11px] text-[#8998a5]">Configure the essentials, then review destinations.</p></div><button onClick={() => setShowComposer(false)} className="text-[#81909d] hover:text-[#f0f2ed]"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[.12em] text-[#93a3b0]">Campaign name</span><input defaultValue="May partner briefing" className="h-10 w-full rounded border border-[#435464] bg-[#14202a] px-3 text-[12px] text-[#eef1ed] outline-none focus:border-[#e9b44c]" /></label><label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[.12em] text-[#93a3b0]">Message template</span><select className="h-10 w-full rounded border border-[#435464] bg-[#14202a] px-3 text-[12px] text-[#eef1ed] outline-none focus:border-[#e9b44c]"><option>Partner briefing — April</option><option>Product update — concise</option></select></label><div className="grid grid-cols-2 gap-3"><div className="rounded border border-[#3b4c5b] bg-[#202e3a] p-3"><div className="text-[10px] text-[#8796a4]">Account</div><div className="mt-1 text-[12px] font-bold text-[#e8ece8]">@studio_ops</div></div><div className="rounded border border-[#3b4c5b] bg-[#202e3a] p-3"><div className="text-[10px] text-[#8796a4]">Destinations</div><div className="mt-1 text-[12px] font-bold text-[#e8ece8]">12 groups</div></div></div><button onClick={() => { setShowComposer(false); setRunning(true); }} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded bg-[#e9b44c] text-[12px] font-extrabold text-[#18212a] hover:bg-[#f3c765]"><Play className="h-4 w-4" />Review campaign</button></div></div></div>}
    <button onClick={() => setRunning(!running)} className="fixed bottom-5 right-5 hidden items-center gap-2 rounded-full border border-[#405160] bg-[#1d2b37] px-3 py-2 text-[10px] font-bold text-[#b9c5cb] shadow-lg sm:flex"><span className={`h-2 w-2 rounded-full ${running ? "bg-[#8ed2b3]" : "bg-[#f1aa85]"}`} />{running ? "Live sync on" : "Live sync paused"}</button>
  </div>;
}

export default ControlCenter;