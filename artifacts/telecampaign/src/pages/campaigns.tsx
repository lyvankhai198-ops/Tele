import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  CircleStop,
  Clock3,
  Eye,
  LoaderCircle,
  CirclePause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Campaign, MessageTemplate } from "@workspace/api-client-react";
import {
  deleteCampaign,
  useCloneCampaign,
  useGetCampaignCloneReadiness,
  useGetTelegramSavedMessage,
  useBulkControlCampaigns,
  useBulkUpdateCampaignTemplate,
  useListCampaigns,
  useListMessageTemplates,
  useListTelegramAccounts,
  useListTelegramSavedMessages,
  useUpdateMessageTemplate,
  useUpdateCampaignStatus,
} from "@workspace/api-client-react";
import { CampaignFormModal } from "@/components/campaign-form-modal";
import { AppLayout, EmptyState, Modal, Panel, PrimaryButton, Toast } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { localizedDeliveryErrorMessage, localizedErrorMessage, useLanguage } from "@/lib/i18n";
import { useLocation, useSearch } from "wouter";

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
    temporaryRestrictionNote: (time: string) => `Safety time applied; this campaign will continue at ${time}.`,
    detailsBtn: "Details",
    pauseBtn: "Pause",
    resumeBtn: "Resume",
    bulkPauseBtn: "Stop all",
    bulkResumeBtn: "Run all",
    bulkTemplateBtn: "Change automatic templates",
    bulkPauseConfirm: (count: number) => `Pause ${count} active campaign${count === 1 ? "" : "s"}?`,
    bulkResumeTitle: "Run campaigns",
    bulkResumeDetail: "Choose which filtered campaign status to run. Running campaigns are not changed.",
    bulkScopeLabel: "Campaigns to run",
    bulkScopeDraft: "Draft campaigns",
    bulkScopeQueued: "Queued campaigns",
    bulkScopePaused: "Paused campaigns",
    bulkScopeCompleted: "Completed campaigns (new run)",
    bulkScopeHint: "Completed campaigns create a new run and keep the previous history.",
    bulkIntervalLabel: "Gap between campaign starts (minutes)",
    bulkIntervalHint: "The next campaign starts after this gap.",
    bulkStartDateLabel: "Schedule date",
    bulkStartTimeLabel: "First start time",
    bulkApply: "Run selected campaigns",
    bulkCancel: "Cancel",
    bulkTemplateTitle: "Change automatic campaign templates",
    bulkTemplateDetail: "Only campaigns whose name starts with “Tự động” and are Draft, Paused, or Running are included. Other campaigns are not changed.",
    bulkTemplateLabel: "New message template",
    bulkTemplatePlaceholder: "Select a message template",
    bulkTemplateScope: (count: number) => `${count} automatic campaign${count === 1 ? "" : "s"} will be updated.`,
    bulkTemplateNoCandidates: "There are no matching automatic campaigns in Draft, Paused, or Running status.",
    bulkTemplateNoTemplates: "Create a message template before using this action.",
    bulkTemplateApply: "Change templates",
    bulkTemplateResult: (updated: number, skipped: number) => `Changed ${updated} automatic campaign${updated === 1 ? "" : "s"}${skipped ? `; ${skipped} skipped.` : "."}`,
    bulkTemplatePreviewMore: (count: number) => `and ${count} more…`,
    bulkNoActive: "There are no active campaigns to stop.",
    bulkNoPaused: "There are no paused campaigns with pending deliveries.",
    bulkNoEligible: "There are no campaigns available for this status filter.",
    bulkPausedResult: (count: number) => `Paused ${count} campaign${count === 1 ? "" : "s"}.`,
    bulkResumedResult: (count: number, skipped: number) => `Queued ${count} campaign${count === 1 ? "" : "s"}${skipped ? `; ${skipped} skipped.` : "."}`,
    editBtn: "Edit",
    cloneBtn: "Clone",
    deleteBtn: "Delete",
    errorsLabel: "Errors",
    dailyQuotaLabel: "Today",
    dailyQuotaValue: (used: number, limit: number) => `${used}/${limit}`,
    dailyQuotaUnlimited: (used: number) => `${used} sent · Unlimited`,
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
    generalTopic: "General",
    topicBadge: "Topic",
    fieldRepeatCount: "Repeat count",
    repeatCountHint: "Max 300 (admin configured).",
    delayBetweenRounds: "Delay between rounds",
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
    toastReopened: "Campaign updated and reopened for delivery.",
    toastPaused: "Campaign paused.",
    toastResumed: "Campaign resumed.",
    automaticResume: "Will resume automatically on a new day",
    toastDeleted: "Campaign deleted.",
    toastCloned: "Campaign copied as a draft. Review it before running.",
    toastError: (msg: string) => msg,
    confirmDelete: (name: string) => `Delete campaign "${name}"?`,
    detailStatusPrefix: "Status:",
    detailStatTotal: "Total",
    detailStatSent: "Sent",
    detailStatErrors: "Errors",
    detailDailyQuota: "Today's campaign quota",
    detailRepeat: "Repeat:",
    detailRounds: "rounds",
    detailDelayRound: "Round delay:",
    detailSchedule: "Scheduled:",
    detailForwardNote: "This template will be forwarded from Saved Messages.",
    detailLiveForwardContent: "Current content from Saved Messages",
    detailLiveForwardLoading: "Loading the current Saved Message…",
    detailLiveForwardUnavailable: "The current Saved Message could not be loaded. Check the Telegram account and message, then try again.",
    detailViewTemplate: "View template",
    detailTemplateContent: "Template content",
    detailForwardContent: "This template forwards the original saved message.",
    clonedDraft: "This cloned draft is waiting for a Saved Message before it can run.",
    userClonedDraft: "This copy is a draft. You can change its account, message template, and destinations before running it.",
    cloneTitle: "Clone campaign",
    cloneDetail: "Create a separate draft without delivery history, retries, sent counts, or quota reservations.",
    cloneSource: "Source campaign",
    cloneTargetAccount: "Send with Telegram account",
    cloneTargetAccountPlaceholder: "Choose a connected account",
    cloneNoConnectedAccounts: "Connect a Telegram account before cloning this campaign.",
    cloneSubmit: "Create draft copy",
    cloneCancel: "Cancel",
    cloneRunTitle: "Choose Saved Message",
    cloneRunDetail: "The message will be forwarded from this admin Telegram account after you confirm.",
    cloneRunAccount: "Telegram account",
    cloneRunMessage: "Saved Message",
    cloneRunMessagePlaceholder: "Choose a saved message",
    cloneRunConfirm: "Confirm & run campaign",
    cloneRunCancel: "Cancel",
    cloneRunMissing: "Choose a Saved Message before running this campaign.",
    clonedFieldsFixed: "The Telegram account and forward template are fixed for this cloned campaign. Choose the Saved Message when you run it.",
    detailWaitingTitle: "Waiting to send",
    detailWaitingStatus: "Waiting",
    detailWaitingMessage: "The campaign will send automatically when the scheduled wait is over.",
    detailWaitingCountdown: "Send countdown:",
    detailNextSend: "Next send:",
    detailErrorTitle: "Delivery errors",
    detailErrorEmpty: "No delivery errors recorded.",
    detailErrorAttempts: "attempts",
    detailErrorRecordedAt: "Recorded:",
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
    temporaryRestrictionNote: (time: string) => `Đã dùng thời gian an toàn; chiến dịch sẽ tiếp tục lúc ${time}.`,
    detailsBtn: "Chi tiết",
    pauseBtn: "Dừng",
    resumeBtn: "Tiếp tục",
    bulkPauseBtn: "Dừng tất cả",
    bulkResumeBtn: "Chạy lại tất cả",
    bulkTemplateBtn: "Đổi mẫu tin tự động",
    bulkPauseConfirm: (count: number) => `Tạm dừng ${count} chiến dịch đang chạy?`,
    bulkResumeTitle: "Chạy lại chiến dịch",
    bulkResumeDetail: "Chọn trạng thái chiến dịch cần chạy theo bộ lọc. Chiến dịch đang chạy sẽ không bị đổi.",
    bulkScopeLabel: "Chiến dịch cần chạy",
    bulkScopeDraft: "Chiến dịch bản nháp",
    bulkScopeQueued: "Chiến dịch đang chờ",
    bulkScopePaused: "Chiến dịch đã dừng",
    bulkScopeCompleted: "Chiến dịch hoàn thành (tạo lượt mới)",
    bulkScopeHint: "Chiến dịch hoàn thành sẽ tạo lượt chạy mới và giữ nguyên lịch sử cũ.",
    bulkIntervalLabel: "Khoảng cách giữa thời điểm bắt đầu campaign (phút)",
    bulkIntervalHint: "Campaign tiếp theo sẽ bắt đầu sau khoảng thời gian này.",
    bulkStartDateLabel: "Ngày bắt đầu",
    bulkStartTimeLabel: "Giờ bắt đầu đầu tiên",
    bulkApply: "Chạy các chiến dịch đã chọn",
    bulkCancel: "Hủy",
    bulkTemplateTitle: "Đổi mẫu tin chiến dịch tự động",
    bulkTemplateDetail: "Chỉ campaign có tên bắt đầu bằng “Tự động” và đang ở trạng thái Bản nháp, Tạm dừng hoặc Đang chạy mới được đổi. Campaign khác không bị tác động.",
    bulkTemplateLabel: "Mẫu tin nhắn mới",
    bulkTemplatePlaceholder: "Chọn mẫu tin nhắn",
    bulkTemplateScope: (count: number) => `Sẽ cập nhật ${count} campaign tự động.`,
    bulkTemplateNoCandidates: "Không có campaign tự động phù hợp ở trạng thái Bản nháp, Tạm dừng hoặc Đang chạy.",
    bulkTemplateNoTemplates: "Hãy tạo mẫu tin nhắn trước khi dùng thao tác này.",
    bulkTemplateApply: "Đổi mẫu tin",
    bulkTemplateResult: (updated: number, skipped: number) => `Đã đổi mẫu tin cho ${updated} campaign tự động${skipped ? `; bỏ qua ${skipped} campaign.` : "."}`,
    bulkTemplatePreviewMore: (count: number) => `và ${count} campaign khác…`,
    bulkNoActive: "Không có chiến dịch đang chạy để dừng.",
    bulkNoPaused: "Không có chiến dịch đã dừng còn lượt gửi chờ.",
    bulkNoEligible: "Không có chiến dịch phù hợp với bộ lọc trạng thái hiện tại.",
    bulkPausedResult: (count: number) => `Đã dừng ${count} chiến dịch.`,
    bulkResumedResult: (count: number, skipped: number) => `Đã xếp lịch ${count} chiến dịch${skipped ? `; bỏ qua ${skipped} chiến dịch.` : "."}`,
    editBtn: "Chỉnh sửa",
    cloneBtn: "Nhân bản",
    deleteBtn: "Xóa",
    errorsLabel: "Lỗi",
    dailyQuotaLabel: "Hôm nay",
    dailyQuotaValue: (used: number, limit: number) => `${used}/${limit}`,
    dailyQuotaUnlimited: (used: number) => `${used} đã gửi · Không giới hạn`,
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
    generalTopic: "Chung",
    topicBadge: "Chủ đề",
    fieldRepeatCount: "Số lần lặp",
    repeatCountHint: "Tối đa 300 (admin cấu hình).",
    delayBetweenRounds: "Delay giữa các vòng lặp",
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
    toastReopened: "Đã cập nhật và mở lại chiến dịch để gửi.",
    toastPaused: "Đã dừng chiến dịch.",
    toastResumed: "Chiến dịch đã tiếp tục.",
    automaticResume: "Tự động chạy lại vào ngày mới",
    toastDeleted: "Đã xóa chiến dịch.",
    toastCloned: "Đã tạo bản sao ở dạng nháp. Hãy kiểm tra trước khi chạy.",
    toastError: (msg: string) => msg,
    confirmDelete: (name: string) => `Xóa chiến dịch "${name}"?`,
    detailStatusPrefix: "Trạng thái:",
    detailStatTotal: "Tổng gửi",
    detailStatSent: "Đã gửi",
    detailStatErrors: "Lỗi",
    detailDailyQuota: "Quota chiến dịch hôm nay",
    detailRepeat: "Lặp:",
    detailRounds: "vòng",
    detailDelayRound: "Delay vòng:",
    detailSchedule: "Lên lịch:",
    detailForwardNote: "Mẫu này sẽ được chuyển tiếp từ Tin nhắn đã lưu.",
    detailLiveForwardContent: "Nội dung hiện tại từ Tin nhắn đã lưu",
    detailLiveForwardLoading: "Đang tải nội dung Tin nhắn đã lưu hiện tại...",
    detailLiveForwardUnavailable: "Không thể tải Tin nhắn đã lưu hiện tại. Hãy kiểm tra tài khoản Telegram và tin nhắn, sau đó thử lại.",
    detailViewTemplate: "Xem mẫu",
    detailTemplateContent: "Nội dung mẫu",
    detailForwardContent: "Mẫu này sẽ chuyển tiếp đúng tin nhắn gốc đã lưu.",
    clonedDraft: "Bản clone này đang chờ chọn Tin nhắn đã lưu trước khi có thể chạy.",
    userClonedDraft: "Bản sao này đang là nháp. Bạn có thể đổi tài khoản, mẫu tin và nhóm gửi trước khi chạy.",
    cloneTitle: "Nhân bản chiến dịch",
    cloneDetail: "Tạo bản nháp độc lập, không sao chép lịch sử gửi, retry, số lượng đã gửi hoặc quota đã giữ chỗ.",
    cloneSource: "Chiến dịch nguồn",
    cloneTargetAccount: "Gửi bằng tài khoản Telegram",
    cloneTargetAccountPlaceholder: "Chọn tài khoản đã kết nối",
    cloneNoConnectedAccounts: "Hãy kết nối tài khoản Telegram trước khi nhân bản chiến dịch.",
    cloneSubmit: "Tạo bản nháp",
    cloneCancel: "Hủy",
    cloneRunTitle: "Chọn Tin nhắn đã lưu",
    cloneRunDetail: "Tin nhắn sẽ được forward từ tài khoản Telegram admin này sau khi bạn xác nhận.",
    cloneRunAccount: "Tài khoản Telegram",
    cloneRunMessage: "Tin nhắn đã lưu",
    cloneRunMessagePlaceholder: "Chọn một tin nhắn đã lưu",
    cloneRunConfirm: "Xác nhận & chạy chiến dịch",
    cloneRunCancel: "Hủy",
    cloneRunMissing: "Hãy chọn Tin nhắn đã lưu trước khi chạy chiến dịch này.",
    clonedFieldsFixed: "Tài khoản Telegram và mẫu forward được cố định cho bản clone này. Hãy chọn Tin nhắn đã lưu khi chạy chiến dịch.",
    detailWaitingTitle: "Đang chờ gửi",
    detailWaitingStatus: "Đang chờ",
    detailWaitingMessage: "Chiến dịch sẽ tự động gửi khi hết thời gian chờ.",
    detailWaitingCountdown: "Đếm ngược lần gửi:",
    detailNextSend: "Lần gửi tiếp:",
    detailErrorTitle: "Chi tiết lỗi gửi",
    detailErrorEmpty: "Chưa ghi nhận lỗi gửi.",
    detailErrorAttempts: "lần thử",
    detailErrorRecordedAt: "Ghi nhận lúc:",
    detailErrorNextRetry: "Lần thử tiếp:",
    genericError: "Không thể hoàn tất thao tác. Vui lòng thử lại.",
  },
} as const;

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

function localDateInputValue(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeInputValue(value = new Date()) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function formatErrorRecordedAt(value: Date | string, language: "en" | "vi") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
    year: "numeric",
    month: language === "vi" ? "2-digit" : "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function isWaitingRetry(error: Campaign["errors"][number]) {
  return error.status === "pending" && Boolean(error.nextAttemptAt);
}

function temporaryRestrictionCampaignNote(
  campaign: Campaign,
  language: "en" | "vi",
  c: (typeof copy)["en"] | (typeof copy)["vi"],
) {
  const waiting = campaign.errors.find((error) =>
    error.status === "pending"
    && Boolean(error.nextAttemptAt)
    && error.lastError?.startsWith("temporary_telegram_restriction:"),
  );
  return waiting?.nextAttemptAt
    ? c.temporaryRestrictionNote(formatSchedule(waiting.nextAttemptAt, language))
    : null;
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
    completed_with_errors: c.statusCompleted,
    cancelled: c.statusCancelled,
  };
  return map[status] ?? status;
}

function isActive(status: string) {
  return status === "queued" || status === "running";
}

type BulkResumeScope = "draft" | "queued" | "paused" | "completed";

function campaignDailyQuotaLabel(
  campaign: Campaign,
  c: (typeof copy)["en"] | (typeof copy)["vi"],
) {
  const { limit, used } = campaign.dailyQuota;
  return limit === null ? c.dailyQuotaUnlimited(used) : c.dailyQuotaValue(used, limit);
}

function resumesAfterDailyQuota(campaign: Campaign) {
  return campaign.status === "paused" && campaign.errors.some((error) => (
    /Daily (?:user )?message limit reached\. Campaign (?:paused (?:until you resume it|and will resume automatically)|will resume automatically) on a new day\./i.test(error.lastError ?? "")
  ));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Campaigns() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isSupportMode = Boolean(user?.support);
  const isAdmin = user?.role === "admin" && !isSupportMode;
  const c = copy[language];
  const [, setLocation] = useLocation();
  const searchParams = useSearch();

  const campaigns = useListCampaigns();
  const accounts = useListTelegramAccounts();
  const templates = useListMessageTemplates();
  const cloneCampaign = useCloneCampaign();
  const bulkControl = useBulkControlCampaigns();
  const bulkTemplate = useBulkUpdateCampaignTemplate();
  const updateStatus = useUpdateCampaignStatus();
  const updateTemplate = useUpdateMessageTemplate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [details, setDetails] = useState<Campaign | null>(null);
  const [highlightedCampaignId, setHighlightedCampaignId] = useState<string | null>(null);
  const [templatePreview, setTemplatePreview] = useState<MessageTemplate | null>(null);
  const [forwardPreviewSource, setForwardPreviewSource] = useState<{ accountId: string; messageId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [forwardCampaign, setForwardCampaign] = useState<Campaign | null>(null);
  const [forwardSourceMessageId, setForwardSourceMessageId] = useState("");
  const [cloneSourceCampaign, setCloneSourceCampaign] = useState<Campaign | null>(null);
  const [cloneTargetAccountId, setCloneTargetAccountId] = useState("");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [bulkResumeOpen, setBulkResumeOpen] = useState(false);
  const [bulkResumeScope, setBulkResumeScope] = useState<BulkResumeScope>("paused");
  const [bulkIntervalMinutes, setBulkIntervalMinutes] = useState("");
  const [bulkScheduleDate, setBulkScheduleDate] = useState(() => localDateInputValue());
  const [bulkScheduleTime, setBulkScheduleTime] = useState(() => localTimeInputValue());
  const [bulkTemplateOpen, setBulkTemplateOpen] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const cloneReadiness = useGetCampaignCloneReadiness(forwardCampaign?.id ?? "", {
    query: { enabled: Boolean(forwardCampaign?.id) } as any,
  });
  const forwardSavedMessages = useListTelegramSavedMessages(forwardCampaign?.telegramAccountId ?? "", {
    query: { enabled: Boolean(forwardCampaign?.telegramAccountId) } as any,
  });
  const liveForwardPreview = useGetTelegramSavedMessage(
    forwardPreviewSource?.accountId ?? "",
    forwardPreviewSource?.messageId ?? "",
    {
      query: {
        enabled: Boolean(forwardPreviewSource?.accountId && forwardPreviewSource?.messageId),
        refetchOnMount: "always",
        staleTime: 0,
      } as any,
    },
  );

  const connectedAccounts = (accounts.data ?? []).filter((account) => account.status === "connected");
  const listedCampaigns = useMemo(() => (campaigns.data ?? []).filter((campaign) => {
    const needle = search.trim().toLowerCase();
    const matchesStatus = status === "all"
      || campaign.status === status
      || (status === "completed" && campaign.status === "completed_with_errors");
    return (!needle || campaign.name.toLowerCase().includes(needle)) && matchesStatus;
  }).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()), [campaigns.data, search, status]);
  const latestCompletedCampaignId = useMemo(() => {
    const completed = (campaigns.data ?? [])
      .filter((campaign) => campaign.status === "completed" || campaign.status === "completed_with_errors")
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    return completed[0]?.id ?? null;
  }, [campaigns.data]);
  const bulkScopeOptions = useMemo(() => {
    const available = new Set<BulkResumeScope>();
    for (const campaign of campaigns.data ?? []) {
      if (campaign.status === "draft") available.add("draft");
      if (campaign.status === "queued") available.add("queued");
      if (campaign.status === "paused") available.add("paused");
      if (campaign.status === "completed" || campaign.status === "completed_with_errors") available.add("completed");
    }
    if (status === "draft") return available.has("draft") ? ["draft" as const] : [];
    if (status === "queued") return available.has("queued") ? ["queued" as const] : [];
    if (status === "paused") return available.has("paused") ? ["paused" as const] : [];
    if (status === "completed") return available.has("completed") ? ["completed" as const] : [];
    return (["draft", "queued", "paused", "completed"] as const).filter((scope) => available.has(scope));
  }, [campaigns.data, status]);
  const automaticCampaigns = useMemo(() => (campaigns.data ?? []).filter((campaign) =>
    campaign.name.startsWith("Tự động")
    && ["draft", "paused", "queued", "running"].includes(campaign.status),
  ), [campaigns.data]);
  const detailTemplate = details?.templateId
    ? (templates.data ?? []).find((template) => template.id === details.templateId) ?? null
    : null;

  function openNew() {
    setEditingCampaign(null);
    setShowForm(true);
  }

  function openEdit(campaign: Campaign) {
    setEditingCampaign(campaign);
    setShowForm(true);
  }

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const requestedStatus = params.get("status");
    if (requestedStatus === "completed" && status !== "completed") {
      setStatus("completed");
      return;
    }
    const editCampaignId = params.get("editCampaignId");
    if (!editCampaignId || !campaigns.data) return;
    const campaign = campaigns.data.find((item) => item.id === editCampaignId);
    if (!campaign) return;
    openEdit(campaign);
    setLocation("/dashboard/campaigns", { replace: true });
  }, [campaigns.data, searchParams, setLocation, status]);

  useEffect(() => {
    const focusCampaignId = new URLSearchParams(searchParams).get("focusCampaignId");
    if (!focusCampaignId || !campaigns.data) return;
    const campaign = campaigns.data.find((item) => item.id === focusCampaignId);
    if (!campaign) return;
    setHighlightedCampaignId(campaign.id);
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-testid="campaign-row-${focusCampaignId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setLocation("/dashboard/campaigns?status=completed", { replace: true });
  }, [campaigns.data, searchParams, setLocation]);

  async function handleFormSaved() {
    const reopeningCompletedCampaign = editingCampaign?.status === "completed" || editingCampaign?.status === "completed_with_errors";
    await Promise.all([campaigns.refetch(), templates.refetch()]);
    setShowForm(false);
    setEditingCampaign(null);
    setToast(reopeningCompletedCampaign ? c.toastReopened : editingCampaign ? c.toastUpdated : c.toastCreated);
  }

  function openClone(campaign: Campaign) {
    const preferredAccount = connectedAccounts.find((account) => account.id === campaign.telegramAccountId) ?? connectedAccounts[0];
    setCloneSourceCampaign(campaign);
    setCloneTargetAccountId(preferredAccount?.id ?? "");
    setCloneError(null);
  }

  async function changeCampaignStatus(campaign: Campaign, nextStatus: "queued" | "paused") {
    try {
      const updatedCampaign = await updateStatus.mutateAsync({ campaignId: campaign.id, data: { status: nextStatus } });
      if (details?.id === campaign.id) setDetails(updatedCampaign);
      await campaigns.refetch();
      setToast(nextStatus === "paused" ? c.toastPaused : c.toastResumed);
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  async function pauseAllCampaigns() {
    const activeCount = (campaigns.data ?? []).filter((campaign) => isActive(campaign.status)).length;
    if (!activeCount) {
      setToast(c.bulkNoActive);
      return;
    }
    if (!window.confirm(c.bulkPauseConfirm(activeCount))) return;
    try {
      const result = await bulkControl.mutateAsync({ data: { action: "pause" } });
      await campaigns.refetch();
      setToast(c.bulkPausedResult(result.updatedCount));
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  function openBulkResume() {
    if (!bulkScopeOptions.length) {
      setToast(c.bulkNoEligible);
      return;
    }
    const now = new Date();
    setBulkResumeScope(bulkScopeOptions[0]);
    setBulkIntervalMinutes("");
    setBulkScheduleDate(localDateInputValue(now));
    setBulkScheduleTime(localTimeInputValue(now));
    setBulkResumeOpen(true);
  }

  async function submitBulkResume() {
    const intervalMinutes = Number(bulkIntervalMinutes.trim());
    if (!bulkIntervalMinutes.trim() || !Number.isInteger(intervalMinutes) || intervalMinutes < 0 || intervalMinutes > 4320 || !bulkScheduleDate || !bulkScheduleTime) {
      setToast(c.genericError);
      return;
    }
    try {
      const scheduledAt = new Date(`${bulkScheduleDate}T${bulkScheduleTime}:00`);
      if (Number.isNaN(scheduledAt.getTime())) {
        setToast(c.genericError);
        return;
      }
      const result = await bulkControl.mutateAsync({
        data: {
          action: "resume",
          scope: bulkResumeScope,
          intervalSeconds: intervalMinutes * 60,
          scheduledAt: scheduledAt.toISOString(),
        },
      });
      await campaigns.refetch();
      setBulkResumeOpen(false);
      setToast(c.bulkResumedResult(result.updatedCount, result.skippedCount));
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  function openBulkTemplate() {
    if (!automaticCampaigns.length) {
      setToast(c.bulkTemplateNoCandidates);
      return;
    }
    setBulkTemplateId("");
    setBulkTemplateOpen(true);
  }

  async function submitBulkTemplate() {
    if (!bulkTemplateId) {
      setToast(c.bulkTemplateNoTemplates);
      return;
    }
    try {
      const result = await bulkTemplate.mutateAsync({ data: { templateId: bulkTemplateId } });
      await campaigns.refetch();
      setBulkTemplateOpen(false);
      setToast(c.bulkTemplateResult(result.updatedCount, result.skippedCount));
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  function requestQueue(campaign: Campaign) {
    if (campaign.cloneMode === "admin") {
      setForwardCampaign(campaign);
      setForwardSourceMessageId("");
      return;
    }
    void changeCampaignStatus(campaign, "queued");
  }

  async function submitClone() {
    if (!cloneSourceCampaign || !cloneTargetAccountId) {
      setCloneError(c.cloneNoConnectedAccounts);
      return;
    }
    setCloneError(null);
    try {
      const clonedCampaign = await cloneCampaign.mutateAsync({
        campaignId: cloneSourceCampaign.id,
        data: { telegramAccountId: cloneTargetAccountId },
      });
      await campaigns.refetch();
      setCloneSourceCampaign(null);
      setCloneTargetAccountId("");
      setToast(c.toastCloned);
      openEdit(clonedCampaign);
    } catch (error) {
      setCloneError(localizedErrorMessage(error, language, c.genericError));
    }
  }

  async function confirmClonedCampaignRun() {
    if (!forwardCampaign?.templateId || !forwardCampaign.telegramAccountId) {
      setToast(c.genericError);
      return;
    }
    if (!forwardSourceMessageId) {
      setToast(c.cloneRunMissing);
      return;
    }
    if (!cloneReadiness.data?.accountReady || cloneReadiness.data.destinations.some((destination) => !destination.ready)) {
      setToast("Đồng bộ tài khoản Telegram admin và xử lý các destination chưa có quyền gửi trước khi chạy.");
      return;
    }
    try {
      await updateTemplate.mutateAsync({
        templateId: forwardCampaign.templateId,
        data: {
          mode: "forward",
          sourceAccountId: forwardCampaign.telegramAccountId,
          sourceMessageId: forwardSourceMessageId,
        },
      });
      await updateStatus.mutateAsync({ campaignId: forwardCampaign.id, data: { status: "queued" } });
      await Promise.all([campaigns.refetch(), templates.refetch()]);
      setForwardCampaign(null);
      setForwardSourceMessageId("");
      setToast(c.toastResumed);
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
      !isSupportMode && <button onClick={openNew} className="grid h-10 w-11 place-items-center rounded-xl bg-[#1d3bb8] text-white shadow-sm transition hover:bg-[#19329c]" aria-label={c.addAriaLabel} data-testid="campaigns-add"><Plus className="h-5 w-5" /></button>
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
          </select>
        </div>
        {!isSupportMode && (
          <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => void pauseAllCampaigns()}
              disabled={bulkControl.isPending || bulkTemplate.isPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f04444] px-3 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="campaigns-pause-all"
            >
              {bulkControl.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleStop className="h-4 w-4" />}
              {c.bulkPauseBtn}
            </button>
            <button
              type="button"
              onClick={openBulkResume}
              disabled={bulkControl.isPending || bulkTemplate.isPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1d3bb8] px-3 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#19329c] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="campaigns-resume-all"
            >
              {bulkControl.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {c.bulkResumeBtn}
            </button>
            {isAdmin && (<button
              type="button"
              onClick={openBulkTemplate}
              disabled={bulkControl.isPending || bulkTemplate.isPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#1d3bb8] bg-white px-3 text-[13px] font-extrabold text-[#1d3bb8] shadow-sm transition hover:bg-[#eff6ff] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="campaigns-bulk-template"
            >
              {bulkTemplate.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              {c.bulkTemplateBtn}
            </button>)}
          </div>
        )}

        <Panel className="overflow-hidden">
          {campaigns.isLoading
            ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-[#64748b]" /></div>
            : listedCampaigns.length
              ? <div className="divide-y divide-[#eef2f6]">{listedCampaigns.map((campaign) => {
                  const account = (accounts.data ?? []).find((item) => item.id === campaign.telegramAccountId);
                  const complete = campaign.targetCount ? Math.round((campaign.completedCount / campaign.targetCount) * 100) : 0;
                  const autoResumes = resumesAfterDailyQuota(campaign);
                   const safetyNote = temporaryRestrictionCampaignNote(campaign, language, c);
                   const isLatestCompleted = campaign.id === latestCompletedCampaignId;
                   const isHighlighted = campaign.id === highlightedCampaignId;
                   return (
                     <article key={campaign.id} className={`p-4 sm:p-5 ${isHighlighted ? "bg-[#fff7f7] ring-2 ring-inset ring-[#fca5a5]" : isLatestCompleted ? "bg-[#f8fbff]" : ""}`} data-testid={`campaign-row-${campaign.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                           <button onClick={() => setDetails(campaign)} className={`truncate text-left text-[15px] hover:underline ${isHighlighted ? "font-black text-[#b91c1c]" : isLatestCompleted ? "font-black text-[#1839b5]" : "font-extrabold text-[#1839b5]"}`}>{campaign.name}</button>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] font-semibold text-[#64748b]">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${isActive(campaign.status) ? "bg-[#eff6ff] text-[#0f172a]" : campaign.status === "paused" ? "bg-[#fff7ed] text-[#c2410c]" : "bg-[#f1f5f9] text-[#64748b]"}`}>{statusLabel(campaign.status, c)}</span>
                            <span>{campaign.completedCount}/{campaign.targetCount}</span>
                             <span className="rounded-full bg-[#eef6ff] px-2 py-1 text-[#1d4ed8]">{c.dailyQuotaLabel}: {campaignDailyQuotaLabel(campaign, c)}</span>
                            <span>OK {campaign.sentCount} · {c.errorsLabel} {campaign.failedCount}</span>
                          </div>
                        </div>
                        <span className="pt-1 text-[12px] font-extrabold text-[#64748b]">{complete}%</span>
                      </div>
                      <div className="mt-3 space-y-0.5 text-[12px] font-medium text-[#64748b]">
                        <p>{account?.phone ?? account?.name ?? c.accountFallback}</p>
                        <p>{account?.name ?? "—"}</p>
                        <p>{c.scheduledLabel} {formatSchedule(campaign.scheduledAt, language)}</p>
                        <p>{c.detailDelayRound} {campaign.roundDelayMinSeconds}–{campaign.roundDelayMaxSeconds}s</p>
                         {isHighlighted && (
                           <p className="mt-2 rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 font-extrabold leading-relaxed text-[#b91c1c]">
                             Hãy kiểm tra chi tiết lỗi, xem nhóm đang chạy trong chiến dịch có quyền đăng không, sau đó chỉnh sửa để chạy lại chiến dịch.
                           </p>
                         )}
                         {safetyNote && <p className="rounded-lg bg-[#fffbeb] px-2.5 py-2 font-extrabold text-[#92400e]">{safetyNote}</p>}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button onClick={() => setDetails(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e2e8f0] text-[14px] font-extrabold text-[#0f172a] hover:bg-[#f8fafc]"><Eye className="h-[17px] w-[17px]" />{c.detailsBtn}</button>
                        {isSupportMode
                          ? (campaign.status === "draft" || campaign.status === "paused" || campaign.status === "completed" || campaign.status === "completed_with_errors")
                            ? <button onClick={() => openEdit(campaign)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] text-[14px] font-extrabold text-[#334155] hover:bg-[#f8fafc]"><Pencil className="h-[16px] w-[16px]" />{c.editBtn}</button>
                            : <span className="h-10" />
                          : isActive(campaign.status)
                          ? <button onClick={() => void changeCampaignStatus(campaign, "paused")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#f04444] text-[14px] font-extrabold text-white hover:bg-[#dc2626]"><CirclePause className="h-[17px] w-[17px]" />{c.pauseBtn}</button>
                          : campaign.status === "draft"
                             ? <div className="grid grid-cols-2 gap-2">
                               <button onClick={() => openEdit(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] text-[14px] font-extrabold text-[#334155] hover:bg-[#f8fafc]"><Pencil className="h-[16px] w-[16px]" />{c.editBtn}</button>
                               <button onClick={() => requestQueue(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1d3bb8] text-[14px] font-extrabold text-white hover:bg-[#19329c]"><Play className="h-[17px] w-[17px]" />{c.resumeBtn}</button>
                             </div>
                            : campaign.status === "paused"
                              ? <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => openEdit(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] text-[14px] font-extrabold text-[#334155] hover:bg-[#f8fafc]"><Pencil className="h-[16px] w-[16px]" />{c.editBtn}</button>
                                 {autoResumes
                                   ? <span className="inline-flex h-10 items-center justify-center rounded-xl bg-[#eff6ff] px-3 text-center text-[12px] font-extrabold text-[#1d4ed8]">{c.automaticResume}</span>
                                   : <button onClick={() => requestQueue(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1d3bb8] text-[14px] font-extrabold text-white hover:bg-[#19329c]"><Play className="h-[17px] w-[17px]" />{c.resumeBtn}</button>}
                              </div>
                             : campaign.status === "completed" || campaign.status === "completed_with_errors"
                               ? <button onClick={() => openEdit(campaign)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] text-[14px] font-extrabold text-[#334155] hover:bg-[#f8fafc]"><Pencil className="h-[16px] w-[16px]" />{c.editBtn}</button>
                            : <span className="h-10" />}
                      </div>
                        {!isSupportMode && (
                          <button onClick={() => openClone(campaign)} disabled={cloneCampaign.isPending} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] text-[14px] font-extrabold text-[#1d4ed8] hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-60" data-testid={`campaign-clone-${campaign.id}`}>
                            {cloneCampaign.isPending && cloneSourceCampaign?.id === campaign.id ? <LoaderCircle className="h-[17px] w-[17px] animate-spin" /> : <Copy className="h-[17px] w-[17px]" />}
                            {c.cloneBtn}
                          </button>
                        )}
                       {campaign.cloneMode === "admin" && campaign.status === "draft" && (
                        <p className="mt-3 rounded-lg bg-[#eff6ff] px-3 py-2 text-[11px] font-semibold leading-relaxed text-[#1e40af]">
                          {c.clonedDraft}
                        </p>
                      )}
                       {campaign.cloneMode === "user" && campaign.status === "draft" && (
                         <p className="mt-3 rounded-lg bg-[#eff6ff] px-3 py-2 text-[11px] font-semibold leading-relaxed text-[#1e40af]">
                           {c.userClonedDraft}
                         </p>
                       )}
                       {!isSupportMode && <button onClick={() => void remove(campaign)} disabled={updateStatus.isPending} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#f99a9d] text-[14px] font-extrabold text-white hover:bg-[#f57c80]"><Trash2 className="h-[17px] w-[17px]" />{c.deleteBtn}</button>}
                    </article>
                  );
                })}</div>
              : <EmptyState
                  icon={Plus}
                  title={search || status !== "all" ? c.emptyFilterTitle : c.emptyTitle}
                  detail={search || status !== "all" ? c.emptyFilterDetail : c.emptyDetail}
                   action={!isSupportMode && !search && status === "all" ? <PrimaryButton onClick={openNew}><Plus className="h-4 w-4" />{c.createCampaignBtn}</PrimaryButton> : undefined}
                />}
        </Panel>
      </div>

      {showForm && (
        <CampaignFormModal
          editingCampaign={editingCampaign}
          onClose={() => {
            setShowForm(false);
            setEditingCampaign(null);
          }}
          onSaved={handleFormSaved}
        />
      )}

      {bulkResumeOpen && (
        <Modal
          title={c.bulkResumeTitle}
          description={c.bulkResumeDetail}
          onClose={() => {
            if (!bulkControl.isPending) setBulkResumeOpen(false);
          }}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[13px] font-extrabold text-[#334155]">{c.bulkScopeLabel}</span>
              <select
                value={bulkResumeScope}
                onChange={(event) => setBulkResumeScope(event.target.value as BulkResumeScope)}
                className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                data-testid="campaigns-bulk-scope"
              >
                {bulkScopeOptions.map((scopeOption) => (
                  <option key={scopeOption} value={scopeOption}>
                    {scopeOption === "draft"
                      ? c.bulkScopeDraft
                      : scopeOption === "queued"
                      ? c.bulkScopeQueued
                      : scopeOption === "paused"
                        ? c.bulkScopePaused
                        : c.bulkScopeCompleted}
                  </option>
                ))}
              </select>
              {bulkResumeScope === "completed" && (
                <span className="mt-1.5 block text-[11px] font-medium text-[#94a3b8]">{c.bulkScopeHint}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-extrabold text-[#334155]">{c.bulkIntervalLabel}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="4320"
                  step="1"
                  value={bulkIntervalMinutes}
                  onChange={(event) => setBulkIntervalMinutes(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                  data-testid="campaigns-bulk-interval"
                />
                <span className="shrink-0 text-[13px] font-bold text-[#64748b]">min</span>
              </div>
              <span className="mt-1.5 block text-[11px] font-medium text-[#94a3b8]">{c.bulkIntervalHint}</span>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[13px] font-extrabold text-[#334155]">{c.bulkStartDateLabel}</span>
                <input
                  type="date"
                  value={bulkScheduleDate}
                  onChange={(event) => setBulkScheduleDate(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                  data-testid="campaigns-bulk-date"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[13px] font-extrabold text-[#334155]">{c.bulkStartTimeLabel}</span>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    type="time"
                    value={bulkScheduleTime}
                    onChange={(event) => setBulkScheduleTime(event.target.value)}
                    className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white pl-9 pr-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                    data-testid="campaigns-bulk-time"
                  />
                </div>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkResumeOpen(false)}
                disabled={bulkControl.isPending}
                className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-[13px] font-extrabold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50"
              >
                {c.bulkCancel}
              </button>
              <PrimaryButton type="button" onClick={() => void submitBulkResume()} disabled={bulkControl.isPending}>
                {bulkControl.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {c.bulkApply}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {bulkTemplateOpen && (
        <Modal
          title={c.bulkTemplateTitle}
          description={c.bulkTemplateDetail}
          onClose={() => {
            if (!bulkTemplate.isPending) setBulkTemplateOpen(false);
          }}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-4 text-[13px] font-semibold leading-relaxed text-[#1e3a8a]">
              <p className="font-extrabold">{c.bulkTemplateScope(automaticCampaigns.length)}</p>
              <p className="mt-1 text-[12px] font-medium">Bản nháp, Tạm dừng, Đang chờ và Đang chạy được kiểm tra theo đúng tiền tố tên.</p>
              <div className="mt-3 space-y-1 text-[12px]">
                {automaticCampaigns.slice(0, 8).map((campaign) => (
                  <p key={campaign.id} className="truncate">• {campaign.name}</p>
                ))}
                {automaticCampaigns.length > 8 && <p>{c.bulkTemplatePreviewMore(automaticCampaigns.length - 8)}</p>}
              </div>
            </div>
            <label className="block">
              <span className="mb-2 block text-[13px] font-extrabold text-[#334155]">{c.bulkTemplateLabel}</span>
              <select
                value={bulkTemplateId}
                onChange={(event) => setBulkTemplateId(event.target.value)}
                disabled={bulkTemplate.isPending || !templates.data?.length}
                className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10 disabled:bg-[#f8fafc]"
                data-testid="campaigns-bulk-template-select"
              >
                <option value="">{c.bulkTemplatePlaceholder}</option>
                {(templates.data ?? []).map((template) => (
                  <option value={template.id} key={template.id}>{template.name}{template.mode === "forward" ? " · Forward" : ""}</option>
                ))}
              </select>
            </label>
            {!templates.data?.length && <p className="rounded-xl bg-[#fff7ed] px-3.5 py-3 text-[12px] font-semibold text-[#9a3412]">{c.bulkTemplateNoTemplates}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkTemplateOpen(false)}
                disabled={bulkTemplate.isPending}
                className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-[13px] font-extrabold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50"
              >
                {c.bulkCancel}
              </button>
              <PrimaryButton
                type="button"
                onClick={() => void submitBulkTemplate()}
                disabled={!bulkTemplateId || bulkTemplate.isPending || !automaticCampaigns.length}
              >
                {bulkTemplate.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {c.bulkTemplateApply}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {cloneSourceCampaign && (
        <Modal
          title={c.cloneTitle}
          description={c.cloneDetail}
          onClose={() => {
            if (!cloneCampaign.isPending) {
              setCloneSourceCampaign(null);
              setCloneTargetAccountId("");
              setCloneError(null);
            }
          }}
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-4 text-[13px] text-[#1e3a8a]">
              <span className="block text-[10px] font-black uppercase tracking-wide text-[#1d4ed8]">{c.cloneSource}</span>
              <span className="mt-1 block break-words font-extrabold">{cloneSourceCampaign.name}</span>
            </div>
            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.cloneTargetAccount}</span>
              <select
                value={cloneTargetAccountId}
                onChange={(event) => setCloneTargetAccountId(event.target.value)}
                disabled={cloneCampaign.isPending || connectedAccounts.length === 0}
                className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] disabled:bg-[#f8fafc]"
                data-testid="clone-campaign-account"
              >
                <option value="">{c.cloneTargetAccountPlaceholder}</option>
                {connectedAccounts.map((account) => (
                  <option value={account.id} key={account.id}>{account.name}{account.phone ? ` · ${account.phone}` : ""}</option>
                ))}
              </select>
              {connectedAccounts.length === 0 && <span className="mt-2 block text-[12px] font-medium text-[#be123c]">{c.cloneNoConnectedAccounts}</span>}
            </label>
            {cloneError && <p className="rounded-xl bg-[#fff1f2] px-3.5 py-3 text-[13px] font-semibold text-[#be123c]">{cloneError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCloneSourceCampaign(null)} disabled={cloneCampaign.isPending} className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-[13px] font-extrabold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50">
                {c.cloneCancel}
              </button>
              <PrimaryButton type="button" onClick={() => void submitClone()} disabled={!cloneTargetAccountId || cloneCampaign.isPending}>
                {cloneCampaign.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {c.cloneSubmit}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {forwardCampaign && (
        <Modal
          title={c.cloneRunTitle}
          description={c.cloneRunDetail}
          onClose={() => {
            setForwardCampaign(null);
            setForwardSourceMessageId("");
          }}
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-4 text-[13px] font-medium text-[#1e3a8a]">
              <span className="block text-[11px] font-black uppercase tracking-wide text-[#1d4ed8]">{c.cloneRunAccount}</span>
              <span className="mt-1 block font-extrabold">
                {connectedAccounts.find((account) => account.id === forwardCampaign.telegramAccountId)?.name ?? c.accountFallback}
              </span>
            </div>
            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.cloneRunMessage}</span>
              <select
                value={forwardSourceMessageId}
                onChange={(event) => setForwardSourceMessageId(event.target.value)}
                disabled={forwardSavedMessages.isLoading}
                className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] disabled:bg-[#f8fafc]"
                data-testid="clone-campaign-saved-message"
              >
                <option value="">{forwardSavedMessages.isLoading ? "Loading…" : c.cloneRunMessagePlaceholder}</option>
                {(forwardSavedMessages.data ?? []).map((message) => (
                  <option key={message.id} value={message.id}>{message.text.slice(0, 100) || "Media message"}</option>
                ))}
              </select>
            </label>
            {forwardSavedMessages.isError && (
              <p className="rounded-xl bg-[#fff1f2] px-3 py-2 text-[12px] font-semibold text-[#be123c]">
                {localizedErrorMessage(forwardSavedMessages.error, language, c.genericError)}
              </p>
            )}
            <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-[#64748b]">Kiểm tra destination</p>
              {cloneReadiness.isLoading ? (
                <p className="text-[12px] font-semibold text-[#64748b]">Đang kiểm tra quyền gửi…</p>
              ) : cloneReadiness.isError ? (
                <p className="text-[12px] font-semibold text-[#be123c]">{localizedErrorMessage(cloneReadiness.error, language, c.genericError)}</p>
              ) : (
                <div className="space-y-2">
                  {!cloneReadiness.data?.accountReady && (
                    <p className="rounded-lg bg-[#fff1f2] px-2.5 py-2 text-[12px] font-semibold text-[#be123c]">Tài khoản Telegram admin chưa kết nối.</p>
                  )}
                  {(cloneReadiness.data?.destinations ?? []).map((destination) => (
                    <div key={destination.id} className={`rounded-lg px-2.5 py-2 text-[12px] font-semibold ${destination.ready ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#fff1f2] text-[#be123c]"}`}>
                      <span className="font-extrabold">{destination.title}</span>
                      {!destination.ready && <span className="block pt-0.5 font-medium">{destination.reason}</span>}
                    </div>
                  ))}
                  {!cloneReadiness.data?.destinations.length && (
                    <p className="rounded-lg bg-[#fff1f2] px-2.5 py-2 text-[12px] font-semibold text-[#be123c]">Campaign không có destination để gửi.</p>
                  )}
                </div>
              )}
            </div>
            {forwardSourceMessageId && (
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-[#64748b]">Preview</p>
                <p className="whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-[#334155]">
                  {(forwardSavedMessages.data ?? []).find((message) => message.id === forwardSourceMessageId)?.text || "Media message"}
                </p>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setForwardCampaign(null);
                  setForwardSourceMessageId("");
                }}
                className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-[13px] font-extrabold text-[#475569] hover:bg-[#f8fafc]"
              >
                {c.cloneRunCancel}
              </button>
              <PrimaryButton
                type="button"
                onClick={() => void confirmClonedCampaignRun()}
                disabled={!forwardSourceMessageId || cloneReadiness.isLoading || !cloneReadiness.data?.accountReady || (cloneReadiness.data?.destinations ?? []).some((destination) => !destination.ready) || updateTemplate.isPending || updateStatus.isPending}
              >
                {(updateTemplate.isPending || updateStatus.isPending) && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {c.cloneRunConfirm}
              </PrimaryButton>
            </div>
          </div>
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
            <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-[#1e3a8a]">
              <span className="text-[11px] font-black uppercase tracking-wide text-[#1d4ed8]">{c.detailDailyQuota}</span>
              <span className="mt-1 block text-[18px] font-black">{campaignDailyQuotaLabel(details, c)}</span>
            </div>
            <div className="rounded-xl bg-[#f8fafc] p-4 text-[#475569]">
              <p><b>{c.detailRepeat}</b> {details.repeatCount} {c.detailRounds}</p>
              <p className="mt-1"><b>{c.detailDelayRound}</b> {details.roundDelayMinSeconds}–{details.roundDelayMaxSeconds}s</p>
              <p className="mt-1"><b>{c.detailSchedule}</b> {formatSchedule(details.scheduledAt, language)}</p>
            </div>
             {details.templateMode === "forward" ? (
               <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e2e8f0] p-4 text-[#334155]">
                 <span className="font-medium">{c.detailForwardNote}</span>
                 {detailTemplate && (
                   <button
                     type="button"
                     onClick={() => {
                        setForwardPreviewSource(details.templateMode === "forward"
                          && details.templateSourceAccountId
                          && details.templateSourceMessageId
                          ? {
                              accountId: details.templateSourceAccountId,
                              messageId: details.templateSourceMessageId,
                            }
                          : null);
                       setDetails(null);
                       setTemplatePreview(detailTemplate);
                     }}
                     className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-extrabold text-[#1d3bb8] transition-colors hover:bg-[#eff6ff]"
                     aria-label={`${c.detailViewTemplate}: ${detailTemplate.name}`}
                     title={c.detailViewTemplate}
                   >
                     <Eye className="h-4 w-4" />
                     <span className="hidden sm:inline">{c.detailViewTemplate}</span>
                   </button>
                 )}
               </div>
             ) : (
               <p className="whitespace-pre-wrap rounded-xl border border-[#e2e8f0] p-4 font-medium text-[#334155]">
                 {details.content}
               </p>
             )}
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
                                {error.nextAttemptAt && <p className="mt-1 text-[11px] font-semibold">{c.detailNextSend} {formatSchedule(error.nextAttemptAt, language)}</p>}
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
                               <p className="mt-1 break-words font-medium">{localizedDeliveryErrorMessage(error.lastError, language, c.genericError)}</p>
                                <p className="mt-1 text-[11px] font-semibold">{c.detailErrorRecordedAt} {formatErrorRecordedAt(error.updatedAt, language)}</p>
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

       {templatePreview && (
         <Modal
           title={templatePreview.name}
            description={templatePreview.mode === "forward" ? c.detailLiveForwardContent : c.detailTemplateContent}
            onClose={() => {
              setTemplatePreview(null);
              setForwardPreviewSource(null);
            }}
         >
           <p className="whitespace-pre-wrap rounded-xl bg-[#f8fafc] p-4 text-[14px] font-medium leading-relaxed text-[#334155]">
              {templatePreview.mode !== "forward"
                ? templatePreview.content || c.genericError
                : !forwardPreviewSource
                  ? c.detailForwardContent
                  : liveForwardPreview.isLoading || liveForwardPreview.isFetching
                    ? c.detailLiveForwardLoading
                    : liveForwardPreview.data?.text || c.detailLiveForwardUnavailable}
           </p>
         </Modal>
       )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
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
