import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  Bell,
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
  LifeBuoy,
  Lightbulb,
  Star,
  ChevronRight,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { getListAdminSystemEventsQueryKey, useGetGroupLibraryAccess, useGetSystemDefaults, useListAdminSystemEvents } from "@workspace/api-client-react";
import { UserNotificationBell } from "@/components/UserNotificationBell";

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
  | "group-library"
  | "upgrade"
  | "admin"
  | "admin-overview"
  | "admin-notifications"
  | "admin-users"
  | "license-keys"
  | "admin-revenue"
  | "admin-system-settings"
  | "admin-operations"
  | "admin-tools"
  | "admin-popups"
  | "admin-active-groups"
  | "admin-system-events"
  | "admin-support-chat"
  | "feedback"
  | "support";

const navigation: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard; path: string; adminOnly?: boolean; groupLibraryOnly?: boolean }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { key: "account", label: "Account", icon: UserCircle, path: "/dashboard/account" },
  { key: "settings", label: "Settings", icon: Settings2, path: "/dashboard/settings" },
  { key: "accounts", label: "Telegram Accounts", icon: UsersRound, path: "/dashboard/telegram-accounts" },
  { key: "groups", label: "Groups", icon: Users, path: "/dashboard/groups" },
  { key: "templates", label: "Message templates", icon: FileText, path: "/dashboard/templates" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, path: "/dashboard/campaigns" },
  { key: "proxy", label: "Proxy", icon: Network, path: "/dashboard/proxy" },
  { key: "group-library", label: "Group library", icon: Users, path: "/group-library", groupLibraryOnly: true },
  { key: "logs", label: "Logs", icon: FileText, path: "/dashboard/logs" },
  { key: "admin", label: "Quản trị", icon: ShieldCheck, path: "/admin", adminOnly: true },
  { key: "admin-tools", label: "Công cụ quản trị", icon: Settings2, path: "/admin/tools", adminOnly: true },
  { key: "admin-popups", label: "Announcement popups", icon: Megaphone, path: "/admin/popups", adminOnly: true },
  { key: "admin-support-chat", label: "Hỗ trợ khách hàng", icon: LifeBuoy, path: "/admin/support-chat", adminOnly: true },
  { key: "feedback", label: "Feedback & discussion", icon: Lightbulb, path: "/dashboard/feedback" },
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
  const [adminGroupOpen, setAdminGroupOpen] = useState<Record<string, boolean>>({});
  const [location, setLocation] = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const { user, logout, exitSupport } = useAuth();
  const isSupportMode = Boolean(user?.support);
  const groupLibraryAccess = useGetGroupLibraryAccess();
  const systemDefaults = useGetSystemDefaults();
  const isAdminSection = location === "/admin" || location.startsWith("/admin/")
    || (user?.role === "admin" && activePage === "feedback");
  const systemEvents = useListAdminSystemEvents(
    { range: "all", limit: 1 },
    {
      query: {
        queryKey: getListAdminSystemEventsQueryKey({ range: "all", limit: 1 }),
        enabled: isAdminSection && user?.role === "admin" && !isSupportMode,
        staleTime: 30_000,
      },
    },
  );
  const nationalDayDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const nationalDayMonth = Number(nationalDayDate.find((part) => part.type === "month")?.value);
  const nationalDayDay = Number(nationalDayDate.find((part) => part.type === "day")?.value);
  const showNationalDayRibbon = systemDefaults.data?.nationalDayThemeEnabled === true
    && ((nationalDayMonth === 8 && nationalDayDay >= 25) || (nationalDayMonth === 9 && nationalDayDay <= 3));
  const nationalDayThemeActive = showNationalDayRibbon;
  const showAdminMenu = user?.role === "admin" && !isSupportMode;
  useEffect(() => {
    setAdminGroupOpen({});
  }, [location]);
  const visibleNavigation = navigation.filter((item) => (
    (!item.adminOnly || showAdminMenu)
    && (!item.groupLibraryOnly || groupLibraryAccess.data?.visible)
    && (item.key !== "feedback" || !isSupportMode)
  ));
  const dedicatedAdminPage = navigation.some((item) => item.adminOnly && item.key !== "admin" && item.key === activePage);
  const adminGroups = [
    {
      id: "users-keys",
      title: language === "vi" ? "Người dùng & Key" : "Users & keys",
      icon: UsersRound,
      entries: [
        { key: "admin-users" as PageKey, label: language === "vi" ? "Người dùng" : "Users", path: "/admin/users" },
        { key: "license-keys" as PageKey, label: language === "vi" ? "License key & gia hạn" : "License keys & renewals", path: "/admin/license-keys" },
      ],
    },
    {
      id: "orders-revenue",
      title: language === "vi" ? "Đơn hàng & Doanh thu" : "Orders & revenue",
      icon: Activity,
      entries: [
        { key: "admin-revenue" as PageKey, label: language === "vi" ? "Doanh thu & định giá key" : "Revenue & key valuation", path: "/admin/revenue" },
        { key: "admin" as PageKey, label: language === "vi" ? "Đơn mua & thanh toán" : "Purchase orders & payments", path: "/admin/purchase-orders" },
      ],
    },
    {
      id: "notifications-care",
      title: language === "vi" ? "Thông báo & Chăm sóc" : "Notifications & care",
      icon: LifeBuoy,
      entries: [
        { key: "admin-notifications" as PageKey, label: language === "vi" ? "Thông báo người dùng" : "User notifications", path: "/admin/notifications" },
        { key: "admin-popups" as PageKey, label: language === "vi" ? "Popup thông báo" : "Announcement popups", path: "/admin/popups" },
        { key: "admin-support-chat" as PageKey, label: language === "vi" ? "Hỗ trợ chat" : "Support chat", path: "/admin/support-chat" },
        { key: "feedback" as PageKey, label: language === "vi" ? "Góp ý & thảo luận" : "Feedback & discussion", path: "/dashboard/feedback" },
      ],
    },
    {
      id: "system",
      title: language === "vi" ? "Hệ thống" : "System",
      icon: Settings2,
      entries: [
        { key: "admin-system-settings" as PageKey, label: language === "vi" ? "Cài đặt hệ thống" : "System settings", path: "/admin/system-settings" },
        { key: "admin-active-groups" as PageKey, label: language === "vi" ? "Nhóm đang hoạt động" : "Active groups", path: "/admin/active-groups" },
        { key: "admin-system-events" as PageKey, label: language === "vi" ? "Sự kiện hệ thống" : "System events", path: "/admin/system-events" },
        { key: "admin-tools" as PageKey, label: language === "vi" ? "Công cụ nâng cao & báo cáo" : "Advanced tools & reports", path: "/admin/tools" },
        { key: "admin-operations" as PageKey, label: language === "vi" ? "Giám sát vận hành" : "Operations monitor", path: "/admin/operations" },
      ],
    },
  ];

  function renderNavigation(items: typeof navigation, highlighted = false) {
    return items.map((item) => {
      const Icon = item.icon;
      const selected = item.key === "admin"
        ? !dedicatedAdminPage && (activePage === "admin" || activePage.startsWith("admin") || activePage === "license-keys")
        : activePage === item.key;
      return (
        <button
          key={item.key}
          onClick={() => {
            if (item.key === "feedback" && window.location.pathname !== "/dashboard/feedback") {
              try { sessionStorage.setItem("telecamp-feedback-source", JSON.stringify({ path: window.location.pathname, at: Date.now() })); } catch { /* Storage is optional. */ }
            }
            navigate(item.path);
          }}
          aria-current={selected ? "page" : undefined}
          className={`group flex w-full items-center text-left text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
            highlighted
              ? `gap-3 rounded-xl border px-3 py-2.5 ${selected
                ? "border-indigo-700 bg-indigo-700 text-white shadow-md shadow-indigo-200/60"
                : "border-indigo-100 bg-white/90 text-indigo-950 shadow-sm hover:border-indigo-300 hover:bg-indigo-50"}`
              : `gap-3.5 rounded-xl px-4 py-3.5 ${selected
                ? (nationalDayThemeActive ? "national-day-nav-selected" : "bg-[#eef2fa] text-[#1a2b88]")
                : (nationalDayThemeActive ? "national-day-nav-item" : "text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]")}`
          }`}
          data-testid={`nav-${item.key}`}
        >
          <span className={highlighted ? `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-white/15 text-white" : "bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200"}` : "shrink-0"}>
            <Icon className={`h-[18px] w-[18px] ${highlighted ? "" : selected ? (nationalDayThemeActive ? "national-day-nav-icon-selected" : "text-[#1a2b88]") : (nationalDayThemeActive ? "national-day-nav-icon" : "text-[#64748b] group-hover:text-[#1a2b88]")}`} strokeWidth={selected ? 2.5 : 2} />
          </span>
          <span className="min-w-0 flex-1">{t(item.label)}</span>
          {highlighted && <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 ${selected ? "text-indigo-200" : "text-indigo-400"}`} />}
        </button>
      );
    });
  }

  function navigate(path: string) {
    setLocation(path);
    setMobileOpen(false);
  }

  async function signOut() {
    if (isSupportMode) {
      await exitSupport();
      setLocation("/admin/users", { replace: true });
      return;
    }
    await logout();
    setLocation("/login", { replace: true });
  }

  return (
    <div className={`min-h-[100dvh] bg-[#f4f7fb] text-[#0f172a] font-sans ${nationalDayThemeActive ? "national-day-shell national-day-grain" : ""}`}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-[#eef2f6] bg-white transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${nationalDayThemeActive ? "national-day-sidebar" : ""}`}
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
          {renderNavigation(visibleNavigation.filter((item) => !showAdminMenu || (!item.adminOnly && item.key !== "feedback")))}
          {showAdminMenu && (
            <section className="!mt-5 space-y-2 rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-slate-50 p-2.5 shadow-sm" data-testid="admin-navigation">
              <div className="flex items-center gap-2 px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-indigo-700">
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                {language === "vi" ? "Khu vực quản trị" : "Admin workspace"}
              </div>
              <button type="button" onClick={() => navigate("/admin")}
                aria-current={location === "/admin" ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#197a91] ${
                  location === "/admin" ? "bg-[#e5f0f2] text-[#145b6c]" : "text-[#3e626f] hover:bg-white"
                }`}
                data-testid="nav-admin-overview">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                {language === "vi" ? "Tổng quan quản trị" : "Admin overview"}
              </button>
              {adminGroups.map((group) => {
                const GroupIcon = group.icon;
                const hasCurrentEntry = group.entries.some((entry) => location === entry.path || (entry.key !== "admin" && activePage === entry.key));
                const isOpen = adminGroupOpen[group.id] ?? hasCurrentEntry;
                const panelId = `admin-nav-items-${group.id}`;
                return (
                  <div key={group.id} className="border-t border-[#dce6e9] pt-1">
                    <button
                      type="button"
                      id={`toggle-admin-group-${group.id}`}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setAdminGroupOpen((current) => ({ ...current, [group.id]: !isOpen }))}
                      className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#607580] outline-none hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[#197a91]"
                      data-testid={`toggle-admin-group-${group.id}`}
                    >
                      <GroupIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      <span className="min-w-0 flex-1">{group.title}</span>
                      <ChevronRight aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    <div id={panelId} role="group" aria-labelledby={`toggle-admin-group-${group.id}`} hidden={!isOpen} className="space-y-1 pb-1 pl-1 pt-1">
                      {group.entries.map((entry) => {
                        const selected = location === entry.path || (entry.key !== "admin" && activePage === entry.key);
                        return (
                          <button key={entry.path} type="button" onClick={() => navigate(entry.path)}
                            aria-current={selected ? "page" : undefined}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#197a91] ${
                              selected ? "bg-[#e5f0f2] text-[#145b6c]" : "text-[#4e6470] hover:bg-white hover:text-[#17394e]"
                            }`}
                            data-testid={`nav-admin-${entry.key}`}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${selected ? "bg-[#167b91]" : "bg-[#a8bbc3]"}`} />
                            <span className="min-w-0 flex-1">{entry.label}</span>
                            {selected && <span className="h-1.5 w-1.5 rounded-full bg-[#167b91]" aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>

        <div className="p-4 border-t border-[#eef2f6]">
          <div className={`border border-[#eef2f6] rounded-2xl p-2.5 bg-[#f8fafc] ${nationalDayThemeActive ? "national-day-language" : ""}`}>
            <div className="flex items-center gap-2 px-2 pb-2.5 text-[11px] font-extrabold text-[#64748b] uppercase tracking-wider">
              NGÔN NGỮ / LANGUAGE
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLanguage("vi")}
                aria-pressed={language === "vi"}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-extrabold transition-all ${
                  language === "vi" ? "bg-white text-[#0f172a] shadow-sm border border-[#e2e8f0]" : "text-[#64748b] hover:text-[#0f172a] hover:bg-[#e2e8f0]/50"
                }`}
                data-testid="language-vi"
              >
                VI
              </button>
              <button
                onClick={() => setLanguage("en")}
                aria-pressed={language === "en"}
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
      
      <main className={`min-h-[100dvh] lg:pl-[280px] flex flex-col ${nationalDayThemeActive ? "national-day-main" : ""}`}>
        <header className={`sticky top-0 z-20 border-b border-[#eef2f6] bg-white/95 backdrop-blur-xl ${nationalDayThemeActive ? "national-day-header" : ""}`}>
          <div className="flex min-h-[72px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#475569] hover:bg-[#f1f5f9] lg:hidden transition-colors" aria-label={t('Open menu')}>
                <Menu className="h-6 w-6" />
              </button>
                <h1 aria-label={t(title)} title={t(title)} className="text-[19px] font-extrabold text-[#0f172a] hidden sm:block tracking-tight">{t(title)}</h1>
               <h1 aria-label={t(title)} title={t(title)} className={`text-[19px] font-extrabold text-[#0f172a] sm:hidden tracking-tight ${isAdminSection ? "min-w-0 max-w-[190px] break-words leading-tight line-clamp-2" : ""}`}>{t(title)}</h1>
            </div>
            
             <div className="flex items-center gap-3 sm:gap-4">
              {headerAction}
                <UserNotificationBell />
               {isAdminSection && user?.role === "admin" && !isSupportMode && (
                 <button
                   type="button"
                   onClick={() => setLocation("/admin/system-events")}
                   className={`relative grid h-10 w-10 place-items-center rounded-xl border transition-colors ${
                     location === "/admin/system-events"
                       ? "border-[#b8d9d5] bg-[#e8f1f0] text-[#075e68]"
                       : "border-[#dfe7ea] bg-[#fcfdfd] text-[#61727b] hover:border-[#b8d9d5] hover:bg-[#f4faf9] hover:text-[#075e68]"
                   }`}
                   aria-label={t("Open system event history")}
                   title={t("System events")}
                   data-testid="admin-system-events-bell"
                 >
                   <Bell className="h-[19px] w-[19px]" strokeWidth={2.2} />
                   {(systemEvents.data?.unreadCount ?? 0) > 0 && (
                     <span className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-[#c65b4d] px-1 text-[9px] font-extrabold leading-none text-white" aria-label={`${systemEvents.data?.unreadCount ?? 0} unread system events`}>
                       {(systemEvents.data?.unreadCount ?? 0) > 99 ? "99+" : systemEvents.data?.unreadCount}
                     </span>
                   )}
                 </button>
               )}
              {!hideUpgrade && !isSupportMode && <button
                onClick={() => setLocation("/upgrade")}
                 className={`bg-[#1a2b88] hover:bg-[#152473] text-white text-[13px] font-extrabold px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 ${nationalDayThemeActive ? "national-day-upgrade" : ""}`}
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

        {showNationalDayRibbon && (
          <section className="national-day-hero" data-testid="national-day-ribbon" aria-label={language === "vi" ? "Chế độ Quốc khánh" : "National Day mode"}>
            <div className="national-day-hero-orbit national-day-hero-orbit-one" />
            <div className="national-day-hero-orbit national-day-hero-orbit-two" />
            <span className="national-day-hero-particle national-day-hero-particle-one" aria-hidden="true" />
            <span className="national-day-hero-particle national-day-hero-particle-two" aria-hidden="true" />
            <div className="relative mx-auto flex max-w-[1440px] items-center gap-4 px-5 py-4 sm:px-8 lg:px-10">
              <span className="national-day-hero-mark"><Star className="h-6 w-6 fill-current" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="national-day-eyebrow">
                  {language === "vi" ? "Quốc khánh Việt Nam · 02.09" : "Vietnam National Day · 02.09"}
                </p>
                <h2 className="mt-1 text-[15px] font-bold tracking-[-.01em] sm:text-[17px]">
                  {language === "vi" ? "Một ngày trọng đại, một nhịp gửi thông điệp." : "A day of meaning, a steady rhythm of sending."}
                </h2>
                <p className="mt-1 text-[11px] font-medium text-[#f9e9ba]">
                  {language === "vi" ? "Đang ở chế độ vận hành lễ — các giới hạn an toàn vẫn được giữ nguyên." : "Ceremonial operations mode is active — safety limits remain unchanged."}
                </p>
              </div>
              <div className="national-day-hero-status">
                <ShieldCheck className="h-4 w-4" />
                <span>{language === "vi" ? "ĐÃ XÁC MINH" : "VERIFIED MODE"}</span>
              </div>
            </div>
          </section>
        )}
        
        {isSupportMode && user?.support && (
          <section
            className="border-b border-[#f2c98b] bg-[#fff8e8] px-4 py-3 text-[#7a4b08] sm:px-6 lg:px-8"
            role="status"
            data-testid="support-mode-banner"
          >
            <div className="mx-auto flex max-w-[1440px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-[#b7791f]" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">
                    {language === "vi" ? "Đang hỗ trợ tài khoản" : "Supporting account"} @{user.support.targetUsername}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-[#956c2c]">
                    {language === "vi"
                      ? "Có thể chỉnh sửa campaign và đồng bộ nhóm; các thao tác chạy, dừng, xóa và quản trị vẫn bị khóa."
                      : "Campaigns can be edited and groups synced; run, pause, delete, and admin actions remain locked."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#e3b96f] bg-white px-3.5 py-2 text-xs font-extrabold text-[#7a4b08] transition hover:bg-[#fff1cc]"
                data-testid="exit-support"
              >
                <LogOut className="h-3.5 w-3.5" />
                {language === "vi" ? "Kết thúc hỗ trợ" : "End support"}
              </button>
            </div>
          </section>
        )}
        {banner}
        
        <div className={`flex-1 p-4 sm:p-6 lg:p-8 ${nationalDayThemeActive ? "national-day-content" : ""}`}>
          <div className="mx-auto max-w-[1440px]">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function Panel({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-3xl border border-[#eef2f6] bg-white shadow-sm ${className}`}>{children}</section>;
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

export function Input({ label, value, onChange, placeholder, type = "text", inputMode, autoComplete, min, max, step }: { label?: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"; autoComplete?: string; min?: number; max?: number; step?: number }) {
  return <label className="block">{label && <span className="mb-2.5 block text-[13px] font-bold text-[#475569]">{label}</span>}<input type={type} inputMode={inputMode} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={min} max={max} step={step} className="w-full rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3.5 text-[15px] font-semibold text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10 transition-all" /></label>;
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
