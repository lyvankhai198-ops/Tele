import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminOperationsQueryKey,
  type AdminOperations,
  useGetAdminOperations,
  useRetryAdminCampaignTarget,
  useUpdateAdminCampaignStatus,
} from "@workspace/api-client-react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, FileArchive, HardDrive, ListRestart, RadioTower, Search, ShieldCheck, ScrollText } from "lucide-react";
import { AppLayout, EmptyState, Panel, SectionHeader, StatusBadge } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";

const copy = {
  en: {
    title: "Operations Monitoring",
    subtitle: "Monitor Telegram health, delivery queues, and platform-wide audit events.",
    loading: "Loading operational data…",
    failed: "Could not load operational data.",
    accounts: "Telegram accounts",
    queue: "Queue & campaigns",
    audit: "System audit log",
    search: "Filter by user, campaign, account, or status…",
    account: "Account",
    owner: "Owner",
    connection: "Connection",
    proxy: "Proxy",
    lastSync: "Last sync",
    cooldown: "FloodWait / cooldown",
    failures: "Failed deliveries",
    campaign: "Campaign",
    targets: "Targets pending / failed / review / sent",
    target: "Target",
    retry: "Retries",
    nextAttempt: "Next attempt",
    reason: "Failure reason",
    actor: "Actor",
    event: "Event",
    result: "Result",
    ip: "IP",
    time: "Time",
    noData: "No matching operational records.",
    storage: "Storage & maintenance",
    storageSubtitle: "Read-only health check for this VPS. No data is deleted from this page.",
    serverDisk: "VPS disk",
    mediaStorage: "Notification media",
    exportsStorage: "Exports",
    appLogs: "TeleCampaign logs",
    free: "free",
    used: "used",
    files: "files",
    oldFiles: "older than 30 days",
    retention: "Configured target",
    days: "days",
    limit: "Limit",
    notAvailable: "Not available in this environment",
    lastChecked: "Last checked",
    storageHealthy: "Healthy",
    storageWarning: "Needs attention",
    storageHigh: "Act soon",
    storageCritical: "Critical",
    storageHint: "Monitor this VPS disk and keep usage below 70% when possible.",
  },
  vi: {
    title: "Giám sát Vận hành",
    subtitle: "Theo dõi Telegram, queue gửi tin và audit log toàn hệ thống.",
    loading: "Đang tải dữ liệu vận hành…",
    failed: "Không thể tải dữ liệu vận hành.",
    accounts: "Tài khoản Telegram",
    queue: "Queue & campaign",
    audit: "Audit log toàn hệ thống",
    search: "Lọc theo user, campaign, tài khoản hoặc trạng thái…",
    account: "Tài khoản",
    owner: "Chủ sở hữu",
    connection: "Kết nối",
    proxy: "Proxy",
    lastSync: "Sync gần nhất",
    cooldown: "FloodWait / cooldown",
    failures: "Gửi thất bại",
    campaign: "Campaign",
    targets: "Target chờ / lỗi / cần review / đã gửi",
    target: "Target",
    retry: "Retry",
    nextAttempt: "Lần thử tiếp",
    reason: "Lý do lỗi",
    actor: "Người thực hiện",
    event: "Sự kiện",
    result: "Kết quả",
    ip: "IP",
    time: "Thời gian",
    noData: "Không có dữ liệu vận hành phù hợp.",
    storage: "Dung lượng & bảo trì",
    storageSubtitle: "Kiểm tra chỉ đọc trên VPS này. Trang này không xóa dữ liệu.",
    serverDisk: "Ổ đĩa toàn VPS",
    mediaStorage: "Media thông báo",
    exportsStorage: "File export",
    appLogs: "Log TeleCampaign",
    free: "còn trống",
    used: "đã dùng",
    files: "file",
    oldFiles: "file quá 30 ngày",
    retention: "Mục tiêu giữ log",
    days: "ngày",
    limit: "Giới hạn",
    notAvailable: "Chưa có số liệu trong môi trường này",
    lastChecked: "Kiểm tra lần cuối",
    storageHealthy: "Bình thường",
    storageWarning: "Nên kiểm tra",
    storageHigh: "Cần xử lý sớm",
    storageCritical: "Khẩn cấp",
    storageHint: "Theo dõi dung lượng ổ đĩa VPS này và nên giữ mức sử dụng dưới 70%.",
  },
} as const;

function dateTime(value: string | null, language: "en" | "vi") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function readableStatus(status: string) {
  return status.replaceAll("_", " ");
}

function statusTone(status: string) {
  if (["connected", "sent", "completed", "success", "active"].includes(status)) return "success" as const;
  if (["pending", "sending", "queued", "running"].includes(status)) return "scheduled" as const;
  if (["paused", "requires_review"].includes(status)) return "warning" as const;
  return "failed" as const;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function storageLevel(usedPercent: number) {
  if (usedPercent >= 90) return "critical" as const;
  if (usedPercent >= 80) return "high" as const;
  if (usedPercent >= 70) return "warning" as const;
  return "healthy" as const;
}

type StorageText = {
  storageHealthy: string;
  storageWarning: string;
  storageHigh: string;
  storageCritical: string;
  used: string;
};

function storageLabel(level: "healthy" | "warning" | "high" | "critical", text: StorageText) {
  return level === "critical" ? text.storageCritical : level === "high" ? text.storageHigh : level === "warning" ? text.storageWarning : text.storageHealthy;
}

function StorageMetric({
  icon: Icon,
  title,
  value,
  detail,
  percent,
  level,
  text,
}: {
  icon: typeof HardDrive;
  title: string;
  value: string;
  detail: string;
  percent?: number;
  level: "healthy" | "warning" | "high" | "critical";
  text: StorageText;
}) {
  const colors = {
    healthy: { icon: "#059669", bg: "#ecfdf5", bar: "#10b981" },
    warning: { icon: "#d97706", bg: "#fffbeb", bar: "#f59e0b" },
    high: { icon: "#ea580c", bg: "#fff7ed", bar: "#f97316" },
    critical: { icon: "#e11d48", bg: "#fff1f2", bar: "#f43f5e" },
  }[level];
  return (
    <div className="rounded-2xl border border-[#eef2f6] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ color: colors.icon, backgroundColor: colors.bg }}><Icon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-extrabold text-[#334155]">{title}</p>
            <p className="mt-1 text-[11px] font-semibold text-[#64748b]">{detail}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide" style={{ color: colors.icon, borderColor: `${colors.icon}33`, backgroundColor: colors.bg }}>{storageLabel(level, text)}</span>
      </div>
      <p className="mt-5 text-[24px] font-extrabold tracking-tight text-[#0f172a]">{value}</p>
      {percent !== undefined && <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: colors.bar }} /></div>
        <p className="mt-2 text-right text-[10px] font-bold text-[#64748b]">{percent.toFixed(1)}% {text.used}</p>
      </div>}
    </div>
  );
}

export default function AdminOperationsPage() {
  const { language } = useLanguage();
  const text = copy[language];
  const query = useGetAdminOperations({ query: { queryKey: getGetAdminOperationsQueryKey(), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const queryClient = useQueryClient();
  const updateCampaign = useUpdateAdminCampaignStatus();
  const retryTarget = useRetryAdminCampaignTarget();
  const [tab, setTab] = useState<"accounts" | "queue" | "audit">("accounts");
  const [search, setSearch] = useState("");
  const data = query.data as AdminOperations | undefined;
  const needle = search.trim().toLowerCase();
  const includes = (...values: Array<string | null | undefined>) => !needle || values.some((value) => value?.toLowerCase().includes(needle));

  const filteredAccounts = useMemo(() => (data?.accounts ?? []).filter((account) => includes(account.name, account.ownerUsername, account.status, account.proxyName, account.proxyStatus)), [data?.accounts, needle]);
  const filteredCampaigns = useMemo(() => (data?.campaigns ?? []).filter((campaign) => includes(campaign.name, campaign.ownerUsername, campaign.status)), [data?.campaigns, needle]);
  const filteredTargets = useMemo(() => (data?.targets ?? []).filter((target) => includes(target.campaignName, target.ownerUsername, target.destinationTitle, target.status, target.lastError)), [data?.targets, needle]);
  const filteredAudit = useMemo(() => (data?.auditLogs ?? []).filter((log) => includes(log.actorUsername, log.event, log.message, log.level)), [data?.auditLogs, needle]);
  const refreshOperations = () => void queryClient.invalidateQueries({ queryKey: getGetAdminOperationsQueryKey() });

  const changeCampaignStatus = (campaignId: string, status: "queued" | "paused") => {
    updateCampaign.mutate({ campaignId, data: { status } }, { onSuccess: refreshOperations });
  };
  const retryCampaignTarget = (targetId: string) => {
    retryTarget.mutate({ targetId }, { onSuccess: refreshOperations });
  };

  return <AppLayout activePage="admin-operations" title={text.title} subtitle={text.subtitle}>
    <div className="space-y-6">
      <Panel className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ["accounts", text.accounts, RadioTower],
              ["queue", text.queue, ListRestart],
              ["audit", text.audit, ShieldCheck],
            ].map(([key, label, Icon]) => <button key={key as string} type="button" onClick={() => setTab(key as typeof tab)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12px] font-extrabold transition ${tab === key ? "bg-[#1a2b88] text-white" : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"}`}><Icon className="h-4 w-4" />{label as string}</button>)}
          </div>
          <label className="relative w-full lg:w-[340px]"><Search className="absolute left-3 top-3 h-4 w-4 text-[#94a3b8]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} className="h-10 w-full rounded-xl border border-[#dbe2ea] pl-9 pr-3 text-[12px] font-semibold outline-none focus:border-[#1a2b88]" /></label>
        </div>
      </Panel>

      {query.isLoading && <Panel className="p-8 text-center text-[14px] font-semibold text-[#64748b]">{text.loading}</Panel>}
      {query.error && <Panel className="p-8 text-center text-[14px] font-semibold text-[#be123c]">{text.failed}</Panel>}

      {data && <Panel className="p-4 sm:p-6">
        <SectionHeader eyebrow="Maintenance" title={text.storage} detail={text.storageSubtitle} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(() => {
            const diskLevel = storageLevel(data.storage.disk.usedPercent);
            const mediaPercent = data.storage.media.maxBytes ? (data.storage.media.bytes / data.storage.media.maxBytes) * 100 : 0;
            const logPercent = data.storage.logs.maxBytes ? (data.storage.logs.bytes / data.storage.logs.maxBytes) * 100 : 0;
            return <>
              <StorageMetric icon={HardDrive} title={text.serverDisk} value={`${formatBytes(data.storage.disk.freeBytes)} ${text.free}`} detail={`${formatBytes(data.storage.disk.usedBytes)} / ${formatBytes(data.storage.disk.totalBytes)}`} percent={data.storage.disk.usedPercent} level={diskLevel} text={text} />
              <StorageMetric icon={RadioTower} title={text.mediaStorage} value={data.storage.media.available ? formatBytes(data.storage.media.bytes) : text.notAvailable} detail={data.storage.media.available ? `${data.storage.media.fileCount} ${text.files} · ${formatBytes(data.storage.media.maxBytes ?? 0)} ${text.limit}` : text.notAvailable} percent={data.storage.media.available ? mediaPercent : undefined} level={storageLevel(mediaPercent)} text={text} />
              <StorageMetric icon={FileArchive} title={text.exportsStorage} value={data.storage.exports.available ? formatBytes(data.storage.exports.bytes) : text.notAvailable} detail={data.storage.exports.available ? `${data.storage.exports.fileCount} ${text.files} · ${data.storage.exports.oldFileCount} ${text.oldFiles}` : text.notAvailable} level={data.storage.exports.oldFileCount > 0 ? "warning" : "healthy"} text={text} />
              <StorageMetric icon={ScrollText} title={text.appLogs} value={data.storage.logs.available ? formatBytes(data.storage.logs.bytes) : text.notAvailable} detail={data.storage.logs.available ? `${text.retention}: ${data.storage.logs.retentionDays} ${text.days} · ${formatBytes(data.storage.logs.maxBytes)} ${text.limit}` : text.notAvailable} percent={data.storage.logs.available ? logPercent : undefined} level={storageLevel(logPercent)} text={text} />
            </>;
          })()}
        </div>
        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-[11px] font-semibold text-[#1e40af] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" />{text.storageHint}</span>
          <span className="shrink-0 text-[#64748b]">{text.lastChecked}: {dateTime(data.storage.checkedAt, language)}</span>
        </div>
      </Panel>}

      {data && tab === "accounts" && <Panel className="overflow-hidden">
        <SectionHeader eyebrow="Health" title={text.accounts} detail={`${data.accounts.length} accounts`} />
        <div className="overflow-x-auto"><table className="min-w-[940px] w-full text-left"><thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]"><tr>{[text.account, text.owner, text.connection, text.proxy, text.lastSync, text.cooldown, text.failures].map((item) => <th key={item} className="px-5 py-3.5">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eef2f6]">{filteredAccounts.map((account) => <tr key={account.id} className="text-[12px] font-semibold text-[#334155]"><td className="px-5 py-4 font-extrabold text-[#0f172a]">{account.name}</td><td className="px-5 py-4">{account.ownerUsername}</td><td className="px-5 py-4"><StatusBadge status={statusTone(account.status)} label={readableStatus(account.status)} /></td><td className="px-5 py-4">{account.proxyName ? <span>{account.proxyName} · <span className={account.proxyStatus === "active" ? "text-[#059669]" : "text-[#e11d48]"}>{account.proxyStatus}</span></span> : "—"}</td><td className="px-5 py-4">{dateTime(account.lastSyncAt, language)}</td><td className="px-5 py-4">{account.cooldownUntil ? <span className="inline-flex items-center gap-1 text-[#d97706]"><Clock3 className="h-3.5 w-3.5" />{dateTime(account.cooldownUntil, language)}</span> : "—"}</td><td className="px-5 py-4"><span className={account.failedTargets ? "text-[#e11d48]" : "text-[#059669]"}>{account.failedTargets}</span></td></tr>)}</tbody></table></div>
        {!filteredAccounts.length && <EmptyState icon={RadioTower} title={text.noData} detail="" />}
      </Panel>}

      {data && tab === "queue" && <div className="space-y-6">
         <Panel className="overflow-hidden"><SectionHeader eyebrow="Delivery" title={text.queue} detail="Campaigns with delivery targets" /><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left"><thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]"><tr>{[text.campaign, text.owner, text.connection, text.targets, "Controls"].map((item) => <th key={item} className="px-5 py-3.5">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eef2f6]">{filteredCampaigns.map((campaign) => <tr key={campaign.id} className="text-[12px] font-semibold text-[#334155]"><td className="px-5 py-4 font-extrabold text-[#0f172a]">{campaign.name}</td><td className="px-5 py-4">{campaign.ownerUsername}</td><td className="px-5 py-4"><StatusBadge status={statusTone(campaign.status)} label={readableStatus(campaign.status)} /></td><td className="px-5 py-4"><span className="text-[#d97706]">{campaign.pendingTargets}</span> / <span className="text-[#e11d48]">{campaign.failedTargets}</span> / <span className="text-[#b45309]">{campaign.reviewTargets}</span> / <span className="text-[#059669]">{campaign.sentTargets}</span></td><td className="px-5 py-4"><button type="button" onClick={() => changeCampaignStatus(campaign.id, campaign.status === "paused" ? "queued" : "paused")} disabled={updateCampaign.isPending} className="rounded-lg border border-[#cbd5e1] px-2.5 py-1.5 text-[10px] font-extrabold uppercase text-[#1a2b88] hover:bg-[#eef2fa] disabled:opacity-50">{campaign.status === "paused" ? "Resume" : "Pause"}</button></td></tr>)}</tbody></table></div></Panel>
        <Panel className="overflow-hidden"><SectionHeader eyebrow="Retry queue" title={text.target} detail="Pending, sending, failed, and review-required targets" /><div className="overflow-x-auto"><table className="min-w-[1020px] w-full text-left"><thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]"><tr>{[text.campaign, text.target, text.owner, text.connection, text.retry, text.nextAttempt, text.reason, "Controls"].map((item) => <th key={item} className="px-5 py-3.5">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eef2f6]">{filteredTargets.map((target) => <tr key={target.id} className="text-[12px] font-semibold text-[#334155]"><td className="px-5 py-4 font-extrabold text-[#0f172a]">{target.campaignName}</td><td className="px-5 py-4">{target.destinationTitle ?? "—"}</td><td className="px-5 py-4">{target.ownerUsername}</td><td className="px-5 py-4"><StatusBadge status={statusTone(target.status)} label={readableStatus(target.status)} /></td><td className="px-5 py-4">{target.attempts}</td><td className="px-5 py-4">{dateTime(target.nextAttemptAt, language)}</td><td className="max-w-[240px] truncate px-5 py-4 text-[#be123c]">{target.lastError ?? "—"}</td><td className="px-5 py-4">{target.status === "failed" && <button type="button" onClick={() => retryCampaignTarget(target.id)} disabled={retryTarget.isPending} className="rounded-lg border border-[#cbd5e1] px-2.5 py-1.5 text-[10px] font-extrabold uppercase text-[#1a2b88] hover:bg-[#eef2fa] disabled:opacity-50">Retry</button>}{target.status === "requires_review" && <span className="text-[10px] font-extrabold uppercase text-[#b45309]">Review result first</span>}</td></tr>)}</tbody></table></div></Panel>
        {!filteredCampaigns.length && !filteredTargets.length && <EmptyState icon={ListRestart} title={text.noData} detail="" />}
      </div>}

      {data && tab === "audit" && <Panel className="overflow-hidden"><SectionHeader eyebrow="Traceability" title={text.audit} detail="Latest 200 platform events. Historical IP addresses are only present when the event recorded one." /><div className="overflow-x-auto"><table className="min-w-[960px] w-full text-left"><thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]"><tr>{[text.actor, text.event, text.result, text.ip, text.time].map((item) => <th key={item} className="px-5 py-3.5">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eef2f6]">{filteredAudit.map((log) => <tr key={log.id} className="text-[12px] font-semibold text-[#334155]"><td className="px-5 py-4 font-extrabold text-[#0f172a]">{log.actorUsername}</td><td className="px-5 py-4"><p className="font-mono text-[11px] text-[#1a2b88]">{log.event}</p><p className="mt-1 text-[#64748b]">{log.message}</p></td><td className="px-5 py-4"><StatusBadge status={log.level === "error" ? "failed" : log.level === "success" ? "success" : "active"} label={log.level} /></td><td className="px-5 py-4 font-mono text-[11px]">{log.ip ?? "—"}</td><td className="px-5 py-4">{dateTime(log.createdAt, language)}</td></tr>)}</tbody></table></div>{!filteredAudit.length && <EmptyState icon={Activity} title={text.noData} detail="" />}</Panel>}
    </div>
  </AppLayout>;
}