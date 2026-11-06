import { useEffect, useMemo, useRef, useState } from "react";
import { campaignDeleteError } from "@/lib/campaign-delete-error";
import { campaignBulkError } from "@/lib/campaign-bulk-error";
import { useQueryClient,useMutation } from "@tanstack/react-query";
import {useOperations} from "@/lib/operations";
import type {BackgroundOperation,BackgroundOperationInput} from "@workspace/api-client-react";
import {
  Clock3,
  Eye,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Campaign, MessageTemplate, CampaignBulkJobProgress } from "@workspace/api-client-react";
import {
  getListCalendarItemsQueryKey,
  getCampaignBulkJob,
  getActiveCampaignBulkJob,
  retryCampaignBulkJob,
  getListCampaignsQueryKey,
  useCloneCampaign,
  useGetCampaignCloneReadiness,
  useGetTelegramSavedMessage,
  useBulkControlCampaigns,
  useBulkDeleteCampaigns,
  useDeleteCampaign,
  useListMessageTemplates,
  useListTelegramAccounts,
  useListTelegramSavedMessages,
  useUpdateMessageTemplate,
  useUpdateCampaignStatus,
} from "@workspace/api-client-react";
import { CampaignFormModal } from "@/components/campaign-form-modal";
import { CampaignDeletionProgress } from "@/components/campaign-deletion-progress";
import { useTemplateJob } from "@/lib/use-template-job";
import { CampaignTemplateProgress } from "@/components/campaign-template-progress";
import { CampaignTemplateSelector } from "@/components/campaign-template-selector";
import { CampaignsWorkspaceView } from "@/components/campaigns/CampaignsWorkspaceView";
import { claimCampaignCompletion, wasCampaignCompletionHandled } from "@/lib/campaign-completion-receipt";
import { useCompleteCampaigns } from "@/lib/use-complete-campaigns";
import { CampaignRerunOptions, CampaignRerunResults } from "@/components/campaign-rerun-options";
import { AppLayout, Modal, PrimaryButton, Toast } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { localizedDeliveryErrorMessage, localizedErrorMessage, useLanguage, type Language } from "@/lib/i18n";
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
    bulkDeleteBtn: "Delete all filtered",
    bulkDeleteConfirm: (count: number) => `Delete ${count} campaign${count === 1 ? "" : "s"} matching the current filters? Active campaigns will be kept.`,
    bulkDeleteResult: (deleted: number, skipped: number) => `Deleted ${deleted} campaign${deleted === 1 ? "" : "s"}${skipped ? `; ${skipped} active campaign${skipped === 1 ? "" : "s"} kept.` : "."}`,
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
    bulkTemplateTitle: "Bulk message template change",
    bulkTemplateDetail: "Choose an account, select campaigns and preview the new template. Any campaign name or status is allowed, including completed campaigns. This does not restart campaigns or change schedules, delays or sent-message history.",
    bulkTemplateAccount: "Telegram account",
    bulkTemplateAllAccounts: "All Telegram accounts",
    bulkTemplateAccountHint: "Only campaigns you select for this account will change. The shared default stays unchanged, including for admins. Incompatible forward templates are skipped with a reason.",
    bulkTemplateAllAccountsHint: "Choose one Telegram account before selecting campaigns. This action never changes the shared default.",
    bulkTemplateOwnAccountsHint: "Only explicitly selected campaigns change; the shared default stays unchanged.",
    bulkTemplateEmptyAccount: "No eligible automatic campaigns for this account.",
    bulkTemplateStatuses: "Draft, Paused, Queued and Running campaigns are checked by name prefix.",
    bulkTemplateLabel: "New message template",
    bulkTemplatePlaceholder: "Select a message template",
    bulkTemplateScope: (count: number) => `${count} automatic campaign${count === 1 ? "" : "s"} will be updated.`,
    bulkTemplateNoCandidates: "There are no matching automatic campaigns in Draft, Paused, Queued, or Running status.",
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
    deleteTitle: "Delete campaign",
    deleteWarning: (name: string) => `Delete "${name}" and its delivery history? This cannot be undone.`,
    deleteActiveHint: "Pause this campaign before deleting it.",
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
    bulkDeleteBtn: "Xóa tất cả theo bộ lọc",
    bulkDeleteConfirm: (count: number) => `Xóa ${count} chiến dịch theo bộ lọc hiện tại? Các chiến dịch đang chạy sẽ được giữ lại.`,
    bulkDeleteResult: (deleted: number, skipped: number) => `Đã xóa ${deleted} chiến dịch${skipped ? `; giữ lại ${skipped} chiến dịch đang chạy.` : "."}`,
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
    bulkApply: "Chạy theo bộ lọc",
    bulkCancel: "Hủy",
    bulkTemplateTitle: "Đổi mẫu tin hàng loạt",
    bulkTemplateDetail: "Chọn tài khoản, tích chiến dịch và xem trước mẫu mới. Không giới hạn tên hay trạng thái, kể cả chiến dịch đã hoàn thành. Không tự chạy lại, không đổi lịch, delay hoặc lịch sử tin đã gửi.",
    bulkTemplateAccount: "Tài khoản Telegram",
    bulkTemplateAllAccounts: "Tất cả tài khoản Telegram",
    bulkTemplateAccountHint: "Chỉ đổi những chiến dịch bạn tích của tài khoản này. Không đổi mẫu mặc định chung, kể cả admin. Mẫu forward không tương thích được bỏ qua và báo lý do.",
    bulkTemplateAllAccountsHint: "Chọn một tài khoản Telegram trước khi tích chiến dịch. Thao tác này không đổi mẫu mặc định chung.",
    bulkTemplateOwnAccountsHint: "Chỉ đổi các chiến dịch được tích chọn; không đổi mẫu mặc định chung.",
    bulkTemplateEmptyAccount: "Tài khoản này không có chiến dịch tự động đủ điều kiện.",
    bulkTemplateStatuses: "Bản nháp, Tạm dừng, Đang chờ và Đang chạy được kiểm tra theo đúng tiền tố tên.",
    bulkTemplateLabel: "Mẫu tin nhắn mới",
    bulkTemplatePlaceholder: "Chọn mẫu tin nhắn",
    bulkTemplateScope: (count: number) => `Sẽ cập nhật ${count} campaign tự động.`,
    bulkTemplateNoCandidates: "Không có campaign tự động phù hợp ở trạng thái Bản nháp, Tạm dừng, Đang chờ hoặc Đang chạy.",
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
    deleteTitle: "Xóa chiến dịch",
    deleteWarning: (name: string) => `Xóa "${name}" cùng lịch sử gửi? Thao tác này không thể hoàn tác.`,
    deleteActiveHint: "Dừng chiến dịch trước khi xóa.",
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
function formatSchedule(value: Date | string | null, language: Language) {
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

function formatErrorRecordedAt(value: Date | string, language: Language) {
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
  language: Language,
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSupportMode = Boolean(user?.support);
  const isAdmin = user?.role === "admin" && !isSupportMode;
  const c = copy[language === "vi" ? "vi" : "en"];
  const [, setLocation] = useLocation();
  const searchParams = useSearch();

  const campaignScope=user ? `${user.id}:${user.support?.targetUserId??"self"}` : "";
  const [accountFilter,setAccountFilterState]=useState(()=>{
    try{return sessionStorage.getItem(`telecamp.campaign-account:${campaignScope}`)??"";}catch{return "";}
  });
  function setAccountFilter(value:string){
    if(value===accountFilter)return;
    void queryClient.cancelQueries({queryKey:[...getListCampaignsQueryKey(),"complete-load",campaignScope,...accountFilter?[accountFilter]:[]],exact:true});
    // An account switch cancels that staging run; merely leaving the page does not.
    queryClient.setQueryData(["campaign-load-progress",campaignScope,...accountFilter?[accountFilter]:[]],{loaded:0,total:null,phase:"counting",run:Date.now()});
    setAccountFilterState(value);
    try{sessionStorage.setItem(`telecamp.campaign-account:${campaignScope}`,value);}catch{/* optional storage */}
  }
  const campaigns = useCompleteCampaigns(campaignScope,accountFilter);
  const campaignDataBlocked=campaigns.isFetching||!campaigns.data||campaigns.isError;
  const accounts = useListTelegramAccounts();
  const templates = useListMessageTemplates();
  const cloneCampaign = useCloneCampaign();
  const operations=useOperations();
  const bulkDelete=useMutation({mutationFn:(filter:Omit<BackgroundOperationInput,"kind"|"confirm">)=>operations.start({kind:"delete_campaigns",confirm:true,...filter})});
  const deleteOne=useMutation({mutationFn:(campaignId:string)=>operations.start({kind:"delete_campaigns",campaignId,confirm:true})});
  const templateProgress = useTemplateJob(user?.id, Boolean(user?.id) && !isSupportMode, () => {
    void campaigns.sync();
    void queryClient.invalidateQueries({queryKey:getListCalendarItemsQueryKey()});
  });
  const bulkTemplate = {isPending:templateProgress.blocked};
  const updateStatus = useUpdateCampaignStatus();
  const updateTemplate = useUpdateMessageTemplate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all"|"queued"|"running"|"paused"|"completed"|"draft"|"cancelled">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [details, setDetails] = useState<Campaign | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [deletionProgress,setDeletionProgress]=useState<{label:string;job:BackgroundOperation|null;error:string|null}|null>(null);
  const deletionSubmitLock=useRef(false);
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
  const [bulkResumeAccountId, setBulkResumeAccountId] = useState("");
  const [bulkResumeSearch, setBulkResumeSearch] = useState("");
  const [bulkResumeScope, setBulkResumeScope] = useState<BulkResumeScope>("paused");
  const [bulkIntervalMinutes, setBulkIntervalMinutes] = useState("");
  const [bulkScheduleDate, setBulkScheduleDate] = useState(() => localDateInputValue());
  const [bulkScheduleTime, setBulkScheduleTime] = useState(() => localTimeInputValue());
  const [bulkJob, setBulkJob] = useState<CampaignBulkJobProgress | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const bulkRequestId = useMemo(() => crypto.randomUUID(), [
    bulkResumeOpen, bulkResumeAccountId, bulkResumeSearch, bulkResumeScope, bulkIntervalMinutes, bulkScheduleDate, bulkScheduleTime,
    accountFilter,search,status,campaignScope,
  ]);
  const bulkControl = useBulkControlCampaigns({request: {headers: {"Idempotency-Key": bulkRequestId}}});
  const bulkJobActive = bulkJob?.status === "queued" || bulkJob?.status === "running";
  const bulkStorageKey = `telecamp.bulk-job:${isSupportMode ? campaignScope : user?.id ?? ""}`;
  function rememberBulkJob(job: CampaignBulkJobProgress) {
    setBulkJob(job);
    setBulkResumeAccountId(job.telegramAccountId??"");
    try { localStorage.setItem(bulkStorageKey, job.id); } catch { /* storage is optional */ }
  }
  useEffect(() => {
    let disposed = false;
    let saved: string | null = null;
    setBulkJob(null);
    setBulkResumeOpen(false);
    setBulkResumeAccountId("");
    try { saved = localStorage.getItem(bulkStorageKey); } catch { /* private browser mode */ }
    void (async () => {
      try {
        const job = saved ? await getCampaignBulkJob(saved).catch(() => getActiveCampaignBulkJob())
          : await getActiveCampaignBulkJob();
        if (!disposed && job) {
          rememberBulkJob(job);
          if(!wasCampaignCompletionHandled(bulkStorageKey,"rerun",job))setBulkResumeOpen(true);
        }
      } catch { /* no access or no saved operation; no automatic resubmission */ }
    })();
    return () => { disposed = true; };
  }, [bulkStorageKey]);
  useEffect(() => {
    if (!bulkJob || (!bulkJobActive && !bulkResumeOpen)) return;
    let disposed = false;
    async function poll() {
      try {
        const next = await getCampaignBulkJob(bulkJob!.id);
        if (disposed) return;
        setBulkJob(next);
        if (claimCampaignCompletion(bulkStorageKey,"rerun",next)) {
          void campaigns.sync();
          void queryClient.invalidateQueries({queryKey: getListCalendarItemsQueryKey()});
          setToast(next.status === "completed" ? c.bulkResumedResult(next.updatedCount, next.skippedCount)
            : language === "vi" ? "Tác vụ đã dừng do lỗi. Các lượt đã tạo được giữ nguyên; không bấm tạo lại."
              : "The operation stopped with an error. Existing runs are preserved; do not submit again.");
        }
      } catch { /* preserve job identity and retry reading progress, never resubmit */ }
    }
    const timer = setInterval(() => { void poll(); }, bulkJobActive ? 2000 : 10000);
    void poll();
    return () => { disposed = true; clearInterval(timer); };
  }, [bulkJob?.id, bulkJobActive, bulkResumeOpen, language]);
  const [bulkTemplateOpen, setBulkTemplateOpen] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [bulkTemplateAccountId, setBulkTemplateAccountId] = useState("");
  const [bulkTemplateCampaignIds,setBulkTemplateCampaignIds]=useState<string[]>([]);
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
    return (!needle || campaign.name.toLowerCase().includes(needle)) && matchesStatus
      && (!accountFilter || campaign.telegramAccountId===accountFilter);
  }).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()), [campaigns.data, search, status, accountFilter]);
  const accountFilterLabel=(accounts.data??[]).find(account=>account.id===accountFilter)?.name
    ?? (language==="vi"?"Tất cả tài khoản":"All accounts");
  const bulkFilter={...(accountFilter?{telegramAccountId:accountFilter}:{}),search:search.trim(),status};
  const latestCompletedCampaignId = useMemo(() => {
    const completed = (campaigns.data ?? [])
      .filter((campaign) => campaign.status === "completed" || campaign.status === "completed_with_errors")
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    return completed[0]?.id ?? null;
  }, [campaigns.data]);
  const bulkScopeOptions = useMemo<BulkResumeScope[]>(() => {
    return ["completed", "paused", "queued"];
  }, []);
  const templateSelection=useCompleteCampaigns(bulkTemplateOpen&&bulkTemplateAccountId?campaignScope:"",bulkTemplateAccountId);
  const templateCampaigns = useMemo(() => (templateSelection.data ?? []).filter((campaign) =>
    Boolean(bulkTemplateAccountId) && campaign.telegramAccountId === bulkTemplateAccountId,
  ), [templateSelection.data, bulkTemplateAccountId]);
  const bulkSelectedIds=useMemo(()=>{
    const available=new Set(templateCampaigns.map(campaign=>campaign.id));
    return bulkTemplateCampaignIds.filter(id=>available.has(id));
  },[templateCampaigns,bulkTemplateCampaignIds]);
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
      campaigns.upsert(updatedCampaign);
      setToast(nextStatus === "paused" ? c.toastPaused : c.toastResumed);
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  async function pauseAllCampaigns() {
    if(campaignDataBlocked)return;
    const activeCount = listedCampaigns.filter((campaign) => isActive(campaign.status)).length;
    if (!activeCount) {
      setToast(c.bulkNoActive);
      return;
    }
    if (!window.confirm(`${accountFilterLabel}\n${c.bulkPauseConfirm(activeCount)}`)) return;
    try {
      const result = await bulkControl.mutateAsync({ data: { action: "pause",...bulkFilter } });
      await campaigns.sync();
      setToast(c.bulkPausedResult(result.updatedCount));
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  function openBulkResume() {
    if(campaignDataBlocked){if(bulkJob)setBulkResumeOpen(true);return;}
    if (bulkJob && bulkJob.status !== "completed") { setBulkResumeOpen(true); return; }
    setBulkJob(null);
    setBulkResumeAccountId(accountFilter);
    setBulkResumeSearch(search);
    try { localStorage.removeItem(bulkStorageKey); } catch { /* optional storage */ }
    if (!bulkScopeOptions.length) {
      setToast(c.bulkNoEligible);
      return;
    }
    const now = new Date();
    setBulkResumeScope(status === "completed" || status === "paused" || status === "queued" ? status : "completed");
    setBulkIntervalMinutes("");
    setBulkScheduleDate(localDateInputValue(now));
    setBulkScheduleTime(localTimeInputValue(now));
    setBulkResumeOpen(true);
  }

  async function submitBulkResume() {
    if(campaignDataBlocked)return;
    if (bulkControl.isPending || bulkJob) return;
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
      // Save the request identity before sending, so a lost response can be
      // recovered after a reload without resubmitting the campaign operation.
      try { localStorage.setItem(bulkStorageKey, bulkRequestId); } catch { /* optional storage */ }
      const result = await bulkControl.mutateAsync({
        data: {
          action: "resume",
          ...(bulkResumeAccountId ? {telegramAccountId:bulkResumeAccountId} : {}),
          ...(bulkResumeSearch.trim() ? {search:bulkResumeSearch.trim()} : {}),
          status: bulkResumeScope,
          scope: bulkResumeScope,
          intervalSeconds: intervalMinutes * 60,
          scheduledAt: scheduledAt.toISOString(),
          onlySendable:false,autoDeleteInvalid:true,confirmAutoDelete:true,
        },
      });
      if (result.job) {
        rememberBulkJob(result.job);
      } else {
        await campaigns.sync();
        setBulkResumeOpen(false);
        setToast(c.bulkResumedResult(result.updatedCount, result.skippedCount));
      }
    } catch (error) {
      try {
        const active = await getActiveCampaignBulkJob();
        if (active) { rememberBulkJob(active); return; }
      } catch { /* show a safe connection message below */ }
      setToast(campaignBulkError(error, language));
    }
  }

  function openBulkTemplate() {
    if (templateProgress.job || templateProgress.uncertain) {
      setBulkTemplateOpen(true);
      return;
    }
    if(campaignDataBlocked)return;
    setBulkTemplateId("");
    setBulkTemplateAccountId(accountFilter);
    setBulkTemplateCampaignIds([]);
    setBulkTemplateOpen(true);
  }

  async function submitBulkTemplate() {
    if(campaignDataBlocked)return;
    if (templateProgress.blocked) return;
    if (!bulkTemplateId || !bulkTemplateAccountId || !bulkSelectedIds.length) {
      setToast(c.bulkTemplateNoTemplates);
      return;
    }
    await templateProgress.start(bulkTemplateId, bulkTemplateAccountId,bulkSelectedIds);
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
      campaigns.upsert(clonedCampaign);
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
      await Promise.all([campaigns.sync(), templates.refetch()]);
      setForwardCampaign(null);
      setForwardSourceMessageId("");
      setToast(c.toastResumed);
    } catch (error) {
      setToast(localizedErrorMessage(error, language, c.genericError));
    }
  }

  async function remove() {
    if (!campaignToDelete || deleteOne.isPending || deletionSubmitLock.current || deletionProgress) return;
    const selected=campaignToDelete;
    deletionSubmitLock.current=true;
    setDeletionProgress({label:selected.name,job:null,error:null});
    setCampaignToDelete(null);
    try {
      const job=await deleteOne.mutateAsync(selected.id);
      if (details?.id === selected.id) setDetails(null);
      setDeletionProgress({label:selected.name,job,error:null});
      // OperationsProgress reconciles confirmed deletions without reloading all
      // summaries. Acceptance is not proof that the campaign is already gone.
    } catch (error) {
      setDeletionProgress({label:selected.name,job:null,error:campaignDeleteError(error,language)});
    } finally {
      deletionSubmitLock.current=false;
    }
  }

  async function removeFilteredCampaigns() {
    if(campaignDataBlocked)return;
    if(bulkDelete.isPending||deletionSubmitLock.current||deletionProgress)return;
    const deletableCount = listedCampaigns.filter((campaign) => !isActive(campaign.status)).length;
    if (!deletableCount) {
      setToast(c.bulkNoEligible);
      return;
    }
    if (!window.confirm(`${accountFilterLabel}\n${c.bulkDeleteConfirm(listedCampaigns.length)}`)) return;
    const label=accountFilterLabel;
    const filter={...bulkFilter,status:bulkFilter.status as BackgroundOperationInput["status"]};
    deletionSubmitLock.current=true;
    setDeletionProgress({label,job:null,error:null});
    try {
      const job=await bulkDelete.mutateAsync(filter);
      setDetails(null);
      setDeletionProgress({label,job,error:null});
    } catch (error) {
      setDeletionProgress({label,job:null,error:campaignDeleteError(error,language)});
    } finally {
      deletionSubmitLock.current=false;
    }
  }

  return (
    <AppLayout activePage="campaigns" title={c.pageTitle} hideUpgrade headerAction={
      <button onClick={openNew} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#14756e] px-3 text-[12px] font-extrabold text-white shadow-sm transition hover:bg-[#0e625b]" aria-label={c.addAriaLabel} data-testid="campaigns-add"><Plus className="h-[18px] w-[18px]" /><span className="hidden min-[390px]:inline">{c.addAriaLabel}</span></button>
    }>
      <CampaignsWorkspaceView
        labels={c} rows={listedCampaigns} accounts={accounts.data ?? []}
        total={campaigns.data?.length} hasData={campaigns.data !== undefined}
        fetching={campaigns.isFetching} failed={campaigns.isError}
        loaded={campaigns.loadProgress.loaded} loadTotal={campaigns.loadProgress.total}
        updatedAt={campaigns.dataUpdatedAt}
        search={search} status={status} accountFilter={accountFilter} accountFilterLabel={accountFilterLabel}
        supportMode={isSupportMode} dataBlocked={campaignDataBlocked}
        bulkPending={bulkControl.isPending} bulkTemplatePending={bulkTemplate.isPending}
        bulkDeletePending={bulkDelete.isPending} hasBulkJob={Boolean(bulkJob)}
        hasTemplateJob={Boolean(templateProgress.job)} templateUncertain={templateProgress.uncertain}
        templateWaiting={templateProgress.waiting} clonePending={cloneCampaign.isPending}
        cloneSourceId={cloneSourceCampaign?.id} deletePending={deleteOne.isPending}
        latestCompletedId={latestCompletedCampaignId} highlightedId={highlightedCampaignId}
        present={campaign => ({
          status: campaign.status === "completed_with_errors" ? c.statusCompletedErrors : statusLabel(campaign.status, c),
          complete: campaign.targetCount ? Math.round((campaign.completedCount / campaign.targetCount) * 100) : 0,
          active: isActive(campaign.status), autoResumes: resumesAfterDailyQuota(campaign),
          safetyNote: temporaryRestrictionCampaignNote(campaign, language, c),
          schedule: formatSchedule(campaign.scheduledAt, language), dailyQuota: campaignDailyQuotaLabel(campaign, c),
        })}
        onSearch={setSearch} onStatus={setStatus} onAccount={setAccountFilter}
        onReset={() => {setAccountFilter("");setSearch("");setStatus("all");}}
        onRefresh={() => void campaigns.refetch()} onCreate={openNew}
        onPauseAll={() => void pauseAllCampaigns()} onRerun={openBulkResume}
        onTemplate={openBulkTemplate} onDeleteFiltered={() => void removeFilteredCampaigns()}
        onDetails={setDetails} onEdit={openEdit}
        onPause={campaign => void changeCampaignStatus(campaign, "paused")}
        onQueue={requestQueue} onClone={openClone}
        onDelete={campaign => isActive(campaign.status) ? setToast(c.deleteActiveHint) : setCampaignToDelete(campaign)}
      />

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
            {bulkJob && (
              <div role="status" aria-live="polite" className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
                <strong>{language === "vi"
                  ? bulkJob.status === "completed" ? "Đã tạo lịch xong" : bulkJob.status === "failed" ? "Tác vụ cần kiểm tra" : "Đang tạo lịch chạy"
                  : bulkJob.status === "completed" ? "Completed" : bulkJob.status === "failed" ? "Operation needs attention" : "Processing campaigns"}</strong>
                <p className="mt-1">{bulkJob.processed}/{bulkJob.total} · {language === "vi" ? "Đã tạo/tiếp tục lượt" : "Created/resumed runs"}: {bulkJob.updatedCount} · {language === "vi" ? "Bỏ qua" : "Skipped"}: {bulkJob.skippedCount} · {language==="vi"?"Đã xoá":"Deleted"}: {bulkJob.deletedCount ?? 0}</p>
                {bulkJobActive && <progress aria-label={language === "vi" ? "Tiến độ xử lý" : "Operation progress"} className="mt-3 h-2 w-full" max={Math.max(1, bulkJob.total)} value={bulkJob.processed} />}
                <p className="mt-2 text-xs">{bulkJob.status === "failed"
                  ? language === "vi" ? "Phần đã tạo được giữ nguyên. Tiếp tục chỉ xử lý phần chưa hoàn tất." : "Created runs are preserved. Continuing processes only the unfinished part."
                  : bulkJob.phase==="checking_permissions" && bulkJobActive
                    ? language==="vi"?"Đang xác minh quyền gửi nhóm trên tài khoản đã chọn.":"Checking group posting permissions on the selected account."
                  : bulkJobActive
                    ? language === "vi" ? "Có thể đóng cửa sổ; tác vụ vẫn tiếp tục. Không bấm chạy lại để tránh tạo trùng." : "You can close this dialog; processing continues. Do not submit again to avoid duplicate runs."
                    : language === "vi" ? "Đã xử lý xong tác vụ này." : "This operation is complete."}</p>
                {bulkJob.status === "failed" && <button type="button" disabled={bulkRetrying}
                  className="mt-3 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                  onClick={() => {
                    setBulkRetrying(true);
                    void retryCampaignBulkJob(bulkJob.id).then(rememberBulkJob)
                      .catch(error => setToast(campaignBulkError(error, language)))
                      .finally(() => setBulkRetrying(false));
                  }}>{language === "vi" ? "Tiếp tục phần chưa xử lý" : "Continue unfinished work"}</button>}
              </div>
            )}
            {bulkJob && <CampaignRerunResults job={bulkJob} language={language} />}
            <fieldset disabled={Boolean(bulkJob) || bulkControl.isPending} className="space-y-4 disabled:opacity-60">
              {!bulkJob && <p className="text-sm font-extrabold text-[#334155]">{language==="vi"?"Bộ lọc chiến dịch":"Campaign filters"}</p>}
              {!bulkJob && <input type="search" value={bulkResumeSearch} onChange={event=>setBulkResumeSearch(event.target.value)}
                placeholder={c.searchPlaceholder} aria-label={c.searchPlaceholder} data-testid="campaigns-rerun-search"
                className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-sm outline-none focus:border-[#1a2b88]" />}
              {!bulkJob && <label className="block text-sm font-semibold">
                {language==="vi"?"Tài khoản Telegram":"Telegram account"}
                <select value={bulkResumeAccountId} onChange={event=>setBulkResumeAccountId(event.target.value)}
                  data-testid="campaigns-rerun-account"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-sm outline-none focus:border-[#1a2b88]">
                  <option value="">{c.bulkTemplateAllAccounts}</option>
                  {(accounts.data??[]).map(account=><option key={account.id} value={account.id}>{account.name}{account.username?` · @${account.username}`:""}</option>)}
                </select>
              </label>}
              <p className="rounded-xl bg-[#eef2ff] px-3 py-2.5 text-[12px] leading-relaxed text-[#3730a3]">
                {bulkJob
                  ? (language==="vi"?"Tác vụ này giữ nguyên phạm vi đã chọn khi bắt đầu. Đổi bộ lọc ngoài trang không thay đổi tác vụ đang xem.":"This operation keeps its original selection. Changing page filters does not change this operation.")
                  : `${language==="vi"?"Tài khoản":"Account"}: ${(accounts.data??[]).find(account=>account.id===bulkResumeAccountId)?.name??c.bulkTemplateAllAccounts}${bulkResumeSearch.trim()?` · ${language==="vi"?"Tên chứa":"Name contains"}: ${bulkResumeSearch.trim()}`:""}`}
              </p>
            <CampaignRerunOptions language={language} />
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
            </fieldset>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkResumeOpen(false)}
                disabled={bulkControl.isPending}
                className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-[13px] font-extrabold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50"
              >
                {bulkJob ? language === "vi" ? "Đóng" : "Close" : c.bulkCancel}
              </button>
              {!bulkJob && <PrimaryButton type="button" onClick={() => void submitBulkResume()} disabled={campaignDataBlocked||bulkControl.isPending}>
                {bulkControl.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {c.bulkApply}
              </PrimaryButton>}
            </div>
          </div>
        </Modal>
      )}

      {bulkTemplateOpen && (
        <Modal
          title={c.bulkTemplateTitle}
          description={c.bulkTemplateDetail}
          onClose={() => setBulkTemplateOpen(false)}
        >
          <div className="space-y-4">
            {templateProgress.job && <p className="text-xs leading-relaxed text-slate-600">
              {c.bulkTemplateAccount}: {templateProgress.job.telegramAccountId
                ? ((accounts.data??[]).find(account=>account.id===templateProgress.job!.telegramAccountId)?.name ?? c.accountFallback)
                : c.bulkTemplateAllAccounts}
              <br/>{c.bulkTemplateLabel}: {(templates.data??[]).find(template=>template.id===templateProgress.job!.templateId)?.name
                ?? (language==="vi"?"Mẫu đã chọn khi bắt đầu":"Template selected at the start")}
            </p>}
            {templateProgress.job && <CampaignTemplateProgress
              job={templateProgress.job} vi={language==="vi"} waiting={templateProgress.waiting}
              problem={templateProgress.problem} onRetry={()=>void templateProgress.retry()}
              onNew={()=>{templateProgress.clear();setBulkTemplateId("");setBulkTemplateAccountId("");setBulkTemplateCampaignIds([]);}}
            />}
            {templateProgress.uncertain && <div className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <p>{language==="vi"?"Chưa nhận được xác nhận. Đừng tạo yêu cầu mới; hãy kiểm tra hoặc gửi lại đúng yêu cầu đã lưu.":"Acceptance is unconfirmed. Do not start another operation; check progress or recover the saved request."}</p>
              <button type="button" disabled={templateProgress.waiting} onClick={()=>void templateProgress.recover()} className="font-bold underline">
                {language==="vi"?"Kiểm tra / khôi phục yêu cầu":"Check / recover request"}
              </button>
            </div>}
            {!templateProgress.job && !templateProgress.uncertain && <>
            {templateProgress.problem&&<p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              {language==="vi"?"Chưa thể bắt đầu. Hãy kiểm tra lại tài khoản, mẫu tin và danh sách chiến dịch đã chọn.":"Could not start. Check the selected account, template and campaign selection."}
            </p>}
            <label className="block">
              <span className="mb-2 block text-[13px] font-extrabold text-[#334155]">{c.bulkTemplateAccount}</span>
              <select
                value={bulkTemplateAccountId}
                onChange={(event) => {setBulkTemplateAccountId(event.target.value);setBulkTemplateCampaignIds([]);}}
                disabled={bulkTemplate.isPending || accounts.isLoading}
                className="w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-[#2233aa]"
                data-testid="campaigns-bulk-template-account-select"
              >
                <option value="">{language==="vi"?"Chọn tài khoản Telegram":"Select a Telegram account"}</option>
                {(accounts.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>{account.name}{account.phone ? ` · ${account.phone}` : ""}</option>
                ))}
              </select>
              <p className="mt-2 text-[12px] leading-relaxed text-[#64748b]">
                {bulkTemplateAccountId ? c.bulkTemplateAccountHint : c.bulkTemplateAllAccountsHint}
              </p>
            </label>
            {bulkTemplateAccountId&&<CampaignTemplateSelector key={bulkTemplateAccountId}
              campaigns={templateCampaigns} selected={bulkSelectedIds} onChange={setBulkTemplateCampaignIds}
              language={language} disabled={bulkTemplate.isPending}
              templateNames={Object.fromEntries((templates.data??[]).map(template=>[template.id,template.name]))}/>}
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
            {bulkTemplateId&&(()=>{const selected=(templates.data??[]).find(template=>template.id===bulkTemplateId);return selected&&
              <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3" data-testid="campaign-template-preview">
                <p className="text-sm font-bold text-indigo-900">{language==="vi"?"Xem trước mẫu mới":"New template preview"} · {selected.name}</p>
                {selected.mode==="forward"&&<p className="mt-1 text-xs text-indigo-700">{language==="vi"?"Forward — phải đúng tài khoản nguồn":"Forward — the source account must match"}</p>}
                <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm text-slate-700">{selected.content||(language==="vi"?"Nội dung lấy từ tin nhắn nguồn.":"Content comes from the source message.")}</p>
              </section>;})()}
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
                disabled={campaignDataBlocked || !bulkTemplateId || !bulkTemplateAccountId || bulkTemplate.isPending || !bulkSelectedIds.length}
              >
                {bulkTemplate.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {language==="vi"?`Đổi mẫu cho ${bulkSelectedIds.length} chiến dịch`:`Change templates for ${bulkSelectedIds.length} campaigns`}
              </PrimaryButton>
            </div>
            </>}
            {(templateProgress.job || templateProgress.uncertain) && <div className="flex justify-end">
              <button type="button" onClick={()=>setBulkTemplateOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold">
                {language==="vi"?"Đóng":"Close"}
              </button>
            </div>}
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

       {deletionProgress&&<Modal title={c.deleteTitle} onClose={()=>{
         if(!deletionSubmitLock.current)setDeletionProgress(null);
       }}>
         <CampaignDeletionProgress initialJob={deletionProgress.job} label={deletionProgress.label} error={deletionProgress.error}
           onClose={()=>{if(!deletionSubmitLock.current)setDeletionProgress(null);}}/>
       </Modal>}
       {campaignToDelete && (
         <Modal title={c.deleteTitle} description={c.deleteWarning(campaignToDelete.name)} onClose={() => {
           if (!deleteOne.isPending) setCampaignToDelete(null);
         }}>
           <div className="flex justify-end gap-3">
             <button type="button" onClick={() => setCampaignToDelete(null)} disabled={deleteOne.isPending} className="rounded-xl border border-[#cbd5e1] px-4 py-2.5 text-[13px] font-extrabold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50">{c.bulkCancel}</button>
             <button type="button" onClick={() => void remove()} disabled={deleteOne.isPending} className="inline-flex items-center gap-2 rounded-xl bg-[#dc2626] px-4 py-2.5 text-[13px] font-extrabold text-white hover:bg-[#b91c1c] disabled:opacity-50" data-testid="confirm-campaign-delete">
               {deleteOne.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
               {c.deleteBtn}
             </button>
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
              <p className="mt-1"><b>{details.timingMode === "round" ? c.detailDelayRound : (language === "vi" ? "Delay lịch cũ:" : "Legacy send delay:")}</b> {details.roundDelayMinSeconds}–{details.roundDelayMaxSeconds}s</p>
              {details.timingMode === "round" && details.destinationIds.length > 1 && (details.groupIntervalSeconds ?? 0) > 0 && <p className="mt-1"><b>{language === "vi" ? "Khoảng cách nhóm:" : "Group spacing:"}</b> {(details.groupIntervalSeconds ?? 0) / 60} {language === "vi" ? "phút" : "min"}</p>}
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
