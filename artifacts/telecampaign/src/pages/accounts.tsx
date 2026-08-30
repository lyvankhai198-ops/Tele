import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Key,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getListTelegramAccountsQueryKey,
  useConfirmTelegramLoginCode,
  useConfirmTelegramLoginPassword,
  useCreateTelegramAccount,
  useDeleteTelegramAccount,
  useGetSystemDefaults,
  useListTelegramAccounts,
  useStartTelegramLogin,
  useSyncTelegramDestinations,
} from "@workspace/api-client-react";
import { AppLayout, Input, Toast } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage, type Language } from "@/lib/i18n";

const copy = {
  en: {
    requestFailed: "The request could not be completed.",
    codeSent: "Telegram verification code sent.",
    loginComplete: "Telegram account logged in.",
    deleted: "Telegram account deleted.",
    title: "Telegram Accounts",
    description: "Manage Telegram account settings and connection status.",
    add: "Add account",
    help: "Connection guide",
    loading: "Loading accounts...",
    loadFailed: "Could not load accounts",
    loadFailedDescription: "There was a problem connecting to the server. Please try again.",
    retry: "Try again",
    emptyTitle: "No Telegram accounts yet",
    emptyDescription: "Add your first Telegram account to manage destinations and campaigns.",
    addFirst: "Add your first account",
    noUsername: "No public username",
    phone: "Phone",
    telegramId: "Telegram ID",
    dailyLimit: "Limit/day",
    savedStatus: "Saved",
    loggedIn: "Logged in",
    authorizing: "Authorizing",
    connectionError: "Connection error",
    notConnected: "Not connected",
    sync: "Sync",
    syncDestinations: "Sync destinations",
    synced: "Synced",
    items: "items",
    delete: "Delete",
    deleteAccount: "Delete Telegram account",
    deleteConfirmation: "Delete this Telegram account? Its connected destinations will no longer be available to campaigns.",
    guideTitle: "Telegram account guide",
    guideDescription: "Use these steps to prepare the API information for an account you manage.",
    understood: "Got it",
    prepare: "Prepare your account",
    prepareDescription: "Use only a Telegram account you are authorized to manage.",
    api: "Open Telegram API",
    apiDescription: "Open my.telegram.org in a browser and sign in with your Telegram account.",
    app: "Create an application",
    appDescription: "Open API development tools and create an application.",
    credentials: "Copy API credentials",
    credentialsDescription: "Copy the API ID and API Hash Telegram provides for the application.",
    phoneSetup: "Add the account phone",
    phoneSetupDescription: "Use the phone number in international format, for example +84901234567.",
    limitSetup: "Set the daily limit",
    limitSetupDescription: "Choose the maximum number of messages this account may send each day.",
    saveStep: "Save the account",
    saveStepDescription: "The account appears in the list with its saved limit and login status.",
    addTitle: "Add Telegram account",
    addDescription: "Enter the Telegram account details below.",
    apiNote: "Get your api_id and api_hash from",
    apiId: "api_id",
    apiHash: "api_hash",
    phoneNumber: "Telegram phone number",
    phonePlaceholder: "+84...",
    save: "Save",
    verify: "Verify",
    verificationTitle: "Verify Telegram",
    verificationDescription: "Enter the code Telegram sent to your account.",
    code: "Verification code",
    codePlaceholder: "Enter code",
    confirmCode: "Confirm code",
    resendCode: "Resend code",
    twoFactorTitle: "Two-step verification",
    twoFactorDescription: "This Telegram account is protected with a 2FA password.",
    twoFactorPassword: "2FA password",
    confirmPassword: "Confirm password",
    sentViaApp: "Telegram sent the code in the Telegram app.",
    sentViaSms: "Telegram sent the code by SMS.",
    tryAgain: "Try again",
  },
  vi: {
    requestFailed: "Yêu cầu không thể hoàn thành.",
    codeSent: "Đã gửi mã xác minh Telegram.",
    loginComplete: "Đã Login tài khoản Telegram.",
    deleted: "Đã xóa tài khoản Telegram.",
    title: "Tài khoản Telegram",
    description: "Quản lý thông tin và trạng thái kết nối tài khoản Telegram.",
    add: "Thêm tài khoản",
    help: "Hướng dẫn kết nối",
    loading: "Đang tải danh sách tài khoản...",
    loadFailed: "Không thể tải danh sách",
    loadFailedDescription: "Đã xảy ra lỗi khi kết nối với máy chủ. Vui lòng thử lại.",
    retry: "Thử lại",
    emptyTitle: "Chưa có tài khoản nào",
    emptyDescription: "Thêm tài khoản Telegram đầu tiên để quản lý điểm đến và chiến dịch.",
    addFirst: "Thêm tài khoản đầu tiên",
    noUsername: "Không có username",
    phone: "Điện thoại",
    telegramId: "Telegram ID",
    dailyLimit: "Limit/ngày",
    savedStatus: "Đã lưu",
    loggedIn: "Đã Login",
    authorizing: "Đang xác thực",
    connectionError: "Lỗi kết nối",
    notConnected: "Chưa kết nối",
    sync: "Đồng bộ",
    syncDestinations: "Đồng bộ điểm đến",
    synced: "Đã đồng bộ",
    items: "mục",
    delete: "Xóa",
    deleteAccount: "Xóa tài khoản Telegram",
    deleteConfirmation: "Xóa tài khoản Telegram này? Các điểm đến đã kết nối sẽ không còn dùng được trong chiến dịch.",
    guideTitle: "Hướng dẫn tài khoản Telegram",
    guideDescription: "Thực hiện các bước sau để chuẩn bị API cho tài khoản bạn quản lý.",
    understood: "Đã hiểu",
    prepare: "Chuẩn bị tài khoản",
    prepareDescription: "Chỉ dùng tài khoản Telegram bạn được phép quản lý.",
    api: "Mở Telegram API",
    apiDescription: "Truy cập my.telegram.org trên trình duyệt và đăng nhập bằng tài khoản Telegram.",
    app: "Tạo ứng dụng",
    appDescription: "Mở API development tools và tạo application.",
    credentials: "Lấy API credentials",
    credentialsDescription: "Sao chép API ID và API Hash Telegram cung cấp cho application.",
    phoneSetup: "Nhập số điện thoại",
    phoneSetupDescription: "Dùng định dạng quốc tế, ví dụ +84901234567.",
    limitSetup: "Đặt limit mỗi ngày",
    limitSetupDescription: "Chọn số tin nhắn tối đa tài khoản được gửi trong một ngày.",
    saveStep: "Lưu tài khoản",
    saveStepDescription: "Tài khoản sẽ xuất hiện trong danh sách với limit và trạng thái đăng nhập.",
    addTitle: "Thêm tài khoản Telegram",
    addDescription: "Nhập thông tin tài khoản Telegram bên dưới.",
    apiNote: "Lấy api_id và api_hash tại",
    apiId: "api_id",
    apiHash: "api_hash",
    phoneNumber: "Số điện thoại Telegram",
    phonePlaceholder: "+84...",
    save: "Lưu",
    verify: "Xác minh",
    verificationTitle: "Xác minh Telegram",
    verificationDescription: "Nhập mã Telegram đã gửi đến tài khoản của bạn.",
    code: "Mã xác minh",
    codePlaceholder: "Nhập mã",
    confirmCode: "Xác nhận mã",
    resendCode: "Gửi lại mã",
    twoFactorTitle: "Xác minh hai bước",
    twoFactorDescription: "Tài khoản Telegram này được bảo vệ bằng mật khẩu 2FA.",
    twoFactorPassword: "Mật khẩu 2FA",
    confirmPassword: "Xác nhận mật khẩu",
    sentViaApp: "Telegram đã gửi mã trong ứng dụng Telegram.",
    sentViaSms: "Telegram đã gửi mã qua SMS.",
    tryAgain: "Thử lại",
  },
} as const;

function errorMessage(error: unknown, language: Language, fallback: string) {
  return localizedErrorMessage(error, language, fallback);
}

function AccountsDialog({
  title,
  description,
  children,
  onClose,
  testId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  testId: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    (getFocusable()[0] ?? dialogRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button aria-label="Close dialog overlay" className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} data-testid={testId} className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#e2e8f0] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#eef2f6] px-5 py-5 sm:px-7">
          <div className="pr-4">
            <h2 id={titleId} className="text-[19px] font-extrabold tracking-tight text-[#0f172a]">{title}</h2>
            <p id={descriptionId} className="mt-2 text-[14px] font-medium leading-relaxed text-[#64748b]">{description}</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="shrink-0 rounded-xl p-2 text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a]" data-testid={`${testId}-close`}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-7">{children}</div>
      </div>
    </div>
  );
}

function HelpStep({
  step,
  index,
  isOpen,
  onToggle,
}: {
  step: { title: string; description: string; icon: LucideIcon };
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = step.icon;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#eef2f6] bg-white">
      <button onClick={onToggle} className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[#f8fafc]" aria-expanded={isOpen}>
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eaf6fd] text-[12px] font-extrabold text-[#1c93d4]">{String(index + 1).padStart(2, "0")}</span>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#f8fafc] text-[#64748b]"><Icon className="h-4 w-4" /></span>
          <span className="text-[14px] font-bold text-[#0f172a]">{step.title}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-[#94a3b8] transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <p className="px-4 pb-4 pt-1 text-[14px] font-medium leading-relaxed text-[#64748b] sm:pl-[7.5rem]">{step.description}</p>}
    </div>
  );
}

type LoginFlow = {
  accountId: string;
  challengeId: string;
  delivery: "app" | "sms";
  step: "code" | "password";
};

export default function Accounts() {
  const { language } = useLanguage();
  const text = copy[language];
  const queryClient = useQueryClient();
  const accounts = useListTelegramAccounts();
  const createAccount = useCreateTelegramAccount();
  const deleteAccount = useDeleteTelegramAccount();
  const startLogin = useStartTelegramLogin();
  const confirmCode = useConfirmTelegramLoginCode();
  const confirmPassword = useConfirmTelegramLoginPassword();
  const sync = useSyncTelegramDestinations();
  const systemDefaults = useGetSystemDefaults();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [openStep, setOpenStep] = useState(0);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [dailyLimit, setDailyLimit] = useState("200");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loginFlow, setLoginFlow] = useState<LoginFlow | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const defaultDailyLimit = String(systemDefaults.data?.defaultAccountDailyLimit ?? 200);

  const closeAddModal = () => {
    setShowAddModal(false);
    setApiId("");
    setApiHash("");
    setPhone("");
    setDailyLimit(defaultDailyLimit);
  };
  const openAddModal = () => {
    setDailyLimit(defaultDailyLimit);
    setShowAddModal(true);
  };

  const invalidateAccounts = () => queryClient.invalidateQueries({ queryKey: getListTelegramAccountsQueryKey() });
  const isLoginPending = startLogin.isPending || confirmCode.isPending || confirmPassword.isPending;

  const openCodeVerification = (data: { account: { id: string }; challenge: { id: string; delivery: "app" | "sms" } }) => {
    setVerificationCode("");
    setTwoFactorPassword("");
    setLoginFlow({ accountId: data.account.id, challengeId: data.challenge.id, delivery: data.challenge.delivery, step: "code" });
  };

  const closeLoginDialog = () => {
    setVerificationCode("");
    setTwoFactorPassword("");
    setLoginFlow(null);
  };

  const startAccountLogin = (accountId: string) => {
    startLogin.mutate({ accountId }, {
      onSuccess: (data) => {
        void invalidateAccounts();
        openCodeVerification(data);
        setToast(text.codeSent);
      },
      onError: (error) => setToast(errorMessage(error, language, text.requestFailed)),
    });
  };

  const saveAccount = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedApiId = Number(apiId);
    const parsedDailyLimit = Number(dailyLimit);
    if (!Number.isInteger(parsedApiId) || !Number.isInteger(parsedDailyLimit) || !apiHash.trim() || !phone.trim()) {
      setToast(text.requestFailed);
      return;
    }
    createAccount.mutate({
      data: {
        api_id: parsedApiId,
        api_hash: apiHash.trim(),
        phone: phone.trim(),
        daily_limit: parsedDailyLimit,
      },
    }, {
      onSuccess: (data) => {
        void invalidateAccounts();
        closeAddModal();
        openCodeVerification(data);
        setToast(text.codeSent);
      },
      onError: (error) => setToast(errorMessage(error, language, text.requestFailed)),
    });
  };

  const submitVerificationCode = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginFlow || !verificationCode.trim()) return;
    confirmCode.mutate({
      accountId: loginFlow.accountId,
      data: { challengeId: loginFlow.challengeId, code: verificationCode.trim() },
    }, {
      onSuccess: (data) => {
        if (data.status === "requires_2fa") {
          setVerificationCode("");
          setLoginFlow((current) => current ? { ...current, step: "password" } : current);
          return;
        }
        void invalidateAccounts();
        closeLoginDialog();
        setToast(text.loginComplete);
      },
      onError: (error) => setToast(errorMessage(error, language, text.requestFailed)),
    });
  };

  const submitTwoFactorPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginFlow || !twoFactorPassword) return;
    confirmPassword.mutate({
      accountId: loginFlow.accountId,
      data: { challengeId: loginFlow.challengeId, password: twoFactorPassword },
    }, {
      onSuccess: () => {
        void invalidateAccounts();
        closeLoginDialog();
        setToast(text.loginComplete);
      },
      onError: (error) => setToast(errorMessage(error, language, text.requestFailed)),
    });
  };

  const removeAccount = (accountId: string) => {
    if (!window.confirm(text.deleteConfirmation)) return;
    setDeletingId(accountId);
    deleteAccount.mutate({ accountId }, {
      onSuccess: () => {
        void invalidateAccounts();
        setToast(text.deleted);
        setDeletingId(null);
      },
      onError: (error) => {
        setToast(errorMessage(error, language, text.requestFailed));
        setDeletingId(null);
      },
    });
  };

  const handleSync = (accountId: string) => {
    setSyncingId(accountId);
    sync.mutate({ accountId }, {
      onSuccess: (data) => {
        setToast(`${text.synced}: ${data.count} ${text.items}`);
        setSyncingId(null);
      },
      onError: (error) => {
        void invalidateAccounts();
        setToast(errorMessage(error, language, text.requestFailed));
        setSyncingId(null);
      },
    });
  };

  const helpSteps = [
    { title: text.prepare, description: text.prepareDescription, icon: Smartphone },
    { title: text.api, description: text.apiDescription, icon: HelpCircle },
    { title: text.app, description: text.appDescription, icon: Plus },
    { title: text.credentials, description: text.credentialsDescription, icon: Key },
    { title: text.phoneSetup, description: text.phoneSetupDescription, icon: Smartphone },
    { title: text.limitSetup, description: text.limitSetupDescription, icon: RefreshCw },
    { title: text.saveStep, description: text.saveStepDescription, icon: CheckCircle2 },
  ];

  return (
    <AppLayout activePage="accounts" title={text.title}>
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[24px] font-extrabold tracking-tight text-[#0f172a]">{text.title}</h1>
            <p className="mt-1.5 text-[14px] font-medium text-[#64748b]">{text.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { setOpenStep(0); setShowHelpModal(true); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#cbd5e1] bg-white text-[#475569] shadow-sm transition-all hover:border-[#94a3b8] hover:bg-[#f8fafc] hover:text-[#0f172a] active:scale-95" aria-label={text.help} title={text.help} data-testid="telegram-accounts-help">
              <HelpCircle className="h-5 w-5" />
            </button>
            <button onClick={openAddModal} className="flex h-11 items-center gap-2.5 rounded-xl bg-[#2aabee] px-5 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)] transition-all hover:bg-[#1c93d4] active:scale-95" data-testid="telegram-accounts-add">
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />
              <span>{text.add}</span>
            </button>
          </div>
        </div>

        {accounts.isLoading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#cbd5e1] bg-[#f8fafc]/50">
            <LoaderCircle className="h-8 w-8 animate-spin text-[#94a3b8]" />
            <span className="mt-4 text-[14px] font-bold text-[#64748b]">{text.loading}</span>
          </div>
        ) : accounts.isError ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#fda4af] bg-[#fff7f8] p-8 text-center">
            <RefreshCw className="h-7 w-7 text-[#e11d48]" />
            <h3 className="mt-5 text-[16px] font-extrabold text-[#0f172a]">{text.loadFailed}</h3>
            <p className="mt-2 max-w-sm text-[14px] font-medium leading-relaxed text-[#64748b]">{text.loadFailedDescription}</p>
            <button onClick={() => void accounts.refetch()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[14px] font-bold text-[#e11d48] shadow-sm ring-1 ring-inset ring-[#fecdd3] transition-all hover:bg-[#fff1f2]">
              <RefreshCw className="h-4 w-4" />{text.retry}
            </button>
          </div>
        ) : (accounts.data?.length ?? 0) === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#cbd5e1] bg-[#f8fafc]/50 p-8 text-center">
            <span className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-[#e2e8f0] text-[#64748b] shadow-inner"><Send className="ml-1 h-7 w-7" /></span>
            <h3 className="text-[16px] font-extrabold text-[#0f172a]">{text.emptyTitle}</h3>
            <p className="mt-2 max-w-sm text-[14px] font-medium leading-relaxed text-[#64748b]">{text.emptyDescription}</p>
            <button onClick={openAddModal} className="mt-6 flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[14px] font-bold text-[#2aabee] shadow-sm ring-1 ring-inset ring-[#cbd5e1] transition-all hover:bg-[#f8fafc]" data-testid="telegram-accounts-empty-add">
              <Plus className="h-4 w-4" />{text.addFirst}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {accounts.data?.map((account) => {
              const isLoggedIn = account.status === "connected";
              const isSaved = account.status === "saved";
              const isError = account.status === "error";
              return (
                <article key={account.id} data-testid={`telegram-account-${account.id}`} className="flex flex-col gap-5 rounded-2xl border border-[#eef2f6] bg-white p-5 shadow-sm transition-all hover:border-[#bde4f9] hover:shadow-md sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-4 sm:w-[285px]">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#2aabee] to-[#1c93d4] text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)]"><Send className="ml-0.5 h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-extrabold text-[#0f172a]">{account.name}</h3>
                      <p className="mt-1 truncate text-[13px] font-medium text-[#64748b]">{account.username ? `@${account.username}` : text.noUsername}</p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-4 border-t border-[#eef2f6] pt-4 sm:border-0 sm:px-2 sm:pt-0">
                    <div className="flex flex-col gap-1.5"><span className="text-[10px] font-extrabold uppercase tracking-wider text-[#94a3b8]">{text.phone}</span><span className="text-[13px] font-semibold text-[#1e293b]">{account.phone ?? "—"}</span></div>
                    <div className="flex flex-col gap-1.5"><span className="text-[10px] font-extrabold uppercase tracking-wider text-[#94a3b8]">{text.telegramId}</span><span className="text-[13px] font-semibold text-[#1e293b]">{account.telegramUserId ?? "—"}</span></div>
                    <div className="flex flex-col gap-1.5"><span className="text-[10px] font-extrabold uppercase tracking-wider text-[#94a3b8]">{text.dailyLimit}</span><span className="text-[13px] font-semibold text-[#1e293b]">{account.daily_limit}</span></div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#eef2f6] pt-4 sm:border-0 sm:pt-0">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${isLoggedIn ? "bg-[#eaf6fd] text-[#1c93d4]" : isError ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#fffbeb] text-[#d97706]"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isLoggedIn ? "bg-[#2aabee]" : isError ? "bg-[#ef4444]" : "bg-[#f59e0b]"}`} />
                      {isLoggedIn ? text.loggedIn : isSaved ? text.savedStatus : isError ? text.connectionError : account.status === "authorizing" ? text.authorizing : text.notConnected}
                    </span>
                     {account.status === "connected" && <button onClick={() => handleSync(account.id)} disabled={sync.isPending} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#f8fafc] px-3 text-[13px] font-bold text-[#475569] ring-1 ring-inset ring-[#e2e8f0] transition-all hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50" aria-label={text.syncDestinations}>
                      <RefreshCw className={`h-3.5 w-3.5 ${syncingId === account.id ? "animate-spin text-[#2aabee]" : ""}`} /><span className="hidden sm:inline">{text.sync}</span>
                    </button>}
                     {account.status !== "connected" && <button onClick={() => startAccountLogin(account.id)} disabled={startLogin.isPending} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#eaf6fd] px-3 text-[13px] font-bold text-[#1c93d4] ring-1 ring-inset ring-[#bde4f9] transition-all hover:bg-[#dff2fc] disabled:cursor-not-allowed disabled:opacity-50" data-testid={`telegram-account-verify-${account.id}`}>
                       {startLogin.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}<span>{text.verify}</span>
                     </button>}
                    <button onClick={() => removeAccount(account.id)} disabled={deletingId === account.id} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#fff7f8] px-3 text-[13px] font-bold text-[#e11d48] ring-1 ring-inset ring-[#fecdd3] transition-all hover:bg-[#ffe4e6] disabled:cursor-not-allowed disabled:opacity-50" aria-label={text.deleteAccount} data-testid={`telegram-account-delete-${account.id}`}>
                      {deletingId === account.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}<span>{text.delete}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showHelpModal && (
        <AccountsDialog title={text.guideTitle} description={text.guideDescription} onClose={() => setShowHelpModal(false)} testId="telegram-accounts-help-dialog">
          <div className="space-y-3">{helpSteps.map((step, index) => <HelpStep key={step.title} step={step} index={index} isOpen={openStep === index} onToggle={() => setOpenStep(openStep === index ? -1 : index)} />)}</div>
          <div className="mt-8 flex justify-end"><button onClick={() => setShowHelpModal(false)} className="rounded-xl bg-[#f1f5f9] px-6 py-3 text-[14px] font-bold text-[#475569] transition-colors hover:bg-[#e2e8f0]">{text.understood}</button></div>
        </AccountsDialog>
      )}

      {showAddModal && (
        <AccountsDialog title={text.addTitle} description={text.addDescription} onClose={closeAddModal} testId="telegram-accounts-add-dialog">
          <form className="space-y-5" onSubmit={saveAccount}>
            <p className="rounded-2xl border border-[#bde4f9] bg-[#f0f9ff] px-4 py-3 text-[13px] font-semibold leading-relaxed text-[#0369a1]">
              {text.apiNote}{" "}
              <a
                href="https://my.telegram.org"
                target="_blank"
                rel="noreferrer"
                className="font-extrabold underline decoration-[#7dd3fc] underline-offset-2 hover:text-[#075985]"
              >
                my.telegram.org
              </a>{" "}
              <span>→ API development tools.</span>
            </p>
            <Input label={text.apiId} value={apiId} onChange={setApiId} placeholder="12345678" type="number" />
            <Input label={text.apiHash} value={apiHash} onChange={setApiHash} placeholder="0123456789abcdef" type="password" />
            <Input label={text.phoneNumber} value={phone} onChange={setPhone} placeholder={text.phonePlaceholder} type="tel" />
            <Input label={text.dailyLimit} value={dailyLimit} onChange={setDailyLimit} placeholder="200" type="number" />
            <div className="flex justify-end pt-3">
              <button type="submit" disabled={createAccount.isPending} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2aabee] px-6 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)] transition-all hover:bg-[#1c93d4] disabled:cursor-not-allowed disabled:opacity-50" data-testid="telegram-accounts-save">
                {createAccount.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{text.save}
              </button>
            </div>
          </form>
        </AccountsDialog>
      )}

      {loginFlow && (
        <AccountsDialog
          title={loginFlow.step === "code" ? text.verificationTitle : text.twoFactorTitle}
          description={loginFlow.step === "code" ? text.verificationDescription : text.twoFactorDescription}
          onClose={closeLoginDialog}
          testId="telegram-accounts-login-dialog"
        >
          {loginFlow.step === "code" ? (
            <form className="space-y-5" onSubmit={submitVerificationCode}>
              <p className="rounded-xl bg-[#f0f9ff] px-4 py-3 text-[13px] font-semibold text-[#0369a1]">
                {loginFlow.delivery === "app" ? text.sentViaApp : text.sentViaSms}
              </p>
              <Input label={text.code} value={verificationCode} onChange={setVerificationCode} placeholder={text.codePlaceholder} type="text" />
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => startAccountLogin(loginFlow.accountId)} disabled={isLoginPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f1f5f9] px-5 text-[14px] font-bold text-[#475569] transition-colors hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50" data-testid="telegram-accounts-resend-code">
                  {startLogin.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{text.resendCode}
                </button>
                <button type="submit" disabled={isLoginPending || !verificationCode.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-5 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)] transition-all hover:bg-[#1c93d4] disabled:cursor-not-allowed disabled:opacity-50" data-testid="telegram-accounts-confirm-code">
                  {confirmCode.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{text.confirmCode}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={submitTwoFactorPassword}>
              <Input label={text.twoFactorPassword} value={twoFactorPassword} onChange={setTwoFactorPassword} type="password" />
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={isLoginPending || !twoFactorPassword} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-5 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)] transition-all hover:bg-[#1c93d4] disabled:cursor-not-allowed disabled:opacity-50" data-testid="telegram-accounts-confirm-password">
                  {confirmPassword.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{text.confirmPassword}
                </button>
              </div>
            </form>
          )}
        </AccountsDialog>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}