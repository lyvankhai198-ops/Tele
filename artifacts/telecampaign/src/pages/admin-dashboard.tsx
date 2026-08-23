import { useGetAdminOverview } from "@workspace/api-client-react";
import { useLanguage } from "@/lib/i18n";
import {
  AppLayout,
  Panel,
  SectionHeader,
  MetricCard,
} from "@/components/layout/AppLayout";
import {
  Users,
  UserPlus,
  ShieldCheck,
  CreditCard,
  Ticket,
  Key,
  XCircle,
  Network,
  Link2,
  PlayCircle,
  Clock,
  AlertTriangle,
    Activity,
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
    pageTitle: "Tổng quan Hệ thống",
    eyebrow: "Trung tâm Quản trị",
    pageDetail: "Các chỉ số trực tiếp và tình trạng hệ thống của toàn bộ không gian làm việc.",
    loadError: "Không thể tải dữ liệu tổng quan",
    loadErrorDetail: "Kiểm tra quyền truy cập hoặc thử lại sau.",
    usersSection: "Người dùng",
    usersTotal: "Tổng số",
    usersNew: "Mới (30 ngày)",
    usersAdmins: "Quản trị viên",
    subscriptionsSection: "Trạng thái Gói dịch vụ",
    subsUnlimited: "Unlimited",
    subsPro: "Pro",
    subsPlus: "Plus",
    subsExpired: "Hết hạn",
    licensesSection: "Mã bản quyền",
    licAvailable: "Khả dụng",
    licClaimed: "Đã kích hoạt",
    licRevoked: "Đã thu hồi",
    platformSection: "Lưu lượng Nền tảng",
    tgTotal: "Danh tính Telegram",
    tgConnected: "Đang kết nối",
    campTotal: "Tổng số Chiến dịch",
    campQueued: "Đang chờ chạy",
    campFailed: "Chiến dịch lỗi",
  }
} as const;

export default function AdminDashboardPage() {
  const { language } = useLanguage();
  const text = copy[language];

  const { data: overview, isLoading, error } = useGetAdminOverview();

  if (error) {
    return (
      <AppLayout activePage="admin-overview" title={text.pageTitle}>
        <Panel className="p-8 text-center text-[#e11d48]">
          <Activity className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <h2 className="mb-2 text-lg font-bold">{text.loadError}</h2>
          <p className="text-sm font-medium opacity-80">
            {text.loadErrorDetail}
          </p>
        </Panel>
      </AppLayout>
    );
  }

  return (
    <AppLayout activePage="admin-overview" title={text.pageTitle}>
      <SectionHeader
        eyebrow={text.eyebrow}
        title={text.pageTitle}
        detail={text.pageDetail}
      />

      {isLoading || !overview ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#eef2f6] border-t-[#1a2b88]" />
        </div>
      ) : (
        <div className="space-y-10">
          <section>
            <h3 className="mb-4 text-[14px] font-extrabold uppercase tracking-wider text-[#64748b]">
              {text.usersSection}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label={text.usersTotal}
                value={overview.usersTotal.toString()}
                change=""
                icon={Users}
                tone="blue"
              />
              <MetricCard
                label={text.usersNew}
                value={overview.usersNewLast30Days.toString()}
                change=""
                icon={UserPlus}
                tone="green"
              />
              <MetricCard
                label={text.usersAdmins}
                value={overview.usersAdmins.toString()}
                change=""
                icon={ShieldCheck}
                tone="warm"
              />
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-[14px] font-extrabold uppercase tracking-wider text-[#64748b]">
              {text.subscriptionsSection}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label={text.subsUnlimited}
                value={overview.subscriptions.unlimited.toString()}
                change=""
                icon={CreditCard}
                tone="blue"
              />
              <MetricCard
                label={text.subsPro}
                value={overview.subscriptions.pro.toString()}
                change=""
                icon={CreditCard}
                tone="blue"
              />
              <MetricCard
                label={text.subsPlus}
                value={overview.subscriptions.plus.toString()}
                change=""
                icon={CreditCard}
                tone="blue"
              />
              <MetricCard
                label={text.subsExpired}
                value={overview.subscriptions.expired.toString()}
                change=""
                icon={XCircle}
                tone="red"
              />
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-[14px] font-extrabold uppercase tracking-wider text-[#64748b]">
              {text.licensesSection}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label={text.licAvailable}
                value={overview.licenses.available.toString()}
                change=""
                icon={Key}
                tone="green"
              />
              <MetricCard
                label={text.licClaimed}
                value={overview.licenses.claimed.toString()}
                change=""
                icon={Ticket}
                tone="blue"
              />
              <MetricCard
                label={text.licRevoked}
                value={overview.licenses.revoked.toString()}
                change=""
                icon={XCircle}
                tone="red"
              />
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-[14px] font-extrabold uppercase tracking-wider text-[#64748b]">
              {text.platformSection}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label={text.tgTotal}
                value={overview.telegramAccountsTotal.toString()}
                change=""
                icon={Network}
                tone="blue"
              />
              <MetricCard
                label={text.tgConnected}
                value={overview.telegramAccountsConnected.toString()}
                change=""
                icon={Link2}
                tone="green"
              />
              <MetricCard
                label={text.campTotal}
                value={overview.campaignsTotal.toString()}
                change=""
                icon={PlayCircle}
                tone="blue"
              />
              <MetricCard
                label={text.campQueued}
                value={overview.campaignsQueued.toString()}
                change=""
                icon={Clock}
                tone="warm"
              />
              <MetricCard
                label={text.campFailed}
                value={overview.campaignsFailed.toString()}
                change=""
                icon={AlertTriangle}
                tone="red"
              />
            </div>
          </section>
        </div>
      )}
    </AppLayout>
  );
}
