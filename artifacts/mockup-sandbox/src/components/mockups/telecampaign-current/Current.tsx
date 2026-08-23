import { useState } from "react";
import {
  Bell,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageCircle,
  Network,
  Send,
  Settings2,
  Users,
  UsersRound,
  UserCircle,
  XCircle,
} from "lucide-react";
import "./_group.css";

const navigation = [
  ["Dashboard", LayoutDashboard],
  ["Account", UserCircle],
  ["Telegram Accounts", UsersRound],
  ["Groups", Users],
  ["Message templates", FileText],
  ["Campaigns", Megaphone],
  ["Proxy", Network],
  ["Logs", FileText],
] as const;

const metrics = [
  ["Telegram Accounts", "4", Users, "text-[#2563eb]", "bg-[#eff6ff]"],
  ["Active Groups", "12", LayoutGrid, "text-[#059669]", "bg-[#ecfdf5]"],
  ["Message Templates", "8", FileText, "text-[#7c3aed]", "bg-[#f5f3ff]"],
  ["Campaigns", "6", Megaphone, "text-[#ea580c]", "bg-[#fff7ed]"],
  ["Sent Today", "247", Send, "text-[#0891b2]", "bg-[#ecfeff]"],
  ["Failed Today", "3", XCircle, "text-[#e11d48]", "bg-[#fff1f2]"],
] as const;

const campaigns = [
  ["January product update", "Running"],
  ["Community welcome sequence", "Completed"],
  ["Weekly engagement post", "Paused"],
];

const activity = [
  ["10:42:18", "January product update", true],
  ["10:18:04", "Community welcome sequence", true],
  ["09:55:31", "January product update", false],
  ["09:31:12", "Weekly engagement post", true],
];

export function Current() {
  const [language, setLanguage] = useState<"vi" | "en">("en");
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="tc-current min-h-[100dvh] bg-[#f4f7fb] text-[#0f172a]">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-[#eef2f6] bg-white">
        <div className="flex items-center justify-between border-b border-[#eef2f6] px-6 py-5">
          <button onClick={() => setToast("Dashboard selected")} className="flex items-center gap-3 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff6ff] text-[#1a2b88] shadow-sm"><MessageCircle className="h-6 w-6" /></span>
            <span><span className="block text-[15px] font-extrabold tracking-tight">Tele Campaign</span><span className="block text-[11px] font-bold text-[#64748b]">Telegram Manager</span></span>
          </button>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
          {navigation.map(([label, Icon], index) => (
            <button key={label} onClick={() => setToast(`${label} opened`)} className={`group flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left text-[14px] font-bold transition-all ${index === 0 ? "bg-[#eef2fa] text-[#1a2b88]" : "text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]"}`}>
              <Icon className={`h-[18px] w-[18px] ${index === 0 ? "text-[#1a2b88]" : "text-[#64748b]"}`} strokeWidth={index === 0 ? 2.5 : 2} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-[#eef2f6] p-4">
          <div className="rounded-2xl border border-[#eef2f6] bg-[#f8fafc] p-2.5">
            <div className="px-2 pb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-[#64748b]">Language</div>
            <div className="flex items-center gap-2">
              {(["vi", "en"] as const).map((item) => <button key={item} onClick={() => setLanguage(item)} className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-all ${language === item ? "border border-[#e2e8f0] bg-white text-[#0f172a] shadow-sm" : "text-[#64748b] hover:bg-[#e2e8f0]/50"}`}>{item.toUpperCase()}</button>)}
            </div>
          </div>
          <div className="mb-2 mt-5 text-center text-[11px] font-bold text-[#94a3b8]">Tele Campaign v2.0</div>
        </div>
      </aside>

      <main className="flex min-h-[100dvh] flex-col pl-[280px]">
        <header className="sticky top-0 z-20 border-b border-[#eef2f6] bg-white/95 backdrop-blur-xl">
          <div className="flex min-h-[72px] items-center justify-between px-8">
            <h1 className="text-[19px] font-extrabold tracking-tight text-[#0f172a]">Dashboard</h1>
            <div className="flex items-center gap-4">
              <button onClick={() => setToast("Upgrade options opened")} className="rounded-xl bg-[#1a2b88] px-5 py-2.5 text-[13px] font-extrabold text-white shadow-sm transition-all hover:bg-[#152473]">Upgrade</button>
              <button onClick={() => setToast("Signed out")} className="rounded-xl p-2.5 text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a]" aria-label="Sign out"><LogOut className="h-[22px] w-[22px]" /></button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-8">
          <div className="mx-auto max-w-[1440px]">
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {metrics.map(([label, value, Icon, color, bg]) => (
                <div key={label} className="flex cursor-default items-center gap-4 rounded-3xl border border-[#eef2f6] bg-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-colors hover:border-[#cbd5e1]">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14 ${bg} ${color}`}><Icon className="h-6 w-6 sm:h-7 sm:w-7" /></span>
                  <div className="min-w-0 flex-1"><div className="mb-1.5 text-2xl font-extrabold leading-none tracking-tight text-[#0f172a] sm:text-3xl">{value}</div><div className="truncate text-[12px] font-bold leading-tight text-[#64748b] sm:text-[13px]">{label}</div></div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_400px]">
              <div className="space-y-8">
                <section className="rounded-3xl border border-[#cbd5e1] bg-[#f8fafc] p-6">
                  <div className="mb-6 flex items-center gap-3.5"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e0e7ff] text-[#1d4ed8] shadow-sm"><Bell className="h-6 w-6" /></span><h2 className="text-[19px] font-extrabold uppercase tracking-wide text-[#0f172a]">ADMIN Notifications</h2></div>
                  <div className="space-y-7 text-[14px] text-[#0f172a]">
                    <div><div className="mb-1.5 font-extrabold">Update on 14/1/2025 - 9h30 :</div><div className="whitespace-pre-line font-medium leading-relaxed text-[#334155]">Welcome to Tele Campaign. Connect your Telegram accounts and groups to start managing campaigns.</div></div>
                    <div><div className="mb-1.5 font-extrabold">Update on 13/1/2025 - 16h15 :</div><div className="whitespace-pre-line font-medium leading-relaxed text-[#334155]">Keep your account sessions active and review campaign logs regularly for the best delivery results.</div></div>
                  </div>
                </section>
                <section className="overflow-hidden rounded-3xl border border-[#eef2f6] bg-white shadow-sm">
                  <div className="border-b border-[#eef2f6] p-6"><h2 className="text-[20px] font-extrabold tracking-tight">Recent Campaigns</h2></div>
                  <div className="divide-y divide-[#eef2f6]"><div className="flex justify-between bg-[#f8fafc] px-6 py-4 text-[12px] font-extrabold uppercase tracking-wider text-[#64748b]"><span>Name</span><span>Status</span></div>
                    {campaigns.map(([name, status]) => <div key={name} className="flex items-center justify-between bg-white px-6 py-4 transition-colors hover:bg-[#f8fafc]"><span className="truncate pr-4 text-[15px] font-extrabold text-[#1a2b88]">{name}</span><CampaignBadge status={status} /></div>)}
                  </div>
                </section>
              </div>
              <section className="self-start overflow-hidden rounded-3xl border border-[#eef2f6] bg-white shadow-sm">
                <div className="border-b border-[#eef2f6] p-6"><h2 className="text-[20px] font-extrabold tracking-tight">Recent Activity</h2></div>
                <div className="divide-y divide-[#eef2f6]"><div className="grid grid-cols-[75px_1fr_85px] gap-3 bg-[#f8fafc] px-6 py-4 text-[12px] font-extrabold uppercase tracking-wider text-[#64748b]"><span>Time</span><span>Campaigns</span><span className="text-right">Status</span></div>
                  {activity.map(([time, name, success]) => <div key={String(time)} className="grid grid-cols-[75px_1fr_85px] items-center gap-3 bg-white px-6 py-4 transition-colors hover:bg-[#f8fafc]"><span className="font-mono text-[13px] font-bold text-[#64748b]">{time}</span><span className="truncate text-[14px] font-extrabold text-[#1a2b88]">{name}</span><span className="flex justify-end"><span className={`inline-block rounded-full px-3.5 py-1.5 text-[11px] font-extrabold text-white ${success ? "bg-[#1a2b88]" : "bg-[#ef4444]"}`}>{success ? "Success" : "Failed"}</span></span></div>)}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      {toast && <button onClick={() => setToast(null)} className="fixed bottom-6 right-6 z-[70] flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white px-5 py-4 text-[14px] font-bold text-[#0f172a] shadow-xl"><span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />{toast}</button>}
    </div>
  );
}

function CampaignBadge({ status }: { status: string }) {
  const color = status === "Running" ? "border border-[#cbd5e1] bg-[#f8fafc] text-[#0f172a]" : status === "Paused" ? "border border-[#fed7aa] bg-[#fff7ed] text-[#ea580c]" : "border border-[#a7f3d0] bg-[#ecfdf5] text-[#059669]";
  return <span className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider ${color}`}>{status}</span>;
}