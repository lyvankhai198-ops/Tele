import { useState } from "react";
import { Activity, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, FileText, Radio, ShieldCheck, Users } from "lucide-react";
import { AppLayout, MetricCard, PageIntro, Panel, PrimaryButton, QuietButton, SectionHeader, StatusBadge, Toast } from "./_shared/AppLayout";

const queue = [
  { time: "09:30", day: "Today", title: "Community update · January notes", channel: "Hanoi Product Builders", status: "scheduled" as const, kind: "Text + 1 image" },
  { time: "13:00", day: "Today", title: "Weekly prompt: what are you shipping?", channel: "Indie Makers Vietnam", status: "scheduled" as const, kind: "Text" },
  { time: "08:45", day: "Tomorrow", title: "Office hours reminder", channel: "Remote Work Asia", status: "draft" as const, kind: "Text + link" },
];

export function Dashboard() {
  const [toast, setToast] = useState<string | null>(null);
  const [range, setRange] = useState("Last 7 days");

  return (
    <AppLayout activePage="dashboard" title="Overview" subtitle="Tuesday, 14 January 2025 · Workspace timezone ICT" headerAction={<QuietButton onClick={() => setToast("Calendar view opened") }><CalendarDays className="h-3.5 w-3.5" />Open calendar</QuietButton>}>
      <PageIntro kicker="Good morning, Minh" heading="The control room is quiet." detail="Keep approved conversations moving without losing the human signal. Here’s what needs your attention today." action={<PrimaryButton onClick={() => window.location.assign("/__mockup/telecampaign/Campaigns")}><FileText className="h-4 w-4" />Create campaign</PrimaryButton>} />

      <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Messages delivered" value="1,284" change="+12.8%" icon={CheckCircle2} tone="green" />
        <MetricCard label="Scheduled next" value="18" change="3 today" icon={Clock3} tone="blue" />
        <MetricCard label="Active channels" value="12" change="2 need review" icon={Users} tone="warm" />
        <MetricCard label="Delivery rate" value="98.4%" change="+0.6%" icon={Activity} tone="blue" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,.8fr)]">
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#24384d] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <SectionHeader eyebrow="Throughput" title="Delivery overview" detail="Successful posts across managed channels" />
            <select value={range} onChange={(event) => setRange(event.target.value)} className="h-9 rounded-lg border border-[#2b455c] bg-[#142638] px-3 text-[11px] text-[#b7ccde] outline-none focus:border-[#5aaef2]"><option>Last 7 days</option><option>Last 30 days</option><option>This quarter</option></select>
          </div>
          <div className="px-4 pb-5 pt-4 sm:px-6">
            <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-[#63809b]"><span>Posts delivered</span><span>1,284 total</span></div>
            <div className="h-[218px] w-full">
              <svg viewBox="0 0 720 218" className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Posts delivered line chart">
                <defs><linearGradient id="fillBlue" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3f9dea" stopOpacity=".25" /><stop offset="1" stopColor="#3f9dea" stopOpacity="0" /></linearGradient></defs>
                {[35, 82, 129, 176].map((y) => <line key={y} x1="0" x2="720" y1={y} y2={y} stroke="#20364b" strokeWidth="1" />)}
                <path d="M0 176 C48 168 61 133 102 145 S164 123 205 126 S260 87 307 109 S363 98 410 112 S460 64 512 81 S567 38 612 56 S670 30 720 40 L720 200 L0 200Z" fill="url(#fillBlue)" />
                <path d="M0 176 C48 168 61 133 102 145 S164 123 205 126 S260 87 307 109 S363 98 410 112 S460 64 512 81 S567 38 612 56 S670 30 720 40" fill="none" stroke="#5eb3f2" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                {[0, 102, 205, 307, 410, 512, 612, 720].map((x, index) => <text key={x} x={x} y="216" fill="#617c96" fontSize="9" textAnchor={index === 0 ? "start" : index === 7 ? "end" : "middle"}>{["08 Jan", "09 Jan", "10 Jan", "11 Jan", "12 Jan", "13 Jan", "14 Jan", ""][index]}</text>)}
              </svg>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] text-[#7e96ab]"><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#5eb3f2]" />Delivered</span><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#e4ad6a]" />Pending review</span></div>
          </div>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <SectionHeader eyebrow="Guardrails" title="Workspace health" detail="Live checks for your Telegram connection" />
          <div className="mb-5 flex items-center gap-4 rounded-xl border border-[#285844] bg-[#12352e] p-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1b5948] text-[#79d8a5]"><ShieldCheck className="h-5 w-5" /></span>
            <div><p className="text-[13px] font-semibold text-[#ccefe0]">Operating normally</p><p className="mt-1 text-[11px] text-[#79b99d]">No permission or delivery issues</p></div>
          </div>
          <div className="space-y-4">
            {[["Telegram connection", "Connected · 4 accounts", "success"], ["Posting permissions", "12 of 12 verified", "success"], ["Review queue", "2 items waiting", "warning"]].map(([label, value, status]) => (
              <div key={label} className="flex items-center justify-between gap-3"><div><p className="text-[12px] text-[#b9cbda]">{label}</p><p className="mt-1 font-mono text-[10px] text-[#6f8ba5]">{value}</p></div><StatusBadge status={status as "success" | "warning"} label={status === "success" ? "Clear" : "Review"} /></div>
            ))}
          </div>
          <button onClick={() => setToast("Health checks are up to date")} className="mt-6 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#68b5f3] hover:text-[#a5d9fa]">Run health check <ArrowUpRight className="h-3.5 w-3.5" /></button>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(310px,.75fr)]">
        <Panel className="p-5 sm:p-6">
          <SectionHeader eyebrow="Queue" title="Upcoming posts" detail="Next approved content in your publishing queue" action={<button onClick={() => window.location.assign("/__mockup/telecampaign/Calendar")} className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#68b5f3] hover:text-[#a5d9fa]">See calendar</button>} />
          <div className="divide-y divide-[#21364a]">
            {queue.map((item) => <div key={item.title} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center"><div className="flex w-[86px] shrink-0 items-center gap-2"><span className="text-[15px] font-semibold text-[#e6f0f7]">{item.time}</span><span className="font-mono text-[9px] text-[#708aa2]">{item.day}</span></div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-[#d5e5f0]">{item.title}</p><p className="mt-1 truncate text-[11px] text-[#718ba3]">{item.channel} · {item.kind}</p></div><StatusBadge status={item.status} label={item.status === "scheduled" ? "Scheduled" : "Draft"} /></div>)}
          </div>
        </Panel>
        <Panel className="p-5 sm:p-6">
          <SectionHeader eyebrow="Signal" title="Channel health" detail="Recent activity by destination" />
          <div className="space-y-4">
            {[["Hanoi Product Builders", "486 members", "82 posts", "98%"], ["Indie Makers Vietnam", "1,204 members", "61 posts", "100%"], ["Remote Work Asia", "3,842 members", "44 posts", "96%"]].map(([name, members, posts, rate], index) => <div key={name} className="flex items-center gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${index === 0 ? "bg-[#1d5279] text-[#a9ddff]" : index === 1 ? "bg-[#614b2e] text-[#f1c98d]" : "bg-[#294b46] text-[#a4e4ca]"}`}>{name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium text-[#cddde9]">{name}</p><p className="mt-1 font-mono text-[9px] text-[#6e889f]">{members} · {posts}</p></div><span className="font-mono text-[10px] text-[#76d19d]">{rate}</span></div>)}
          </div>
          <button onClick={() => window.location.assign("/__mockup/telecampaign/Groups")} className="mt-6 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#68b5f3] hover:text-[#a5d9fa]">Manage destinations <ArrowUpRight className="h-3.5 w-3.5" /></button>
        </Panel>
      </div>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}