import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  Bell,
  CircleHelp,
  Command,
  FileText,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  LogOut,
  Network,
  Users,
  UsersRound,
  X,
  Megaphone,
  UserCircle,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export type PageKey =
  | "dashboard"
  | "account"
  | "accounts"
  | "groups"
  | "campaigns"
  | "calendar"
  | "logs"
  | "settings"
  | "templates"
  | "proxy"
  | "upgrade"
  | "admin-overview"
  | "admin-users"
  | "license-keys"
  | "admin-system-settings"
  | "admin-operations";

const navigation: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard; path: string; adminOnly?: boolean }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { key: "account", label: "Account", icon: UserCircle, path: "/dashboard/account" },
  { key: "accounts", label: "Telegram Accounts", icon: UsersRound, path: "/dashboard/telegram-accounts" },
  { key: "groups", label: "Groups", icon: Users, path: "/dashboard/groups" },
  { key: "templates", label: "Message templates", icon: FileText, path: "/dashboard/templates" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, path: "/dashboard/campaigns" },
  { key: "proxy", label: "Proxy", icon: Network, path: "/dashboard/proxy" },
  { key: "logs", label: "Logs", icon: FileText, path: "/dashboard/logs" },
  { key: "admin-overview", label: "Admin center", icon: ShieldCheck, path: "/admin", adminOnly: true },
  { key: "admin-users", label: "User management", icon: UsersRound, path: "/admin/users", adminOnly: true },
  { key: "license-keys", label: "Admin license keys", icon: ShieldCheck, path: "/admin/license-keys", adminOnly: true },
  { key: "admin-system-settings", label: "System settings", icon: Settings2, path: "/admin/system-settings", adminOnly: true },
  { key: "admin-operations", label: "Operations monitoring", icon: Activity, path: "/admin/operations", adminOnly: true },
];

export function AppLayout({
  activePage,
  title,
  subtitle,
  children,
  headerAction,
  banner,
  hideUpgrade = false,
}: {
  activePage: PageKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
  headerAction?: ReactNode;
  banner?: ReactNode;
  hideUpgrade?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const { user, logout } = useAuth();

  function navigate(path: string) {
    setLocation(path);
    setMobileOpen(false);
  }

  async function signOut() {
    await logout();
    setLocation("/login", { replace: true });
  }

  return (
    <div className="min-h-[100dvh] bg-[#f5f1e9] text-[#17343b] font-sans">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col border-r border-[#365960] bg-[#17343b] text-[#d9e3dc] transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-[#365960] px-5 py-6">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-3 text-left">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#ee876c] text-[#17343b] shadow-[0_5px_0_#b85f4e]">
              <MessageCircle className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-[14px] font-extrabold tracking-tight text-[#f5f1e9]">TeleCampaign</span>
              <span className="mt-0.5 block font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#88a39e]">{t('Telegram Manager')}</span>
            </span>
          </button>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-[#9eb5ad] transition-colors hover:bg-[#24474e] lg:hidden" aria-label={t('Close sidebar')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-7">
          <div className="mb-3 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#789690]">{t("Workspace")}</div>
          {navigation.filter((item) => !item.adminOnly || user?.role === "admin").map((item) => {
            const Icon = item.icon;
            const selected = activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-bold transition-all ${
                  selected ? "bg-[#31545a] text-[#fff8ed]" : "text-[#9eb5ad] hover:bg-[#24474e] hover:text-[#f5f1e9]"
                }`}
                data-testid={`nav-${item.key}`}
              >
                <Icon className={`h-[17px] w-[17px] ${selected ? "text-[#ee876c]" : "text-[#789690] group-hover:text-[#ee876c]"}`} strokeWidth={selected ? 2.4 : 1.8} />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#365960] p-5">
          <div className="rounded-2xl border border-[#365960] bg-[#1d4148] p-2.5">
            <div className="flex items-center gap-2 px-2 pb-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#8facaa]">
              {t("Language")}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLanguage("vi")}
                className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-all ${
                  language === "vi" ? "bg-[#f5f1e9] text-[#17343b] shadow-sm" : "text-[#9eb5ad] hover:bg-[#31545a] hover:text-[#f5f1e9]"
                }`}
                data-testid="language-vi"
              >
                VI
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-all ${
                  language === "en" ? "bg-[#f5f1e9] text-[#17343b] shadow-sm" : "text-[#9eb5ad] hover:bg-[#31545a] hover:text-[#f5f1e9]"
                }`}
                data-testid="language-en"
              >
                EN
              </button>
            </div>
          </div>
          <div className="mb-2 mt-5 text-center font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#789690]">TeleCampaign v2.0</div>
        </div>
      </aside>

      {mobileOpen && <button aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[#17343b]/35 backdrop-blur-sm transition-opacity lg:hidden" />}
      
      <main className="flex min-h-[100dvh] flex-col lg:pl-[244px]">
        <header className="sticky top-0 z-20 border-b border-[#ded8cc] bg-[#f5f1e9]/90 backdrop-blur-xl">
          <div className="flex min-h-[74px] items-center justify-between px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#71817d] transition-colors hover:bg-[#e8e0d3] lg:hidden" aria-label={t('Open menu')}>
                <Menu className="h-6 w-6" />
              </button>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#71817d]">
                {t("Workspace")} <span className="mx-2 text-[#c7bdb0]">/</span> <span className="text-[#17343b]">{t(title)}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {headerAction}
              {!hideUpgrade && <button
                onClick={() => setLocation("/upgrade")}
                className="rounded-xl bg-[#e97961] px-4 py-2.5 text-[12px] font-extrabold text-[#17343b] shadow-sm transition-all hover:bg-[#ee876c] active:scale-95"
                data-testid="header-upgrade"
              >
                {t("Upgrade")}
              </button>}
              <button onClick={() => void signOut()} className="rounded-xl p-2.5 text-[#71817d] transition-colors hover:bg-[#e8e0d3] hover:text-[#17343b]" aria-label={t('Sign out')} data-testid="header-logout">
                <LogOut className="h-[22px] w-[22px]" />
              </button>
            </div>
          </div>
        </header>
        
        {banner}
        
        <div className="flex-1 px-5 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto max-w-[1370px]">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[#ded8cc] bg-[#fbf8f2] shadow-[0_8px_24px_rgba(50,64,57,0.04)] ${className}`}>{children}</section>;
}

export function SectionHeader({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#71817d]">{eyebrow}</div>}
        <h2 className="text-[23px] font-extrabold tracking-tight text-[#17343b]">{title}</h2>
        {detail && <p className="mt-1.5 text-[13px] font-medium text-[#71817d]">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status, label }: { status: "active" | "connected" | "scheduled" | "draft" | "paused" | "failed" | "success" | "warning" | "restricted"; label?: string }) {
  const styles = {
    active: "border-[#d1fae5] bg-[#ecfdf5] text-[#059669]",
    connected: "border-[#d1fae5] bg-[#ecfdf5] text-[#059669]",
    scheduled: "border-[#e0e7ff] bg-[#eef2ff] text-[#4f46e5]",
    draft: "border-[#f1f5f9] bg-[#f8fafc] text-[#64748b]",
    paused: "border-[#ffedd5] bg-[#fff7ed] text-[#ea580c]",
    failed: "border-[#ffe4e6] bg-[#fff1f2] text-[#e11d48]",
    success: "border-[#d1fae5] bg-[#ecfdf5] text-[#059669]",
    warning: "border-[#fef08a] bg-[#fffbeb] text-[#d97706]",
    restricted: "border-[#ffe4e6] bg-[#fff1f2] text-[#e11d48]",
  }[status];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${styles}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label ?? status}</span>;
}

export function MetricCard({ label, value, change, icon: Icon, tone = "blue" }: { label: string; value: string; change: string; icon: typeof Activity; tone?: "blue" | "warm" | "green" | "red" }) {
  const color = { blue: "#2563eb", warm: "#ea580c", green: "#059669", red: "#e11d48" }[tone];
  const bg = { blue: "#eff6ff", warm: "#fff7ed", green: "#ecfdf5", red: "#fff1f2" }[tone];
  return (
    <Panel className="relative overflow-hidden p-6">
      <div className="mb-6 flex items-start justify-between">
        <span className="font-extrabold text-[11px] uppercase tracking-wider text-[#64748b]">{label}</span>
        <span className={`grid h-11 w-11 place-items-center rounded-2xl`} style={{ color, backgroundColor: bg }}><Icon className="h-5 w-5" /></span>
      </div>
      <div className="flex items-end justify-between gap-2"><strong className="text-[34px] font-extrabold leading-none tracking-tight text-[#0f172a]">{value}</strong><span className="mb-1.5 font-bold text-[13px]" style={{ color }}>{change}</span></div>
    </Panel>
  );
}

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className="fixed bottom-6 right-6 z-[70] flex max-w-[calc(100vw-3rem)] items-center gap-3 rounded-xl bg-[#17343b] px-5 py-4 text-[13px] font-bold text-[#f5f1e9] shadow-xl"><span className="h-2.5 w-2.5 rounded-full bg-[#86c89b]" />{message}<button onClick={onDismiss} className="ml-3 text-[#9eb5ad] transition-colors hover:text-[#f5f1e9]" aria-label="Dismiss"><X className="h-4 w-4" /></button></div>;
}

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17343b]/35 p-4 backdrop-blur-sm"><div className={`max-h-[92dvh] w-full overflow-y-auto rounded-2xl border border-[#ded8cc] bg-[#fbf8f2] shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}><div className="flex items-start justify-between border-b border-[#e6dfd4] px-6 py-6 sm:px-8"><div><h2 className="text-[19px] font-extrabold text-[#17343b]">{title}</h2>{description && <p className="mt-2 max-w-lg text-[13px] font-medium leading-relaxed text-[#71817d]">{description}</p>}</div><button onClick={onClose} className="rounded-xl p-2 text-[#71817d] transition-colors hover:bg-[#e9dfd2] hover:text-[#17343b]"><X className="h-5 w-5" /></button></div><div className="p-6 sm:p-8">{children}</div></div></div>;
}

export function Input({ label, value, onChange, placeholder, type = "text", min, max, step }: { label?: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; min?: number; max?: number; step?: number }) {
  return <label className="block">{label && <span className="mb-2.5 block text-[13px] font-bold text-[#4d625e]">{label}</span>}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={min} max={max} step={step} className="w-full rounded-xl border border-[#d9d1c4] bg-[#f5f1e9] px-4 py-3.5 text-[14px] font-semibold text-[#17343b] outline-none transition-all placeholder:text-[#9ba6a0] focus:border-[#d36e59] focus:ring-4 focus:ring-[#d36e59]/10" /></label>;
}

export function PrimaryButton({ children, onClick, type = "button", disabled = false }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return <button type={type} disabled={disabled} onClick={onClick} className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#e97961] px-5 py-3 text-[13px] font-extrabold text-[#17343b] shadow-sm transition-all hover:bg-[#ee876c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">{children}</button>;
}

export function QuietButton({ children, onClick, type = "button" }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit" }) {
  return <button type={type} onClick={onClick} className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#d9d1c4] bg-transparent px-5 py-3 text-[13px] font-extrabold text-[#71817d] transition-all hover:border-[#c9bfb1] hover:bg-[#e9dfd2] hover:text-[#17343b] active:scale-[0.98]">{children}</button>;
}

export function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof Search; title: string; detail: string; action?: ReactNode }) {
  return <div className="grid min-h-[220px] place-items-center px-6 py-12 text-center"><span className="mb-5 grid h-16 w-16 place-items-center rounded-3xl border border-[#ded8cc] bg-[#e9dfd2] text-[#d36e59]"><Icon className="h-7 w-7" /></span><h3 className="text-[17px] font-extrabold tracking-tight text-[#17343b]">{title}</h3><p className="mt-2.5 max-w-sm text-[14px] font-medium leading-relaxed text-[#71817d]">{detail}</p>{action && <div className="mt-6">{action}</div>}</div>;
}

export function PageIntro({ kicker, heading, detail, action }: { kicker: string; heading: string; detail: string; action?: ReactNode }) {
  return <div className="mb-10 flex flex-col gap-5 border-b border-[#d9d1c4] pb-9 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-3.5 flex items-center gap-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.19em] text-[#d36e59]"><span className="h-1.5 w-1.5 rounded-full bg-[#ee876c]" />{kicker}</div><h1 className="text-[36px] font-extrabold tracking-[-0.05em] text-[#17343b] sm:text-[50px]">{heading}</h1><p className="mt-3.5 max-w-2xl text-[14px] font-medium leading-relaxed text-[#71817d]">{detail}</p></div>{action}</div>;
}

export const addIcon = Plus;
export const commandIcon = Command;
export const shieldIcon = ShieldCheck;
