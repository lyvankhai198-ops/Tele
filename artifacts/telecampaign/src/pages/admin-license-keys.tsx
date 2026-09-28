import { useEffect, useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Key,
  Copy,
  AlertCircle,
  Trash2,
  CheckCircle2,
  Filter,
  Bot,
  ExternalLink,
  Save,
  Send,
  Search,
  Clock3,
  Check,
  ChevronRight,
  X,
  KeyRound,
  UserRound,
} from "lucide-react";
import { format } from "date-fns";
import { vi as viLocale, enUS } from "date-fns/locale";
import "./admin-license-keys.css";

import {
  AppLayout,
  Panel,
  SectionHeader,
  StatusBadge,
  Modal,
  Input,
  PrimaryButton,
  QuietButton,
  EmptyState,
  Toast,
} from "@/components/layout/AppLayout";
import {
  useListAdminLicenseKeys,
  useCreateAdminLicenseKey,
  useRevokeAdminLicenseKey,
  useGetAdminPurchaseSettings,
  useGetAdminPurchaseOrderSettings,
  useUpdateAdminPurchaseSettings,
  useGetAdminLicenseReminderSettings,
  useUpdateAdminLicenseReminderSettings,
  useResetAdminRenewalTestAccount,
  useListAdminUsers,
  useListAdminLicenseKeyRecipientDetails,
  getGetAdminPurchaseSettingsQueryKey,
  getGetAdminLicenseReminderSettingsQueryKey,
  getListAdminLicenseKeysQueryKey,
  getListAdminUsersQueryKey,
  getListAdminLicenseKeyRecipientDetailsQueryKey,
  type CreateAdminLicenseKeyInput,
  type AdminLicenseReminderSettings,
  type PurchaseOrderSettings,
  type LicenseKeyStatus,
  type LicenseKeyPool,
  type PlanCode,
  type AdminUser,
  type AdminLicenseKey,
  type AdminLicenseKeyRecipientDetails,
  type AdminLicenseKeyReminderDelivery,
} from "@workspace/api-client-react";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

type LicenseKeyPlan = CreateAdminLicenseKeyInput["plan"];

const copy = {
  en: {
    pageTitle: "Admin License Keys",
    loadError: "Could not load data",
    loadErrorDetail: "Please check your access rights or try again later.",
    eyebrow: "System administration",
    sectionTitle: "Keys & renewals",
    sectionDetail: "Match recipients, current subscriptions, key state, and real Telegram reminder records.",
    createButton: "Create key",
    configureReminders: "Reminder settings",
    resetRenewalTest: "Reset renewal test",
    totalKeys: "Total keys",
    activeSubscriptions: "Active subscriptions",
    expiringSoon: "Expiring in 7 days",
    pendingReminders: "Queued reminder jobs",
    priorityTitle: "Subscriptions to review",
    automationTitle: "Telegram renewal reminders",
    automationEnabled: "Enabled",
    automationDisabled: "Disabled",
    automationSender: "Sender",
    noSender: "No sender selected",
    noUpcoming: "No linked subscriptions are expiring in the next 7 days.",
    openQueue: "Show expiring",
    inventoryTitle: "Key inventory",
    inventoryDetail: "Subscription and key states are shown separately. Key values are never listed here.",
    searchPlaceholder: "Username, Telegram handle, label, or key ID",
    searchLabel: "Search key inventory",
    subscriptionFilterLabel: "Subscription",
    allSubscriptions: "All subscriptions",
    subscriptionActive: "Active",
    subscriptionSoon: "Expiring soon",
    subscriptionExpired: "Expired",
    subscriptionUnavailable: "Not linked",
    quickAll: "All keys",
    quickSoon: "Expiring soon",
    quickActive: "Active subscription",
    quickAvailable: "Available keys",
    tableRecipient: "Recipient",
    tableSubscription: "Current subscription",
    tableIdentifier: "Key reference",
    tableKeyState: "Key state",
    tableReminder: "Latest reminder",
    noRecipient: "Unclaimed key",
    recipientUnavailable: "Account not found",
    appUsername: "App account",
    noTelegramAccount: "No linked Telegram account",
    noExpiry: "No expiry",
    notAvailable: "Unavailable",
    noReminderRecord: "No current-period record",
    reminderSent: "Sent",
    reminderFailed: "Failed",
    reminderPending: "Queued",
    reminderSending: "Sending",
    reminderHistoryTitle: "Reminder records",
    reminderHistoryScope: "Current subscription expiry",
    reminderHistoryEmpty: "No delivery records are stored for this subscription expiry.",
    reminderHistoryLoadError: "Reminder records could not be loaded.",
    reminderDeliveryTo: "Telegram recipient",
    reminderAttempts: "Attempts",
    detailTitle: "License details",
    detailKeyLabel: "Masked key reference",
    detailPlanDuration: "Key plan and duration",
    detailCreated: "Created",
    detailClaimed: "Claimed",
    detailPool: "Inventory pool",
    keyReferenceNote: "This is an internal record ID, not the license key.",
    contextLoadError: "Recipient or reminder details are temporarily unavailable.",
    noMatch: "No keys match the current search and filters.",
    closeDetails: "Close details",
    botSectionTitle: "Telegram Bot purchase link",
    botSectionDetail: "This is the destination users open from the upgrade page to buy a license key.",
    loadingPurchaseLink: "Loading purchase link…",
    purchaseLinkError: "Could not load the purchase-link setting. Refresh the page and try again.",
    botUrlLabel: "Telegram Bot URL",
    openLink: "Open",
    savingLink: "Saving…",
    saveLink: "Save link",
    saveLinkRequiredError: "Enter a Telegram Bot link before saving.",
    saveLinkSuccess: "Telegram purchase link saved.",
    saveLinkError: "Could not save the Telegram purchase link.",
    purchaseLinkNote: (hasLink: boolean) =>
      hasLink
        ? "Only HTTPS links on t.me or telegram.me are accepted."
        : "No purchase link is configured. Users will be told to contact an administrator.",
    reminderTitle: "Telegram renewal reminders",
    reminderDetail: "Use an admin Telegram account to send direct private reminders to linked user accounts. Each message can include a web renewal link and a Telegram Bot link for buying a key.",
    reminderEnabled: "Enable automatic reminders",
    reminderSender: "Admin sender account",
    reminderSenderPlaceholder: "Select a connected admin Telegram account",
    reminderDays: "Remind before expiry",
    reminderDay: (days: number) => `${days} days`,
    reminderAfterExpiry: "Send one reminder after expiry",
     reminderMessageVi: "Vietnamese message template",
     reminderMessageEn: "English message template",
     reminderRenewalUrl: "Web renewal URL",
     reminderRenewalUrlPlaceholder: "https://tele.khaimmo.shop/upgrade",
     reminderRenewalUrlNote: "Use the full HTTPS URL users should open to renew their subscription.",
     reminderMessageHint: "Available placeholders: {days}, {expiresAt}, {username}, {renewalLink}, {purchaseLink}. The message is selected from the user's interface language.",
    reminderSave: "Save reminders",
    reminderSaving: "Saving…",
    reminderSaved: "Telegram renewal reminders saved.",
    reminderLoadError: "Could not load renewal reminder settings.",
    reminderDisabledNote: "Reminders are disabled.",
    reminderDisconnected: "The selected sender account is not connected.",
    filterLabel: "Filters:",
    filterAllStatus: "All statuses",
    filterAvailable: "Available",
    filterClaimed: "Activated",
    filterRevoked: "Revoked",
    filterAllPlans: "All plans",
    tableKeyLabel: "Key / Label",
    tablePlanDuration: "Plan / Duration",
    tableSalePrice: "Sale price",
    tableStatus: "Status",
    tableCreated: "Created",
    tableUsage: "Usage",
    tableActions: "Actions",
    durationDays: (n: number) => `${n} day${n === 1 ? "" : "s"}`,
    statusAvailable: "Available",
    statusClaimed: "Activated",
    statusRevoked: "Revoked",
    createdBy: "By:",
    bySystem: "System",
    claimedAt: (dateStr: string) => dateStr,
    revokedBy: (username: string) => `By ${username}`,
    revokeAction: "Revoke",
    emptyTitle: "No license keys yet",
    emptyDetail: "You have not created any license keys, or none match the current filters.",
    createModalTitle: "Create new license key",
    createModalDetail: "The plan duration starts when the user successfully activates the key.",
    planLabel: "Subscription plan",
    durationLabel: "Duration (Days)",
    salePriceLabel: "Sale price (VND)",
    salePricePlaceholder: "E.g. 149000",
     salePriceHint: "Website keys still available for automatic sale follow the current Order Settings price. Once sold, or when using the external pool, the price is kept as a historical snapshot. You can override it for a promotion.",
    salePriceValidationError: "Sale price must be an integer from 0 to 1,000,000,000 VND.",
    durationPlaceholder: "E.g. 30",
    quantityLabel: "Quantity",
    quantityPlaceholder: "E.g. 10",
    quantityHint: "Create between 1 and 100 keys with the same plan and duration.",
    labelFieldLabel: "Label (optional)",
    labelFieldPlaceholder: "E.g. New Year Promo 2024",
    durationValidationError: "Duration must be between 1 and 3660 days.",
    quantityValidationError: "Quantity must be between 1 and 100.",
    cancel: "Cancel",
    creating: "Creating…",
    createN: (n: number) => `Create ${n} key${n === 1 ? "" : "s"}`,
    createFallback: "Create key",
    createError: "An error occurred while creating the key.",
    createSuccess: (n: number) => `Created ${n} license key${n === 1 ? "" : "s"}.`,
    successModalTitle: "Keys created",
    successModalCreated: (n: number, plan: string, label: string | null) =>
      `Created ${n} ${plan.toUpperCase()} key${n === 1 ? "" : "s"}${label ? ` for "${label}"` : ""}.`,
    importantNoticeLabel: "Important notice",
    importantNoticeText: "These keys are shown only once. Copy and store them safely right now.",
    keyListTitle: "Newly created keys",
    copyAll: "Copy all",
    copyKey: (n: number) => `Copy key ${n}`,
    copiedToClipboard: "Copied to clipboard.",
    copyError: "Could not copy.",
    closeModal: "Saved — close window",
    revokeModalTitle: "Confirm revocation",
    revokeModalDetail: "Are you sure you want to revoke this license key? This action cannot be undone and the key will no longer be usable.",
    revokeConfirm: "Revoke now",
    revoking: "Revoking…",
    revokeSuccess: "License key revoked.",
    revokeError: "An error occurred while revoking the key.",
  },
  vi: {
    pageTitle: "Quản trị License Keys",
    loadError: "Không thể tải dữ liệu",
    loadErrorDetail: "Vui lòng kiểm tra lại quyền truy cập của bạn hoặc thử lại sau.",
    eyebrow: "Quản trị hệ thống",
    sectionTitle: "Keys & gia hạn",
    sectionDetail: "Đối chiếu người nhận, thuê bao hiện tại, trạng thái key và lịch sử nhắc Telegram thực tế.",
    createButton: "Tạo mã mới",
    configureReminders: "Cấu hình nhắc",
    resetRenewalTest: "Reset test gia hạn",
    totalKeys: "Tổng key",
    activeSubscriptions: "Thuê bao hoạt động",
    expiringSoon: "Hết hạn trong 7 ngày",
    pendingReminders: "Lượt nhắc đang chờ",
    priorityTitle: "Thuê bao cần theo dõi",
    automationTitle: "Nhắc gia hạn Telegram",
    automationEnabled: "Đang bật",
    automationDisabled: "Đang tắt",
    automationSender: "Tài khoản gửi",
    noSender: "Chưa chọn tài khoản gửi",
    noUpcoming: "Không có thuê bao đã liên kết nào hết hạn trong 7 ngày tới.",
    openQueue: "Xem sắp hết hạn",
    inventoryTitle: "Danh mục key",
    inventoryDetail: "Trạng thái thuê bao và trạng thái key được hiển thị riêng. Không hiển thị giá trị key.",
    searchPlaceholder: "Username, Telegram, nhãn hoặc ID key",
    searchLabel: "Tìm trong danh mục key",
    subscriptionFilterLabel: "Thuê bao",
    allSubscriptions: "Mọi trạng thái",
    subscriptionActive: "Đang hoạt động",
    subscriptionSoon: "Sắp hết hạn",
    subscriptionExpired: "Đã hết hạn",
    subscriptionUnavailable: "Chưa đối chiếu",
    quickAll: "Tất cả key",
    quickSoon: "Sắp hết hạn",
    quickActive: "Thuê bao hoạt động",
    quickAvailable: "Key khả dụng",
    tableRecipient: "Người nhận",
    tableSubscription: "Thuê bao hiện tại",
    tableIdentifier: "Mã tham chiếu",
    tableKeyState: "Trạng thái key",
    tableReminder: "Nhắc gần nhất",
    noRecipient: "Key chưa được nhận",
    recipientUnavailable: "Không tìm thấy tài khoản",
    appUsername: "Tài khoản ứng dụng",
    noTelegramAccount: "Chưa liên kết tài khoản Telegram",
    noExpiry: "Không hết hạn",
    notAvailable: "Không có dữ liệu",
    noReminderRecord: "Chưa có bản ghi kỳ hạn hiện tại",
    reminderSent: "Đã gửi",
    reminderFailed: "Thất bại",
    reminderPending: "Đang chờ",
    reminderSending: "Đang gửi",
    reminderHistoryTitle: "Lịch sử nhắc",
    reminderHistoryScope: "Kỳ hạn thuê bao hiện tại",
    reminderHistoryEmpty: "Chưa có bản ghi gửi cho kỳ hạn thuê bao này.",
    reminderHistoryLoadError: "Không thể tải dữ liệu nhắc.",
    reminderDeliveryTo: "Tài khoản Telegram nhận",
    reminderAttempts: "Số lần thử",
    detailTitle: "Chi tiết license",
    detailKeyLabel: "Mã tham chiếu đã che",
    detailPlanDuration: "Gói và thời hạn key",
    detailCreated: "Ngày tạo",
    detailClaimed: "Ngày nhận",
    detailPool: "Kho key",
    keyReferenceNote: "Đây là ID nội bộ của bản ghi, không phải license key.",
    contextLoadError: "Tạm thời không tải được thông tin người nhận hoặc lịch sử nhắc.",
    noMatch: "Không tìm thấy key phù hợp với từ khóa và bộ lọc hiện tại.",
    closeDetails: "Đóng chi tiết",
    botSectionTitle: "Link mua key qua Telegram Bot",
    botSectionDetail: "Đây là link người dùng sẽ mở từ trang nâng cấp để mua license key.",
    loadingPurchaseLink: "Đang tải link mua key…",
    purchaseLinkError: "Không thể tải cấu hình link mua key. Hãy làm mới trang và thử lại.",
    botUrlLabel: "Link Telegram Bot",
    openLink: "Mở",
    savingLink: "Đang lưu…",
    saveLink: "Lưu link",
    saveLinkRequiredError: "Hãy nhập link Telegram Bot trước khi lưu.",
    saveLinkSuccess: "Đã lưu link mua key Telegram.",
    saveLinkError: "Không thể lưu link mua key Telegram.",
    purchaseLinkNote: (hasLink: boolean) =>
      hasLink
        ? "Chỉ chấp nhận link HTTPS thuộc t.me hoặc telegram.me."
        : "Chưa cấu hình link mua key. Người dùng sẽ được yêu cầu liên hệ quản trị viên.",
    reminderTitle: "Nhắc mua key qua Telegram",
    reminderDetail: "Dùng tài khoản Telegram của admin để nhắn riêng trực tiếp đến tài khoản người dùng đã liên kết. Mỗi tin có thể kèm link gia hạn trên web và link bot để mua key.",
    reminderEnabled: "Bật tự động nhắc mua key",
    reminderSender: "Tài khoản admin gửi tin",
    reminderSenderPlaceholder: "Chọn tài khoản Telegram admin đang kết nối",
    reminderDays: "Nhắc trước khi hết hạn",
    reminderDay: (days: number) => `${days} ngày`,
    reminderAfterExpiry: "Gửi thêm một lần sau khi hết hạn",
     reminderMessageVi: "Mẫu tin nhắn tiếng Việt",
     reminderMessageEn: "Mẫu tin nhắn tiếng Anh",
     reminderRenewalUrl: "Link gia hạn trên website",
     reminderRenewalUrlPlaceholder: "https://tele.khaimmo.shop/upgrade",
     reminderRenewalUrlNote: "Nhập đầy đủ URL HTTPS mà người dùng sẽ mở để gia hạn gói.",
     reminderMessageHint: "Placeholder dùng được: {days}, {expiresAt}, {username}, {renewalLink}, {purchaseLink}. Hệ thống chọn mẫu theo ngôn ngữ giao diện của người dùng.",
    reminderSave: "Lưu cấu hình nhắc",
    reminderSaving: "Đang lưu…",
    reminderSaved: "Đã lưu cấu hình nhắc mua key qua Telegram.",
    reminderLoadError: "Không thể tải cấu hình nhắc mua key.",
    reminderDisabledNote: "Tính năng nhắc đang tắt.",
    reminderDisconnected: "Tài khoản gửi được chọn chưa kết nối.",
    filterLabel: "Bộ lọc:",
    filterAllStatus: "Tất cả trạng thái",
    filterAvailable: "Khả dụng",
    filterClaimed: "Đã kích hoạt",
    filterRevoked: "Đã thu hồi",
    filterAllPlans: "Tất cả gói",
    tableKeyLabel: "Mã / Nhãn",
    tablePlanDuration: "Gói / Thời hạn",
    tableSalePrice: "Giá bán",
    tableStatus: "Trạng thái",
    tableCreated: "Ngày tạo",
    tableUsage: "Sử dụng",
    tableActions: "Hành động",
    durationDays: (n: number) => `${n} ngày`,
    statusAvailable: "Khả dụng",
    statusClaimed: "Đã kích hoạt",
    statusRevoked: "Đã thu hồi",
    createdBy: "Bởi:",
    bySystem: "Hệ thống",
    claimedAt: (dateStr: string) => dateStr,
    revokedBy: (username: string) => `Bởi ${username}`,
    revokeAction: "Thu hồi",
    emptyTitle: "Chưa có mã bản quyền nào",
    emptyDetail: "Bạn chưa tạo mã bản quyền nào hoặc không có mã nào phù hợp với bộ lọc hiện tại.",
    createModalTitle: "Tạo mã bản quyền mới",
    createModalDetail: "Thời hạn gói bắt đầu tính từ lúc người dùng kích hoạt mã thành công.",
    planLabel: "Gói đăng ký",
    durationLabel: "Thời hạn (Ngày)",
    salePriceLabel: "Giá bán (VND)",
    salePricePlaceholder: "VD: 149000",
      salePriceHint: "Key Website chưa bán tự động theo giá hiện tại trong Cài đặt đơn mua. Khi đã bán, hoặc ở kho bán ngoài, giá được giữ làm snapshot lịch sử. Có thể sửa nếu đây là giá khuyến mãi.",
    salePriceValidationError: "Giá bán phải là số nguyên từ 0 đến 1.000.000.000 VND.",
    durationPlaceholder: "VD: 30",
    quantityLabel: "Số lượng mã",
    quantityPlaceholder: "VD: 10",
    quantityHint: "Tạo từ 1 đến 100 mã cho cùng gói và thời hạn.",
    labelFieldLabel: "Nhãn (Không bắt buộc)",
    labelFieldPlaceholder: "VD: Khuyến mãi Tết 2024",
    durationValidationError: "Thời hạn phải từ 1 đến 3660 ngày.",
    quantityValidationError: "Số lượng mã phải từ 1 đến 100.",
    cancel: "Hủy",
    creating: "Đang tạo...",
    createN: (n: number) => `Tạo ${n} mã`,
    createFallback: "Tạo mã",
    createError: "Có lỗi xảy ra khi tạo mã.",
    createSuccess: (n: number) => `Đã tạo ${n} mã bản quyền.`,
    successModalTitle: "Tạo mã thành công",
    successModalCreated: (n: number, plan: string, label: string | null) =>
      `Đã tạo ${n} mã ${plan.toUpperCase()}${label ? ` cho "${label}"` : ""}.`,
    importantNoticeLabel: "Lưu ý quan trọng",
    importantNoticeText: "Mã này chỉ được hiển thị một lần duy nhất. Vui lòng sao chép và lưu trữ an toàn ngay bây giờ.",
    keyListTitle: "Danh sách mã vừa tạo",
    copyAll: "Sao chép tất cả",
    copyKey: (n: number) => `Sao chép mã ${n}`,
    copiedToClipboard: "Đã sao chép vào khay nhớ tạm.",
    copyError: "Không thể sao chép.",
    closeModal: "Đã lưu, đóng cửa sổ",
    revokeModalTitle: "Xác nhận thu hồi",
    revokeModalDetail: "Bạn có chắc chắn muốn thu hồi mã bản quyền này? Hành động này không thể hoàn tác và mã sẽ không thể được sử dụng nữa.",
    revokeConfirm: "Thu hồi ngay",
    revoking: "Đang thu hồi...",
    revokeSuccess: "Đã thu hồi mã bản quyền.",
    revokeError: "Có lỗi xảy ra khi thu hồi.",
  },
} as const;

function formatKeyDate(dateStr: string | Date, language: string, includeTime = false): string {
  try {
    const locale = language === "vi" ? viLocale : enUS;
    const pattern = includeTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";
    const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
    return format(date, pattern, { locale });
  } catch {
    return String(dateStr);
  }
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reminderStatusLabel(status: string, language: string): string {
  const labels = language === "vi"
    ? { sent: "Đã gửi", failed: "Thất bại", pending: "Đang chờ", sending: "Đang gửi" }
    : { sent: "Sent", failed: "Failed", pending: "Queued", sending: "Sending" };
  return labels[status as keyof typeof labels] ?? status;
}

function reminderTypeLabel(reminderType: string, language: string): string {
  if (reminderType === "expired") return language === "vi" ? "Sau khi hết hạn" : "After expiry";
  const match = /^(\d+)d$/.exec(reminderType);
  if (match) return language === "vi" ? `Trước hạn ${match[1]} ngày` : `${match[1]} days before expiry`;
  return reminderType;
}

function formatVnd(value: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
}

function configuredSalePrice(
  settings: PurchaseOrderSettings | undefined,
  plan: LicenseKeyPlan,
  durationDays: number,
): number {
  if (!settings || !Number.isInteger(durationDays) || durationDays < 1) return 0;
  const planCode = plan.toUpperCase() as keyof PurchaseOrderSettings["pricesVnd"];
  const configuredPrice = settings.pricesVnd[planCode];
  const configuredDuration = settings.durationsDays?.[planCode];
  if (!Number.isFinite(configuredPrice) || configuredDuration === undefined || !Number.isInteger(configuredDuration) || configuredDuration < 1) return 0;
  return Math.max(0, Math.round(configuredPrice * durationDays / configuredDuration));
}

export function AdminLicenseKeysPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const text = copy[language];

  // Filters
  const [statusFilter, setStatusFilter] = useState<LicenseKeyStatus | "all">("all");
  const [planFilter, setPlanFilter] = useState<PlanCode | "all">("all");
  const [poolFilter, setPoolFilter] = useState<LicenseKeyPool | "all">("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState<"all" | "active" | "expiring" | "expired" | "unmatched">("all");
  const [quickFilter, setQuickFilter] = useState<"all" | "soon" | "active" | "available">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  // Queries
  const queryParams = {
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(planFilter !== "all" ? { plan: planFilter } : {}),
    ...(poolFilter !== "all" ? { pool: poolFilter } : {}),
  };
  const { data: licenseKeys, isLoading, error } = useListAdminLicenseKeys(queryParams, {
    query: {
      queryKey: getListAdminLicenseKeysQueryKey(queryParams),
    },
  });
  const usersQueryParams = {};
  const {
    data: adminUsers,
    error: usersError,
    isLoading: isUsersLoading,
  } = useListAdminUsers(usersQueryParams, {
    query: {
      queryKey: getListAdminUsersQueryKey(usersQueryParams),
      staleTime: 30_000,
    },
  });
  const {
    data: recipientDetails,
    error: recipientDetailsError,
    isLoading: isRecipientDetailsLoading,
  } = useListAdminLicenseKeyRecipientDetails({
    query: {
      queryKey: getListAdminLicenseKeyRecipientDetailsQueryKey(),
      staleTime: 30_000,
    },
  });
  const {
    data: purchaseSettings,
    isLoading: isPurchaseSettingsLoading,
    isError: isPurchaseSettingsError,
  } = useGetAdminPurchaseSettings();
  const { data: purchaseOrderSettings } = useGetAdminPurchaseOrderSettings();
  const {
    data: reminderData,
    isLoading: isReminderLoading,
    isError: isReminderError,
  } = useGetAdminLicenseReminderSettings();

  // Modals & UI State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New License Key State
  const [newLicenseData, setNewLicenseData] = useState<{
    keys: string[];
    plan: LicenseKeyPlan;
    label: string | null;
  } | null>(null);

  // Form State
  const [formPlan, setFormPlan] = useState<LicenseKeyPlan>("pro");
  const [formDuration, setFormDuration] = useState<string>("30");
  const [formQuantity, setFormQuantity] = useState<string>("1");
  const [formSalePrice, setFormSalePrice] = useState<string>("");
  const [formLabel, setFormLabel] = useState<string>("");
  const [formPool, setFormPool] = useState<LicenseKeyPool>("normal");
  const lastAutoSalePrice = useRef<number | null>(null);
  const [telegramPurchaseUrl, setTelegramPurchaseUrl] = useState("");
  const [reminderForm, setReminderForm] = useState<AdminLicenseReminderSettings | null>(null);

  useEffect(() => {
    if (purchaseSettings) {
      setTelegramPurchaseUrl(purchaseSettings.telegramPurchaseUrl ?? "");
    }
  }, [purchaseSettings]);

  useEffect(() => {
    if (reminderData && !reminderForm) setReminderForm(reminderData.settings);
  }, [reminderData, reminderForm]);

  // Mutations
  const createMutation = useCreateAdminLicenseKey();
  const revokeMutation = useRevokeAdminLicenseKey();
  const purchaseSettingsMutation = useUpdateAdminPurchaseSettings();
  const reminderMutation = useUpdateAdminLicenseReminderSettings();
  const resetRenewalTestMutation = useResetAdminRenewalTestAccount();

  const handleResetRenewalTestAccount = () => {
    if (resetRenewalTestMutation.isPending) return;
    if (!window.confirm("Reset tài khoản test_renewal về PLUS đã hết hạn? Dữ liệu đơn và license key của riêng tài khoản test sẽ bị xóa.")) return;
    resetRenewalTestMutation.mutate(undefined, {
      onSuccess: (result) => {
        setToastMessage(result.created
          ? "Đã tạo và reset tài khoản test_renewal. Dùng chức năng reset mật khẩu admin để đăng nhập."
          : "Đã reset tài khoản test_renewal về PLUS đã hết hạn.");
      },
      onError: () => setToastMessage("Không thể reset tài khoản test gia hạn."),
    });
  };

  useEffect(() => {
    const durationDays = Number(formDuration);
    if (!Number.isInteger(durationDays) || durationDays < 1) return;
    const nextPrice = configuredSalePrice(purchaseOrderSettings, formPlan, durationDays);
    const currentPrice = Number(formSalePrice);
    if (!formSalePrice || currentPrice === lastAutoSalePrice.current) {
      setFormSalePrice(String(nextPrice));
      lastAutoSalePrice.current = nextPrice;
    }
  }, [formPlan, formDuration, purchaseOrderSettings]);

  const handleSavePurchaseLink = () => {
    const value = telegramPurchaseUrl.trim();
    if (!value) {
      setToastMessage(text.saveLinkRequiredError);
      return;
    }

    purchaseSettingsMutation.mutate(
      { data: { telegramPurchaseUrl: value } },
      {
        onSuccess: (settings) => {
          setTelegramPurchaseUrl(settings.telegramPurchaseUrl ?? "");
          queryClient.invalidateQueries({ queryKey: getGetAdminPurchaseSettingsQueryKey() });
          setToastMessage(text.saveLinkSuccess);
        },
        onError: (mutationError: Error) => {
          const apiError = (mutationError as { data?: { error?: string } }).data?.error;
          setToastMessage(localizedErrorMessage(
            apiError ? new Error(apiError) : mutationError,
            language,
            text.saveLinkError,
          ));
        },
      },
    );
  };

  const handleSaveReminderSettings = () => {
    if (!reminderForm) return;
    reminderMutation.mutate(
      { data: reminderForm },
      {
        onSuccess: (next) => {
          setReminderForm(next.settings);
          queryClient.invalidateQueries({ queryKey: getGetAdminLicenseReminderSettingsQueryKey() });
          setToastMessage(text.reminderSaved);
        },
        onError: (mutationError: Error) => {
          const apiError = (mutationError as { data?: { error?: string } }).data?.error;
          setToastMessage(localizedErrorMessage(
            apiError ? new Error(apiError) : mutationError,
            language,
            text.reminderLoadError,
          ));
        },
      },
    );
  };

  const handleCreate = () => {
    const durationDays = Number(formDuration);
    const quantity = Number(formQuantity);
    const salePriceVnd = Number(formSalePrice);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3660) {
      setToastMessage(text.durationValidationError);
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      setToastMessage(text.quantityValidationError);
      return;
    }
    if (!Number.isInteger(salePriceVnd) || salePriceVnd < 0 || salePriceVnd > 1_000_000_000) {
      setToastMessage(text.salePriceValidationError);
      return;
    }

    createMutation.mutate(
      {
        data: {
          plan: formPlan,
          durationDays,
          quantity,
          salePriceVnd,
          label: formLabel.trim() || undefined,
          pool: formPool,
        },
      },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListAdminLicenseKeysQueryKey() });
          setNewLicenseData({
            keys: result.licenseKeys,
            plan: formPlan,
            label: result.licenses[0]?.label ?? null,
          });
          setFormPlan("pro");
          setFormDuration("30");
          setFormQuantity("1");
           setFormSalePrice(String(configuredSalePrice(purchaseOrderSettings, "pro", 30)));
           lastAutoSalePrice.current = configuredSalePrice(purchaseOrderSettings, "pro", 30);
          setFormLabel("");
           setFormPool("normal");
          setToastMessage(text.createSuccess(result.licenseKeys.length));
        },
        onError: () => {
          setToastMessage(text.createError);
        },
      }
    );
  };

  const handleRevoke = () => {
    if (!revokeConfirmId) return;

    revokeMutation.mutate(
      { licenseKeyId: revokeConfirmId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminLicenseKeysQueryKey() });
          setRevokeConfirmId(null);
          setToastMessage(text.revokeSuccess);
        },
        onError: () => {
          setToastMessage(text.revokeError);
          setRevokeConfirmId(null);
        },
      }
    );
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToastMessage(text.copiedToClipboard);
    } catch {
      setToastMessage(text.copyError);
    }
  };

  const closeNewLicenseModal = () => {
    setNewLicenseData(null);
    setIsCreateModalOpen(false);
  };

  const usersById = useMemo(() => new Map(
    (adminUsers ?? []).map((user) => [user.id, user]),
  ), [adminUsers]);
  const recipientDetailsByUserId = useMemo(() => new Map(
    (recipientDetails ?? []).map((details) => [details.userId, details]),
  ), [recipientDetails]);
  const licenseRows = useMemo(() => (licenseKeys ?? []).map((key) => {
    const user = key.claimedByUserId ? usersById.get(key.claimedByUserId) : undefined;
    const details = key.claimedByUserId ? recipientDetailsByUserId.get(key.claimedByUserId) : undefined;
    const expiresAt = asDate(user?.subscription.expiresAt);
    const daysLeft = expiresAt
      ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000)
      : null;
    const subscriptionState = !user
      ? key.status === "claimed" ? "unmatched" : "none"
      : user.subscription.status !== "active"
        ? "expired"
        : daysLeft !== null && daysLeft >= 0 && daysLeft <= 7
          ? "expiring"
          : "active";
    return { key, user, details, expiresAt, daysLeft, subscriptionState };
  }), [licenseKeys, usersById, recipientDetailsByUserId]);

  const filteredKeys = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase(language === "vi" ? "vi" : "en");
    return licenseRows.filter((row) => {
      const { key, user, details, subscriptionState } = row;
      if (statusFilter !== "all" && key.status !== statusFilter) return false;
      if (planFilter !== "all" && key.plan !== planFilter) return false;
      if (poolFilter !== "all" && key.pool !== poolFilter) return false;
      if (
        subscriptionFilter === "active" && subscriptionState !== "active" && subscriptionState !== "expiring"
        || subscriptionFilter === "expiring" && subscriptionState !== "expiring"
        || subscriptionFilter === "expired" && subscriptionState !== "expired"
        || subscriptionFilter === "unmatched" && subscriptionState !== "unmatched" && subscriptionState !== "none"
      ) return false;
      if (
        quickFilter === "soon" && subscriptionState !== "expiring"
        || quickFilter === "active" && subscriptionState !== "active" && subscriptionState !== "expiring"
        || quickFilter === "available" && key.status !== "available"
      ) return false;
      if (normalizedSearch) {
        const searchable = [
          key.id,
          key.label ?? "",
          key.plan,
          key.pool,
          key.claimedByUsername ?? "",
          user?.username ?? "",
          ...(details?.telegramAccounts.map((account) => account.username ?? "") ?? []),
        ].join(" ").toLocaleLowerCase(language === "vi" ? "vi" : "en");
        if (!searchable.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }, [licenseRows, statusFilter, planFilter, poolFilter, subscriptionFilter, quickFilter, searchTerm, language]);

  const subscriberRows = useMemo(() => {
    const byUserId = new Map<string, (typeof licenseRows)[number]>();
    for (const row of licenseRows) {
      if (row.user && row.key.claimedByUserId) byUserId.set(row.key.claimedByUserId, row);
    }
    return [...byUserId.values()];
  }, [licenseRows]);
  const expiringRecipients = useMemo(() => subscriberRows
    .filter((row) => row.subscriptionState === "expiring")
    .sort((left, right) => (left.daysLeft ?? 99) - (right.daysLeft ?? 99)), [subscriberRows]);
  const pendingReminderCount = useMemo(() => (recipientDetails ?? [])
    .flatMap((details) => details.reminders)
    .filter((reminder) => reminder.status === "pending" || reminder.status === "sending")
    .length, [recipientDetails]);
  const selectedRow = selectedKeyId ? licenseRows.find((row) => row.key.id === selectedKeyId) : undefined;

  if (error) {
    return (
      <AppLayout activePage="license-keys" title={text.pageTitle}>
        <Panel className="p-8 text-center text-[#e11d48]">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <h2 className="mb-2 text-lg font-bold">{text.loadError}</h2>
          <p className="text-sm font-medium opacity-80">
            {text.loadErrorDetail}
          </p>
        </Panel>
      </AppLayout>
    );
  }

  const quantityNum = Number(formQuantity);
  const isValidQuantity = Number.isInteger(quantityNum) && quantityNum >= 1 && quantityNum <= 100;

  return (
    <AppLayout activePage="license-keys" title={text.pageTitle}>
      <div className="license-key-page">
      <SectionHeader
        eyebrow={text.eyebrow}
        title={text.sectionTitle}
        detail={text.sectionDetail}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <QuietButton onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} data-testid="toggle-license-settings">
              <Send className="h-4 w-4" />
              {text.configureReminders}
            </QuietButton>
            <QuietButton onClick={handleResetRenewalTestAccount}>
              {resetRenewalTestMutation.isPending ? (language === "vi" ? "Đang reset…" : "Resetting…") : text.resetRenewalTest}
            </QuietButton>
            <PrimaryButton onClick={() => setIsCreateModalOpen(true)}>
              {text.createButton}
            </PrimaryButton>
          </div>
        }
      />

      <section className="license-key-page__stats" aria-label={language === "vi" ? "Tóm tắt license" : "License summary"}>
        <article className="license-key-page__stat">
          <span className="license-key-page__stat-icon"><KeyRound /></span>
          <div><span className="license-key-page__stat-label">{text.totalKeys}</span><strong>{isLoading ? "—" : licenseRows.length}</strong></div>
          <span className="license-key-page__stat-note">{language === "vi" ? "trong kho" : "in inventory"}</span>
        </article>
        <article className="license-key-page__stat">
          <span className="license-key-page__stat-icon"><Check /></span>
          <div><span className="license-key-page__stat-label">{text.activeSubscriptions}</span><strong>{isUsersLoading ? "—" : subscriberRows.filter((row) => row.subscriptionState === "active" || row.subscriptionState === "expiring").length}</strong></div>
          <span className="license-key-page__stat-note">{language === "vi" ? "tài khoản đã nhận key" : "claimed accounts"}</span>
        </article>
        <article className="license-key-page__stat">
          <span className="license-key-page__stat-icon license-key-page__stat-icon--amber"><Clock3 /></span>
          <div><span className="license-key-page__stat-label">{text.expiringSoon}</span><strong>{isUsersLoading ? "—" : expiringRecipients.length}</strong></div>
          <span className="license-key-page__stat-note">{language === "vi" ? "thuê bao" : "subscriptions"}</span>
        </article>
        <article className="license-key-page__stat">
          <span className="license-key-page__stat-icon license-key-page__stat-icon--rose"><Send /></span>
          <div><span className="license-key-page__stat-label">{text.pendingReminders}</span><strong>{isRecipientDetailsLoading ? "—" : pendingReminderCount}</strong></div>
          <span className="license-key-page__stat-note">{language === "vi" ? "bản ghi đang chờ/gửi" : "pending or sending"}</span>
        </article>
      </section>

      <section className="license-key-page__workbench">
        <div className="license-key-page__queue">
          <div className="license-key-page__section-head">
            <div className="license-key-page__section-title"><Clock3 /><span>{text.priorityTitle}</span><span className="license-key-page__count">{isUsersLoading ? "—" : expiringRecipients.length}</span></div>
            <button type="button" className="license-key-page__text-link" onClick={() => { setQuickFilter("soon"); setSubscriptionFilter("all"); }}>
              {text.openQueue}<ChevronRight size={14} />
            </button>
          </div>
          {isUsersLoading ? (
            <p className="license-key-page__empty">{language === "vi" ? "Đang tải thuê bao…" : "Loading subscriptions…"}</p>
          ) : expiringRecipients.length === 0 ? (
            <p className="license-key-page__empty">{text.noUpcoming}</p>
          ) : (
            <div className="license-key-page__queue-list">
              {expiringRecipients.slice(0, 3).map((row) => (
                <button key={row.key.claimedByUserId} type="button" className="license-key-page__queue-item" onClick={() => setSelectedKeyId(row.key.id)}>
                  <span className="license-key-page__queue-person">
                    <span className="license-key-page__avatar">{(row.user?.username ?? "?").slice(0, 2).toUpperCase()}</span>
                    <span><strong>{row.user?.username ?? row.key.claimedByUsername ?? text.recipientUnavailable}</strong>
                      <small>{row.details?.telegramAccounts.find((account) => account.status === "connected" && account.username)?.username
                        ? `@${row.details.telegramAccounts.find((account) => account.status === "connected" && account.username)!.username!.replace(/^@+/, "")}`
                        : text.noTelegramAccount}</small>
                    </span>
                  </span>
                  <span className="license-key-page__queue-meta"><strong>{row.daysLeft} {language === "vi" ? "ngày" : "days"}</strong><small>{row.expiresAt ? formatKeyDate(row.expiresAt, language) : "—"}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="license-key-page__automation">
          <div className="license-key-page__automation-top">
            <span className="license-key-page__automation-icon"><Bot /></span>
            <div><strong>{text.automationTitle}</strong><p>{text.reminderDetail}</p></div>
          </div>
          <div className="license-key-page__automation-bottom">
            <span>{text.automationSender}: <strong>
              {reminderData?.accounts.find((account) => account.id === reminderForm?.senderAccountId)
                ? `${reminderData.accounts.find((account) => account.id === reminderForm?.senderAccountId)!.ownerUsername} · ${reminderData.accounts.find((account) => account.id === reminderForm?.senderAccountId)!.name}`
                : text.noSender}
            </strong></span>
            <span className={`license-key-page__reminder-toggle-label ${reminderForm?.enabled ? "is-on" : ""}`}>
              {reminderForm?.enabled ? text.automationEnabled : text.automationDisabled}
            </span>
          </div>
          {reminderData?.accounts.find((account) => account.id === reminderForm?.senderAccountId)?.username && (
            <p className="license-key-page__automation-handle">
              @{reminderData.accounts.find((account) => account.id === reminderForm?.senderAccountId)!.username!.replace(/^@+/, "")}
            </p>
          )}
        </div>
      </section>

      {settingsOpen && <div className="license-key-page__settings">
      <button
        type="button"
        onClick={() => navigate("/admin/purchase-orders")}
        className="mb-6 flex w-full flex-col gap-1 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-5 text-left transition-colors hover:bg-[#dbeafe]"
        data-testid="link-admin-purchase-orders"
      >
        <span className="font-extrabold text-[#1a2b88]">{language === "vi" ? "Thanh toán & đơn mua gói →" : "Payments & plan orders →"}</span>
        <span className="text-sm text-[#475569]">{language === "vi" ? "Đặt giá hiện trên trang Nâng cấp, nhập tài khoản nhận tiền và duyệt đơn ở đây." : "Set prices shown on Upgrade, payment destinations, and review orders here."}</span>
      </button>

      <Panel className="mb-6 overflow-hidden border-[#dbeafe]">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eff6ff] text-[#1a2b88]">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-extrabold text-[#0f172a]">{text.botSectionTitle}</h2>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-[#64748b]">
                {text.botSectionDetail}
              </p>
            </div>
          </div>

          {isPurchaseSettingsLoading ? (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#64748b]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#dbeafe] border-t-[#1a2b88]" />
              {text.loadingPurchaseLink}
            </div>
          ) : isPurchaseSettingsError ? (
            <div className="rounded-xl border border-[#ffe4e6] bg-[#fff1f2] px-4 py-3 text-[13px] font-semibold text-[#be123c]">
              {text.purchaseLinkError}
            </div>
          ) : (
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                handleSavePurchaseLink();
              }}
            >
              <label className="block min-w-0 flex-1">
                <span className="mb-2 block text-[12px] font-extrabold uppercase tracking-wider text-[#475569]">
                  {text.botUrlLabel}
                </span>
                <input
                  type="url"
                  value={telegramPurchaseUrl}
                  onChange={(event) => setTelegramPurchaseUrl(event.target.value)}
                  placeholder="https://t.me/your_bot"
                  data-testid="input-telegram-purchase-url"
                  className="w-full rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3 text-[15px] font-semibold text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                />
              </label>
              <div className="flex gap-2">
                {purchaseSettings?.telegramPurchaseUrl && (
                  <a
                    href={purchaseSettings.telegramPurchaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3 text-[14px] font-extrabold text-[#475569] transition-all hover:bg-[#f8fafc]"
                    data-testid="link-open-telegram-purchase"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {text.openLink}
                  </a>
                )}
                <PrimaryButton type="submit" disabled={purchaseSettingsMutation.isPending}>
                  <Save className="h-4 w-4" />
                  {purchaseSettingsMutation.isPending ? text.savingLink : text.saveLink}
                </PrimaryButton>
              </div>
            </form>
          )}

          {!isPurchaseSettingsLoading && !isPurchaseSettingsError && (
            <p className="text-[12px] font-medium text-[#64748b]">
              {text.purchaseLinkNote(!!purchaseSettings?.telegramPurchaseUrl)}
            </p>
          )}
        </div>
      </Panel>

      <Panel className="mb-6 overflow-hidden border-[#dbeafe]">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eef2ff] text-[#1a2b88]">
              <Send className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-extrabold text-[#0f172a]">{text.reminderTitle}</h2>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-[#64748b]">{text.reminderDetail}</p>
            </div>
          </div>

          {isReminderError ? (
            <div className="rounded-xl border border-[#ffe4e6] bg-[#fff1f2] px-4 py-3 text-[13px] font-semibold text-[#be123c]">
              {text.reminderLoadError}
            </div>
          ) : isReminderLoading || !reminderForm ? (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#64748b]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#dbeafe] border-t-[#1a2b88]" />
              Loading…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#e7edf4] bg-[#f8fafc] px-4 py-3">
                <div>
                  <p className="text-[13px] font-extrabold text-[#0f172a]">{text.reminderEnabled}</p>
                  {!reminderForm.enabled && <p className="mt-1 text-[12px] font-medium text-[#64748b]">{text.reminderDisabledNote}</p>}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reminderForm.enabled}
                  onClick={() => setReminderForm({ ...reminderForm, enabled: !reminderForm.enabled })}
                  className={`relative h-6 w-11 rounded-full transition ${reminderForm.enabled ? "bg-[#1a2b88]" : "bg-[#cbd5e1]"}`}
                  data-testid="toggle-license-reminders"
                >
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${reminderForm.enabled ? "left-6" : "left-1"}`} />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[12px] font-extrabold uppercase tracking-wider text-[#475569]">{text.reminderSender}</span>
                  <select
                    value={reminderForm.senderAccountId ?? ""}
                    onChange={(event) => setReminderForm({ ...reminderForm, senderAccountId: event.target.value || null })}
                    className="h-12 w-full rounded-2xl border border-[#cbd5e1] bg-white px-4 text-[14px] font-semibold text-[#0f172a] outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                    data-testid="select-license-reminder-sender"
                  >
                    <option value="">{text.reminderSenderPlaceholder}</option>
                    {(reminderData?.accounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.ownerUsername} · {account.name}{account.username ? ` (@${account.username.replace(/^@+/, "")})` : ""} · {account.status}
                      </option>
                    ))}
                  </select>
                  {reminderForm.senderAccountId && reminderData?.accounts.find((account) => account.id === reminderForm.senderAccountId)?.status !== "connected" && (
                    <p className="mt-1.5 text-[12px] font-semibold text-[#b45309]">{text.reminderDisconnected}</p>
                  )}
                </label>

                <label className="block">
                  <span className="mb-2 block text-[12px] font-extrabold uppercase tracking-wider text-[#475569]">{text.reminderRenewalUrl}</span>
                  <input
                    type="url"
                    value={reminderForm.renewalUrl}
                    onChange={(event) => setReminderForm({ ...reminderForm, renewalUrl: event.target.value })}
                    placeholder={text.reminderRenewalUrlPlaceholder}
                    className="h-12 w-full rounded-2xl border border-[#cbd5e1] bg-white px-4 text-[14px] font-semibold text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                    data-testid="input-license-reminder-renewal-url"
                  />
                  <span className="mt-1.5 block text-[12px] font-medium text-[#64748b]">{text.reminderRenewalUrlNote}</span>
                </label>

                <div>
                  <span className="mb-2 block text-[12px] font-extrabold uppercase tracking-wider text-[#475569]">{text.reminderDays}</span>
                  <div className="flex flex-wrap gap-2">
                    {[7, 3, 1].map((days) => {
                      const selected = reminderForm.reminderDays.includes(days);
                      return (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setReminderForm({
                            ...reminderForm,
                            reminderDays: selected
                              ? reminderForm.reminderDays.filter((value) => value !== days)
                              : [...reminderForm.reminderDays, days].sort((left, right) => right - left),
                          })}
                          className={`rounded-xl border px-3.5 py-2.5 text-[13px] font-extrabold transition ${selected ? "border-[#1a2b88] bg-[#eef2ff] text-[#1a2b88]" : "border-[#dbe2ea] bg-white text-[#64748b] hover:border-[#a5b4fc]"}`}
                        >
                          {text.reminderDay(days)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-3 text-[13px] font-bold text-[#475569]">
                <input
                  type="checkbox"
                  checked={reminderForm.sendAfterExpiry}
                  onChange={(event) => setReminderForm({ ...reminderForm, sendAfterExpiry: event.target.checked })}
                  className="h-4 w-4 accent-[#1a2b88]"
                />
                {text.reminderAfterExpiry}
              </label>

               <label className="block">
                 <span className="mb-2 block text-[12px] font-extrabold uppercase tracking-wider text-[#475569]">{text.reminderMessageVi}</span>
                <textarea
                  rows={4}
                  maxLength={4096}
                   value={reminderForm.messageVi}
                   onChange={(event) => setReminderForm({ ...reminderForm, messageVi: event.target.value })}
                  className="w-full resize-y rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3 text-[14px] font-medium leading-6 text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                   data-testid="textarea-license-reminder-message-vi"
                />
               </label>
               <label className="block">
                 <span className="mb-2 block text-[12px] font-extrabold uppercase tracking-wider text-[#475569]">{text.reminderMessageEn}</span>
                 <textarea
                   rows={4}
                   maxLength={4096}
                   value={reminderForm.messageEn}
                   onChange={(event) => setReminderForm({ ...reminderForm, messageEn: event.target.value })}
                   className="w-full resize-y rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3 text-[14px] font-medium leading-6 text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10"
                   data-testid="textarea-license-reminder-message-en"
                 />
                 <p className="mt-1.5 text-[12px] font-medium text-[#64748b]">{text.reminderMessageHint}</p>
              </label>

              <div className="flex justify-end">
                <PrimaryButton
                  onClick={handleSaveReminderSettings}
                   disabled={reminderMutation.isPending || reminderForm.reminderDays.length === 0 || !reminderForm.renewalUrl.trim() || !reminderForm.messageVi.trim() || !reminderForm.messageEn.trim()}
                >
                  <Save className="h-4 w-4" />
                  {reminderMutation.isPending ? text.reminderSaving : text.reminderSave}
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      </Panel>
      </div>}

      {(usersError || recipientDetailsError) && (
        <div className="license-key-page__context-warning" role="status">
          <AlertCircle size={16} /> {text.contextLoadError}
        </div>
      )}
      <section className="license-key-page__inventory">
        <div className="license-key-page__inventory-head">
          <div>
            <h2>{text.inventoryTitle}</h2>
            <p>{text.inventoryDetail}</p>
          </div>
          <label className="license-key-page__search">
            <Search size={16} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={text.searchPlaceholder}
              aria-label={text.searchLabel}
              data-testid="search-license-inventory"
            />
          </label>
        </div>
        <div className="license-key-page__filters">
          <div className="license-key-page__quick-filters" role="group" aria-label={text.subscriptionFilterLabel}>
            {([
              ["all", text.quickAll],
              ["soon", text.quickSoon],
              ["active", text.quickActive],
              ["available", text.quickAvailable],
            ] as const).map(([filter, label]) => (
              <button key={filter} type="button" className={`license-key-page__pill ${quickFilter === filter ? "is-selected" : ""}`} onClick={() => setQuickFilter(filter)}>
                {filter === "all" && <Filter size={12} />}
                {label}
              </button>
            ))}
          </div>
          <div className="license-key-page__select-filters">
            <label>
              <span>{text.subscriptionFilterLabel}</span>
              <select value={subscriptionFilter} onChange={(event) => setSubscriptionFilter(event.target.value as typeof subscriptionFilter)} aria-label={text.subscriptionFilterLabel}>
                <option value="all">{text.allSubscriptions}</option>
                <option value="active">{text.subscriptionActive}</option>
                <option value="expiring">{text.subscriptionSoon}</option>
                <option value="expired">{text.subscriptionExpired}</option>
                <option value="unmatched">{text.subscriptionUnavailable}</option>
              </select>
            </label>
            <label>
              <span>{text.tableKeyState}</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LicenseKeyStatus | "all")} aria-label={text.tableKeyState}>
                <option value="all">{text.filterAllStatus}</option>
                <option value="available">{text.filterAvailable}</option>
                <option value="claimed">{text.filterClaimed}</option>
                <option value="revoked">{text.filterRevoked}</option>
              </select>
            </label>
            <label>
              <span>{text.planLabel}</span>
              <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value as PlanCode | "all")} aria-label={text.planLabel}>
                <option value="all">{text.filterAllPlans}</option>
                <option value="plus">PLUS</option>
                <option value="pro">PRO</option>
                <option value="unlimited">UNLIMITED</option>
              </select>
            </label>
            <label>
              <span>{text.detailPool}</span>
              <select value={poolFilter} onChange={(event) => setPoolFilter(event.target.value as LicenseKeyPool | "all")} aria-label={text.detailPool}>
                <option value="all">{language === "vi" ? "Tất cả kho" : "All pools"}</option>
                <option value="normal">{language === "vi" ? "Kho website" : "Website"}</option>
                <option value="external">{language === "vi" ? "Kho bán ngoài" : "External"}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="license-key-page__table-scroll">
          {isLoading ? (
            <div className="license-key-page__loading"><span />{language === "vi" ? "Đang tải danh mục key…" : "Loading license inventory…"}</div>
          ) : filteredKeys.length === 0 ? (
            <div className="license-key-page__empty-state">
              <Key size={24} />
              <strong>{text.noMatch}</strong>
            </div>
          ) : (
            <table className="license-key-page__table">
              <thead>
                <tr>
                  <th>{text.tableRecipient}</th>
                  <th>{text.tableSubscription}</th>
                  <th>{text.tableIdentifier}</th>
                  <th>{text.tableKeyState}</th>
                  <th>{text.tableReminder}</th>
                  <th aria-label={text.tableActions} />
                </tr>
              </thead>
              <tbody>
                {filteredKeys.map((row) => {
                  const { key, user, details, expiresAt, daysLeft, subscriptionState } = row;
                  const linkedAccount = details?.telegramAccounts.find((account) => account.username && account.status === "connected")
                    ?? details?.telegramAccounts.find((account) => account.username);
                  const latestReminder = details?.reminders[0];
                  const subLabel = subscriptionState === "active"
                    ? text.subscriptionActive
                    : subscriptionState === "expiring"
                      ? text.subscriptionSoon
                      : subscriptionState === "expired"
                        ? text.subscriptionExpired
                        : text.subscriptionUnavailable;
                  const keyLabel = key.status === "available"
                    ? text.statusAvailable
                    : key.status === "claimed"
                      ? text.statusClaimed
                      : text.statusRevoked;
                  return (
                    <tr
                      key={key.id}
                      tabIndex={0}
                      onClick={() => setSelectedKeyId(key.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedKeyId(key.id);
                        }
                      }}
                      data-testid={`license-row-${key.id}`}
                    >
                      <td>
                        <span className="license-key-page__recipient">
                          <span className="license-key-page__avatar">{(user?.username ?? key.claimedByUsername ?? "—").slice(0, 2).toUpperCase()}</span>
                          <span>
                            <strong>{user?.username ?? (key.status === "claimed" ? key.claimedByUsername ?? text.recipientUnavailable : text.noRecipient)}</strong>
                            <small>{linkedAccount?.username
                              ? `@${linkedAccount.username.replace(/^@+/, "")}${linkedAccount.status !== "connected" ? ` · ${linkedAccount.status}` : ""}`
                              : user ? text.noTelegramAccount : text.appUsername}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        {user ? (
                          <>
                            <span className="license-key-page__plan">{user.subscription.plan.toUpperCase()}</span>
                            <span className={`license-key-page__expiry ${subscriptionState === "expiring" ? "is-soon" : subscriptionState === "expired" ? "is-expired" : ""}`}>
                              {expiresAt ? formatKeyDate(expiresAt, language) : text.noExpiry}
                              {daysLeft !== null && subscriptionState === "expiring" && <small> · {daysLeft} {language === "vi" ? "ngày" : "days"}</small>}
                            </span>
                          </>
                        ) : (
                          <span className="license-key-page__muted">{key.status === "claimed" && isUsersLoading ? (language === "vi" ? "Đang tải…" : "Loading…") : text.notAvailable}</span>
                        )}
                      </td>
                      <td>
                        <span className="license-key-page__masked-id" title={text.keyReferenceNote}>••••{key.id.slice(-6)}</span>
                        <small className="license-key-page__subtext">{key.label || `#${key.id.slice(0, 8)}`}</small>
                      </td>
                      <td>
                        <span className={`license-key-page__badge license-key-page__badge--${subscriptionState}`}>
                          {subLabel}
                        </span>
                        <span className={`license-key-page__key-state license-key-page__key-state--${key.status}`}>
                          {keyLabel}
                        </span>
                      </td>
                      <td>
                        {recipientDetailsError ? (
                          <span className="license-key-page__muted">{text.notAvailable}</span>
                        ) : isRecipientDetailsLoading ? (
                          <span className="license-key-page__muted">{language === "vi" ? "Đang tải…" : "Loading…"}</span>
                        ) : latestReminder ? (
                          <>
                            <span className={`license-key-page__reminder-state license-key-page__reminder-state--${latestReminder.status}`}>
                              {reminderStatusLabel(latestReminder.status, language)}
                            </span>
                            <small className="license-key-page__subtext">
                              {formatKeyDate(latestReminder.sentAt ?? latestReminder.updatedAt, language, true)}
                            </small>
                          </>
                        ) : (
                          <span className="license-key-page__muted">{key.status === "claimed" ? text.noReminderRecord : "—"}</span>
                        )}
                      </td>
                      <td className="license-key-page__row-actions">
                        {key.status === "available" && (
                          <button
                            type="button"
                            aria-label={`${text.revokeAction}: ${key.label ?? key.id.slice(-6)}`}
                            onClick={(event) => { event.stopPropagation(); setRevokeConfirmId(key.id); }}
                            data-testid={`revoke-license-${key.id}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                        <ChevronRight size={15} aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="license-key-page__table-foot">
          <span>{language === "vi" ? "Đang hiển thị" : "Showing"} <strong>{filteredKeys.length}</strong> {language === "vi" ? "trong" : "of"} {licenseRows.length}</span>
          <span>{language === "vi" ? "Mã key gốc chỉ hiển thị một lần khi tạo." : "Plaintext keys are shown only once at creation."}</span>
        </div>
      </section>

      {selectedRow && (
        <div className="license-key-page__drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedKeyId(null)}>
          <aside className="license-key-page__drawer" role="dialog" aria-modal="true" aria-label={text.detailTitle}>
            <div className="license-key-page__drawer-head">
              <div><small>{text.tableIdentifier} · #{selectedRow.key.id.slice(0, 8)}</small><h2>{text.detailTitle}</h2></div>
              <button type="button" aria-label={text.closeDetails} onClick={() => setSelectedKeyId(null)}><X size={17} /></button>
            </div>
            <div className="license-key-page__detail-person">
              <span className="license-key-page__detail-avatar"><UserRound size={20} /></span>
              <div>
                <strong>{selectedRow.user?.username ?? selectedRow.key.claimedByUsername ?? text.noRecipient}</strong>
                <small>{selectedRow.details?.telegramAccounts.length
                  ? selectedRow.details.telegramAccounts.map((account) => account.username ? `@${account.username.replace(/^@+/, "")}` : account.status).join(" · ")
                  : text.noTelegramAccount}</small>
              </div>
            </div>
            <div className="license-key-page__detail-grid">
              <div><small>{text.tableSubscription}</small><strong>{selectedRow.user?.subscription.plan.toUpperCase() ?? text.notAvailable}</strong></div>
              <div><small>{text.expiringSoon}</small><strong>{selectedRow.expiresAt ? formatKeyDate(selectedRow.expiresAt, language) : text.noExpiry}</strong></div>
              <div><small>{text.subscriptionFilterLabel}</small><span className={`license-key-page__badge license-key-page__badge--${selectedRow.subscriptionState}`}>
                {selectedRow.subscriptionState === "active" ? text.subscriptionActive
                  : selectedRow.subscriptionState === "expiring" ? text.subscriptionSoon
                    : selectedRow.subscriptionState === "expired" ? text.subscriptionExpired
                      : text.subscriptionUnavailable}
              </span></div>
              <div><small>{text.tableKeyState}</small><span className={`license-key-page__key-state license-key-page__key-state--${selectedRow.key.status}`}>
                {selectedRow.key.status === "available" ? text.statusAvailable : selectedRow.key.status === "claimed" ? text.statusClaimed : text.statusRevoked}
              </span></div>
            </div>
            <section className="license-key-page__key-detail">
              <small>{text.detailKeyLabel}</small>
              <strong>••••{selectedRow.key.id.slice(-6)}</strong>
              <p>{text.keyReferenceNote}</p>
            </section>
            <div className="license-key-page__detail-grid license-key-page__detail-grid--secondary">
              <div><small>{text.detailPlanDuration}</small><strong>{selectedRow.key.plan.toUpperCase()} · {text.durationDays(selectedRow.key.durationDays)}</strong></div>
              <div><small>{text.detailPool}</small><strong>{selectedRow.key.pool === "external" ? (language === "vi" ? "Bán ngoài" : "External") : (language === "vi" ? "Website" : "Website")}</strong></div>
              <div><small>{text.detailCreated}</small><strong>{formatKeyDate(selectedRow.key.createdAt, language, true)}</strong></div>
              <div><small>{text.detailClaimed}</small><strong>{selectedRow.key.claimedAt ? formatKeyDate(selectedRow.key.claimedAt, language, true) : "—"}</strong></div>
              <div><small>{text.tableSalePrice}</small><strong>{selectedRow.key.salePriceVnd === null ? "—" : formatVnd(selectedRow.key.salePriceVnd)}</strong></div>
              <div><small>{text.createdBy}</small><strong>{selectedRow.key.createdByUsername ?? text.bySystem}</strong></div>
            </div>
            <section className="license-key-page__timeline">
              <div className="license-key-page__timeline-head">
                <h3>{text.reminderHistoryTitle}</h3>
                <small>{text.reminderHistoryScope}</small>
              </div>
              {recipientDetailsError ? (
                <p className="license-key-page__timeline-empty">{text.reminderHistoryLoadError}</p>
              ) : isRecipientDetailsLoading ? (
                <p className="license-key-page__timeline-empty">{language === "vi" ? "Đang tải bản ghi…" : "Loading reminder records…"}</p>
              ) : selectedRow.details?.reminders.length ? (
                <ol>
                  {selectedRow.details.reminders.map((reminder: AdminLicenseKeyReminderDelivery) => {
                    const targetAccount = selectedRow.details?.telegramAccounts.find((account) => account.id === reminder.telegramAccountId);
                    const eventTime = reminder.sentAt ?? reminder.updatedAt;
                    return (
                      <li key={reminder.id}>
                        <span className={`license-key-page__timeline-dot license-key-page__timeline-dot--${reminder.status}`} />
                        <div>
                          <strong>{reminderTypeLabel(reminder.reminderType, language)} · {reminderStatusLabel(reminder.status, language)}</strong>
                          <small>{text.reminderDeliveryTo}: {targetAccount?.username ? `@${targetAccount.username.replace(/^@+/, "")}` : text.notAvailable}</small>
                          <small>{formatKeyDate(eventTime, language, true)} · {text.reminderAttempts}: {reminder.attemptCount}</small>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : selectedRow.key.status === "claimed" ? (
                <p className="license-key-page__timeline-empty">{text.reminderHistoryEmpty}</p>
              ) : (
                <p className="license-key-page__timeline-empty">{language === "vi" ? "Không áp dụng cho key chưa được nhận." : "Not applicable until a key is claimed."}</p>
              )}
            </section>
          </aside>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && !newLicenseData && (
        <Modal
          title={text.createModalTitle}
          description={text.createModalDetail}
          onClose={() => setIsCreateModalOpen(false)}
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2.5 block text-[13px] font-bold text-[#475569]">{text.planLabel}</label>
              <div className="grid grid-cols-3 gap-3">
                {(["plus", "pro", "unlimited"] as LicenseKeyPlan[]).map((plan) => (
                  <label
                    key={plan}
                    className={`flex cursor-pointer items-center justify-center rounded-xl border-2 px-4 py-3 font-bold uppercase tracking-wider text-[13px] transition-all ${
                      formPlan === plan
                        ? "border-[#1a2b88] bg-[#eef2fa] text-[#1a2b88]"
                        : "border-[#eef2f6] bg-white text-[#64748b] hover:border-[#cbd5e1]"
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      checked={formPlan === plan}
                      onChange={() => setFormPlan(plan)}
                    />
                    {plan}
                  </label>
                ))}
              </div>
            </div>

            <Input
              label={text.durationLabel}
              type="number"
              value={formDuration}
              onChange={setFormDuration}
              placeholder={text.durationPlaceholder}
              min={1}
              max={3660}
              step={1}
            />

            <div>
              <Input
                label={text.quantityLabel}
                type="number"
                value={formQuantity}
                onChange={setFormQuantity}
                placeholder={text.quantityPlaceholder}
                min={1}
                max={100}
                step={1}
              />
              <p className="mt-1.5 text-[12px] font-medium text-[#64748b]">{text.quantityHint}</p>
            </div>

            <div>
              <Input
                label={text.salePriceLabel}
                type="number"
                value={formSalePrice}
                onChange={setFormSalePrice}
                placeholder={text.salePricePlaceholder}
                min={0}
                max={1_000_000_000}
                step={1}
              />
              <p className="mt-1.5 text-[12px] font-medium text-[#64748b]">{text.salePriceHint}</p>
            </div>

            <Input
              label={text.labelFieldLabel}
              value={formLabel}
              onChange={setFormLabel}
              placeholder={text.labelFieldPlaceholder}
            />

            <label className="block">
              <span className="mb-2.5 block text-[13px] font-bold text-[#475569]">Kho license key</span>
              <select
                value={formPool}
                onChange={(e) => setFormPool(e.target.value as LicenseKeyPool)}
                className="w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-3 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#1a2b88] focus:ring-2 focus:ring-[#1a2b88]/10"
              >
                <option value="normal">Kho website tự động</option>
                <option value="external">Kho bán ngoài</option>
              </select>
              <span className="mt-1.5 block text-[12px] font-medium text-[#64748b]">
                Kho bán ngoài không được hệ thống tự động cấp cho đơn mua trên website.
              </span>
            </label>

            <div className="mt-8 flex justify-end gap-3">
              <QuietButton onClick={() => setIsCreateModalOpen(false)}>{text.cancel}</QuietButton>
              <PrimaryButton
                onClick={handleCreate}
                disabled={createMutation.isPending || !formDuration || !formQuantity}
              >
                {createMutation.isPending
                  ? text.creating
                  : isValidQuantity
                    ? text.createN(quantityNum)
                    : text.createFallback}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Success Modal with New Key */}
      {newLicenseData && (
        <Modal
          title={text.successModalTitle}
          onClose={closeNewLicenseModal}
        >
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#ecfdf5] text-[#059669]">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="text-[15px] font-bold text-[#0f172a] mb-1">
              {text.successModalCreated(newLicenseData.keys.length, newLicenseData.plan, newLicenseData.label)}
            </p>
          </div>

          <div className="rounded-2xl border border-[#fef08a] bg-[#fffbeb] p-4 text-center">
            <div className="mb-2 flex items-center justify-center gap-2 text-[#d97706]">
              <AlertCircle className="h-5 w-5" />
              <span className="text-[13px] font-extrabold uppercase tracking-wide">{text.importantNoticeLabel}</span>
            </div>
            <p className="text-[13px] font-semibold text-[#b45309]">
              {text.importantNoticeText}
            </p>
          </div>

          <div className="mt-6 mb-4 flex items-center justify-between gap-3">
            <p className="text-[13px] font-bold text-[#475569]">{text.keyListTitle}</p>
            <button
              onClick={() => copyToClipboard(newLicenseData.keys.join("\n"))}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-[#1a2b88] px-3.5 py-2 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-[#152473] active:scale-95"
            >
              <Copy className="h-4 w-4" />
              {text.copyAll}
            </button>
          </div>
          <div className="mb-8 max-h-[280px] space-y-2 overflow-y-auto rounded-xl border-2 border-[#cbd5e1] bg-[#f8fafc] p-2">
            {newLicenseData.keys.map((key, index) => (
              <div key={key} className="flex items-center gap-2 rounded-lg bg-white p-2.5 shadow-sm">
                <span className="w-6 shrink-0 text-center text-[11px] font-extrabold text-[#64748b]">{index + 1}</span>
                <code className="min-w-0 flex-1 break-all font-mono text-[13px] font-bold tracking-tight text-[#0f172a] select-all">{key}</code>
                <button
                  onClick={() => copyToClipboard(key)}
                  aria-label={text.copyKey(index + 1)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#dbeafe] text-[#1a2b88] transition-colors hover:bg-[#eff6ff]"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <PrimaryButton onClick={closeNewLicenseModal}>
              {text.closeModal}
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeConfirmId && (
        <Modal
          title={text.revokeModalTitle}
          description={text.revokeModalDetail}
          onClose={() => setRevokeConfirmId(null)}
        >
          <div className="mt-8 flex justify-end gap-3">
            <QuietButton onClick={() => setRevokeConfirmId(null)}>{text.cancel}</QuietButton>
            <button
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[#e11d48] px-5 py-3 text-[14px] font-extrabold text-white shadow-sm transition-all hover:bg-[#be123c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revokeMutation.isPending ? text.revoking : text.revokeConfirm}
            </button>
          </div>
        </Modal>
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
      </div>
    </AppLayout>
  );
}

export default AdminLicenseKeysPage;
