import { useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Gauge,
  Layers3,
  Menu,
  MoreHorizontal,
  Network,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";

type Campaign = { name: string; audience: string; status: "Ready" | "Scheduled" | "Draft"; progress: number; send: string };

const campaigns: Campaign[] = [
  { name: "January product notes", audience: "Hanoi Product Builders · 8 topics", status: "Ready", progress: 82, send: "Today, 09:30" },
  { name: "Founder office hours", audience: "Indie Makers Vietnam · 4 groups", status: "Scheduled", progress: 46, send: "Today, 13:00" },
  { name: "Remote work pulse", audience: "Remote Work Asia · 6 groups", status: "Draft", progress: 18, send: "Not scheduled" },
];

const navItems = [
  { label: "Workspace", icon: Layers3 },
  { label: "Campaigns", icon: Send, active: true },
  { label: "Accounts", icon: UsersRound },
  { label: "Groups & topics", icon: Radio },
  { label: "Templates", icon: FileText },
];

export function CampaignStudio() {
  const [activeNav, setActiveNav] = useState("Campaigns");
  const [showComposer, setShowComposer] = useState(false);
  const [toast, setToast] = useState("");
  const [campaignRows, setCampaignRows] = useState(campaigns);
  const [query, setQuery] = useState("");

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function createCampaign() {
    setCampaignRows((rows) => [{ name: "Untitled campaign", audience: "Choose groups and topics", status: "Draft", progress: 0, send: "Not scheduled" }, ...rows]);
    setShowComposer(false);
    notify("Draft campaign created");
  }

  const filtered = campaignRows.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="min-h-[100dvh] bg-[#f5f1e9] text-[#18252d] selection:bg-[#f4a58e] selection:text-[#18252d]">
      <style>{`
        .studio-shell { font-family: "Plus Jakarta Sans", ui-sans-serif, sans-serif; }
        .studio-display { font-family: Georgia, "Times New Roman", serif; }
        .studio-grain { position: relative; }
        .studio-grain:after { content:""; position:fixed; inset:0; pointer-events:none; opacity:.035; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E"); z-index:40; }
        .studio-row { transition: transform .2s ease, background-color .2s ease; }
        .studio-row:hover { transform: translateX(4px); background:#fbf8f2; }
        .studio-button { transition: transform .2s ease, background-color .2s ease, box-shadow .2s ease; }
        .studio-button:hover { transform: translateY(-2px); box-shadow:0 8px 18px rgba(40,55,58,.13); }
      `}</style>
      <div className="studio-shell studio-grain flex min-h-[100dvh]">
        <aside className="hidden w-[244px] shrink-0 flex-col bg-[#17343b] px-5 py-6 text-[#d9e3dc] lg:flex">
          <div className="mb-14 flex items-center gap-3 px-2">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#ee876c] text-[#17343b]"><Send className="h-[17px] w-[17px]" strokeWidth={2.8} /></span>
            <div><div className="text-[14px] font-extrabold tracking-[-.03em] text-[#f5f1e9]">TeleCampaign</div><div className="mt-0.5 font-mono text-[9px] uppercase tracking-[.18em] text-[#88a39e]">Campaign Studio</div></div>
          </div>
          <div className="mb-3 px-3 font-mono text-[9px] font-bold uppercase tracking-[.18em] text-[#789690]">The desk</div>
          <nav className="space-y-1">
            {navItems.map(({ label, icon: Icon, active }) => (
              <button key={label} onClick={() => { setActiveNav(label); notify(`${label} view selected`); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-bold ${activeNav === label ? "bg-[#31545a] text-[#fff8ed]" : "text-[#9eb5ad] hover:bg-[#24474e] hover:text-[#f5f1e9]"}`}>
                <Icon className="h-[17px] w-[17px]" strokeWidth={activeNav === label ? 2.3 : 1.8} /><span>{label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#ee876c]" />}
              </button>
            ))}
          </nav>
          <div className="mt-auto">
            <div className="mb-5 rounded-2xl border border-[#365960] bg-[#1d4148] p-4">
              <div className="mb-3 flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[.16em] text-[#8facaa]">System health</span><span className="h-2 w-2 rounded-full bg-[#86c89b]" /></div>
              <div className="mb-2 text-[13px] font-extrabold text-[#f5f1e9]">All systems steady</div>
              <div className="font-mono text-[10px] text-[#8facaa]">12 accounts · 0 warnings</div>
            </div>
            <button onClick={() => notify("Settings view selected")} className="flex items-center gap-3 px-3 py-2 text-[12px] font-bold text-[#9eb5ad] hover:text-[#f5f1e9]"><Settings2 className="h-4 w-4" />Workspace settings</button>
            <div className="mt-7 flex items-center gap-3 border-t border-[#365960] pt-5"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#edc9b8] text-[11px] font-extrabold text-[#17343b]">MN</span><div><div className="text-[11px] font-extrabold text-[#f5f1e9]">Minh Nguyen</div><div className="text-[10px] text-[#8facaa]">Operator</div></div><MoreHorizontal className="ml-auto h-4 w-4 text-[#789690]" /></div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-[74px] items-center justify-between border-b border-[#ded8cc] bg-[#f5f1e9]/90 px-5 backdrop-blur-md sm:px-9">
            <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-[#e8e0d3] lg:hidden" onClick={() => notify("Navigation opened")}><Menu className="h-5 w-5" /></button><div className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#71817d]">Tuesday, 14 January 2025 <span className="mx-2 text-[#c7bdb0]">/</span> ICT</div></div>
            <div className="flex items-center gap-3"><button onClick={() => notify("No new notifications")} className="relative rounded-xl p-2.5 text-[#71817d] hover:bg-[#e8e0d3]"><CircleAlert className="h-[18px] w-[18px]" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#ee876c]" /></button><div className="hidden h-7 w-px bg-[#ded8cc] sm:block" /><button onClick={() => notify("Help center opened")} className="text-[11px] font-extrabold text-[#71817d] hover:text-[#17343b]">Need a hand?</button></div>
          </header>
          <div className="mx-auto max-w-[1370px] px-5 py-8 sm:px-9 sm:py-11">
            <section className="mb-10 flex flex-col justify-between gap-7 border-b border-[#d9d1c4] pb-9 md:flex-row md:items-end">
              <div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.19em] text-[#d36e59]"><span className="h-1.5 w-1.5 rounded-full bg-[#ee876c]" />Operator workspace</div><h1 className="studio-display text-[42px] leading-[.98] tracking-[-.04em] text-[#17343b] sm:text-[57px]">Make the next send<br /><em className="text-[#d36e59]">worth opening.</em></h1><p className="mt-5 max-w-[490px] text-[13px] font-medium leading-6 text-[#71817d]">A clear view of what is ready, what needs your eye, and what will move when you press send.</p></div>
              <button onClick={() => setShowComposer(true)} className="studio-button inline-flex h-[49px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#e97961] px-5 text-[12px] font-extrabold text-[#17343b]"><Plus className="h-4 w-4" strokeWidth={2.7} /> Build a campaign <ArrowRight className="ml-2 h-4 w-4" /></button>
            </section>

            <section className="mb-9 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
              <div className="rounded-2xl bg-[#17343b] p-6 text-[#f5f1e9] sm:p-7">
                <div className="flex items-start justify-between"><div><div className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#8facaa]">Today’s delivery quota</div><div className="flex items-baseline gap-3"><strong className="studio-display text-[48px] font-normal leading-none">1,284</strong><span className="text-[12px] font-bold text-[#86c89b]">+12.8%</span></div></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#2c5056] text-[#eea18c]"><Gauge className="h-[19px] w-[19px]" /></span></div>
                <div className="mt-6 flex items-center justify-between text-[10px] font-bold text-[#8facaa]"><span>1,284 delivered</span><span>of 1,500 daily limit</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#31545a]"><div className="h-full w-[85.6%] rounded-full bg-[#ee876c]" /></div><div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-[#b4cac0]"><ShieldCheck className="h-4 w-4 text-[#86c89b]" /> Within safe sending limits <span className="ml-auto font-mono text-[#8facaa]">85.6%</span></div>
              </div>
              <div className="rounded-2xl border border-[#ded8cc] bg-[#fbf8f2] p-6 sm:p-7"><div className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#71817d]">Next on the desk</div><div className="mt-5 flex items-start gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#f4ded4] text-[#d36e59]"><CalendarClock className="h-5 w-5" /></div><div><div className="text-[11px] font-bold text-[#71817d]">Today · 09:30 ICT</div><div className="mt-1 text-[15px] font-extrabold text-[#17343b]">January product notes</div><div className="mt-2 text-[11px] font-medium text-[#71817d]">8 topics · @minh_product</div></div></div><button onClick={() => notify("Campaign preview opened")} className="mt-6 flex items-center gap-2 text-[11px] font-extrabold text-[#d36e59] hover:gap-3">Review before sending <ArrowRight className="h-3.5 w-3.5" /></button></div>
            </section>

            <section className="grid gap-9 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.65fr)]">
              <div>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#71817d]">The working queue</div><h2 className="studio-display text-[29px] font-normal tracking-[-.03em] text-[#17343b]">Campaigns in motion</h2></div><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ba6a0]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a campaign" className="h-9 w-[180px] rounded-lg border border-[#d9d1c4] bg-transparent pl-9 pr-3 text-[11px] font-semibold outline-none focus:border-[#d36e59]" /></div></div>
                <div className="overflow-hidden rounded-2xl border border-[#ded8cc] bg-[#fbf8f2]">{filtered.map((campaign, index) => <div key={campaign.name + index} className="studio-row grid gap-4 border-b border-[#e6dfd4] p-5 last:border-0 sm:grid-cols-[1.5fr_.75fr_105px] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${campaign.status === "Ready" ? "bg-[#86c89b]" : campaign.status === "Scheduled" ? "bg-[#d7a35d]" : "bg-[#a9b0ac]"}`} /><span className="truncate text-[13px] font-extrabold text-[#17343b]">{campaign.name}</span></div><div className="mt-2 truncate text-[10px] font-medium text-[#8b9891]">{campaign.audience}</div></div><div><div className="mb-1.5 flex justify-between text-[9px] font-bold text-[#8b9891]"><span>{campaign.status}</span><span>{campaign.progress}%</span></div><div className="h-1.5 rounded-full bg-[#e4ded3]"><div className={`h-full rounded-full ${campaign.status === "Ready" ? "bg-[#86c89b]" : campaign.status === "Scheduled" ? "bg-[#d7a35d]" : "bg-[#abb4ad]"}`} style={{ width: `${campaign.progress}%` }} /></div></div><div className="flex items-center justify-between gap-2 sm:block sm:text-right"><div className="font-mono text-[10px] font-bold text-[#71817d]">{campaign.send}</div><button onClick={() => notify(`${campaign.name} selected`)} className="mt-2 text-[#9ba6a0] hover:text-[#d36e59]"><MoreHorizontal className="h-4 w-4" /></button></div></div>)}</div>
              </div>
              <aside><div className="mb-5 flex items-end justify-between"><div><div className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#71817d]">Quiet confidence</div><h2 className="studio-display text-[29px] font-normal tracking-[-.03em] text-[#17343b]">Signal check</h2></div><Activity className="mb-1 h-5 w-5 text-[#d36e59]" /></div><div className="space-y-2.5"><HealthRow icon={UsersRound} label="Telegram accounts" value="12 connected" tone="good" /><HealthRow icon={Radio} label="Groups & topics" value="38 ready" tone="good" /><HealthRow icon={Network} label="Proxy connections" value="11 healthy" tone="good" /><HealthRow icon={FileText} label="Message templates" value="3 approved" tone="warm" /></div><div className="mt-7 rounded-2xl bg-[#e9dfd2] p-5"><div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#a15e4e]"><Check className="h-3.5 w-3.5" /> Before you send</div><p className="text-[12px] font-semibold leading-5 text-[#4d625e]">Your next campaign has an approved template, a connected account, and a healthy route.</p><button onClick={() => notify("Readiness checklist opened")} className="mt-4 flex items-center gap-2 text-[10px] font-extrabold text-[#d36e59]">Open checklist <ArrowRight className="h-3 w-3" /></button></div></aside>
            </section>
          </div>
        </main>
      </div>
      {toast && <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-[#17343b] px-4 py-3 text-[11px] font-bold text-[#f5f1e9] shadow-xl"><Check className="h-4 w-4 text-[#86c89b]" />{toast}<button onClick={() => setToast("")}><X className="h-3.5 w-3.5 text-[#8facaa]" /></button></div>}
      {showComposer && <div className="fixed inset-0 z-30 grid place-items-center bg-[#17343b]/35 p-5 backdrop-blur-sm"><div className="w-full max-w-[530px] rounded-2xl border border-[#ded8cc] bg-[#fbf8f2] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><div className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#d36e59]">New work</div><h2 className="studio-display text-[31px] text-[#17343b]">Build a campaign</h2><p className="mt-2 text-[12px] font-medium leading-5 text-[#71817d]">Start with a name. You can refine the audience and message before scheduling.</p></div><button onClick={() => setShowComposer(false)} className="rounded-lg p-2 text-[#71817d] hover:bg-[#e9dfd2]"><X className="h-5 w-5" /></button></div><label className="mt-7 block text-[11px] font-extrabold text-[#4d625e]">Campaign name<input autoFocus placeholder="e.g. January community notes" className="mt-2 h-11 w-full rounded-xl border border-[#d9d1c4] bg-[#f5f1e9] px-3.5 text-[13px] font-semibold outline-none focus:border-[#d36e59]" /></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><SelectLike label="Telegram account" value="@minh_product · Connected" /><SelectLike label="Message template" value="January notes · Approved" /></div><div className="mt-7 flex justify-end gap-3"><button onClick={() => setShowComposer(false)} className="rounded-xl px-4 py-2.5 text-[11px] font-extrabold text-[#71817d] hover:bg-[#e9dfd2]">Keep planning</button><button onClick={createCampaign} className="studio-button rounded-xl bg-[#e97961] px-5 py-2.5 text-[11px] font-extrabold text-[#17343b]">Create draft</button></div></div></div>}
    </div>
  );
}

function HealthRow({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone: "good" | "warm" }) {
  return <button className="flex w-full items-center gap-3 rounded-xl border border-[#ded8cc] bg-[#fbf8f2] px-4 py-3 text-left hover:border-[#c9bfb1]"><span className={`grid h-8 w-8 place-items-center rounded-lg ${tone === "good" ? "bg-[#e2f0e5] text-[#5b9b72]" : "bg-[#f4ded4] text-[#d36e59]"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-extrabold text-[#4d625e]">{label}</span><span className="mt-0.5 block text-[10px] font-medium text-[#8b9891]">{value}</span></span><ChevronDown className="h-3.5 w-3.5 -rotate-90 text-[#b2b9b3]" /></button>;
}

function SelectLike({ label, value }: { label: string; value: string }) {
  return <button className="rounded-xl border border-[#d9d1c4] bg-[#f5f1e9] p-3 text-left hover:border-[#d36e59]"><span className="block text-[10px] font-extrabold text-[#8b9891]">{label}</span><span className="mt-1 block truncate text-[11px] font-bold text-[#4d625e]">{value}</span></button>;
}