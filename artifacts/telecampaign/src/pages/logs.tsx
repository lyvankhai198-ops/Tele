import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Info,
  Megaphone,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  XCircle,
} from "lucide-react";
import { useListActivity } from "@workspace/api-client-react";
import type { ActivityLog } from "@workspace/api-client-react";
import { AppLayout, PageIntro, Panel, QuietButton, SectionHeader } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";

type FilterTab = "all" | "success" | "warning" | "error" | "review";

const eventLabels: Record<string, { vi: string; en: string }> = {
  "campaign.target.sent": { vi: "Đã gửi tin nhắn", en: "Message delivered" },
  "campaign.target.failed": { vi: "Chưa xác nhận được lượt gửi", en: "Delivery needs attention" },
  "campaign.target.rate_limited": { vi: "Telegram yêu cầu chờ", en: "Telegram requested a delay" },
  "campaign.paused.subscription_expired": { vi: "Chiến dịch đã tạm dừng", en: "Campaign paused" },
  "campaign.created": { vi: "Đã tạo chiến dịch", en: "Campaign created" },
  "campaign.updated": { vi: "Đã cập nhật chiến dịch", en: "Campaign updated" },
  "campaign.deleted": { vi: "Đã xóa chiến dịch", en: "Campaign deleted" },
  "campaign.status.updated": { vi: "Đã đổi trạng thái chiến dịch", en: "Campaign status updated" },
  "account.connected": { vi: "Đã xác minh tài khoản Telegram", en: "Telegram account verified" },
  "destinations.synced": { vi: "Đã đồng bộ nhóm và kênh", en: "Groups and channels synced" },
  "template.created": { vi: "Đã tạo mẫu tin nhắn", en: "Message template created" },
  "template.updated": { vi: "Đã cập nhật mẫu tin nhắn", en: "Message template updated" },
  "template.deleted": { vi: "Đã xóa mẫu tin nhắn", en: "Message template deleted" },
  "proxy.created": { vi: "Đã tạo proxy", en: "Proxy created" },
  "proxy.updated": { vi: "Đã cập nhật proxy", en: "Proxy updated" },
  "proxy.deleted": { vi: "Đã xóa proxy", en: "Proxy deleted" },
  "proxy.attached": { vi: "Đã gắn proxy", en: "Proxy attached" },
  "proxy.detached": { vi: "Đã gỡ proxy", en: "Proxy detached" },
};

function formatDate(value: string, language: "vi" | "en") {
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function logStatus(log: ActivityLog, language: "vi" | "en") {
  if (log.level === "error") {
    return {
      label: language === "vi" ? "Thất bại" : "Failed",
      icon: XCircle,
      badge: "border-[#fecdd3] bg-[#fff1f2] text-[#e11d48]",
      iconBox: "bg-[#fff1f2] text-[#e11d48]",
    };
  }
  if (log.level === "warning") {
    return {
      label: language === "vi" ? "Cảnh báo" : "Warning",
      icon: AlertTriangle,
      badge: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
      iconBox: "bg-[#fffbeb] text-[#d97706]",
    };
  }
  if (log.level === "success") {
    return {
      label: language === "vi" ? "Thành công" : "Success",
      icon: CheckCircle2,
      badge: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
      iconBox: "bg-[#f0fdf4] text-[#16a34a]",
    };
  }
  return {
    label: language === "vi" ? "Thông tin" : "Info",
    icon: Info,
    badge: "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]",
    iconBox: "bg-[#eff6ff] text-[#2563eb]",
  };
}

function targetStatusLabel(status: string, language: "vi" | "en") {
  const labels: Record<string, { vi: string; en: string }> = {
    pending: { vi: "Đang chờ", en: "Pending" },
    sending: { vi: "Đang gửi", en: "Sending" },
    sent: { vi: "Đã gửi", en: "Sent" },
    failed: { vi: "Thất bại", en: "Failed" },
    requires_review: { vi: "Cần xem xét", en: "Needs review" },
    cancelled: { vi: "Đã hủy", en: "Cancelled" },
  };
  return labels[status]?.[language] ?? status;
}

function userMessage(log: ActivityLog, language: "vi" | "en") {
  if (language === "en") return log.message;

  if (log.event === "campaign.target.failed") {
    return log.destinationTitle
      ? `Không thể xác nhận việc gửi đến “${log.destinationTitle}”. Hãy kiểm tra chi tiết để tránh gửi trùng.`
      : "Không thể xác nhận việc gửi. Hãy kiểm tra chi tiết để tránh gửi trùng.";
  }
  if (log.event === "campaign.target.rate_limited") {
    return "Telegram đang giới hạn tần suất gửi. Lượt gửi đã được hoãn và sẽ xử lý lại theo thời gian hiển thị.";
  }
  if (log.event === "campaign.paused.subscription_expired") {
    return "Chiến dịch được tạm dừng vì gói dùng thử hoặc gói dịch vụ đã hết hạn.";
  }
  if (log.event === "campaign.target.sent" && log.destinationTitle) {
    return `Đã gửi tin nhắn đến “${log.destinationTitle}”.`;
  }
  return log.message;
}

function metadataText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export default function Logs() {
  const { t, language } = useLanguage();
  const activity = useListActivity({ limit: 100 });
  const [tab, setTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const logs = activity.data ?? [];
  const counts = {
    success: logs.filter((log) => log.level === "success").length,
    warning: logs.filter((log) => log.level === "warning").length,
    error: logs.filter((log) => log.level === "error").length,
    review: logs.filter((log) => log.targetStatus === "requires_review" || log.event.includes("review")).length,
  };
  const tabs: Array<{ id: FilterTab; label: string; count: number }> = [
    { id: "all", label: t("All activity"), count: logs.length },
    { id: "success", label: t("Success"), count: counts.success },
    { id: "warning", label: t("Warnings"), count: counts.warning },
    { id: "error", label: t("Failures"), count: counts.error },
    { id: "review", label: t("Needs review"), count: counts.review },
  ];
  const filtered = useMemo(() => logs.filter((log) => {
    const matchesTab =
      tab === "all" ||
      (tab === "success" && log.level === "success") ||
      (tab === "warning" && log.level === "warning") ||
      (tab === "error" && log.level === "error") ||
      (tab === "review" && (log.targetStatus === "requires_review" || log.event.includes("review")));
    const searchable = [
      log.event,
      log.message,
      userMessage(log, language),
      log.campaignName,
      log.accountName,
      log.destinationTitle,
      log.destinationUsername,
      log.targetLastError,
      ...Object.values(log.metadata ?? {}).map(metadataText),
    ].filter(Boolean).join(" ").toLowerCase();
    return matchesTab && searchable.includes(query.trim().toLowerCase());
  }), [logs, tab, query, language]);

  return (
    <AppLayout
      activePage="logs"
      title={t("Activity log")}
      subtitle={t("Understand what happened and why")}
      headerAction={<QuietButton onClick={() => void activity.refetch()}><RefreshCw className={`h-4 w-4 ${activity.isFetching ? "animate-spin" : ""}`} />{t("Refresh")}</QuietButton>}
    >
      <PageIntro kicker={t("Traceability")} heading={t("Activity log")} detail={t("Clear records of deliveries, warnings, and account actions. Open any record to see its context and technical details.")} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LogMetric icon={CheckCircle2} value={counts.success} label={t("Successful actions")} tone="green" />
        <LogMetric icon={AlertTriangle} value={counts.warning} label={t("Warnings")} tone="amber" />
        <LogMetric icon={XCircle} value={counts.error} label={t("Failures")} tone="red" />
        <LogMetric icon={ShieldAlert} value={counts.review} label={t("Needs review")} tone="orange" />
      </div>

      <Panel className="overflow-hidden">
        <div className="border-b border-[#eef2f6] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader eyebrow={t("Audit trail")} title={t("Recent activity")} detail={t("Latest first · workspace timezone")} />
            <div className="relative w-full lg:w-[320px]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search activity")} aria-label={t("Search activity")} className="w-full rounded-xl border border-[#dbe4ee] bg-[#f8fafc] py-3 pl-10 pr-3 text-[13px] font-medium text-[#0f172a] outline-none transition focus:border-[#5b6ee1] focus:bg-white" />
            </div>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-bold transition ${tab === item.id ? "border-[#263c9d] bg-[#263c9d] text-white" : "border-[#dbe4ee] bg-white text-[#475569] hover:border-[#aab7c8]"}`}>
                {item.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === item.id ? "bg-white/20" : "bg-[#f1f5f9] text-[#64748b]"}`}>{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        {activity.isError ? (
          <div className="p-10 text-center text-[13px] font-medium text-[#be123c]">{t("Could not load activity. Refresh and try again.")}</div>
        ) : (
          <div className="divide-y divide-[#eef2f6]">
            {filtered.map((log) => {
              const status = logStatus(log, language);
              const Icon = status.icon;
              const isExpanded = expandedId === log.id;
              const needsReview = log.targetStatus === "requires_review" || log.event.includes("review");
              const title = eventLabels[log.event]?.[language] ?? log.event.replace(/[._]/g, " ");
              const metadata = Object.entries(log.metadata ?? {});
              const context = [
                log.campaignName && { icon: Megaphone, label: t("Campaign"), value: log.campaignName },
                log.accountName && { icon: UserRound, label: t("Account"), value: log.accountName },
                log.destinationTitle && { icon: CircleAlert, label: t("Destination"), value: log.destinationTitle },
              ].filter(Boolean) as Array<{ icon: typeof Megaphone; label: string; value: string }>;

              return (
                <article key={log.id} className="bg-white">
                  <button type="button" onClick={() => setExpandedId(isExpanded ? null : log.id)} aria-expanded={isExpanded} className="w-full px-5 py-4 text-left transition hover:bg-[#f8fafc] sm:px-6">
                    <div className="flex items-start gap-3.5">
                      <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${status.iconBox}`}><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-extrabold text-[#0f172a]">{title}</p>
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${status.badge}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status.label}</span>
                          {needsReview && <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fed7aa] bg-[#fff7ed] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#c2410c]"><ShieldAlert className="h-3 w-3" />{t("Needs review")}</span>}
                        </div>
                        <p className="mt-1.5 text-[13px] leading-5 text-[#475569]">{userMessage(log, language)}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold text-[#64748b]">
                          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatDate(log.createdAt, language)}</span>
                          {context.map((item) => {
                            const ContextIcon = item.icon;
                            return <span key={item.label} className="inline-flex max-w-full items-center gap-1.5 truncate"><ContextIcon className="h-3.5 w-3.5 shrink-0 text-[#5064ce]" />{item.value}</span>;
                          })}
                        </div>
                      </div>
                      <span className="mt-2 shrink-0 text-[#64748b]">{isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#eef2f6] bg-[#f8fafc] px-5 py-5 sm:px-6">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <DetailSection title={t("Context")}>
                          <DetailRow label={t("Campaign")} value={log.campaignName ?? (log.campaignId ? t("Campaign no longer available") : t("No linked campaign"))} />
                          <DetailRow label={t("Account")} value={log.accountName ?? (log.accountId ? t("Account no longer available") : t("No linked account"))} />
                          <DetailRow label={t("Destination")} value={log.destinationTitle ?? (log.targetId ? t("Destination no longer available") : t("No linked destination"))} />
                          {log.destinationUsername && <DetailRow label={t("Telegram username")} value={`@${log.destinationUsername}`} />}
                        </DetailSection>
                        <DetailSection title={t("Delivery details")}>
                          {log.targetStatus && <DetailRow label={t("Target status")} value={targetStatusLabel(log.targetStatus, language)} />}
                          {typeof log.targetAttempts === "number" && <DetailRow label={t("Attempts")} value={String(log.targetAttempts)} />}
                          {log.targetNextAttemptAt && <DetailRow label={t("Next retry")} value={formatDate(log.targetNextAttemptAt, language)} />}
                          {log.targetLastError && <DetailRow label={t("Last error")} value={log.targetLastError} emphasis />}
                          {!log.targetStatus && <p className="text-[12px] leading-5 text-[#64748b]">{t("This record is not tied to a delivery target.")}</p>}
                        </DetailSection>
                      </div>
                      <DetailSection title={t("Technical information")} className="mt-4">
                        <DetailRow label={t("Action type")} value={log.event} mono />
                        <DetailRow label={t("Reference")} value={log.id} mono />
                        {metadata.map(([key, value]) => <DetailRow key={key} label={key} value={metadataText(value)} mono />)}
                      </DetailSection>
                    </div>
                  )}
                </article>
              );
            })}
            {!filtered.length && <div className="p-12 text-center text-[13px] font-medium text-[#64748b]">{activity.isLoading ? t("Loading activity…") : t("No activity matches this view.")}</div>}
          </div>
        )}
      </Panel>
    </AppLayout>
  );
}

function LogMetric({ icon: Icon, value, label, tone }: { icon: typeof CheckCircle2; value: number; label: string; tone: "green" | "amber" | "red" | "orange" }) {
  const styles = {
    green: "bg-[#f0fdf4] text-[#16a34a]",
    amber: "bg-[#fffbeb] text-[#d97706]",
    red: "bg-[#fff1f2] text-[#e11d48]",
    orange: "bg-[#fff7ed] text-[#ea580c]",
  }[tone];
  return <Panel className="flex items-center gap-3.5 p-4 sm:p-5"><span className={`grid h-10 w-10 place-items-center rounded-xl ${styles}`}><Icon className="h-5 w-5" /></span><div><p className="text-[23px] font-extrabold leading-none text-[#0f172a]">{value}</p><p className="mt-1.5 text-[11px] font-bold text-[#64748b]">{label}</p></div></Panel>;
}

function DetailSection({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[#e2e8f0] bg-white p-4 ${className}`}><p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#64748b]">{title}</p><div className="space-y-2.5">{children}</div></div>;
}

function DetailRow({ label, value, mono = false, emphasis = false }: { label: string; value: string; mono?: boolean; emphasis?: boolean }) {
  return <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 text-[12px]"><span className="font-semibold text-[#64748b]">{label}</span><span className={`break-words text-right font-medium ${mono ? "font-mono text-[11px]" : ""} ${emphasis ? "text-[#be123c]" : "text-[#0f172a]"}`}>{value}</span></div>;
}
