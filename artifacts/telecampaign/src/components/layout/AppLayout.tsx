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
    <div className="min-h-[100dvh] bg-[#f4f7fb] text-[#0f172a] font-sans">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-[#eef2f6] bg-white transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 py-5 border-b border-[#eef2f6]">
          <button onClick={() => navigate("/dashboard")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <img src="/icon.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
            <span className="min-w-0 whitespace-nowrap text-[17px] font-bold tracking-[-0.02em] text-[#1a2b88] lg:hidden">Campaign Manager</span>
            <span className="hidden lg:block">
              <span className="block text-[15px] font-extrabold text-[#0f172a] tracking-tight">Telegram Campaign Manager</span>
            </span>
          </button>
          <button onClick={() => setMobileOpen(false)} className="shrink-0 rounded-lg p-2 text-[#64748b] hover:bg-[#f1f5f9] lg:hidden transition-colors" aria-label={t('Close sidebar')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
          {navigation.filter((item) => !item.adminOnly || user?.role === "admin").map((item) => {
            const Icon = item.icon;
            const selected = activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                className={`group flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left text-[14px] font-bold transition-all ${
                  selected ? "bg-[#eef2fa] text-[#1a2b88]" : "text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]"
                }`}
                data-testid={`nav-${item.key}`}
              >
                <Icon className={`h-[18px] w-[18px] ${selected ? "text-[#1a2b88]" : "text-[#64748b] group-hover:text-[#1a2b88]"}`} strokeWidth={selected ? 2.5 : 2} />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-[#eef2f6]">
          <div className="border border-[#eef2f6] rounded-2xl p-2.5 bg-[#f8fafc]">
            <div className="flex items-center gap-2 px-2 pb-2.5 text-[11px] font-extrabold text-[#64748b] uppercase tracking-wider">
              {t("Language")}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLanguage("vi")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-extrabold transition-all ${
                  language === "vi" ? "bg-white text-[#0f172a] shadow-sm border border-[#e2e8f0]" : "text-[#64748b] hover:text-[#0f172a] hover:bg-[#e2e8f0]/50"
                }`}
                data-testid="language-vi"
              >
                VI
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-extrabold transition-all ${
                  language === "en" ? "bg-white text-[#0f172a] shadow-sm border border-[#e2e8f0]" : "text-[#64748b] hover:text-[#0f172a] hover:bg-[#e2e8f0]/50"
                }`}
                data-testid="language-en"
              >
                EN
              </button>
            </div>
          </div>
          <div className="mt-5 mb-2 text-center text-[11px] font-bold text-[#94a3b8]">Telegram Campaign Manager v2.0</div>
        </div>
      </aside>

      {mobileOpen && <button aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[#0f172a]/20 backdrop-blur-sm lg:hidden transition-opacity" />}
      
      <main className="min-h-[100dvh] lg:pl-[280px] flex flex-col">
        <header className="sticky top-0 z-20 border-b border-[#eef2f6] bg-white/95 backdrop-blur-xl">
          <div className="flex min-h-[72px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#475569] hover:bg-[#f1f5f9] lg:hidden transition-colors" aria-label={t('Open menu')}>
                <Menu className="h-6 w-6" />
              </button>
              <h1 className="text-[19px] font-extrabold text-[#0f172a] hidden sm:block tracking-tight">{t(title)}</h1>
              <h1 className="text-[19px] font-extrabold text-[#0f172a] sm:hidden tracking-tight">{t(title)}</h1>
            </div>
            
            <div className="flex items-center gap-4">
              {headerAction}
              {!hideUpgrade && <button
                onClick={() => setLocation("/upgrade")}
                className="bg-[#1a2b88] hover:bg-[#152473] text-white text-[13px] font-extrabold px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95"
                data-testid="header-upgrade"
              >
                {t("Upgrade")}
              </button>}
              <button onClick={() => void signOut()} className="rounded-xl p-2.5 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors" aria-label={t('Sign out')} data-testid="header-logout">
                <LogOut className="h-[22px] w-[22px]" />
              </button>
            </div>
          </div>
        </header>
        
        {banner}
        
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1440px]">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-[#eef2f6] bg-white shadow-sm ${className}`}>{children}</section>;
}

export function SectionHeader({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#64748b]">{eyebrow}</div>}
        <h2 className="text-[19px] font-extrabold tracking-tight text-[#0f172a]">{title}</h2>
        {detail && <p className="mt-1.5 text-[14px] font-medium text-[#475569]">{detail}</p>}
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
  return <div className="fixed bottom-6 right-6 z-[70] flex max-w-[calc(100vw-3rem)] items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white px-5 py-4 text-[14px] font-bold text-[#0f172a] shadow-xl"><span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />{message}<button onClick={onDismiss} className="ml-3 text-[#64748b] hover:text-[#0f172a] transition-colors" aria-label="Dismiss"><X className="h-4 w-4" /></button></div>;
}

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#0f172a]/30 p-4 backdrop-blur-sm"><div className={`max-h-[92dvh] w-full overflow-y-auto rounded-3xl border border-[#eef2f6] bg-white shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}><div className="flex items-start justify-between border-b border-[#eef2f6] px-6 py-6 sm:px-8"><div><h2 className="text-[19px] font-extrabold text-[#0f172a]">{title}</h2>{description && <p className="mt-2 max-w-lg text-[14px] font-medium text-[#64748b] leading-relaxed">{description}</p>}</div><button onClick={onClose} className="rounded-xl p-2 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors"><X className="h-5 w-5" /></button></div><div className="p-6 sm:p-8">{children}</div></div></div>;
}

export function Input({ label, value, onChange, placeholder, type = "text", min, max, step }: { label?: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; min?: number; max?: number; step?: number }) {
  return <label className="block">{label && <span className="mb-2.5 block text-[13px] font-bold text-[#475569]">{label}</span>}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={min} max={max} step={step} className="w-full rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3.5 text-[15px] font-semibold text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10 transition-all" /></label>;
}

export function PrimaryButton({ children, onClick, type = "button", disabled = false }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return <button type={type} disabled={disabled} onClick={onClick} className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[#1a2b88] px-5 py-3 text-[14px] font-extrabold text-white shadow-sm transition-all hover:bg-[#152473] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">{children}</button>;
}

export function QuietButton({ children, onClick, type = "button" }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit" }) {
  return <button type={type} onClick={onClick} className="inline-flex items-center justify-center gap-2.5 rounded-2xl border border-[#cbd5e1] bg-white px-5 py-3 text-[14px] font-extrabold text-[#475569] transition-all hover:border-[#94a3b8] hover:bg-[#f8fafc] hover:text-[#0f172a] active:scale-[0.98]">{children}</button>;
}

export function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof Search; title: string; detail: string; action?: ReactNode }) {
  return <div className="grid min-h-[220px] place-items-center px-6 py-12 text-center"><span className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-[#f8fafc] text-[#64748b] shadow-sm border border-[#eef2f6]"><Icon className="h-7 w-7" /></span><h3 className="text-[17px] font-extrabold text-[#0f172a] tracking-tight">{title}</h3><p className="mt-2.5 max-w-sm text-[14px] font-medium text-[#64748b] leading-relaxed">{detail}</p>{action && <div className="mt-6">{action}</div>}</div>;
}

export function PageIntro({ kicker, heading, detail, action }: { kicker: string; heading: string; detail: string; action?: ReactNode }) {
  return <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-3.5 flex items-center gap-2.5 text-[12px] font-extrabold uppercase tracking-wider text-[#1a2b88]"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" />{kicker}</div><h1 className="text-[36px] font-extrabold tracking-tight text-[#0f172a] sm:text-[44px]">{heading}</h1><p className="mt-3.5 max-w-2xl text-[16px] font-medium text-[#475569] leading-relaxed">{detail}</p></div>{action}</div>;
}

export const addIcon = Plus;
export const commandIcon = Command;
export const shieldIcon = ShieldCheck;
