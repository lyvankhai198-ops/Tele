import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckSquare,
  Eye,
  LoaderCircle,
  CirclePause,
  Pencil,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import type { Campaign } from "@workspace/api-client-react";
import {
  deleteCampaign,
  useCreateCampaign,
  useGetSystemDefaults,
  useListCampaigns,
  useListDestinations,
  useListMessageTemplates,
  useListTelegramAccounts,
  useUpdateCampaignStatus,
} from "@workspace/api-client-react";
import { AppLayout, EmptyState, Modal, Panel, PrimaryButton, Toast } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Bilingual copy
// ---------------------------------------------------------------------------
const copy = {
  en: {
    pageTitle: "Campaigns",
    addAriaLabel: "Create campaign",
    searchPlaceholder: "Search by name…",
    statusAll: "All statuses",
    statusQueued: "Queued",
    statusRunning: "Running",
    statusPaused: "Paused",
    statusCompleted: "Completed",
    statusCompletedErrors: "Completed with errors",
    statusDraft: "Draft",
    statusCancelled: "Cancelled",
    accountFallback: "Telegram account",
    scheduledLabel: "Scheduled:",
    detailsBtn: "Details",
    pauseBtn: "Pause",
    resumeBtn: "Resume",
    editBtn: "Edit",
    deleteBtn: "Delete",
    errorsLabel: "Errors",
    emptyFilterTitle: "No campaigns found",
    emptyFilterDetail: "Try changing the search term or filter.",
    emptyTitle: "No campaigns yet",
    emptyDetail: "Create your first campaign from an approved message template and Telegram group.",
    createCampaignBtn: "Create campaign",
    modalTitle: "Create campaign",
    fieldName: "Campaign name",
    fieldAccount: "Telegram account",
    fieldAccountPlaceholder: "Select account",
    fieldTemplate: "Message template",
    fieldTemplatePlaceholder: "Select template",
    fieldDestinations: "Select destinations",
    deselectAll: "Deselect all",
    selectAll: "Select all",
    searchGroupPlaceholder: "Search groups…",
    pickAccountHint: "Select a Telegram account to see active groups.",
    noGroupsHint: "No groups with posting permission.",
    fieldRepeatCount: "Repeat count",
    repeatCountHint: "Max 300 (admin configured).",
    delayBetweenGroups: "Delay between groups (same round)",
    delayBetweenRounds: "Delay between rounds",
    delayMinGroupLabel: "Min delay between groups (sec)",
    delayMaxGroupLabel: "Max delay between groups (sec)",
    delayMinRoundLabel: "Min delay between rounds (sec)",
    delayMaxRoundLabel: "Max delay between rounds (sec)",
    delayMaxHint: (max: number) => `Max ${max.toLocaleString("en-US")} seconds.`,
    fieldSchedule: "Schedule (optional)",
    validationRequired: "Please enter a name, select an account, template, and at least one destination.",
    validationNumbers: "Repeat count and delays must be valid integers.",
    validationDelayOrder: "Minimum delay cannot exceed maximum delay.",
    validationSchedule: "Invalid schedule date/time.",
    toastCreated: "Campaign created.",
    toastUpdated: "Campaign updated.",
    toastPaused: "Campaign paused.",
    toastResumed: "Campaign resumed.",
    toastDeleted: "Campaign deleted.",
    toastError: (msg: string) => msg,
    confirmDelete: (name: string) => `Delete campaign "${name}"?`,
    detailStatusPrefix: "Status:",
    detailStatTotal: "Total",
    detailStatSent: "Sent",
    detailStatErrors: "Errors",
    detailRepeat: "Repeat:",
    detailRounds: "rounds",
    detailDelayGroup: "Group delay:",
    detailDelayRound: "Round delay:",
    detailSchedule: "Scheduled:",
    detailForwardNote: "This template will be forwarded from Saved Messages.",
    detailWaitingTitle: "Waiting to send",
    detailWaitingStatus: "Waiting",
    detailWaitingMessage: "The campaign will send automatically when the scheduled wait is over.",
    detailWaitingCountdown: "Send countdown:",
    detailErrorTitle: "Delivery errors",
    detailErrorEmpty: "No delivery errors recorded.",
    detailErrorAttempts: "attempts",
    detailErrorNextRetry: "Next retry:",
    genericError: "Could not complete the operation. Please try again.",
  },
  vi: {
    pageTitle: "Chiến dịch",
    addAriaLabel: "Tạo chiến dịch",
    searchPlaceholder: "Tìm theo tên...",
    statusAll: "Tất cả trạng thái",
    statusQueued: "Đang chờ",
    statusRunning: "Đang chạy",
    statusPaused: "Đã dừng",
    statusCompleted: "Hoàn thành",
    statusCompletedErrors: "Hoàn thành lỗi",
    statusDraft: "Bản nháp",
    statusCancelled: "Đã hủy",
    accountFallback: "Tài khoản Telegram",
    scheduledLabel: "Lên lịch:",
    detailsBtn: "Chi tiết",
    pauseBtn: "Dừng",
    resumeBtn: "Tiếp tục",
    editBtn: "Chỉnh sửa",
    deleteBtn: "Xóa",
    errorsLabel: "Lỗi",
    emptyFilterTitle: "Không tìm thấy chiến dịch",
    emptyFilterDetail: "Hãy thay đổi từ khóa hoặc bộ lọc.",
    emptyTitle: "Chưa có chiến dịch",
    emptyDetail: "Tạo chiến dịch đầu tiên từ mẫu tin nhắn và nhóm Telegram đã được cấp quyền.",
    createCampaignBtn: "Tạo chiến dịch",
    modalTitle: "Tạo chiến dịch",
    fieldName: "Tên chiến dịch",
    fieldAccount: "Tài khoản Telegram",
    fieldAccountPlaceholder: "Chọn tài khoản",
    fieldTemplate: "Mẫu tin",
    fieldTemplatePlaceholder: "Chọn mẫu",
    fieldDestinations: "Chọn nhóm gửi",
    deselectAll: "Bỏ chọn tất cả",
    selectAll: "Chọn tất cả",
    searchGroupPlaceholder: "Tìm nhóm...",
    pickAccountHint: "Chọn tài khoản Telegram để hiển thị nhóm đang hoạt động.",
    noGroupsHint: "Không có nhóm nào được phép gửi.",
    fieldRepeatCount: "Số lần lặp",
    repeatCountHint: "Tối đa 300 (admin cấu hình).",
    delayBetweenGroups: "Delay giữa các nhóm (cùng vòng gửi)",
    delayBetweenRounds: "Delay giữa các vòng lặp",
    delayMinGroupLabel: "Delay min giữa nhóm (giây)",
    delayMaxGroupLabel: "Delay max giữa nhóm (giây)",
    delayMinRoundLabel: "Delay min giữa mỗi vòng lặp (giây)",
    delayMaxRoundLabel: "Delay max giữa mỗi vòng lặp (giây)",
    delayMaxHint: (max: number) => `Tối đa ${max.toLocaleString("vi-VN")} giây.`,
    fieldSchedule: "Lên lịch (tùy chọn)",
    validationRequired: "Hãy nhập tên, chọn tài khoản, mẫu tin và ít nhất một nhóm gửi.",
    validationNumbers: "Số lần lặp và delay phải là số nguyên hợp lệ.",
    validationDelayOrder: "Delay tối thiểu không thể lớn hơn delay tối đa.",
    validationSchedule: "Thời gian lên lịch không hợp lệ.",
    toastCreated: "Đã tạo chiến dịch.",
    toastUpdated: "Đã cập nhật chiến dịch.",
    toastPaused: "Đã dừng chiến dịch.",
    toastResumed: "Chiến dịch đã tiếp tục.",
    toastDeleted: "Đã xóa chiến dịch.",
    toastError: (msg: string) => msg,
    confirmDelete: (name: string) => `Xóa chiến dịch "${name}"?`,
    detailStatusPrefix: "Trạng thái:",
    detailStatTotal: "Tổng gửi",
    detailStatSent: "Đã gửi",
    detailStatErrors: "Lỗi",
    detailRepeat: "Lặp:",
    detailRounds: "vòng",
    detailDelayGroup: "Delay nhóm:",
    detailDelayRound: "Delay vòng:",
    detailSchedule: "Lên lịch:",
    detailForwardNote: "Mẫu này sẽ được chuyển tiếp từ Tin nhắn đã lưu.",
    detailWaitingTitle: "Đang chờ gửi",
    detailWaitingStatus: "Đang chờ",
    detailWaitingMessage: "Chiến dịch sẽ tự động gửi khi hết thời gian chờ.",
    detailWaitingCountdown: "Đếm ngược lần gửi:",
    detailErrorTitle: "Chi tiết lỗi gửi",
    detailErrorEmpty: "Chưa ghi nhận lỗi gửi.",
    detailErrorAttempts: "lần thử",
    detailErrorNextRetry: "Lần thử tiếp:",
    genericError: "Không thể hoàn tất thao tác. Vui lòng thử lại.",
  },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type CampaignForm = {
  name: string;
  accountId: string;
  templateId: string;
  destinationIds: string[];
  repeatCount: string;
  delayMinSeconds: string;
  delayMaxSeconds: string;
  roundDelayMinSeconds: string;
  roundDelayMaxSeconds: string;
  scheduleDate: string;
  scheduleTime: string;
};

const emptyForm = (): CampaignForm => ({
  name: "",
  accountId: "",
  templateId: "",
  destinationIds: [],
  repeatCount: "1",
  delayMinSeconds: "5",
  delayMaxSeconds: "8",
  roundDelayMinSeconds: "1",
  roundDelayMaxSeconds: "3",
  scheduleDate: "",
  scheduleTime: "",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatSchedule(value: Date | string | null, language: "en" | "vi") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function isWaitingRetry(error: Campaign["errors"][number]) {
  return error.status === "pending" && Boolean(error.nextAttemptAt);
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function retryTimestamp(value: Date | string | null) {
  return value ? new Date(value).getTime() : 0;
}

function RetryCountdown({ nextAttemptAt }: { nextAttemptAt: Date | string }) {
  const [remaining, setRemaining] = useState(() => retryTimestamp(nextAttemptAt) - Date.now());

  useEffect(() => {
    const update = () => setRemaining(retryTimestamp(nextAttemptAt) - Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [nextAttemptAt]);

  return <span className="font-black tabular-nums">{formatCountdown(remaining)}</span>;
}

function statusLabel(status: string, c: (typeof copy)["en"] | (typeof copy)["vi"]) {
  const map: Record<string, string> = {
    queued: c.statusQueued,
    running: c.statusRunning,
    paused: c.statusPaused,
    draft: c.statusDraft,
    completed: c.statusCompleted,
    completed_with_errors: c.statusCompletedErrors,
    cancelled: c.statusCancelled,
  };
  return map[status] ?? status;
}

function isActive(status: string) {
  return status === "queued" || status === "running";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Campaigns() {
  const { language } = useLanguage();
  const c = copy[language];

  const campaigns = useListCampaigns();
  const accounts = useListTelegramAccounts();
  const destinations = useListDestinations();
  const templates = useListMessageTemplates();
  const createCampaign = useCreateCampaign();
  const systemDefaults = useGetSystemDefaults();
  const updateStatus = useUpdateCampaignStatus();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [details, setDetails] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [groupSearch, setGroupSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const connectedAccounts = (accounts.data ?? []).filter((account) => account.status === "connected");
  const listedCampaigns = useMemo(() => (campaigns.data ?? []).filter((campaign) => {
    const needle = search.trim().toLowerCase();
    return (!needle || campaign.name.toLowerCase().includes(needle)) && (status === "all" || campaign.status === status);
  }), [campaigns.data, search, status]);
  const accountDestinations = useMemo(() => (destinations.data ?? []).filter((destination) =>
    destination.accountId === form.accountId && destination.canPost && (
      !groupSearch.trim() ||
      destination.title.toLowerCase().includes(groupSearch.trim().toLowerCase()) ||
      (destination.username ?? "").toLowerCase().includes(groupSearch.trim().toLowerCase())
    ),
  ), [destinations.data, form.accountId, groupSearch]);
  const accountTemplates = useMemo(() => (templates.data ?? []).filter((template) =>
    template.mode !== "forward" || template.sourceAccountId === form.accountId,
  ), [templates.data, form.accountId]);
  const selectedTemplate = (templates.data ?? []).find((template) => template.id === form.templateId);

  function openNew() {
    const defaults = systemDefaults.data;
    setForm({
      ...emptyForm(),
      delayMinSeconds: String(defaults?.campaignDefaults.delayMinSeconds ?? 5),
      delayMaxSeconds: String(defaults?.campaignDefaults.delayMaxSeconds ?? 8),
      roundDelayMinSeconds: String(defaults?.campaignDefaults.roundDelayMinSeconds ?? 1),
      roundDelayMaxSeconds: String(defaults?.campaignDefaults.roundDelayMaxSeconds ?? 3),
    });
    setGroupSearch("");
    setFormError(null);
    setEditingCampaign(null);
    setShowForm(true);
  }

  function openEdit(campaign: Campaign) {
    const schedule = campaign.scheduledAt ? new Date(campaign.scheduledAt) : null;
    setEditingCampaign(campaign);
    setForm({
      name: campaign.name,
      accountId: campaign.telegramAccountId ?? "",
      templateId: campaign.templateId ?? "",
      destinationIds: (destinations.data ?? [])
        .filter((destination) => campaign.destinationIds.includes(destination.id) && destination.canPost)
        .map((destination) => destination.id),
      repeatCount: String(campaign.repeatCount),
      delayMinSeconds: String(campaign.delayMinSeconds),
      delayMaxSeconds: String(campaign.delayMaxSeconds),
      roundDelayMinSeconds: String(campaign.roundDelayMinSeconds),
      roundDelayMaxSeconds: String(campaign.roundDelayMaxSeconds),
      scheduleDate: schedule ? new Intl.DateTimeFormat("en-CA").format(schedule) : "",
      scheduleTime: schedule ? schedule.toTimeString().slice(0, 5) : "",
    });
    setGroupSearch("");
    setFormError(null);
    setShowForm(true);
  }

  function changeAccount(accountId: string) {
    setForm((current) => ({ ...current, accountId, templateId: "", destinationIds: [] }));
  }

  function toggleDestination(destinationId: string) {
    setForm((current) => ({
      ...current,
      destinationIds: current.destinationIds.includes(destinationId)
        ? current.destinationIds.filter((id) => id !== destinationId)
        : [...current.destinationIds, destinationId],
    }));
  }

  function toggleAllDestinations() {
    const visibleIds = accountDestinations.map((destination) => destination.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => form.destinationIds.includes(id));
    setForm((current) => ({
      ...current,
      destinationIds: allVisibleSelected
        ? current.destinationIds.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current.destinationIds, ...visibleIds])],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const values = [
      Number(form.repeatCount),
      Number(form.delayMinSeconds),
      Number(form.delayMaxSeconds),
      Number(form.roundDelayMinSeconds),
      Number(form.roundDelayMaxSeconds),
    ];
    if (!form.name.trim() || !form.accountId || !form.templateId || !form.destinationIds.length) {
      setFormError(c.validationRequired);
      return;
    }
    if (!values.every(Number.isInteger) || values.some((value) => value < 0) || values[0] < 1) {
      setFormError(c.validationNumbers);
      return;
    }
    if (values[1] > values[2] || values[3] > values[4]) {
      setFormError(c.validationDelayOrder);
      return;
    }
    let scheduledAt: string | null = null;
    if (form.scheduleDate) {
      const date = new Date(`${form.scheduleDate}T${form.scheduleTime || "00:00"}`);
      if (Number.isNaN(date.getTime())) {
        setFormError(c.validationSchedule);
        return;
      }
      scheduledAt = date.toISOString();
    }
    try {
      if (editingCampaign) {
        await updateStatus.mutateAsync({
          campaignId: editingCampaign.id,
          data: {
            name: form.name.trim(),
            telegramAccountId: form.accountId,
            templateId: form.templateId,
            destinationIds: form.destinationIds,
            scheduledAt,
            timezone: systemDefaults.data?.defaultTimezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh"),
            repeatCount: values[0],
            delayMinSeconds: values[1],
            delayMaxSeconds: values[2],
            roundDelayMinSeconds: values[3],
            roundDelayMaxSeconds: values[4],
          },
        });
        await campaigns.refetch();
        setShowForm(false);
        setEditingCampaign(null);
        setToast(c.toastUpdated);
      } else {
        await createCampaign.mutateAsync({
          data: {
          name: form.name.trim(),
          content: selectedTemplate?.content ?? "",
          telegramAccountId: form.accountId,
          templateId: form.templateId,
          destinationIds: form.destinationIds,
          scheduledAt,
          timezone: systemDefaults.data?.defaultTimezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh"),
          repeatCount: values[0],
          delayMinSeconds: values[1],
          delayMaxSeconds: values[2],
          roundDelayMinSeconds: values[3],
          roundDelayMaxSeconds: values[4],
          },
        });
        await campaigns.refetch();
        setShowForm(false);
        setToast(c.toastCreated);
      }
    } catch (error) {
      setFormError(localizedErrorMessage(error, language, c.genericError));
    }
  }

  async function changeCampaignStatus(campaign: Campaign, nextStatus: "queued" | "paused") {
    try {
      await updateStatus.mutateAsync({ campaignId: campaign.id, data: { status: nextStatus } });
      await campaigns.refetch();
      setToast(nextStatus === "paused" ? c.toastPaused : c.toastResumed);
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  async function remove(campaign: Campaign) {
    if (!window.confirm(c.confirmDelete(campaign.name))) return;
    try {
      await deleteCampaign(campaign.id);
      await campaigns.refetch();
      setToast(c.toastDeleted);
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  return (
    <AppLayout activePage="campaigns" title={c.pageTitle} hideUpgrade headerAction={
      <button onClick={openNew} className="grid h-10 w-11 place-items-center rounded-xl bg-[#1d3bb8] text-white shadow-sm transition hover:bg-[#19329c]" aria-label={c.addAriaLabel} data-testid="campaigns-add"><Plus className="h-5 w-5" /></button>
    }>
      <div className="mx-auto max-w-[900px]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#94a3b8]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={c.searchPlaceholder}
              className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white pl-10 pr-4 text-[14px] font-semibold outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
              data-testid="campaigns-search"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-11 rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold text-[#334155] outline-none focus:border-[#1a2b88]"
            data-testid="campaigns-status"
          >
            <option value="all">{c.statusAll}</option>
            <option value="queued">{c.statusQueued}</option>
            <option value="running">{c.statusRunning}</option>
            <option value="paused">{c.statusPaused}</option>
            <option value="completed">{c.statusCompleted}</option>
            <option value="completed_with_errors">{c.statusCompletedErrors}</option>
          </select>
        </div>

        <Panel className="overflow-hidden">
          {campaigns.isLoading
            ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-[#64748b]" /></div>
            : listedCampaigns.length
              ? <div className="divide-y divide-[#eef2f6]">{listedCampaigns.map((campaign) => {
                  const account = (accounts.data ?? []).find((item) => item.id === campaign.telegramAccountId);
                  const complete = campaign.targetCount ? Math.round((campaign.sentCount / campaign.targetCount) * 100) : 0;
                  return (
                    <article key={campaign.id} className="p-4 sm:p-5" data-testid={`campaign-row-${campaign.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button onClick={() => setDetails(campaign)} className="truncate text-left text-[15px] font-extrabold text-[#1839b5] hover:underline">{campaign.name}</button>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] font-semibold text-[#64748b]">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${isActive(campaign.status) ? "bg-[#eff6ff] text-[#0f172a]" : campaign.status === "paused" ? "bg-[#fff7ed] text-[#c2410c]" : "bg-[#f1f5f9] text-[#64748b]"}`}>{statusLabel(campaign.status, c)}</span>
                            <span>{campaign.sentCount}/{campaign.targetCount}</span>
                            <span>OK {campaign.sentCount} · {c.errorsLabel} {campaign.failedCount}</span>
                          </div>
                        </div>
                        <span className="pt-1 text-[12px] font-extrabold text-[#64748b]">{complete}%</span>
                      </div>
                      <div className="mt-3 space-y-0.5 text-[12px] font-medium text-[#64748b]">
                        <p>{account?.phone ?? account?.name ?? c.accountFallback}</p>
                        <p>{account?.name ?? "—"}</p>
                        <p>{c.scheduledLabel} {formatSchedule(campaign.scheduledAt, language)}</p>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button onClick={() => setDetails(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e2e8f0] text-[14px] font-extrabold text-[#0f172a] hover:bg-[#f8fafc]"><Eye className="h-[17px] w-[17px]" />{c.detailsBtn}</button>
                        {isActive(campaign.status)
                          ? <button onClick={() => void changeCampaignStatus(campaign, "paused")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#f04444] text-[14px] font-extrabold text-white hover:bg-[#dc2626]"><CirclePause className="h-[17px] w-[17px]" />{c.pauseBtn}</button>
                          : campaign.status === "draft"
                             ? <div className="grid grid-cols-2 gap-2">
                               <button onClick={() => openEdit(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] text-[14px] font-extrabold text-[#334155] hover:bg-[#f8fafc]"><Pencil className="h-[16px] w-[16px]" />{c.editBtn}</button>
                               <button onClick={() => void changeCampaignStatus(campaign, "queued")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1d3bb8] text-[14px] font-extrabold text-white hover:bg-[#19329c]"><Play className="h-[17px] w-[17px]" />{c.resumeBtn}</button>
                             </div>
                            : campaign.status === "paused"
                              ? <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => openEdit(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] text-[14px] font-extrabold text-[#334155] hover:bg-[#f8fafc]"><Pencil className="h-[16px] w-[16px]" />{c.editBtn}</button>
                                <button onClick={() => void changeCampaignStatus(campaign, "queued")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1d3bb8] text-[14px] font-extrabold text-white hover:bg-[#19329c]"><Play className="h-[17px] w-[17px]" />{c.resumeBtn}</button>
                              </div>
                            : <span className="h-10" />}
                      </div>
                      <button onClick={() => void remove(campaign)} disabled={updateStatus.isPending} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#f99a9d] text-[14px] font-extrabold text-white hover:bg-[#f57c80]"><Trash2 className="h-[17px] w-[17px]" />{c.deleteBtn}</button>
                    </article>
                  );
                })}</div>
              : <EmptyState
                  icon={Plus}
                  title={search || status !== "all" ? c.emptyFilterTitle : c.emptyTitle}
                  detail={search || status !== "all" ? c.emptyFilterDetail : c.emptyDetail}
                  action={!search && status === "all" ? <PrimaryButton onClick={openNew}><Plus className="h-4 w-4" />{c.createCampaignBtn}</PrimaryButton> : undefined}
                />}
        </Panel>
      </div>

      {showForm && (
        <Modal title={editingCampaign ? c.editBtn : c.modalTitle} onClose={() => setShowForm(false)} wide>
          <form className="space-y-5" onSubmit={(event) => void submit(event)}>
            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldName}</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="campaign-name" />
            </label>

            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldAccount}</span>
              <select value={form.accountId} onChange={(event) => changeAccount(event.target.value)} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="campaign-account">
                <option value="">{c.fieldAccountPlaceholder}</option>
                {connectedAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}{account.phone ? ` · ${account.phone}` : ""}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldTemplate}</span>
              <select value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })} disabled={!form.accountId} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] disabled:bg-[#f8fafc]" data-testid="campaign-template">
                <option value="">{c.fieldTemplatePlaceholder}</option>
                {accountTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}{template.mode === "forward" ? " · Forward" : ""}</option>)}
              </select>
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[14px] font-bold text-[#0f172a]">{c.fieldDestinations}</span>
                {form.accountId && (
                  <button type="button" onClick={toggleAllDestinations} className="text-[12px] font-extrabold text-[#1d3bb8]">
                    {accountDestinations.length && accountDestinations.every((item) => form.destinationIds.includes(item.id)) ? c.deselectAll : c.selectAll}
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-[#e2e8f0] p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                  <input value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder={c.searchGroupPlaceholder} className="h-10 w-full rounded-xl border border-[#e2e8f0] pl-9 pr-3 text-[14px] font-medium outline-none focus:border-[#1a2b88]" />
                </div>
                {!form.accountId
                  ? <p className="px-1 py-4 text-[13px] font-medium leading-relaxed text-[#64748b]">{c.pickAccountHint}</p>
                  : <div className="mt-2 max-h-40 divide-y divide-[#f1f5f9] overflow-y-auto">
                      {accountDestinations.length
                        ? accountDestinations.map((destination) => (
                            <button type="button" key={destination.id} onClick={() => toggleDestination(destination.id)} className="flex w-full items-center gap-3 px-2 py-2.5 text-left">
                              <span className="text-[#1d3bb8]">{form.destinationIds.includes(destination.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-[#cbd5e1]" />}</span>
                              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#334155]">{destination.title}</span>
                            </button>
                          ))
                        : <p className="px-2 py-4 text-[13px] font-medium text-[#64748b]">{c.noGroupsHint}</p>}
                    </div>}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldRepeatCount}</span>
              <span className="mb-2 block text-[12px] font-medium text-[#64748b]">{c.repeatCountHint}</span>
              <input type="number" min="1" max="300" value={form.repeatCount} onChange={(event) => setForm({ ...form, repeatCount: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
            </label>

            <div className="border-t border-[#eef2f6] pt-5">
              <p className="mb-4 text-[13px] font-medium text-[#64748b]">{c.delayBetweenGroups}</p>
              <DelayFields
                form={form}
                setForm={setForm}
                firstLabel={c.delayMinGroupLabel}
                secondLabel={c.delayMaxGroupLabel}
                firstKey="delayMinSeconds"
                secondKey="delayMaxSeconds"
                max={120}
                maxHint={c.delayMaxHint}
              />
            </div>

            <div>
              <p className="mb-4 text-[13px] font-medium text-[#64748b]">{c.delayBetweenRounds}</p>
              <DelayFields
                form={form}
                setForm={setForm}
                firstLabel={c.delayMinRoundLabel}
                secondLabel={c.delayMaxRoundLabel}
                firstKey="roundDelayMinSeconds"
                secondKey="roundDelayMaxSeconds"
                max={259200}
                maxHint={c.delayMaxHint}
              />
            </div>

            <div>
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldSchedule}</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input type="date" value={form.scheduleDate} onChange={(event) => setForm({ ...form, scheduleDate: event.target.value })} className="h-11 rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
                <input type="time" value={form.scheduleTime} onChange={(event) => setForm({ ...form, scheduleTime: event.target.value })} className="h-11 rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
              </div>
            </div>

            {formError && <p className="rounded-xl bg-[#fff1f2] px-3.5 py-3 text-[13px] font-semibold text-[#be123c]">{formError}</p>}

            <PrimaryButton type="submit" disabled={createCampaign.isPending} onClick={() => undefined}>
              {(createCampaign.isPending || updateStatus.isPending) && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {editingCampaign ? c.editBtn : c.createCampaignBtn}
            </PrimaryButton>
          </form>
        </Modal>
      )}

      {details && (
        <Modal title={details.name} description={`${c.detailStatusPrefix} ${statusLabel(details.status, c)}`} onClose={() => setDetails(null)}>
          <div className="space-y-4 text-[14px]">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label={c.detailStatTotal} value={String(details.targetCount)} />
              <Stat label={c.detailStatSent} value={String(details.sentCount)} />
              <Stat label={c.detailStatErrors} value={String(details.failedCount)} />
            </div>
            <div className="rounded-xl bg-[#f8fafc] p-4 text-[#475569]">
              <p><b>{c.detailRepeat}</b> {details.repeatCount} {c.detailRounds}</p>
              <p className="mt-1"><b>{c.detailDelayGroup}</b> {details.delayMinSeconds}–{details.delayMaxSeconds}s</p>
              <p className="mt-1"><b>{c.detailDelayRound}</b> {details.roundDelayMinSeconds}–{details.roundDelayMaxSeconds}s</p>
              <p className="mt-1"><b>{c.detailSchedule}</b> {formatSchedule(details.scheduledAt, language)}</p>
            </div>
            <p className="whitespace-pre-wrap rounded-xl border border-[#e2e8f0] p-4 font-medium text-[#334155]">
              {details.templateMode === "forward" ? c.detailForwardNote : details.content}
            </p>
             <div>
               {(() => {
                 const waiting = details.errors.filter(isWaitingRetry);
                 const failures = details.errors.filter((error) => !isWaitingRetry(error));
                 return (
                   <>
                     {waiting.length > 0 && (
                       <div className="mb-4">
                         <h3 className="mb-2 text-[13px] font-extrabold text-[#92400e]">{c.detailWaitingTitle}</h3>
                         <div className="space-y-2">
                           {waiting.map((error) => (
                              <div key={`${error.destinationId}-${error.status}-${error.attempts}-${retryTimestamp(error.nextAttemptAt)}`} className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-[12px] text-[#92400e]">
                               <div className="flex items-start justify-between gap-3">
                                 <strong>{error.destinationTitle}</strong>
                                 <span className="shrink-0 font-bold">{c.detailWaitingStatus}</span>
                               </div>
                               <p className="mt-2 text-[16px]">{c.detailWaitingCountdown} <RetryCountdown nextAttemptAt={error.nextAttemptAt!} /></p>
                               <p className="mt-1 font-medium">{c.detailWaitingMessage}</p>
                               {error.nextAttemptAt && <p className="mt-1 text-[11px] font-semibold">{c.detailErrorNextRetry} {formatSchedule(error.nextAttemptAt, language)}</p>}
                             </div>
                           ))}
                         </div>
                       </div>
                     )}
                     {failures.length > 0 ? (
                       <div>
                         <h3 className="mb-2 text-[13px] font-extrabold text-[#be123c]">{c.detailErrorTitle}</h3>
                         <div className="space-y-2">
                           {failures.map((error) => (
                             <div key={`${error.destinationId}-${error.status}-${error.attempts}-${retryTimestamp(error.nextAttemptAt)}`} className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] p-3 text-[12px] text-[#881337]">
                               <div className="flex items-start justify-between gap-3">
                                 <strong>{error.destinationTitle}</strong>
                                 <span className="shrink-0 font-bold">{error.attempts} {c.detailErrorAttempts}</span>
                               </div>
                               <p className="mt-1 break-words font-medium">{error.lastError ?? c.genericError}</p>
                               {error.nextAttemptAt && <p className="mt-1 text-[11px] font-semibold">{c.detailErrorNextRetry} {formatSchedule(error.nextAttemptAt, language)}</p>}
                             </div>
                           ))}
                         </div>
                       </div>
                     ) : waiting.length === 0 ? (
                       <p className="rounded-xl bg-[#f8fafc] p-3 text-[13px] font-medium text-[#64748b]">{c.detailErrorEmpty}</p>
                     ) : null}
                   </>
                 );
               })()}
             </div>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function DelayFields({
  form,
  setForm,
  firstLabel,
  secondLabel,
  firstKey,
  secondKey,
  max,
  maxHint,
}: {
  form: CampaignForm;
  setForm: (form: CampaignForm) => void;
  firstLabel: string;
  secondLabel: string;
  firstKey: "delayMinSeconds" | "roundDelayMinSeconds";
  secondKey: "delayMaxSeconds" | "roundDelayMaxSeconds";
  max: number;
  maxHint: (max: number) => string;
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-bold text-[#0f172a]">{firstLabel}</span>
        <span className="mb-2 block text-[12px] font-medium text-[#64748b]">{maxHint(max)}</span>
        <input type="number" min="0" max={max} value={form[firstKey]} onChange={(event) => setForm({ ...form, [firstKey]: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-bold text-[#0f172a]">{secondLabel}</span>
        <span className="mb-2 block text-[12px] font-medium text-[#64748b]">{maxHint(max)}</span>
        <input type="number" min="0" max={max} value={form[secondKey]} onChange={(event) => setForm({ ...form, [secondKey]: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
      </label>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f8fafc] p-3">
      <p className="text-[11px] font-bold text-[#64748b]">{label}</p>
      <p className="mt-1 text-[18px] font-extrabold text-[#0f172a]">{value}</p>
    </div>
  );
}
