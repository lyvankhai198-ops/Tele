import { useLocation } from "wouter";
import {
  AppLayout,
  SectionHeader,
} from "@/components/layout/AppLayout";
import {
  Activity,
  Bell,
  ChevronRight,
  KeyRound,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const copy = {
  en: {
    pageTitle: "System Overview",
    eyebrow: "Admin Center",
    pageDetail: "Live metrics and system health indicators for the entire workspace.",
    loadError: "Could not load overview data",
    loadErrorDetail: "Check your access rights or try again later.",
    usersSection: "User Base",
    usersTotal: "Total Users",
    usersNew: "New (30d)",
    usersAdmins: "Administrators",
    subscriptionsSection: "Subscription Status",
    subsUnlimited: "Unlimited",
    subsPro: "Pro",
    subsPlus: "Plus",
    subsExpired: "Expired",
    licensesSection: "License Keys",
    licAvailable: "Available",
    licClaimed: "Claimed",
    licRevoked: "Revoked",
    platformSection: "Platform Volume",
    tgTotal: "Telegram Identities",
    tgConnected: "Actively Connected",
    campTotal: "Lifetime Campaigns",
    campQueued: "Currently Queued",
    campFailed: "Failed Campaigns",
  },
  vi: {
    pageTitle: "Quản trị",
    eyebrow: "Khu vực quản trị",
    pageDetail: "Chọn một chức năng để quản lý và theo dõi toàn bộ hệ thống.",
    notifications: "Thông báo quản trị",
    notificationsDetail: "Tạo và quản lý thông báo hiển thị trên dashboard người dùng.",
    users: "Quản lý người dùng",
    usersDetail: "Xem tài khoản, vai trò, giới hạn và gói dịch vụ.",
    keys: "Quản trị key",
    keysDetail: "Tạo, theo dõi và thu hồi key kích hoạt gói dịch vụ.",
    settings: "Cài đặt hệ thống",
    settingsDetail: "Thiết lập giới hạn, gửi tin và quyền truy cập toàn hệ thống.",
    operations: "Giám sát vận hành",
    operationsDetail: "Theo dõi Telegram, campaign, queue và dung lượng VPS.",
    activeGroups: "Kho nhóm đang chạy",
    activeGroupsDetail: "Tập trung các nhóm đang được campaign active sử dụng và delay đã cài.",
  }
} as const;

export default function AdminDashboardPage() {
  const [, navigate] = useLocation();
  const text = copy.vi;
  const cards = [
    { path: "/admin/notifications", title: text.notifications, detail: text.notificationsDetail, icon: Bell, tone: "blue" },
    { path: "/admin/users", title: text.users, detail: text.usersDetail, icon: UsersRound, tone: "green" },
    { path: "/admin/license-keys", title: text.keys, detail: text.keysDetail, icon: KeyRound, tone: "warm" },
    { path: "/admin/system-settings", title: text.settings, detail: text.settingsDetail, icon: Settings2, tone: "purple" },
    { path: "/admin/operations", title: text.operations, detail: text.operationsDetail, icon: Activity, tone: "red" },
    { path: "/admin/active-groups", title: text.activeGroups, detail: text.activeGroupsDetail, icon: UsersRound, tone: "blue" },
  ] as const;

  return (
    <AppLayout activePage="admin" title={text.pageTitle}>
      <SectionHeader
        eyebrow={text.eyebrow}
        title={text.pageTitle}
        detail={text.pageDetail}
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {cards.map(({ path, title, detail, icon: Icon, tone }) => {
          const styles = {
            blue: { icon: "#2563eb", bg: "#eff6ff", hover: "hover:border-[#93c5fd]" },
            green: { icon: "#059669", bg: "#ecfdf5", hover: "hover:border-[#86efac]" },
            warm: { icon: "#ea580c", bg: "#fff7ed", hover: "hover:border-[#fdba74]" },
            purple: { icon: "#7c3aed", bg: "#f5f3ff", hover: "hover:border-[#c4b5fd]" },
            red: { icon: "#e11d48", bg: "#fff1f2", hover: "hover:border-[#fda4af]" },
          }[tone];
          return (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={`group flex min-h-[148px] items-center gap-5 rounded-3xl border border-[#eef2f6] bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${styles.hover}`}
              data-testid={`admin-card-${path.split("/").pop()}`}
            >
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ color: styles.icon, backgroundColor: styles.bg }}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-[17px] font-extrabold tracking-tight text-[#0f172a]">{title}</strong>
                <span className="mt-2 block text-[13px] font-medium leading-relaxed text-[#64748b]">{detail}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#94a3b8] transition-transform group-hover:translate-x-1 group-hover:text-[#1a2b88]" />
            </button>
          );
        })}
      </div>
    </AppLayout>
  );
}
