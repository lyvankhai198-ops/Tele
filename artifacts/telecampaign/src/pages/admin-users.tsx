import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  useListAdminUsers,
  useGetAdminUser,
  useUpdateAdminUserSubscription,
  useUpdateAdminUserQuota,
  getGetAdminOverviewQueryKey,
  getGetAdminUserQueryKey,
  getListAdminUsersQueryKey,
  type PlanCode,
  type AdminUser,
} from "@workspace/api-client-react";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";
import { Users, Search, Filter, ShieldAlert, CheckCircle2, ChevronRight, Activity, AlertTriangle } from "lucide-react";

const copy = {
  en: {
    pageTitle: "User Management",
    eyebrow: "Admin Center",
    pageDetail: "Manage users, monitor usage limits, and safely update active subscriptions.",
    loadError: "Could not load users",
    loadErrorDetail: "Please check your access rights or try again later.",
    searchPlaceholder: "Search by username...",
    filterAllPlans: "All Plans",
    tableUser: "User & Role",
    tableSubscription: "Subscription",
    tableLimits: "Current Limits",
    tableUsage: "Usage (TG / Camp)",
    tableActions: "Actions",
    roleAdmin: "Administrator",
    roleUser: "User",
    joinedAt: "Joined",
    lastActive: "Last active",
    statusActive: "Active",
    statusExpired: "Expired",
    limitAccounts: "accounts",
    limitCampaigns: "campaigns",
    limitMsgs: "msgs/day",
    noLimit: "Unlimited",
    quotaExempt: "Daily message quota schedule",
    quotaExemptDetail: "Choose a start and end date. The plan-wide daily message quota is removed for the whole range; the normal limit returns automatically afterward. Account and campaign limits remain unchanged.",
    quotaDatesValidationError: "Choose both dates, or clear both dates to remove the schedule.",
    quotaDateOrderError: "The end date must be on or after the start date.",
    saveQuota: "Save quota schedule",
    quotaSaving: "Saving...",
    quotaSaved: "Daily quota access updated.",
    updateAction: "Update Plan",
    emptyTitle: "No users found",
    emptyDetail: "No users match your current search and filter criteria.",
    modalTitle: "Update Subscription",
    modalDetail: (username: string) => `Safely extend or change the plan for @${username}.`,
    planLabel: "Select Plan",
    durationLabel: "Duration (Days)",
    durationPlaceholder: "E.g. 30",
    durationValidationError: "Duration must be between 1 and 3660 days.",
    warningTitle: "Important limitations",
    warningDetail: "Downgrades are not supported. An active paid plan keeps its remaining time and the new duration is added. Please ensure payment has been confirmed out-of-band.",
    confirmLabel: "I confirm this upgrade is authorized.",
    cancel: "Cancel",
    saving: "Applying...",
    saveSuccess: "Subscription updated successfully.",
    saveError: "Could not update subscription.",
    confirmAction: "Apply Update",
  },
  vi: {
    pageTitle: "Quản lý Người dùng",
    eyebrow: "Trung tâm Quản trị",
    pageDetail: "Quản lý người dùng, giám sát giới hạn sử dụng và cập nhật gói dịch vụ an toàn.",
    loadError: "Không thể tải danh sách người dùng",
    loadErrorDetail: "Vui lòng kiểm tra lại quyền truy cập hoặc thử lại sau.",
    searchPlaceholder: "Tìm theo tên tài khoản...",
    filterAllPlans: "Tất cả các gói",
    tableUser: "Người dùng & Vai trò",
    tableSubscription: "Gói dịch vụ",
    tableLimits: "Giới hạn hiện tại",
    tableUsage: "Sử dụng (TG / Camp)",
    tableActions: "Thao tác",
    roleAdmin: "Quản trị viên",
    roleUser: "Người dùng",
    joinedAt: "Tham gia",
    lastActive: "Hoạt động cuối",
    statusActive: "Đang hoạt động",
    statusExpired: "Hết hạn",
    limitAccounts: "tài khoản",
    limitCampaigns: "chiến dịch",
    limitMsgs: "tin nhắn/ngày",
    noLimit: "Không giới hạn",
    quotaExempt: "Lịch miễn quota tin nhắn",
    quotaExemptDetail: "Chọn ngày bắt đầu và ngày kết thúc. Quota tin nhắn/ngày của gói được gỡ trong toàn bộ khoảng này; sau đó hệ thống tự áp lại. Giới hạn tài khoản và chiến dịch vẫn giữ nguyên.",
    quotaDatesValidationError: "Hãy chọn đủ hai ngày, hoặc xóa cả hai ngày để hủy lịch.",
    quotaDateOrderError: "Ngày kết thúc phải từ ngày bắt đầu trở đi.",
    saveQuota: "Lưu lịch quota",
    quotaSaving: "Đang lưu...",
    quotaSaved: "Đã cập nhật quyền quota tin nhắn/ngày.",
    updateAction: "Cập nhật Gói",
    emptyTitle: "Không tìm thấy",
    emptyDetail: "Không có người dùng nào phù hợp với bộ lọc hiện tại.",
    modalTitle: "Cập nhật Gói dịch vụ",
    modalDetail: (username: string) => `Thay đổi hoặc gia hạn gói an toàn cho @${username}.`,
    planLabel: "Chọn gói",
    durationLabel: "Thời hạn (Ngày)",
    durationPlaceholder: "VD: 30",
    durationValidationError: "Thời hạn phải từ 1 đến 3660 ngày.",
    warningTitle: "Lưu ý quan trọng",
    warningDetail: "Hệ thống không hỗ trợ hạ cấp. Gói trả phí còn hiệu lực sẽ giữ thời gian còn lại và cộng thêm thời hạn mới. Vui lòng đảm bảo đã nhận thanh toán trước khi thực hiện.",
    confirmLabel: "Tôi xác nhận đã cấp quyền nâng cấp này.",
    cancel: "Hủy",
    saving: "Đang áp dụng...",
    saveSuccess: "Đã cập nhật gói dịch vụ.",
    saveError: "Không thể cập nhật gói dịch vụ.",
    confirmAction: "Áp dụng",
  }
} as const;

function formatDate(dateStr: string, language: string): string {
  try {
    const locale = language === "vi" ? viLocale : enUS;
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale });
  } catch {
    return dateStr;
  }
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const text = copy[language];

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanCode | "all">("all");

  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  // Form State
  const [formPlan, setFormPlan] = useState<PlanCode>("pro");
  const [formDuration, setFormDuration] = useState("30");
  const [formConfirmed, setFormConfirmed] = useState(false);

  // Auto-search debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(planFilter !== "all" ? { plan: planFilter } : {}),
  };

  const { data: users, isLoading, error } = useListAdminUsers(queryParams, {
    query: {
      queryKey: getListAdminUsersQueryKey(queryParams),
    },
  });
  const selectedUserId = editingUser?.id ?? "";
  const { data: selectedUser } = useGetAdminUser(selectedUserId, {
    query: {
      queryKey: getGetAdminUserQueryKey(selectedUserId),
      enabled: Boolean(editingUser),
    },
  });

  const updateMutation = useUpdateAdminUserSubscription();
  const quotaMutation = useUpdateAdminUserQuota();
  const [formQuotaExemptFrom, setFormQuotaExemptFrom] = useState("");
  const [formQuotaExemptUntil, setFormQuotaExemptUntil] = useState("");
  const modalUser = selectedUser ?? editingUser;

  const handleOpenEdit = (user: AdminUser) => {
    setEditingUser(user);
    // Only offer pro and unlimited for manual updates per requirements
    setFormPlan(user.storedPlan === "unlimited" ? "unlimited" : "pro");
    setFormDuration("30");
    setFormConfirmed(false);
    setFormQuotaExemptFrom(user.subscription.dailyQuotaExemptFrom ?? "");
    setFormQuotaExemptUntil(user.subscription.dailyQuotaExemptUntil ?? "");
  };

  const handleUpdateQuota = () => {
    if (!editingUser) return;
    const hasNoSchedule = !formQuotaExemptFrom && !formQuotaExemptUntil;
    const hasPartialSchedule = Boolean(formQuotaExemptFrom) !== Boolean(formQuotaExemptUntil);
    if (hasPartialSchedule) {
      setToastMessage({ text: text.quotaDatesValidationError, isError: true });
      return;
    }
    if (!hasNoSchedule && formQuotaExemptFrom > formQuotaExemptUntil) {
      setToastMessage({ text: text.quotaDateOrderError, isError: true });
      return;
    }
    quotaMutation.mutate(
      {
        userId: editingUser.id,
        data: {
          dailyQuotaExemptFrom: formQuotaExemptFrom || null,
          dailyQuotaExemptUntil: formQuotaExemptUntil || null,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminUserQueryKey(editingUser.id) });
          void queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
          setToastMessage({ text: text.quotaSaved });
        },
        onError: (err: any) => {
          setToastMessage({
            text: localizedErrorMessage(err, language, text.saveError),
            isError: true,
          });
        },
      },
    );
  };

  const handleUpdateSubscription = () => {
    if (!editingUser) return;
    const durationDays = Number(formDuration);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3660) {
      setToastMessage({ text: text.durationValidationError, isError: true });
      return;
    }

    updateMutation.mutate(
      {
        userId: editingUser.id,
        data: {
          plan: formPlan,
          durationDays,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminUserQueryKey(editingUser.id) });
          void queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
          setEditingUser(null);
          setToastMessage({ text: text.saveSuccess });
        },
        onError: (err: any) => {
          setToastMessage({
            text: localizedErrorMessage(err, language, text.saveError),
            isError: true,
          });
        },
      }
    );
  };

  if (error) {
    return (
      <AppLayout activePage="admin-users" title={text.pageTitle}>
        <Panel className="p-8 text-center text-[#e11d48]">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <h2 className="mb-2 text-lg font-bold">{text.loadError}</h2>
          <p className="text-sm font-medium opacity-80">
            {text.loadErrorDetail}
          </p>
        </Panel>
      </AppLayout>
    );
  }

  return (
    <AppLayout activePage="admin-users" title={text.pageTitle}>
      <SectionHeader
        eyebrow={text.eyebrow}
        title={text.pageTitle}
        detail={text.pageDetail}
      />

      <Panel className="mb-6 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#f8fafc]">
        <div className="flex-1 flex w-full max-w-sm items-center gap-3 rounded-xl border border-[#cbd5e1] bg-white px-3.5 py-2.5 focus-within:border-[#1a2b88] focus-within:ring-2 focus-within:ring-[#1a2b88]/10 transition-all">
          <Search className="h-[18px] w-[18px] text-[#64748b]" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={text.searchPlaceholder}
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-[#64748b]" />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as PlanCode | "all")}
            className="flex-1 sm:flex-none rounded-xl border border-[#cbd5e1] bg-white px-4 py-2.5 text-[14px] font-bold text-[#0f172a] outline-none focus:border-[#1a2b88] focus:ring-2 focus:ring-[#1a2b88]/10"
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
        ) : !users || users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={text.emptyTitle}
            detail={text.emptyDetail}
          />
        ) : (
          <table className="w-full min-w-[900px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-[#eef2f6] bg-[#f8fafc]">
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tableUser}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tableSubscription}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tableLimits}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px]">{text.tableUsage}</th>
                <th className="px-6 py-4 font-extrabold text-[#64748b] uppercase tracking-wider text-[11px] text-right">{text.tableActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f6]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[#f8fafc]/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef2fa] text-[#1a2b88] font-extrabold">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-[#0f172a]">{user.username}</div>
                        <div className="text-[12px] font-medium text-[#64748b] mt-0.5">
                          {user.role === "admin" ? text.roleAdmin : text.roleUser}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="inline-flex items-center gap-1.5 font-bold uppercase text-[11px] tracking-wide text-[#1a2b88] bg-[#eef2fa] px-2 py-0.5 rounded">
                        {user.storedPlan}
                      </div>
                      <StatusBadge
                        status={user.subscription.status === "active" ? "active" : "failed"}
                        label={user.subscription.status === "active" ? text.statusActive : text.statusExpired}
                      />
                    </div>
                    {user.subscription.dailyQuotaExempt && (
                      <div className="mt-1 inline-flex items-center rounded bg-[#ecfdf5] px-2 py-0.5 text-[11px] font-bold text-[#047857]">
                        {text.quotaExempt}
                      </div>
                    )}
                    {user.subscription.expiresAt && (
                      <div className="text-[12px] font-medium text-[#64748b]">
                        Exp: {formatDate(user.subscription.expiresAt, language).split(" ")[0]}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 text-[12px] font-medium text-[#475569]">
                      <div><span className="font-bold text-[#0f172a]">{user.subscription.accountLimit ?? text.noLimit}</span> {text.limitAccounts}</div>
                      <div><span className="font-bold text-[#0f172a]">{user.subscription.campaignLimit ?? text.noLimit}</span> {text.limitCampaigns}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3 text-[13px] font-bold text-[#0f172a]">
                      <div className="flex flex-col items-center justify-center rounded-lg bg-[#f1f5f9] px-3 py-1.5 min-w-[3rem]">
                        <span>{user.usage.telegramAccounts}</span>
                      </div>
                      <span className="text-[#94a3b8] block">/</span>
                      <div className="flex flex-col items-center justify-center rounded-lg bg-[#f1f5f9] px-3 py-1.5 min-w-[3rem]">
                        <span>{user.usage.campaigns}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleOpenEdit(user)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#cbd5e1] bg-white px-3 py-1.5 text-[12px] font-extrabold text-[#1a2b88] hover:border-[#1a2b88] hover:bg-[#f8fafc] transition-all"
                    >
                      {text.updateAction}
                      <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {editingUser && modalUser && (
        <Modal
          title={text.modalTitle}
          description={text.modalDetail(modalUser.username)}
          onClose={() => setEditingUser(null)}
        >
          <div className="space-y-6">
            <div className="rounded-xl border border-[#ffe4e6] bg-[#fff1f2] p-4 text-[#9f1239]">
              <div className="flex gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  <h4 className="text-[13px] font-extrabold">{text.warningTitle}</h4>
                  <p className="mt-1 text-[13px] font-medium leading-relaxed opacity-90">
                    {text.warningDetail}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#eef2f6] bg-[#f8fafc] p-4 text-[13px]">
              <div>
                <span className="block font-bold text-[#64748b]">{text.joinedAt}</span>
                <span className="mt-1 block font-extrabold text-[#0f172a]">{formatDate(modalUser.joinedAt, language).split(" ")[0]}</span>
              </div>
              <div>
                <span className="block font-bold text-[#64748b]">{text.lastActive}</span>
                <span className="mt-1 block font-extrabold text-[#0f172a]">{modalUser.lastActiveAt ? formatDate(modalUser.lastActiveAt, language) : "—"}</span>
              </div>
              <div>
                <span className="block font-bold text-[#64748b]">{text.tableUsage}</span>
                <span className="mt-1 block font-extrabold text-[#0f172a]">{modalUser.usage.telegramAccounts} / {modalUser.usage.campaigns}</span>
              </div>
              <div>
                <span className="block font-bold text-[#64748b]">{text.tableSubscription}</span>
                <span className="mt-1 block font-extrabold uppercase text-[#0f172a]">{modalUser.storedPlan}</span>
              </div>
            </div>

            <div>
              <label className="mb-2.5 block text-[13px] font-bold text-[#475569]">{text.planLabel}</label>
              <div className="grid grid-cols-2 gap-3">
                {((modalUser.storedPlan === "unlimited" ? ["unlimited"] : ["pro", "unlimited"]) as PlanCode[]).map((plan) => (
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

            <div className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4">
              <span className="block text-[14px] font-extrabold text-[#1e3a8a]">{text.quotaExempt}</span>
              <span className="mt-1 block text-[12px] font-medium leading-relaxed text-[#1e40af]">{text.quotaExemptDetail}</span>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input
                  label={language === "vi" ? "Ngày bắt đầu" : "Start date"}
                  type="date"
                  value={formQuotaExemptFrom}
                  onChange={setFormQuotaExemptFrom}
                />
                <Input
                  label={language === "vi" ? "Ngày kết thúc" : "End date"}
                  type="date"
                  value={formQuotaExemptUntil}
                  onChange={setFormQuotaExemptUntil}
                />
              </div>
              <p className="mt-2 text-[12px] font-medium text-[#1e40af]">
                {language === "vi" ? "Xóa cả hai ngày để hủy lịch miễn quota." : "Clear both dates to remove the quota schedule."}
              </p>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleUpdateQuota}
                  disabled={quotaMutation.isPending
                    || (formQuotaExemptFrom === (modalUser.subscription.dailyQuotaExemptFrom ?? "")
                      && formQuotaExemptUntil === (modalUser.subscription.dailyQuotaExemptUntil ?? ""))}
                  className="rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-[13px] font-bold text-[#475569] transition-colors hover:border-[#94a3b8] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {quotaMutation.isPending ? text.quotaSaving : text.saveQuota}
                </button>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer group pt-2">
              <div className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-[#cbd5e1] bg-white group-hover:border-[#94a3b8] transition-colors">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={formConfirmed}
                  onChange={(e) => setFormConfirmed(e.target.checked)}
                />
                <CheckCircle2 className="pointer-events-none absolute h-4 w-4 scale-50 text-white opacity-0 peer-checked:scale-100 peer-checked:text-[#1a2b88] peer-checked:opacity-100 transition-all" />
              </div>
              <span className="text-[14px] font-bold text-[#475569] select-none pt-0.5">
                {text.confirmLabel}
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#eef2f6]">
              <QuietButton onClick={() => setEditingUser(null)}>{text.cancel}</QuietButton>
              <PrimaryButton
                onClick={handleUpdateSubscription}
                disabled={updateMutation.isPending || !formConfirmed || !formDuration}
              >
                {updateMutation.isPending ? text.saving : text.confirmAction}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {toastMessage && (
        <Toast
          message={toastMessage.text}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </AppLayout>
  );
}
