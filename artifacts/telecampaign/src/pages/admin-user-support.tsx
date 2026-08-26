import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { vi as viLocale, enUS } from "date-fns/locale";
import {
  AppLayout,
  Panel,
  SectionHeader,
  StatusBadge,
  EmptyState,
} from "@/components/layout/AppLayout";
import {
  useGetAdminUserSupport,
  useGetAdminUserSupportCampaignTargets,
  getGetAdminUserSupportQueryKey,
  getGetAdminUserSupportCampaignTargetsQueryKey,
  type AdminUserSupportCampaign,
} from "@workspace/api-client-react";
import { useLanguage } from "@/lib/i18n";
import {
  ArrowLeft,
  ShieldAlert,
  Server,
  Megaphone,
  AlertOctagon,
  Activity,
  CheckCircle2,
  Clock,
  Smartphone,
  Send,
  AlertTriangle,
  History,
  Target,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
} from "lucide-react";

const copy = {
  en: {
    back: "Back to Directory",
    eyebrow: "Support Workspace",
    pageDetail: "Live snapshot of user operations and configuration.",
    loadError: "Could not load support data",
    loadErrorDetail: "The user might not exist or you lack permission.",
    overview: "Overview",
    statCampaigns: "Campaigns (Active / Total)",
    statErrors: "Campaigns w/ Errors",
    statAccounts: "Telegram Accounts (Connected / Total)",
    statDeliveries: "Failed / Review Deliveries",
    sectionAccounts: "Telegram Accounts",
    sectionCampaigns: "Recent Campaigns",
    sectionErrors: "Recent Delivery Errors",
    sectionActivity: "Activity Log",
    emptyAccounts: "No Telegram accounts found.",
    emptyCampaigns: "No campaigns found.",
    emptyErrors: "No recent delivery errors.",
    emptyActivity: "No activity logged.",
    plan: "Plan",
    joined: "Joined",
    lastActive: "Last Active",
    destinations: "Destinations",
    statusConnected: "Connected",
    statusDisconnected: "Disconnected",
    statusDraft: "Draft",
    statusQueued: "Queued",
    statusPaused: "Paused",
    cooldown: "Cooldown",
    targets: "Targets",
    sent: "Sent",
    failed: "Failed",
    viewDetails: "View message & groups",
    hideDetails: "Hide details",
    message: "Message",
    forwardSource: "Forwarded saved message",
    source: "Source",
    groups: "Groups & delivery status",
    openTelegram: "Open Telegram",
    privateGroup: "Private group",
    attempts: "Attempts",
    nextRetry: "Next retry",
    sentAt: "Sent at",
    targetsLoading: "Loading destinations…",
    targetsLoadError: "Could not load campaign destinations.",
    targetPage: "Showing {start}–{end} of {total} targets",
    previousTargets: "Previous",
    nextTargets: "Next",
    recentCampaignsOnly: "Showing the 50 most recently updated campaigns.",
  },
  vi: {
    back: "Quay lại danh sách",
    eyebrow: "Không gian Hỗ trợ",
    pageDetail: "Ảnh chụp trực tiếp hoạt động và cấu hình của người dùng.",
    loadError: "Không thể tải dữ liệu hỗ trợ",
    loadErrorDetail: "Người dùng không tồn tại hoặc bạn không có quyền.",
    overview: "Tổng quan",
    statCampaigns: "Chiến dịch (Đang chạy / Tổng)",
    statErrors: "Chiến dịch có lỗi",
    statAccounts: "Tài khoản Telegram (Đã kết nối / Tổng)",
    statDeliveries: "Gửi lỗi / Cần xem xét",
    sectionAccounts: "Tài khoản Telegram",
    sectionCampaigns: "Chiến dịch gần đây",
    sectionErrors: "Lỗi gửi gần đây",
    sectionActivity: "Nhật ký hoạt động",
    emptyAccounts: "Không có tài khoản Telegram.",
    emptyCampaigns: "Không có chiến dịch.",
    emptyErrors: "Không có lỗi gửi gần đây.",
    emptyActivity: "Không có hoạt động.",
    plan: "Gói dịch vụ",
    joined: "Tham gia",
    lastActive: "Hoạt động cuối",
    destinations: "Điểm đến",
    statusConnected: "Đã kết nối",
    statusDisconnected: "Ngắt kết nối",
    statusDraft: "Nháp",
    statusQueued: "Chờ gửi",
    statusPaused: "Tạm dừng",
    cooldown: "Chờ phục hồi",
    targets: "Mục tiêu",
    sent: "Đã gửi",
    failed: "Lỗi",
    viewDetails: "Xem tin nhắn & nhóm",
    hideDetails: "Ẩn chi tiết",
    message: "Tin nhắn",
    forwardSource: "Chuyển tiếp tin nhắn đã lưu",
    source: "Nguồn",
    groups: "Nhóm & trạng thái gửi",
    openTelegram: "Mở Telegram",
    privateGroup: "Nhóm riêng tư",
    attempts: "Số lần thử",
    nextRetry: "Lần thử tiếp",
    sentAt: "Đã gửi lúc",
    targetsLoading: "Đang tải điểm đến…",
    targetsLoadError: "Không thể tải điểm đến của chiến dịch.",
    targetPage: "Hiển thị {start}–{end} / {total} target",
    previousTargets: "Trước",
    nextTargets: "Tiếp",
    recentCampaignsOnly: "Đang hiển thị 50 chiến dịch được cập nhật gần nhất.",
  },
} as const;

function formatDate(dateStr: string, language: string, showTime = true): string {
  try {
    const locale = language === "vi" ? viLocale : enUS;
    const fStr = showTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";
    return format(new Date(dateStr), fStr, { locale });
  } catch {
    return dateStr;
  }
}

type SupportCopy = (typeof copy)[keyof typeof copy];

function CampaignDetails({
  campaign,
  userId,
  language,
  text,
}: {
  campaign: AdminUserSupportCampaign;
  userId: string;
  language: string;
  text: SupportCopy;
}) {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error } = useGetAdminUserSupportCampaignTargets(
    { userId, campaignId: campaign.id, limit: 100, offset },
    {
      query: {
        enabled: Boolean(userId && campaign.id),
        queryKey: getGetAdminUserSupportCampaignTargetsQueryKey({ userId, campaignId: campaign.id, limit: 100, offset }),
        staleTime: 10000,
      },
    },
  );

  const pageStart = data && data.targets.length > 0 ? offset + 1 : 0;
  const pageEnd = data ? offset + data.targets.length : 0;
  const pageLabel = text.targetPage
    .replace("{start}", String(pageStart))
    .replace("{end}", String(pageEnd))
    .replace("{total}", String(data?.totalTargets ?? 0));

  return (
    <div className="mt-4 min-w-0 space-y-4 border-t border-[#e2e8f0] pt-4">
      <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#1e40af]">
          <FileText className="h-3.5 w-3.5" />
          {campaign.templateMode === "forward" ? text.forwardSource : text.message}
        </div>
        {campaign.templateMode === "forward" ? (
          <p className="text-[12px] font-semibold leading-relaxed text-[#1e3a8a]" data-testid={`text-forward-source-${campaign.id}`}>
            {text.source}: {campaign.templateSourceAccountName ?? "—"}{campaign.templateSourceMessageId ? ` · #${campaign.templateSourceMessageId}` : ""}
          </p>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[12px] font-medium leading-relaxed text-[#1e3a8a]" data-testid={`text-campaign-message-${campaign.id}`}>
            {campaign.content || "—"}
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-wider text-[#475569]">{text.groups}</p>
          <span className="text-[10px] font-bold text-[#64748b]">{campaign.destinationCount} {text.destinations.toLowerCase()}</span>
        </div>
        {isLoading ? (
          <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4 text-[12px] font-semibold text-[#64748b]">{text.targetsLoading}</div>
        ) : error ? (
          <div className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] p-4 text-[12px] font-semibold text-[#be123c]">{text.targetsLoadError}</div>
        ) : (
          <>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {data?.targets.map((target) => (
                <div key={target.id} className="min-w-0 rounded-xl border border-[#e2e8f0] bg-white p-3" data-testid={`card-campaign-target-${target.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[12px] font-extrabold text-[#0f172a]">{target.destinationTitle}</p>
                        {target.destinationLink ? (
                          <a
                            href={target.destinationLink}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`link-telegram-group-${target.id}`}
                            className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#1a2b88] hover:underline"
                          >
                            {text.openTelegram}<ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[10px] font-semibold text-[#64748b]">{text.privateGroup}</span>
                        )}
                      </div>
                      {target.destinationUsername && <p className="mt-0.5 text-[10px] font-semibold text-[#64748b]">@{target.destinationUsername}</p>}
                    </div>
                    <StatusBadge status={target.status as any} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-[#64748b]">
                    <span>{text.attempts}: {target.attempts}</span>
                    {target.nextAttemptAt && <span>{text.nextRetry}: {formatDate(target.nextAttemptAt, language)}</span>}
                    {target.sentAt && <span>{text.sentAt}: {formatDate(target.sentAt, language)}</span>}
                  </div>
                  {target.lastError && <p className="mt-2 break-words rounded-lg bg-[#fff1f2] px-2 py-1.5 text-[11px] font-medium leading-relaxed text-[#be123c]">{target.lastError}</p>}
                </div>
              ))}
            </div>
            {data && data.totalTargets > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-[#64748b]">
                <span>{pageLabel}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOffset((current) => Math.max(0, current - 100))}
                    disabled={offset === 0}
                    className="rounded-md border border-[#cbd5e1] bg-white px-2 py-1 font-bold text-[#475569] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.previousTargets}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOffset((current) => current + 100)}
                    disabled={!data.hasMore}
                    className="rounded-md border border-[#cbd5e1] bg-white px-2 py-1 font-bold text-[#1a2b88] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.nextTargets}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminUserSupportPage({ userId }: { userId: string }) {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();
  const text = copy[language];
  const [expandedCampaignIds, setExpandedCampaignIds] = useState<Set<string>>(() => new Set());

  const { data, isLoading, error } = useGetAdminUserSupport(userId, {
    query: {
      enabled: !!userId,
      queryKey: getGetAdminUserSupportQueryKey(userId),
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
    },
  });

  if (error) {
    return (
      <AppLayout activePage="admin-users" title="User Support">
        <div className="mb-4">
          <button
            onClick={() => setLocation("/admin/users")}
            className="inline-flex items-center gap-2 text-[13px] font-bold text-[#64748b] hover:text-[#0f172a] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {text.back}
          </button>
        </div>
        <Panel className="p-8 text-center text-[#e11d48]">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <h2 className="mb-2 text-lg font-bold">{text.loadError}</h2>
          <p className="text-sm font-medium opacity-80">{text.loadErrorDetail}</p>
        </Panel>
      </AppLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <AppLayout activePage="admin-users" title="User Support">
        <div className="flex h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#eef2f6] border-t-[#0f766e]" />
        </div>
      </AppLayout>
    );
  }

  const { user, overview, telegramAccounts, campaigns, recentErrors, activity } = data;
  const accountNameById = new Map(telegramAccounts.map((account) => [account.id, account.name]));
  const campaignNameById = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const toggleCampaignDetails = (campaignId: string) => {
    setExpandedCampaignIds((current) => {
      const next = new Set(current);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      return next;
    });
  };

  return (
    <AppLayout
      activePage="admin-users"
      title={`@${user.username}`}
      subtitle={text.eyebrow}
    >
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button
            onClick={() => setLocation("/admin/users")}
            className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-widest text-[#64748b] hover:text-[#0f766e] transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {text.back}
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-black tracking-tight text-[#0f172a]">
              @{user.username}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center rounded-md bg-[#eef2fa] px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-[#1a2b88]">
                {user.role}
              </span>
              <span className="inline-flex items-center rounded-md bg-[#f0fdf4] px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-[#166534]">
                {user.storedPlan}
              </span>
            </div>
          </div>
          <p className="mt-1.5 text-[14px] font-medium text-[#475569]">
            {text.pageDetail}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-1 text-[12px] font-medium text-[#475569]">
          <div>
            <span className="font-bold">{text.joined}:</span>{" "}
            {formatDate(user.joinedAt, language, false)}
          </div>
          <div>
            <span className="font-bold">{text.lastActive}:</span>{" "}
            {user.lastActiveAt ? formatDate(user.lastActiveAt, language) : "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Panel className="p-5 border-l-4 border-l-[#0f766e]">
          <div className="flex items-start justify-between mb-4">
            <span className="text-[12px] font-black uppercase tracking-wider text-[#64748b]">
              {text.statAccounts}
            </span>
            <Server className="h-4 w-4 text-[#0f766e]" />
          </div>
          <div className="text-[32px] font-black text-[#0f172a] leading-none">
            {overview.telegramAccountsConnected}{" "}
            <span className="text-[18px] text-[#94a3b8]">/ {overview.telegramAccountsTotal}</span>
          </div>
        </Panel>

        <Panel className="p-5 border-l-4 border-l-[#2563eb]">
          <div className="flex items-start justify-between mb-4">
            <span className="text-[12px] font-black uppercase tracking-wider text-[#64748b]">
              {text.statCampaigns}
            </span>
            <Megaphone className="h-4 w-4 text-[#2563eb]" />
          </div>
          <div className="text-[32px] font-black text-[#0f172a] leading-none">
            {overview.activeCampaigns}{" "}
            <span className="text-[18px] text-[#94a3b8]">/ {overview.totalCampaigns}</span>
          </div>
        </Panel>

        <Panel className="p-5 border-l-4 border-l-[#ea580c]">
          <div className="flex items-start justify-between mb-4">
            <span className="text-[12px] font-black uppercase tracking-wider text-[#64748b]">
              {text.statDeliveries}
            </span>
            <Target className="h-4 w-4 text-[#ea580c]" />
          </div>
          <div className="text-[32px] font-black text-[#0f172a] leading-none">
            {overview.failedDeliveries}{" "}
            <span className="text-[18px] text-[#94a3b8]">/ {overview.reviewDeliveries}</span>
          </div>
        </Panel>

        <Panel className="p-5 border-l-4 border-l-[#e11d48]">
          <div className="flex items-start justify-between mb-4">
            <span className="text-[12px] font-black uppercase tracking-wider text-[#64748b]">
              {text.statErrors}
            </span>
            <AlertOctagon className="h-4 w-4 text-[#e11d48]" />
          </div>
          <div className="text-[32px] font-black text-[#e11d48] leading-none">
            {overview.campaignsWithErrors}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="flex flex-col gap-4">
          <h3 className="text-[16px] font-extrabold text-[#0f172a] flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-[#64748b]" />
            {text.sectionAccounts}
          </h3>
          <Panel className="overflow-hidden">
            {telegramAccounts.length === 0 ? (
              <EmptyState icon={Server} title={text.emptyAccounts} detail="" />
            ) : (
              <div className="divide-y divide-[#eef2f6]">
                {telegramAccounts.map((account) => (
                  <div key={account.id} className="p-4 hover:bg-[#f8fafc]/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${account.status === "connected" ? "bg-[#10b981]" : "bg-[#ef4444]"}`} />
                        <span className="font-extrabold text-[14px] text-[#0f172a]">{account.name}</span>
                        {account.username && (
                          <span className="text-[12px] font-medium text-[#64748b]">@{account.username}</span>
                        )}
                      </div>
                      <StatusBadge
                        status={account.status === "connected" ? "connected" : "failed"}
                        label={account.status === "connected" ? text.statusConnected : text.statusDisconnected}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-[12px] font-medium text-[#475569] mt-3">
                      <div>
                        <span className="font-bold text-[#64748b]">{text.destinations}:</span>{" "}
                        <span className="text-[#0f172a] font-extrabold">{account.destinationCount}</span>
                      </div>
                      <div>
                        <span className="font-bold text-[#64748b]">{text.statCampaigns.split(" ")[0]}:</span>{" "}
                        <span className="text-[#0f172a] font-extrabold">{account.campaignCount}</span>
                      </div>
                      {account.cooldownUntil && (
                        <div className="col-span-2 flex items-center gap-1.5 text-[#ea580c] bg-[#fff7ed] px-2 py-1 rounded-md w-fit font-bold">
                          <Clock className="h-3 w-3" />
                          {text.cooldown}: {formatDate(account.cooldownUntil, language)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-[16px] font-extrabold text-[#0f172a] flex items-center gap-2">
            <Send className="h-4 w-4 text-[#64748b]" />
            {text.sectionCampaigns}
          </h3>
          <Panel className="overflow-hidden">
            {campaigns.length === 0 ? (
              <EmptyState icon={Megaphone} title={text.emptyCampaigns} detail="" />
            ) : (
              <div className="divide-y divide-[#eef2f6] max-h-[500px] overflow-y-auto">
                {campaigns.map((camp) => {
                  const isExpanded = expandedCampaignIds.has(camp.id);
                  return (
                  <div key={camp.id} className="p-4 hover:bg-[#f8fafc]/50 transition-colors">
                    <div className="flex items-start justify-between mb-2 gap-4">
                      <div>
                        <div className="font-extrabold text-[14px] text-[#0f172a]">{camp.name}</div>
                        <div className="text-[12px] font-medium text-[#64748b] mt-0.5">
                          {camp.telegramAccountName ? `via ${camp.telegramAccountName}` : "No account"}
                        </div>
                      </div>
                      <StatusBadge status={camp.status as any} />
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-[11px] mt-4 font-black uppercase tracking-wider">
                      <div className="bg-[#f8fafc] rounded-lg py-2 border border-[#eef2f6]">
                        <div className="text-[#64748b]">{text.targets}</div>
                        <div className="text-[14px] text-[#0f172a] mt-0.5">{camp.destinationCount}</div>
                      </div>
                      <div className="bg-[#ecfdf5] rounded-lg py-2 border border-[#d1fae5]">
                        <div className="text-[#059669]">{text.sent}</div>
                        <div className="text-[14px] text-[#047857] mt-0.5">{camp.sentCount}</div>
                      </div>
                      <div className="bg-[#fff1f2] rounded-lg py-2 border border-[#ffe4e6]">
                        <div className="text-[#e11d48]">{text.failed}</div>
                        <div className="text-[14px] text-[#be123c] mt-0.5">{camp.failedCount}</div>
                      </div>
                      <div className="bg-[#fff7ed] rounded-lg py-2 border border-[#ffedd5]">
                        <div className="text-[#ea580c]">Review</div>
                        <div className="text-[14px] text-[#c2410c] mt-0.5">{camp.reviewCount}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCampaignDetails(camp.id)}
                      data-testid={`button-campaign-details-${camp.id}`}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#cbd5e1] bg-white px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[#1a2b88] transition hover:border-[#1a2b88] hover:bg-[#eef2fa]"
                    >
                      {isExpanded ? text.hideDetails : text.viewDetails}
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {isExpanded && (
                      <CampaignDetails campaign={camp} userId={userId} language={language} text={text} />
                    )}
                  </div>
                  );
                })}
              </div>
            )}
            {data.campaignsTruncated && (
              <p className="border-t border-[#eef2f6] px-4 py-3 text-[10px] font-semibold text-[#b45309]">
                {text.recentCampaignsOnly}
              </p>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
          <h3 className="text-[16px] font-extrabold text-[#0f172a] flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#e11d48]" />
            {text.sectionErrors}
          </h3>
          <Panel className="overflow-hidden">
            {recentErrors.length === 0 ? (
              <EmptyState icon={CheckCircle2} title={text.emptyErrors} detail="" />
            ) : (
              <div className="divide-y divide-[#eef2f6] max-h-[400px] overflow-y-auto">
                {recentErrors.map((err) => (
                  <div key={err.id} className="p-4 hover:bg-[#fff1f2]/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-extrabold text-[13px] text-[#0f172a]">
                          {err.destinationTitle}
                        </div>
                        <div className="text-[11px] font-bold text-[#64748b] mt-0.5 uppercase tracking-wide">
                          {err.campaignName}
                        </div>
                      </div>
                      <div className="text-[11px] font-black text-[#e11d48] bg-[#fff1f2] px-2 py-0.5 rounded uppercase">
                        {err.status}
                      </div>
                    </div>
                    <div className="mt-2 text-[12px] font-medium text-[#475569] bg-[#f8fafc] p-2 rounded-md border border-[#eef2f6]">
                      {err.lastError || "Unknown error"}
                    </div>
                    <div className="mt-2 text-[11px] font-bold text-[#94a3b8] flex justify-between">
                      <span>Attempts: {err.attempts}</span>
                      <span>{formatDate(err.updatedAt, language)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-[16px] font-extrabold text-[#0f172a] flex items-center gap-2">
            <History className="h-4 w-4 text-[#64748b]" />
            {text.sectionActivity}
          </h3>
          <Panel className="overflow-hidden">
            {activity.length === 0 ? (
              <EmptyState icon={Activity} title={text.emptyActivity} detail="" />
            ) : (
              <div className="divide-y divide-[#eef2f6] max-h-[400px] overflow-y-auto">
                {activity.map((act) => (
                  <div key={act.id} className="p-4 hover:bg-[#f8fafc]/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${act.level === 'error' ? 'bg-[#e11d48]' : act.level === 'warning' ? 'bg-[#ea580c]' : 'bg-[#10b981]'}`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-extrabold text-[12px] text-[#0f172a]">{act.event}</span>
                          <span className="text-[11px] font-medium text-[#64748b]">{formatDate(act.createdAt, language)}</span>
                        </div>
                        <p className="text-[13px] font-medium text-[#475569] leading-relaxed">
                          {act.message}
                        </p>
                        {(act.accountId || act.campaignId) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {act.accountId && (
                              <span className="inline-flex items-center bg-[#f1f5f9] px-2 py-0.5 rounded text-[10px] font-bold text-[#475569]">
                                ACC: {accountNameById.get(act.accountId) ?? "—"}
                              </span>
                            )}
                            {act.campaignId && (
                              <span className="inline-flex items-center bg-[#f1f5f9] px-2 py-0.5 rounded text-[10px] font-bold text-[#475569]">
                                CAMP: {campaignNameById.get(act.campaignId) ?? "—"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AppLayout>
  );
}
