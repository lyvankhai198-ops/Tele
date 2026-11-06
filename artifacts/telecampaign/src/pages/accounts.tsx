import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Key,
  LoaderCircle,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
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
  useCreateTelegramQrAccount,
  useGetSystemDefaults,
  useGetTelegramQrLoginStatus,
  useListTelegramAccounts,
  useStartTelegramQrLogin,
  useCancelTelegramQrLogin,
  useStartTelegramLogin,
} from "@workspace/api-client-react";
import QRCode from "qrcode";
import { AppLayout, Input, Toast } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage, type Language } from "@/lib/i18n";
import {useOperations} from "@/lib/operations";
import "./accounts.css";

const copy = {
  en: {
    connectionPrivacyTitle: "Before you connect",
    connectionPrivacyPurpose: "Connecting lets Telecampaign sync your groups and send campaigns according to your settings.",
    connectionPrivacyPassword: "Telecampaign does not store your Telegram / 2FA password. If requested, it is used only to authenticate with Telegram.",
    connectionPrivacySession: "Your login session is stored encrypted to keep the connection active.",
    connectionPrivacyRevoke: "You can revoke this session at any time in Telegram → Settings → Devices.",
    requestFailed: "The request could not be completed.",
    codeSent: "A new Telegram verification code was sent. Use only the latest code.",
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
    deleteConfirmation: "Delete this Telegram account and ALL related campaigns (including running campaigns), synced groups and sending history? New sends will stop. A message already sent to Telegram cannot be recalled. This cannot be undone. Other accounts will not be affected.",
    guideTitle: "Telegram account guide",
    guideDescription: "Use these steps to prepare the API information for an account you manage.",
    understood: "Got it",
    prepare: "Prepare your account",
    prepareDescription: "Use only a Telegram account you are authorized to manage.",
    api: "Open Telegram API",
    apiDescription: "Get api_id and api_hash from my.telegram.org → API development tools.",
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
    connectionNoticeTitle: "Before adding an account",
    connectionConfirm: "Understood, continue",
    connectionCancel: "Cancel",
    methodApi: "Method 1: Sign in with API ID / API Hash",
    methodQr: "Method 2: Sign in with Telegram QR code",
    apiNote: "Get your api_id and api_hash from",
    apiId: "api_id",
    apiHash: "api_hash",
    phoneNumber: "Telegram phone number",
    phonePlaceholder: "+84...",
    save: "Save",
    saveAndQr: "Save & use QR",
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
    sentViaApp: "Telegram sent the code in the Telegram app. Use only the newest message; older codes are no longer valid.",
    sentViaSms: "Telegram sent the code by SMS. Use only the newest message; older codes are no longer valid.",
    tryAgain: "Try again",
    useQr: "Use QR code instead",
    qrTitle: "Scan Telegram QR code",
    qrDescription: "Open Telegram on your phone, go to Settings → Devices → Link Desktop Device, then scan this code.",
    qrWaiting: "Waiting for Telegram to confirm the scan...",
    qrTwoFactor: "Telegram accepted the QR scan. Enter your 2FA password to finish.",
    qrExpired: "This QR code has expired. Generate a new one to try again.",
    qrAlreadyLinked: "This Telegram account is already logged in to another Telecampaign session. Sign in to that session or ask an administrator to release the link.",
    qrCancel: "Cancel",
    qrRegenerate: "Generate new QR",
  },
  vi: {
    connectionPrivacyTitle: "Trước khi kết nối",
    connectionPrivacyPurpose: "Kết nối giúp Telecampaign đồng bộ nhóm và gửi chiến dịch theo cấu hình của bạn.",
    connectionPrivacyPassword: "Telecampaign không lưu mật khẩu Telegram / 2FA của bạn. Mật khẩu (nếu được yêu cầu) chỉ dùng để xác thực với Telegram.",
    connectionPrivacySession: "Phiên đăng nhập được lưu dưới dạng mã hóa để duy trì kết nối.",
    connectionPrivacyRevoke: "Bạn có thể thu hồi phiên bất cứ lúc nào tại Telegram → Cài đặt → Thiết bị.",
    requestFailed: "Yêu cầu không thể hoàn thành.",
    codeSent: "Đã gửi mã xác minh Telegram mới. Chỉ dùng mã mới nhất.",
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
    deleteConfirmation: "Xóa tài khoản Telegram này cùng TOÀN BỘ chiến dịch (kể cả đang chạy), nhóm đã đồng bộ và lịch sử gửi liên quan? Hệ thống sẽ ngừng gửi mới. Tin đã gửi sang Telegram không thể thu hồi. Không thể hoàn tác. Tài khoản khác không bị ảnh hưởng.",
    guideTitle: "Hướng dẫn tài khoản Telegram",
    guideDescription: "Thực hiện các bước sau để chuẩn bị API cho tài khoản bạn quản lý.",
    understood: "Đã hiểu",
    prepare: "Chuẩn bị tài khoản",
    prepareDescription: "Chỉ dùng tài khoản Telegram bạn được phép quản lý.",
    api: "Mở Telegram API",
    apiDescription: "Lấy api_id và api_hash tại my.telegram.org → API development tools.",
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
    connectionNoticeTitle: "Lưu ý trước khi thêm tài khoản",
    connectionConfirm: "Đã hiểu, tiếp tục",
    connectionCancel: "Hủy",
    methodApi: "Phương thức 1: Đăng nhập bằng API ID / API Hash",
    methodQr: "Phương thức 2: Đăng nhập bằng mã QR Telegram",
    apiNote: "Lấy api_id và api_hash tại",
    apiId: "api_id",
    apiHash: "api_hash",
    phoneNumber: "Số điện thoại Telegram",
    phonePlaceholder: "+84...",
    save: "Lưu",
    saveAndQr: "Lưu & dùng QR",
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
    sentViaApp: "Telegram đã gửi mã trong ứng dụng. Chỉ dùng tin nhắn mới nhất; mã cũ không còn hiệu lực.",
    sentViaSms: "Telegram đã gửi mã qua SMS. Chỉ dùng tin nhắn mới nhất; mã cũ không còn hiệu lực.",
    tryAgain: "Thử lại",
    useQr: "Đăng nhập bằng mã QR",
    qrTitle: "Quét mã QR Telegram",
    qrDescription: "Mở Telegram trên điện thoại, vào Cài đặt → Thiết bị → Liên kết thiết bị máy tính, rồi quét mã này.",
    qrWaiting: "Đang chờ Telegram xác nhận quét mã...",
    qrTwoFactor: "Telegram đã nhận mã QR. Nhập mật khẩu 2FA để hoàn tất.",
    qrExpired: "Mã QR đã hết hạn. Hãy tạo mã mới để thử lại.",
    qrAlreadyLinked: "Tài khoản Telegram này đã đăng nhập ở một phiên Telecampaign khác. Hãy dùng phiên đó hoặc nhờ quản trị viên gỡ liên kết.",
    qrCancel: "Hủy",
    qrRegenerate: "Tạo mã QR mới",
  },
} as const;

function ConnectionPrivacyNotice({ language }: { language: Language }) {
  const text = copy[language === "vi" ? "vi" : "en"];
  return (
    <aside role="note" className="mb-5 rounded-2xl border border-[#bde4f9] bg-[#f0f9ff] p-4" data-testid="telegram-connection-privacy">
      <div className="mb-2 flex items-center gap-2 text-[#075985]">
        <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
        <h3 className="text-[14px] font-bold">{text.connectionPrivacyTitle}</h3>
      </div>
      <div className="space-y-2 text-[13px] leading-relaxed text-[#334155]">
        <p>{text.connectionPrivacyPurpose}</p>
        <p className="font-semibold">{text.connectionPrivacyPassword}</p>
        <p>{text.connectionPrivacySession} {text.connectionPrivacyRevoke}</p>
      </div>
    </aside>
  );
}

function errorMessage(error: unknown, language: Language, fallback: string) {
  return localizedErrorMessage(error, language, fallback);
}

function AccountsDialog({
  title,
  description,
  children,
  onClose,
  testId,
  size = "default",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  testId: string;
  size?: "default" | "small";
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
    <div className="fixed inset-0 z-50 grid place-items-center p-2 sm:p-4">
      <button aria-label="Close dialog overlay" className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined} tabIndex={-1} data-testid={testId} className={`relative flex max-h-[calc(100dvh-1rem)] w-full min-w-0 ${size === "small" ? "max-w-sm" : "max-w-lg"} flex-col overflow-hidden rounded-3xl border border-[#e2e8f0] bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]`}>
        <div className="flex shrink-0 items-start justify-between border-b border-[#eef2f6] px-5 py-5 sm:px-7">
          <div className="min-w-0 pr-2 sm:pr-4">
            <h2 id={titleId} className="break-words text-[19px] font-extrabold tracking-tight text-[#0f172a]">{title}</h2>
            {description&&<p id={descriptionId} className="mt-2 break-words text-[14px] font-medium leading-relaxed text-[#64748b]">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#197a91]" data-testid={`${testId}-close`}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-4 sm:p-7">{children}</div>
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
  delivery: "app" | "sms" | "qr";
  step: "code" | "password" | "qr";
  qrUrl?: string | null;
  expiresAt?: string;
};

export default function Accounts() {
  const { language, t } = useLanguage();
  const text = copy[language === "vi" ? "vi" : "en"];
  const queryClient = useQueryClient();
  const accounts = useListTelegramAccounts();
  const createAccount = useCreateTelegramAccount();
  const createQrAccount = useCreateTelegramQrAccount();
  const operations=useOperations();
  const startLogin = useStartTelegramLogin();
  const confirmCode = useConfirmTelegramLoginCode();
  const confirmPassword = useConfirmTelegramLoginPassword();
  const startQrLogin = useStartTelegramQrLogin();
  const cancelQrLogin = useCancelTelegramQrLogin();
  const systemDefaults = useGetSystemDefaults();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConnectionNotice,setShowConnectionNotice]=useState(false);
  const [connectionNoticeAccepted,setConnectionNoticeAccepted]=useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [openStep, setOpenStep] = useState(0);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [dailyLimit, setDailyLimit] = useState("200");
  const [addMethod, setAddMethod] = useState<"choose" | "api">("choose");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loginFlow, setLoginFlow] = useState<LoginFlow | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [qrImage, setQrImage] = useState("");
  const loginSubmissionLocked = useRef(false);
  const defaultDailyLimit = String(systemDefaults.data?.defaultAccountDailyLimit ?? 200);

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddMethod("choose");
    setApiId("");
    setApiHash("");
    setPhone("");
    setDailyLimit(defaultDailyLimit);
  };
  const openAddModal = () => {
    setConnectionNoticeAccepted(false);
    setShowConnectionNotice(true);
  };
  const confirmAddAccount = () => {
    setConnectionNoticeAccepted(true);
    setShowConnectionNotice(false);
    setDailyLimit(defaultDailyLimit);
    setAddMethod("choose");
    setShowAddModal(true);
  };

  const invalidateAccounts = () => queryClient.invalidateQueries({ queryKey: getListTelegramAccountsQueryKey() });
  const isLoginPending = startLogin.isPending || confirmCode.isPending || confirmPassword.isPending;
  const qrStatus = useGetTelegramQrLoginStatus(
    loginFlow?.accountId ?? "",
    loginFlow?.challengeId ?? "",
    {
      query: {
        queryKey: ["telegram-qr-login-status", loginFlow?.accountId ?? "", loginFlow?.challengeId ?? ""],
        enabled: loginFlow?.delivery === "qr",
        refetchInterval: loginFlow?.delivery === "qr" ? 1500 : false,
      },
    },
  );

  const completeTelegramLogin = () => {
    void invalidateAccounts();
    closeLoginDialog(false);
    setToast(text.loginComplete);
  };

  const openCodeVerification = (data: { account: { id: string }; challenge: { id: string; delivery: "app" | "sms" | "qr" } }) => {
    const delivery = data.challenge.delivery === "sms" ? "sms" : "app";
    setVerificationCode("");
    setTwoFactorPassword("");
    setLoginFlow({ accountId: data.account.id, challengeId: data.challenge.id, delivery, step: "code" });
  };

  const closeLoginDialog = (cancelQr = true) => {
    if (loginFlow?.delivery === "qr" && !cancelQrLogin.isPending) {
      if (cancelQr) {
        cancelQrLogin.mutate({ accountId: loginFlow.accountId, challengeId: loginFlow.challengeId }, {
          onSettled: () => void invalidateAccounts(),
        });
      }
    }
    loginSubmissionLocked.current = false;
    setVerificationCode("");
    setTwoFactorPassword("");
    setQrImage("");
    setLoginFlow(null);
  };

  const startAccountLogin = (accountId: string) => {
    if (loginSubmissionLocked.current) return;
    loginSubmissionLocked.current = true;
    setVerificationCode("");
    startLogin.mutate({ accountId }, {
      onSuccess: (data) => {
        void invalidateAccounts();
        openCodeVerification(data);
        setToast(text.codeSent);
      },
      onError: (error) => {
        void invalidateAccounts();
        setToast(errorMessage(error, language, text.requestFailed));
      },
      onSettled: () => {
        loginSubmissionLocked.current = false;
      },
    });
  };

  const startQrAccountLogin = (accountId: string) => {
    if (loginSubmissionLocked.current) return;
    loginSubmissionLocked.current = true;
    startQrLogin.mutate({ accountId }, {
      onSuccess: (data) => {
        void invalidateAccounts();
        setQrImage("");
        setLoginFlow({
          accountId: data.account.id,
          challengeId: data.challenge.id,
          delivery: "qr",
          step: "qr",
          qrUrl: data.challenge.qrUrl,
          expiresAt: data.challenge.expiresAt,
        });
      },
      onError: (error) => {
        void invalidateAccounts();
        setToast(errorMessage(error, language, text.requestFailed));
      },
      onSettled: () => {
        loginSubmissionLocked.current = false;
      },
    });
  };

  const openQrLogin = (data: { account: { id: string }; challenge: { id: string; qrUrl?: string | null; expiresAt: string } }) => {
    void invalidateAccounts();
    closeAddModal();
    setQrImage("");
    setLoginFlow({
      accountId: data.account.id,
      challengeId: data.challenge.id,
      delivery: "qr",
      step: "qr",
      qrUrl: data.challenge.qrUrl,
      expiresAt: data.challenge.expiresAt,
    });
  };

  const startDirectQrAccountLogin = () => {
    if (loginSubmissionLocked.current) return;
    const parsedDailyLimit = Number(dailyLimit);
    if (!Number.isInteger(parsedDailyLimit) || parsedDailyLimit < 1) {
      setToast(text.requestFailed);
      return;
    }
    loginSubmissionLocked.current = true;
    createQrAccount.mutate({ data: { daily_limit: parsedDailyLimit } }, {
      onSuccess: openQrLogin,
      onError: (error) => setToast(errorMessage(error, language, text.requestFailed)),
      onSettled: () => {
        loginSubmissionLocked.current = false;
      },
    });
  };

  useEffect(() => {
    if (loginFlow?.delivery !== "qr" || !loginFlow.qrUrl || loginFlow.step !== "qr") {
      setQrImage("");
      return;
    }
    let active = true;
    void QRCode.toDataURL(loginFlow.qrUrl, {
      width: 280,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((url) => {
      if (active) setQrImage(url);
    }).catch(() => {
      if (active) setQrImage("");
    });
    return () => {
      active = false;
    };
  }, [loginFlow?.delivery, loginFlow?.qrUrl, loginFlow?.step]);

  useEffect(() => {
    const status = qrStatus.data;
    if (!status || loginFlow?.delivery !== "qr") return;
    if (status.status === "waiting_qr") {
      if (status.qrUrl && status.qrUrl !== loginFlow.qrUrl) {
        setLoginFlow((current) => current ? { ...current, qrUrl: status.qrUrl, expiresAt: status.expiresAt, step: "qr" } : current);
      }
      return;
    }
    if (status.status === "requires_2fa") {
      setLoginFlow((current) => current ? { ...current, step: "password", qrUrl: null } : current);
      setTwoFactorPassword("");
      return;
    }
    if (status.status === "connected") {
      completeTelegramLogin();
      return;
    }
    if (status.status === "expired" || status.status === "cancelled") {
      void invalidateAccounts();
      setToast(status.errorCode === "TELEGRAM_ACCOUNT_ALREADY_LINKED" ? text.qrAlreadyLinked : text.qrExpired);
      closeLoginDialog(false);
    }
  }, [qrStatus.data?.status, qrStatus.data?.qrUrl, qrStatus.data?.errorCode]);

  const submitAccount = () => {
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

  const saveAccount = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAccount();
  };

  const submitVerificationCode = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginFlow || !verificationCode.trim() || loginSubmissionLocked.current) return;
    loginSubmissionLocked.current = true;
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
        completeTelegramLogin();
      },
      onError: (error) => setToast(errorMessage(error, language, text.requestFailed)),
      onSettled: () => {
        loginSubmissionLocked.current = false;
      },
    });
  };

  const submitTwoFactorPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginFlow || !twoFactorPassword || loginSubmissionLocked.current) return;
    loginSubmissionLocked.current = true;
    confirmPassword.mutate({
      accountId: loginFlow.accountId,
      data: { challengeId: loginFlow.challengeId, password: twoFactorPassword },
    }, {
      onSuccess: () => {
        if (loginFlow.delivery === "qr") {
          setTwoFactorPassword("");
          setToast(text.qrWaiting);
        } else {
          completeTelegramLogin();
        }
      },
      onError: (error) => {
        setTwoFactorPassword("");
        setToast(errorMessage(error, language, text.requestFailed));
      },
      onSettled: () => {
        loginSubmissionLocked.current = false;
      },
    });
  };

  const removeAccount = (accountId: string) => {
    if (!window.confirm(text.deleteConfirmation)) return;
    setDeletingId(accountId);
    void operations.start({kind:"delete_account",accountId,confirm:true}).then(() => {
        // Account deletion also removes campaigns and groups, including cached
        // dashboard counts and selectors used by Quick Send.
        void queryClient.invalidateQueries();
        setToast(language==="vi"?"Đã tiếp nhận yêu cầu xoá. Xem tiến trình phía trên.":"Deletion accepted. See progress above.");
        setDeletingId(null);
      }, (error) => {
        setToast(errorMessage(error, language, text.requestFailed));
        setDeletingId(null);
      });
  };

  const handleSync = (accountId: string) => {
    setSyncingId(accountId);
    void operations.start({kind:"sync_groups",accountId}).then(() => {
        void invalidateAccounts();
        setToast(language==="vi"?"Đã bắt đầu đồng bộ nền. Xem tiến trình phía trên.":"Background sync accepted. See progress above.");
        setSyncingId(null);
      }, (error) => {
        void invalidateAccounts();
        setToast(errorMessage(error, language, text.requestFailed));
        setSyncingId(null);
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
      <div className="tc-telegram-pro tcp-accounts">
        <div className="tcp-heading">
          <div>
            <p className="tcp-kicker">{t("Telegram connection")}</p>
            <h1>{text.title}</h1>
            <p className="tcp-description">{text.description}</p>
          </div>
          <div className="tcp-heading-actions">
            <button onClick={() => { setOpenStep(0); setShowHelpModal(true); }} className="tcp-help-button" aria-label={text.help} title={text.help} data-testid="telegram-accounts-help">
              <HelpCircle size={17} /><span>{text.help}</span>
            </button>
            <button onClick={openAddModal} className="tcp-add-button" data-testid="telegram-accounts-add">
              <Plus size={18} strokeWidth={2.5} />
              <span>{text.add}</span>
            </button>
          </div>
        </div>

        {!accounts.isLoading && !accounts.isError && accounts.data && (
          <section className="tcp-summary" aria-label={t("Telegram Accounts (Connected / Total)")}>
            <div className="tcp-summary-label"><span className="tcp-summary-icon"><Smartphone size={16} /></span>{text.title}</div>
            <div className="tcp-summary-count">{accounts.data.length}<span> {t("accounts")}</span></div>
            <div className="tcp-summary-note">
              <span className="tcp-live-dot" />{accounts.data.filter(account => account.status === "connected").length} {t("Connected")}
              <span className="tcp-summary-sep">·</span>
              {accounts.data.filter(account => account.status === "saved").length} {text.savedStatus}
            </div>
          </section>
        )}

        <div className="tcp-list-section">
        <div className="tcp-section-head"><div><h2>{t("Accounts")}</h2><p>{text.description}</p></div></div>
        {accounts.isLoading ? (
          <div className="tcp-state" role="status">
            <LoaderCircle className="h-8 w-8 animate-spin text-[#94a3b8]" />
            <span className="mt-4 text-[14px] font-bold text-[#64748b]">{text.loading}</span>
          </div>
        ) : accounts.isError ? (
          <div className="tcp-state tcp-state-error" role="alert">
            <RefreshCw className="h-7 w-7 text-[#e11d48]" />
            <h3 className="mt-5 text-[16px] font-extrabold text-[#0f172a]">{text.loadFailed}</h3>
            <p className="mt-2 max-w-sm text-[14px] font-medium leading-relaxed text-[#64748b]">{text.loadFailedDescription}</p>
            <button onClick={() => void accounts.refetch()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[14px] font-bold text-[#e11d48] shadow-sm ring-1 ring-inset ring-[#fecdd3] transition-all hover:bg-[#fff1f2]">
              <RefreshCw className="h-4 w-4" />{text.retry}
            </button>
          </div>
        ) : (accounts.data?.length ?? 0) === 0 ? (
          <div className="tcp-state">
            <span className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-[#e2e8f0] text-[#64748b] shadow-inner"><Send className="ml-1 h-7 w-7" /></span>
            <h3 className="text-[16px] font-extrabold text-[#0f172a]">{text.emptyTitle}</h3>
            <p className="mt-2 max-w-sm text-[14px] font-medium leading-relaxed text-[#64748b]">{text.emptyDescription}</p>
            <button onClick={openAddModal} className="tcp-add-button mt-6" data-testid="telegram-accounts-empty-add">
              <Plus className="h-4 w-4" />{text.addFirst}
            </button>
          </div>
        ) : (
          <div className="tcp-account-list">
            {accounts.data?.map((account, index) => {
              const isLoggedIn = account.status === "connected";
              const isSaved = account.status === "saved";
              const isError = account.status === "error";
              return (
                <article key={account.id} data-testid={`telegram-account-${account.id}`} className="tcp-account" style={{ animationDelay: `${Math.min(index, 8) * 65}ms` }}>
                  <div className="tcp-account-top">
                    <div className="tcp-account-identity">
                      <span className={`tcp-avatar ${isLoggedIn ? "is-connected" : "is-saved"}`}><Send size={19} fill="currentColor" /></span>
                      <div className="tcp-account-name">
                        <h3 title={account.name}>{account.name}</h3>
                        <p dir="auto">{account.username ? `@${account.username}` : text.noUsername}</p>
                      </div>
                    </div>
                    <span className={`tcp-status ${isLoggedIn ? "status-connected" : isError ? "status-error" : "status-saved"}`}>
                      <span className="tcp-status-dot" />
                      {isLoggedIn ? t("Connected") : isSaved ? text.savedStatus : isError ? text.connectionError : account.status === "authorizing" ? text.authorizing : text.notConnected}
                    </span>
                  </div>
                  <div className="tcp-account-details">
                    <div className="tcp-detail"><span>{text.phone}</span><strong dir="ltr">{account.phone ?? "—"}</strong></div>
                    <div className="tcp-detail"><span>{text.telegramId}</span><strong dir="ltr" className="tcp-mono">{account.telegramUserId ?? "—"}</strong></div>
                    <div className="tcp-detail"><span title={text.limitSetupDescription}>{text.dailyLimit}</span><strong>{account.daily_limit}</strong></div>
                  </div>
                  <div className="tcp-account-footer">
                    <p><ShieldCheck size={14} />{t("Send limit, not messages sent")}</p>
                    <div className="tcp-account-actions">
                    {account.status === "connected" && <button onClick={() => handleSync(account.id)} disabled={syncingId===account.id||operations.data?.some(job=>job.accountId===account.id&&(job.state==="queued"||job.state==="running"))} className="tcp-action tcp-sync" aria-label={text.syncDestinations}>
                      <RefreshCw className={`h-3.5 w-3.5 ${syncingId === account.id || operations.data?.some(job=>job.accountId===account.id&&(job.state==="queued"||job.state==="running")) ? "animate-spin" : ""}`} /><span>{text.sync}</span>
                    </button>}
                      {account.status !== "connected" && <button onClick={() => account.phone ? startAccountLogin(account.id) : startQrAccountLogin(account.id)} disabled={startLogin.isPending || startQrLogin.isPending} className="tcp-action tcp-verify" data-testid={`telegram-account-verify-${account.id}`}>
                        {startLogin.isPending || startQrLogin.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : account.phone ? <Smartphone className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}<span>{text.verify}</span>
                     </button>}
                    <button onClick={() => removeAccount(account.id)} disabled={deletingId === account.id} className="tcp-delete" aria-label={text.deleteAccount} data-testid={`telegram-account-delete-${account.id}`}>
                      {deletingId === account.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}<span>{text.delete}</span>
                    </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {showHelpModal && (
        <AccountsDialog title={text.guideTitle} description={text.guideDescription} onClose={() => setShowHelpModal(false)} testId="telegram-accounts-help-dialog">
          <div className="space-y-3">{helpSteps.map((step, index) => <HelpStep key={step.title} step={step} index={index} isOpen={openStep === index} onToggle={() => setOpenStep(openStep === index ? -1 : index)} />)}</div>
          <div className="mt-8 flex justify-end"><button onClick={() => setShowHelpModal(false)} className="rounded-xl bg-[#f1f5f9] px-6 py-3 text-[14px] font-bold text-[#475569] transition-colors hover:bg-[#e2e8f0]">{text.understood}</button></div>
        </AccountsDialog>
      )}

      {showConnectionNotice && (
        <AccountsDialog
          size="small"
          title={text.connectionNoticeTitle}
          description=""
          onClose={() => setShowConnectionNotice(false)}
          testId="telegram-accounts-connection-notice"
        >
          <div className="space-y-5">
            <ConnectionPrivacyNotice language={language} />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowConnectionNotice(false)}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#f1f5f9] px-5 text-[14px] font-bold text-[#475569] transition-colors hover:bg-[#e2e8f0]"
                data-testid="telegram-accounts-connection-cancel"
              >
                {text.connectionCancel}
              </button>
              <button
                type="button"
                onClick={confirmAddAccount}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2aabee] px-5 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)] transition-all hover:bg-[#1c93d4]"
                data-testid="telegram-accounts-connection-confirm"
              >
                {text.connectionConfirm}
              </button>
            </div>
          </div>
        </AccountsDialog>
      )}

      {showAddModal && (
        <AccountsDialog title={text.addTitle} description={text.addDescription} onClose={closeAddModal} testId="telegram-accounts-add-dialog">
          {addMethod === "choose" ? (
            <div className="space-y-4">
              <button type="button" onClick={() => setAddMethod("api")} className="flex w-full items-start gap-4 rounded-2xl border border-[#e2e8f0] bg-white p-5 text-left shadow-sm transition-all hover:border-[#7dd3fc] hover:bg-[#f8fcff] hover:shadow-md" data-testid="telegram-accounts-method-api">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eaf6fd] text-[#1c93d4]"><Key className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold text-[#0f172a]">{text.methodApi}</span>
                  <span className="mt-1 block text-[13px] font-medium leading-relaxed text-[#64748b]">{text.apiDescription}</span>
                </span>
              </button>
              <button type="button" onClick={startDirectQrAccountLogin} disabled={createQrAccount.isPending} className="flex w-full items-start gap-4 rounded-2xl border border-[#e2e8f0] bg-white p-5 text-left shadow-sm transition-all hover:border-[#7dd3fc] hover:bg-[#f8fcff] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60" data-testid="telegram-accounts-method-qr">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#f0f9ff] text-[#0369a1]"><QrCode className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold text-[#0f172a]">{text.methodQr}</span>
                  <span className="mt-1 block text-[13px] font-medium leading-relaxed text-[#64748b]">{createQrAccount.isPending ? text.loading : text.qrDescription}</span>
                </span>
              </button>
            </div>
          ) : (
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
              <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setAddMethod("choose")} disabled={createAccount.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f1f5f9] px-5 text-[14px] font-bold text-[#475569] ring-1 ring-inset ring-[#e2e8f0] transition-colors hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50">
                  {text.qrCancel}
                </button>
                <button type="submit" disabled={createAccount.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-5 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)] transition-all hover:bg-[#1c93d4] disabled:cursor-not-allowed disabled:opacity-50" data-testid="telegram-accounts-save">
                  {createAccount.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{text.save}
                </button>
              </div>
            </form>
          )}
        </AccountsDialog>
      )}

      {loginFlow && (
        <AccountsDialog
          title={loginFlow.step === "code" ? text.verificationTitle : loginFlow.step === "qr" ? text.qrTitle : text.twoFactorTitle}
          description={loginFlow.step === "code" ? text.verificationDescription : loginFlow.step === "qr" ? text.qrDescription : text.twoFactorDescription}
          onClose={closeLoginDialog}
          testId="telegram-accounts-login-dialog"
        >
          {!connectionNoticeAccepted&&<ConnectionPrivacyNotice language={language} />}
          {loginFlow.step === "code" ? (
            <form className="space-y-5" onSubmit={submitVerificationCode}>
              <p className="rounded-xl bg-[#f0f9ff] px-4 py-3 text-[13px] font-semibold text-[#0369a1]">
                {loginFlow.delivery === "app" ? text.sentViaApp : text.sentViaSms}
              </p>
              <Input label={text.code} value={verificationCode} onChange={setVerificationCode} placeholder={text.codePlaceholder} type="text" />
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                 <button type="button" onClick={() => startQrAccountLogin(loginFlow.accountId)} disabled={isLoginPending || startQrLogin.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f0f9ff] px-5 text-[14px] font-bold text-[#0369a1] ring-1 ring-inset ring-[#bae6fd] transition-colors hover:bg-[#e0f2fe] disabled:cursor-not-allowed disabled:opacity-50" data-testid="telegram-accounts-use-qr">
                   {startQrLogin.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}{text.useQr}
                 </button>
                <button type="button" onClick={() => startAccountLogin(loginFlow.accountId)} disabled={isLoginPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f1f5f9] px-5 text-[14px] font-bold text-[#475569] transition-colors hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50" data-testid="telegram-accounts-resend-code">
                  {startLogin.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{text.resendCode}
                </button>
                <button type="submit" disabled={isLoginPending || !verificationCode.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2aabee] px-5 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)] transition-all hover:bg-[#1c93d4] disabled:cursor-not-allowed disabled:opacity-50" data-testid="telegram-accounts-confirm-code">
                  {confirmCode.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{text.confirmCode}
                </button>
              </div>
            </form>
           ) : loginFlow.step === "qr" ? (
             <div className="space-y-5">
               <div className="flex justify-center rounded-2xl border border-[#e2e8f0] bg-white p-4">
                 {qrImage ? (
                   <img src={qrImage} alt={text.qrTitle} className="h-[280px] w-[280px] rounded-xl" />
                 ) : (
                   <div className="grid h-[280px] w-[280px] place-items-center rounded-xl bg-[#f8fafc] text-center text-[13px] font-semibold text-[#64748b]">
                     <LoaderCircle className="h-7 w-7 animate-spin text-[#2aabee]" />
                   </div>
                 )}
               </div>
               <p className="rounded-xl bg-[#f0f9ff] px-4 py-3 text-center text-[13px] font-semibold text-[#0369a1]">{text.qrWaiting}</p>
               <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                 <button type="button" onClick={() => startQrAccountLogin(loginFlow.accountId)} disabled={startQrLogin.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f1f5f9] px-5 text-[14px] font-bold text-[#475569] transition-colors hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50">
                   {startQrLogin.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{text.qrRegenerate}
                 </button>
                 <button type="button" onClick={() => closeLoginDialog()} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2aabee] px-5 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(42,171,238,0.25)] transition-all hover:bg-[#1c93d4]">{text.qrCancel}</button>
               </div>
             </div>
          ) : (
            <form className="space-y-5" onSubmit={submitTwoFactorPassword}>
              <Input label={text.twoFactorPassword} value={twoFactorPassword} onChange={setTwoFactorPassword} type="password" />
               {loginFlow.delivery === "qr" && <p className="rounded-xl bg-[#f0f9ff] px-4 py-3 text-[13px] font-semibold text-[#0369a1]">{text.qrTwoFactor}</p>}
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