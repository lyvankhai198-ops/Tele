import { useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Command,
  FileText,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

export type PageKey =
  | "dashboard"
  | "accounts"
  | "groups"
  | "campaigns"
  | "calendar"
  | "logs"
  | "settings";

const navigation: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard; path: string }> = [
  { key: "dashboard", label: "Overview", icon: LayoutDashboard, path: "Dashboard" },
  { key: "accounts", label: "Accounts", icon: Radio, path: "Accounts" },
  { key: "groups", label: "Groups & channels", icon: Users, path: "Groups" },
  { key: "campaigns", label: "Campaigns", icon: FileText, path: "Campaigns" },
  { key: "calendar", label: "Calendar", icon: CalendarDays, path: "Calendar" },
  { key: "logs", label: "Activity log", icon: Activity, path: "Logs" },
];

export function AppLayout({
  activePage,
  title,
  subtitle,
  children,
  headerAction,
  banner,
}: {
  activePage: PageKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
  headerAction?: ReactNode;
  banner?: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function navigate(path: string) {
    window.location.assign(`/__mockup/telecampaign/${path}`);
  }

  return (
    <div
      className="min-h-[100dvh] bg-[#0b1420] text-[#dce8f5]"
      style={{ fontFamily: "'Avenir Next', 'Trebuchet MS', ui-sans-serif, sans-serif" }}
    >
      <div className="pointer-events-none fixed inset-0 opacity-[0.025]" style={{ backgroundImage: "radial-gradient(#b8d8f4 0.6px, transparent 0.6px)", backgroundSize: "7px 7px" }} />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col border-r border-[#243548] bg-[#0d1927]/95 px-4 py-5 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-9 flex items-center justify-between px-2">
          <button onClick={() => navigate("Dashboard")} className="flex items-center gap-3 text-left">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#2992ee] shadow-[0_8px_24px_rgba(41,146,238,.25)]">
              <MessageCircle className="h-5 w-5 text-[#f5fbff]" strokeWidth={2.5} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold tracking-[-0.02em] text-[#f1f7fc]">TeleCampaign</span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.2em] text-[#7791ab]">Operations console</span>
            </span>
          </button>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-[#718aa4] hover:bg-[#172739] hover:text-[#dce8f5] lg:hidden" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#58728c]">Workspace</div>
        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${selected ? "bg-[#193a5a] text-[#f1f7fc] shadow-[inset_3px_0_0_#54adf6]" : "text-[#8ca2b7] hover:bg-[#142536] hover:text-[#e2edf7]"}`}
              >
                <Icon className={`h-[17px] w-[17px] ${selected ? "text-[#68baff]" : "text-[#67819b] group-hover:text-[#96b8d5]"}`} strokeWidth={selected ? 2.2 : 1.8} />
                <span>{item.label}</span>
                {item.key === "logs" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e6ae68]" />}
              </button>
            );
          })}
        </nav>

        <div className="mb-3 mt-9 px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#58728c]">Control</div>
        <nav className="space-y-1">
          <button onClick={() => navigate("Settings")} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${activePage === "settings" ? "bg-[#193a5a] text-[#f1f7fc] shadow-[inset_3px_0_0_#54adf6]" : "text-[#8ca2b7] hover:bg-[#142536] hover:text-[#e2edf7]"}`}>
            <Settings2 className={`h-[17px] w-[17px] ${activePage === "settings" ? "text-[#68baff]" : "text-[#67819b]"}`} strokeWidth={1.9} />
            Settings
          </button>
          <button className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-[#8ca2b7] transition hover:bg-[#142536] hover:text-[#e2edf7]">
            <CircleHelp className="h-[17px] w-[17px] text-[#67819b] group-hover:text-[#96b8d5]" strokeWidth={1.9} />
            Help center
            <span className="ml-auto font-mono text-[10px] text-[#506b84]">⌘?</span>
          </button>
        </nav>

        <div className="mt-auto">
          <div className="mb-4 rounded-2xl border border-[#27425b] bg-[#11263a] p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#7390ab]">System status</span>
              <span className="h-2 w-2 rounded-full bg-[#72d39a] shadow-[0_0_0_3px_rgba(114,211,154,.12)]" />
            </div>
            <p className="text-[12px] leading-5 text-[#b9cede]">All services operational</p>
            <p className="mt-1 font-mono text-[10px] text-[#67839d]">Checked 2 min ago</p>
          </div>
          <button className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left hover:border-[#263c52] hover:bg-[#142536]">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d19b62] text-[11px] font-bold text-[#1a2430]">MP</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-[#dfeaf4]">Minh Pham</span>
              <span className="block truncate font-mono text-[10px] text-[#668199]">Community ops</span>
            </span>
            <ChevronDown className="h-4 w-4 text-[#617b94]" />
          </button>
        </div>
      </aside>

      {mobileOpen && <button aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[#06101a]/70 lg:hidden" />}
      <main className="min-h-[100dvh] lg:pl-[258px]">
        <header className="sticky top-0 z-20 border-b border-[#203246] bg-[#0b1420]/90 backdrop-blur-xl">
          <div className="flex min-h-[76px] items-center gap-4 px-5 py-3 sm:px-8 lg:px-10">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#8ba1b5] hover:bg-[#172739] lg:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#64819c]">
                <span>TeleCampaign</span><span className="text-[#38536c]">/</span><span className="text-[#9ab1c6]">{title}</span>
              </div>
              {subtitle && <p className="mt-1 truncate text-[12px] text-[#718aa3]">{subtitle}</p>}
            </div>
            <button className="hidden rounded-lg border border-[#263c52] p-2.5 text-[#7490aa] transition hover:border-[#3d607c] hover:bg-[#142536] hover:text-[#c9deee] sm:block" aria-label="Search">
              <Search className="h-[17px] w-[17px]" />
            </button>
            <button className="relative rounded-lg border border-[#263c52] p-2.5 text-[#7490aa] transition hover:border-[#3d607c] hover:bg-[#142536] hover:text-[#c9deee]" aria-label="Notifications">
              <Bell className="h-[17px] w-[17px]" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#e7ae6a]" />
            </button>
            {headerAction}
          </div>
        </header>
        {banner}
        <div className="px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[#24384d] bg-[#101e2d]/90 shadow-[0_16px_50px_rgba(0,0,0,.12)] ${className}`}>{children}</section>;
}

export function SectionHeader({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#61819f]">{eyebrow}</div>}
        <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-[#e7f0f8]">{title}</h2>
        {detail && <p className="mt-1.5 text-[12px] text-[#7891a8]">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status, label }: { status: "active" | "connected" | "scheduled" | "draft" | "paused" | "failed" | "success" | "warning" | "restricted"; label?: string }) {
  const styles = {
    active: "border-[#285a4c] bg-[#12382f] text-[#80d9ad]",
    connected: "border-[#285a4c] bg-[#12382f] text-[#80d9ad]",
    scheduled: "border-[#2a5276] bg-[#12334f] text-[#75c5ff]",
    draft: "border-[#4d5060] bg-[#252735] text-[#aeb6c6]",
    paused: "border-[#665034] bg-[#342817] text-[#e2b473]",
    failed: "border-[#633d4b] bg-[#351e2a] text-[#f095a2]",
    success: "border-[#285a4c] bg-[#12382f] text-[#80d9ad]",
    warning: "border-[#665034] bg-[#342817] text-[#e2b473]",
    restricted: "border-[#633d4b] bg-[#351e2a] text-[#f095a2]",
  }[status];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] ${styles}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label ?? status}</span>;
}

export function MetricCard({ label, value, change, icon: Icon, tone = "blue" }: { label: string; value: string; change: string; icon: typeof Activity; tone?: "blue" | "warm" | "green" | "red" }) {
  const color = { blue: "#64b7f7", warm: "#e7b16d", green: "#77d29d", red: "#ed8e9c" }[tone];
  return (
    <Panel className="relative overflow-hidden p-5">
      <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full opacity-[0.07]" style={{ backgroundColor: color }} />
      <div className="mb-5 flex items-start justify-between">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-[#718ba5]">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#2a425a] bg-[#14283b]" style={{ color }}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="flex items-end justify-between gap-2"><strong className="text-[29px] font-semibold leading-none tracking-[-0.05em] text-[#eaf3fa]">{value}</strong><span className="mb-0.5 font-mono text-[10px]" style={{ color }}>{change}</span></div>
    </Panel>
  );
}

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className="fixed bottom-5 right-5 z-[70] flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-[#345b76] bg-[#12283b] px-4 py-3 text-[12px] text-[#dcecf8] shadow-[0_16px_40px_rgba(0,0,0,.3)]"><span className="h-2 w-2 rounded-full bg-[#73d49b]" />{message}<button onClick={onDismiss} className="ml-2 text-[#7793ac] hover:text-white" aria-label="Dismiss notification"><X className="h-3.5 w-3.5" /></button></div>;
}

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#06101a]/75 p-4 backdrop-blur-sm"><div className={`max-h-[92dvh] w-full overflow-y-auto rounded-2xl border border-[#345069] bg-[#112131] shadow-[0_24px_80px_rgba(0,0,0,.45)] ${wide ? "max-w-2xl" : "max-w-lg"}`}><div className="flex items-start justify-between border-b border-[#263d53] px-5 py-5 sm:px-6"><div><h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#eef6fc]">{title}</h2>{description && <p className="mt-1.5 max-w-lg text-[12px] leading-5 text-[#8299af]">{description}</p>}</div><button onClick={onClose} className="rounded-lg p-1.5 text-[#718aa4] hover:bg-[#1a3044] hover:text-[#e5f0f8]"><X className="h-4 w-4" /></button></div><div className="p-5 sm:p-6">{children}</div></div></div>;
}

export function Input({ label, value, onChange, placeholder, type = "text" }: { label?: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block">{label && <span className="mb-2 block font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-[#7892a9]">{label}</span>}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-[#2b445b] bg-[#0d1b2a] px-3.5 py-3 text-[13px] text-[#e5f0f8] outline-none placeholder:text-[#526d87] focus:border-[#58aef1] focus:ring-2 focus:ring-[#58aef1]/10" /></label>;
}

export function PrimaryButton({ children, onClick, type = "button", disabled = false }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return <button type={type} disabled={disabled} onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2992ee] px-4 py-2.5 text-[12px] font-semibold text-[#f7fbff] shadow-[0_8px_22px_rgba(41,146,238,.16)] transition hover:bg-[#42a1f3] disabled:cursor-not-allowed disabled:opacity-50">{children}</button>;
}

export function QuietButton({ children, onClick, type = "button" }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit" }) {
  return <button type={type} onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2b445b] bg-[#142638] px-4 py-2.5 text-[12px] font-semibold text-[#bcd0e1] transition hover:border-[#4b6d89] hover:bg-[#1a3044] hover:text-[#e5f1f8]">{children}</button>;
}

export function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof Search; title: string; detail: string; action?: ReactNode }) {
  return <div className="grid min-h-[190px] place-items-center px-6 py-10 text-center"><span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl border border-[#2c455c] bg-[#14283b] text-[#6ea9d2]"><Icon className="h-5 w-5" /></span><h3 className="text-[14px] font-semibold text-[#dceaf5]">{title}</h3><p className="mt-1.5 max-w-sm text-[12px] leading-5 text-[#718ba4]">{detail}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function PageIntro({ kicker, heading, detail, action }: { kicker: string; heading: string; detail: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#67b5f2]"><span className="h-1.5 w-1.5 rounded-full bg-[#e6ae68]" />{kicker}</div><h1 className="text-[30px] font-semibold tracking-[-0.045em] text-[#eff6fb] sm:text-[35px]">{heading}</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#7892a9]">{detail}</p></div>{action}</div>;
}

export const addIcon = Plus;
export const commandIcon = Command;
export const shieldIcon = ShieldCheck;