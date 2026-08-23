import { useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Key, Copy, AlertCircle, Trash2, CheckCircle2, Filter, Bot, ExternalLink, Save } from "lucide-react";
import { format } from "date-fns";
import { vi as viLocale, enUS } from "date-fns/locale";

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
  useUpdateAdminPurchaseSettings,
  getGetAdminPurchaseSettingsQueryKey,
  getListAdminLicenseKeysQueryKey,
  type CreateAdminLicenseKeyInput,
  type LicenseKeyStatus,
  type PlanCode,
} from "@workspace/api-client-react";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

type LicenseKeyPlan = CreateAdminLicenseKeyInput["plan"];

const copy = {
  en: {
    pageTitle: "Admin License Keys",
    loadError: "Could not load data",
    loadErrorDetail: "Please check your access rights or try again later.",
    eyebrow: "System administration",
    sectionTitle: "License Keys",
    sectionDetail: "Create and manage single-use license keys for users.",
    createButton: "Create key",
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
    filterLabel: "Filters:",
    filterAllStatus: "All statuses",
    filterAvailable: "Available",
    filterClaimed: "Activated",
    filterRevoked: "Revoked",
    filterAllPlans: "All plans",
    tableKeyLabel: "Key / Label",
    tablePlanDuration: "Plan / Duration",
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
    sectionTitle: "Danh sách Mã bản quyền",
    sectionDetail: "Tạo và quản lý các mã bản quyền cấp phát một lần cho người dùng.",
    createButton: "Tạo mã mới",
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
    filterLabel: "Bộ lọc:",
    filterAllStatus: "Tất cả trạng thái",
    filterAvailable: "Khả dụng",
    filterClaimed: "Đã kích hoạt",
    filterRevoked: "Đã thu hồi",
    filterAllPlans: "Tất cả gói",
    tableKeyLabel: "Mã / Nhãn",
    tablePlanDuration: "Gói / Thời hạn",
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

function formatKeyDate(dateStr: string, language: string, includeTime = false): string {
  try {
    const locale = language === "vi" ? viLocale : enUS;
    const pattern = includeTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";
    return format(new Date(dateStr), pattern, { locale });
  } catch {
    return dateStr;
  }
}

export function AdminLicenseKeysPage() {
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const text = copy[language];

  // Filters
  const [statusFilter, setStatusFilter] = useState<LicenseKeyStatus | "all">("all");
  const [planFilter, setPlanFilter] = useState<PlanCode | "all">("all");

  // Queries
  const queryParams = {
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(planFilter !== "all" ? { plan: planFilter } : {}),
  };
  const { data: licenseKeys, isLoading, error } = useListAdminLicenseKeys(queryParams, {
    query: {
      queryKey: getListAdminLicenseKeysQueryKey(queryParams),
    },
  });
  const {
    data: purchaseSettings,
    isLoading: isPurchaseSettingsLoading,
    isError: isPurchaseSettingsError,
  } = useGetAdminPurchaseSettings();

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
  const [formLabel, setFormLabel] = useState<string>("");
  const [telegramPurchaseUrl, setTelegramPurchaseUrl] = useState("");

  useEffect(() => {
    if (purchaseSettings) {
      setTelegramPurchaseUrl(purchaseSettings.telegramPurchaseUrl ?? "");
    }
  }, [purchaseSettings]);

  // Mutations
  const createMutation = useCreateAdminLicenseKey();
  const revokeMutation = useRevokeAdminLicenseKey();
  const purchaseSettingsMutation = useUpdateAdminPurchaseSettings();

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

  const handleCreate = () => {
    const durationDays = Number(formDuration);
    const quantity = Number(formQuantity);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3660) {
      setToastMessage(text.durationValidationError);
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      setToastMessage(text.quantityValidationError);
      return;
    }

    createMutation.mutate(
      {
        data: {
          plan: formPlan,
          durationDays,
          quantity,
          label: formLabel.trim() || undefined,
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
          setFormLabel("");
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

  const filteredKeys = useMemo(() => {
    if (!licenseKeys) return [];
    return licenseKeys.filter((key) => {
      if (statusFilter !== "all" && key.status !== statusFilter) return false;
      if (planFilter !== "all" && key.plan !== planFilter) return false;
      return true;
    });
  }, [licenseKeys, statusFilter, planFilter]);

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
      <SectionHeader
        eyebrow={text.eyebrow}
        title={text.sectionTitle}
        detail={text.sectionDetail}
        action={
          <PrimaryButton onClick={() => setIsCreateModalOpen(true)}>
            {text.createButton}
          </PrimaryButton>
        }
      />

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

      <Panel className="mb-6 p-4 flex flex-col sm:flex-row gap-4 bg-[#f8fafc]">
        <div className="flex items-center gap-2 text-sm font-bold text-[#475569]">
          <Filter className="h-4 w-4" />
          <span>{text.filterLabel}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LicenseKeyStatus | "all")}
            className="rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#1a2b88] focus:ring-2 focus:ring-[#1a2b88]/10"
          >
            <option value="all">{text.filterAllStatus}</option>
            <option value="available">{text.filterAvailable}</option>
            <option value="claimed">{text.filterClaimed}</option>
            <option value="revoked">{text.filterRevoked}</option>
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as PlanCode | "all")}
            className="rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#1a2b88] focus:ring-2 focus:ring-[#1a2b88]/10"
          >
            <option value="all">{text.filterAllPlans}</option>
            <option value="pro">Pro</option>
            <option value="unlimited">Unlimited</option>
            <option value="plus">Plus</option>
          </select>
        </div>
      </Panel>

      <Panel className="overflow-x-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#eef2f6] border-t-[#1a2b88]" />
          </div>
        ) : filteredKeys.length === 0 ? (
          <EmptyState
            icon={Key}
            title={text.emptyTitle}
            detail={text.emptyDetail}
          />
        ) : (
          <table className="w-full min-w-[900px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-[#eef2f6] bg-[#f8fafc]">
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tableKeyLabel}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tablePlanDuration}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tableStatus}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tableCreated}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tableUsage}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px] text-right">{text.tableActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f6]">
              {filteredKeys.map((key) => (
                <tr key={key.id} className="hover:bg-[#f8fafc]/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-[#0f172a]">{key.label || "—"}</div>
                    <div className="text-[12px] font-mono text-[#64748b] mt-0.5">{key.id.split("-")[0]}...</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="inline-flex items-center gap-1.5 font-bold uppercase text-[12px] tracking-wide text-[#1a2b88] bg-[#eef2fa] px-2 py-0.5 rounded">
                      {key.plan}
                    </div>
                    <div className="text-[13px] font-medium text-[#475569] mt-1">{text.durationDays(key.durationDays)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge
                      status={
                        key.status === "available"
                          ? "success"
                          : key.status === "claimed"
                          ? "active"
                          : "restricted"
                      }
                      label={
                        key.status === "available"
                          ? text.statusAvailable
                          : key.status === "claimed"
                          ? text.statusClaimed
                          : text.statusRevoked
                      }
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-[#0f172a]">
                      {formatKeyDate(key.createdAt, language)}
                    </div>
                    <div className="text-[12px] text-[#64748b] mt-0.5">
                      {text.createdBy} {key.createdByUsername || text.bySystem}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {key.status === "claimed" && key.claimedByUsername ? (
                      <div>
                        <div className="font-semibold text-[#0f172a]">{key.claimedByUsername}</div>
                        <div className="text-[12px] text-[#64748b] mt-0.5">
                          {key.claimedAt && formatKeyDate(key.claimedAt, language, true)}
                        </div>
                      </div>
                    ) : key.status === "revoked" ? (
                      <div className="text-[13px] font-medium text-[#94a3b8] italic">
                        {text.revokedBy(key.revokedByUsername || text.bySystem)}
                      </div>
                    ) : (
                      <span className="text-[#94a3b8] text-[13px]">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {key.status === "available" && (
                      <button
                        onClick={() => setRevokeConfirmId(key.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold text-[#e11d48] hover:bg-[#fff1f2] transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                        {text.revokeAction}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

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

            <Input
              label={text.labelFieldLabel}
              value={formLabel}
              onChange={setFormLabel}
              placeholder={text.labelFieldPlaceholder}
            />

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
    </AppLayout>
  );
}

export default AdminLicenseKeysPage;
