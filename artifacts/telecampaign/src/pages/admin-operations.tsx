import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminOperationsQueryKey,
  type AdminOperations,
  useGetAdminOperations,
  useRetryAdminCampaignTarget,
  useUpdateAdminCampaignStatus,
} from "@workspace/api-client-react";
import { Activity, AlertTriangle, Clock3, ListRestart, RadioTower, Search, ShieldCheck } from "lucide-react";
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
    targets: "Targets pending / failed / sent",
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
    targets: "Target chờ / lỗi / đã gửi",
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

export default function AdminOperationsPage() {
  const { language } = useLanguage();
  const text = copy[language];
  const query = useGetAdminOperations();
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

      {data && tab === "accounts" && <Panel className="overflow-hidden">
        <SectionHeader eyebrow="Health" title={text.accounts} detail={`${data.accounts.length} accounts`} />
        <div className="overflow-x-auto"><table className="min-w-[940px] w-full text-left"><thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]"><tr>{[text.account, text.owner, text.connection, text.proxy, text.lastSync, text.cooldown, text.failures].map((item) => <th key={item} className="px-5 py-3.5">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eef2f6]">{filteredAccounts.map((account) => <tr key={account.id} className="text-[12px] font-semibold text-[#334155]"><td className="px-5 py-4 font-extrabold text-[#0f172a]">{account.name}</td><td className="px-5 py-4">{account.ownerUsername}</td><td className="px-5 py-4"><StatusBadge status={statusTone(account.status)} label={readableStatus(account.status)} /></td><td className="px-5 py-4">{account.proxyName ? <span>{account.proxyName} · <span className={account.proxyStatus === "active" ? "text-[#059669]" : "text-[#e11d48]"}>{account.proxyStatus}</span></span> : "—"}</td><td className="px-5 py-4">{dateTime(account.lastSyncAt, language)}</td><td className="px-5 py-4">{account.cooldownUntil ? <span className="inline-flex items-center gap-1 text-[#d97706]"><Clock3 className="h-3.5 w-3.5" />{dateTime(account.cooldownUntil, language)}</span> : "—"}</td><td className="px-5 py-4"><span className={account.failedTargets ? "text-[#e11d48]" : "text-[#059669]"}>{account.failedTargets}</span></td></tr>)}</tbody></table></div>
        {!filteredAccounts.length && <EmptyState icon={RadioTower} title={text.noData} detail="" />}
      </Panel>}

      {data && tab === "queue" && <div className="space-y-6">
        <Panel className="overflow-hidden"><SectionHeader eyebrow="Delivery" title={text.queue} detail="Campaigns with delivery targets" /><div className="overflow-x-auto"><table className="min-w-[840px] w-full text-left"><thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]"><tr>{[text.campaign, text.owner, text.connection, text.targets, "Controls"].map((item) => <th key={item} className="px-5 py-3.5">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eef2f6]">{filteredCampaigns.map((campaign) => <tr key={campaign.id} className="text-[12px] font-semibold text-[#334155]"><td className="px-5 py-4 font-extrabold text-[#0f172a]">{campaign.name}</td><td className="px-5 py-4">{campaign.ownerUsername}</td><td className="px-5 py-4"><StatusBadge status={statusTone(campaign.status)} label={readableStatus(campaign.status)} /></td><td className="px-5 py-4"><span className="text-[#d97706]">{campaign.pendingTargets}</span> / <span className="text-[#e11d48]">{campaign.failedTargets}</span> / <span className="text-[#059669]">{campaign.sentTargets}</span></td><td className="px-5 py-4"><button type="button" onClick={() => changeCampaignStatus(campaign.id, campaign.status === "paused" ? "queued" : "paused")} disabled={updateCampaign.isPending} className="rounded-lg border border-[#cbd5e1] px-2.5 py-1.5 text-[10px] font-extrabold uppercase text-[#1a2b88] hover:bg-[#eef2fa] disabled:opacity-50">{campaign.status === "paused" ? "Resume" : "Pause"}</button></td></tr>)}</tbody></table></div></Panel>
        <Panel className="overflow-hidden"><SectionHeader eyebrow="Retry queue" title={text.target} detail="Pending, sending, failed, and review-required targets" /><div className="overflow-x-auto"><table className="min-w-[1020px] w-full text-left"><thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]"><tr>{[text.campaign, text.target, text.owner, text.connection, text.retry, text.nextAttempt, text.reason, "Controls"].map((item) => <th key={item} className="px-5 py-3.5">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eef2f6]">{filteredTargets.map((target) => <tr key={target.id} className="text-[12px] font-semibold text-[#334155]"><td className="px-5 py-4 font-extrabold text-[#0f172a]">{target.campaignName}</td><td className="px-5 py-4">{target.destinationTitle ?? "—"}</td><td className="px-5 py-4">{target.ownerUsername}</td><td className="px-5 py-4"><StatusBadge status={statusTone(target.status)} label={readableStatus(target.status)} /></td><td className="px-5 py-4">{target.attempts}</td><td className="px-5 py-4">{dateTime(target.nextAttemptAt, language)}</td><td className="max-w-[240px] truncate px-5 py-4 text-[#be123c]">{target.lastError ?? "—"}</td><td className="px-5 py-4">{["failed", "requires_review"].includes(target.status) && <button type="button" onClick={() => retryCampaignTarget(target.id)} disabled={retryTarget.isPending} className="rounded-lg border border-[#cbd5e1] px-2.5 py-1.5 text-[10px] font-extrabold uppercase text-[#1a2b88] hover:bg-[#eef2fa] disabled:opacity-50">Retry</button>}</td></tr>)}</tbody></table></div></Panel>
        {!filteredCampaigns.length && !filteredTargets.length && <EmptyState icon={ListRestart} title={text.noData} detail="" />}
      </div>}

      {data && tab === "audit" && <Panel className="overflow-hidden"><SectionHeader eyebrow="Traceability" title={text.audit} detail="Latest 200 platform events. Historical IP addresses are only present when the event recorded one." /><div className="overflow-x-auto"><table className="min-w-[960px] w-full text-left"><thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]"><tr>{[text.actor, text.event, text.result, text.ip, text.time].map((item) => <th key={item} className="px-5 py-3.5">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#eef2f6]">{filteredAudit.map((log) => <tr key={log.id} className="text-[12px] font-semibold text-[#334155]"><td className="px-5 py-4 font-extrabold text-[#0f172a]">{log.actorUsername}</td><td className="px-5 py-4"><p className="font-mono text-[11px] text-[#1a2b88]">{log.event}</p><p className="mt-1 text-[#64748b]">{log.message}</p></td><td className="px-5 py-4"><StatusBadge status={log.level === "error" ? "failed" : log.level === "success" ? "success" : "active"} label={log.level} /></td><td className="px-5 py-4 font-mono text-[11px]">{log.ip ?? "—"}</td><td className="px-5 py-4">{dateTime(log.createdAt, language)}</td></tr>)}</tbody></table></div>{!filteredAudit.length && <EmptyState icon={Activity} title={text.noData} detail="" />}</Panel>}
    </div>
  </AppLayout>;
}