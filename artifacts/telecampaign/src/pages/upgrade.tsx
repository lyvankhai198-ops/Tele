import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout, Modal, Toast, StatusBadge } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";
import { Check, Key, Shield, Zap, CreditCard, LoaderCircle, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useGetUpgradeSummary, getGetUpgradeSummaryQueryKey, useActivateLicense } from "@workspace/api-client-react";

// Plan feature keys — translated via t() at render time
const planFeatureKeys: Record<string, string[]> = {
  plus: [
    "Campaign management",
    "Message templates (feature)",
    "Activity log tracking",
    "Automatic group sync",
    "Campaign automation",
    "Technical support",
  ],
  pro: [
    "Campaign management",
    "Message templates (feature)",
    "Activity log tracking",
    "Automatic group sync",
    "Campaign automation",
    "Priority support",
  ],
  unlimited: [
    "Campaign management",
    "Message templates (feature)",
    "Activity log tracking",
    "Automatic group sync",
    "Campaign automation",
    "Priority support 24/7",
  ],
};

const planOrder: Record<string, number> = { plus: 1, pro: 2, unlimited: 3 };
const planTaglines = {
  en: {
    plus: "Simple coverage for one operating account",
    pro: "More room for your growing team",
    unlimited: "Unlimited Telegram accounts",
  },
  vi: {
    plus: "Gọn gàng cho một tài khoản vận hành",
    pro: "Nhiều không gian hơn cho đội nhóm",
    unlimited: "Không giới hạn tài khoản Telegram",
  },
} as const;

export default function Upgrade() {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: summary, isLoading, isError } = useGetUpgradeSummary();
  const activateMutation = useActivateLicense();

  const [selectedPlanToConfirm, setSelectedPlanToConfirm] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [toastMessage, setToastMessage] = useState<{ title: string; type: "success" | "error" } | null>(null);
  const [activateError, setActivateError] = useState<Error | null>(null);
  const [activateSuccess, setActivateSuccess] = useState(false);

  const licenseInputRef = useRef<HTMLInputElement>(null);

  const handleActivate = () => {
    if (licenseKey.length < 8) return;

    setActivateError(null);
    setActivateSuccess(false);

    activateMutation.mutate(
      { data: { licenseKey } },
      {
        onSuccess: () => {
          setActivateSuccess(true);
          setLicenseKey("");
          queryClient.invalidateQueries({ queryKey: getGetUpgradeSummaryQueryKey() });
          setToastMessage({ title: t("Activation successful! Dashboard limits have been updated."), type: "success" });
          setTimeout(() => setLocation("/dashboard"), 700);
        },
        onError: (err) => {
          setActivateError(err);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <AppLayout activePage="upgrade" title={t("Upgrade plan")}>
        <div className="max-w-[1200px] mx-auto py-8 px-4 flex items-center justify-center min-h-[60vh]">
          <LoaderCircle className="h-10 w-10 animate-spin text-[#1a2b88]" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !summary) {
    return (
      <AppLayout activePage="upgrade" title={t("Upgrade plan")}>
        <div className="max-w-[1200px] mx-auto py-8 px-4 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-[#e11d48] mx-auto mb-4" />
            <h2 className="text-xl font-extrabold text-[#0f172a]">{t("Could not load plan information.")}</h2>
            <p className="text-[#64748b] mt-2">{t("Please try again later.")}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const { plans, subscription, telegramPurchaseUrl } = summary;
  const sortedPlans = [...plans].sort((a, b) => (planOrder[a.code] || 0) - (planOrder[b.code] || 0));
  const subscriptionExpired = subscription.status === "expired";
  const currentPlanLevel = subscriptionExpired ? 0 : planOrder[subscription.plan] || 0;
  const isForever = !subscription.expiresAt;

  return (
    <AppLayout activePage="upgrade" title={t("Upgrade plan")}>
      <div className="max-w-[1100px] mx-auto py-6 sm:py-10" data-testid="upgrade-page">

        <div className="mb-10 max-w-2xl">
          <h1 className="text-[32px] sm:text-[40px] font-extrabold text-[#0f172a] tracking-tight mb-4 leading-tight">{t("Upgrade plan")}</h1>
          <p className="text-[16px] font-medium text-[#475569] leading-relaxed">
            {subscriptionExpired
              ? (language === "vi"
                ? "Thời hạn đã kết thúc. Mua và kích hoạt key PLUS, PRO hoặc UNLIMITED để tiếp tục sử dụng."
                : "Your access has ended. Buy and activate a PLUS, PRO, or UNLIMITED key to continue.")
              : t("Expand account limits and unlock advanced campaign management features. Optimise workflow efficiency with priority systems.")}
          </p>
        </div>

        {/* Current Plan Banner */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 mb-12 shadow-sm border border-[#eef2f6] relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6" data-testid="current-plan-banner">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#64748b]">{t("Your current plan")}</span>
              <StatusBadge
                status={subscription.status === "active" ? "success" : "failed"}
                label={subscription.status === "active" ? t("Active") : t("Expired")}
              />
            </div>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-3xl font-extrabold tracking-tight text-[#0f172a] uppercase">{subscription.plan}</h2>
            </div>
            <div className="text-[#475569] text-[13px] font-bold flex flex-wrap items-center gap-2.5">
              <span className="bg-[#f8fafc] border border-[#e2e8f0] px-3 py-1.5 rounded-lg">
                {subscription.accountLimit
                  ? t("Up to {n} accounts").replace("{n}", String(subscription.accountLimit))
                  : t("Unlimited accounts")}
              </span>
              <span className="bg-[#f8fafc] border border-[#e2e8f0] px-3 py-1.5 rounded-lg">
                {isForever
                  ? t("No expiry")
                  : t("Expires: {date}").replace("{date}", new Date(subscription.expiresAt!).toLocaleDateString())}
              </span>
            </div>
            {subscriptionExpired && (
              <p className="mt-4 text-sm font-semibold text-[#c2410c]">
                {language === "vi" ? "Kích hoạt key để mở lại toàn bộ chức năng workspace." : "Activate a key to restore all workspace features."}
              </p>
            )}
          </div>

          <div className="relative z-10 w-full md:w-auto shrink-0">
            <button
              onClick={() => document.getElementById("activation-section")?.scrollIntoView({ behavior: "smooth" })}
              className="w-full md:w-auto bg-white border-2 border-[#e2e8f0] text-[#0f172a] px-6 py-3.5 rounded-xl font-extrabold text-[14px] hover:border-[#cbd5e1] hover:bg-[#f8fafc] transition-all active:scale-95"
            >
              {t("Activate key / Change plan")}
            </button>
          </div>

          <Shield className="absolute -right-8 -bottom-8 h-48 w-48 text-[#f8fafc] pointer-events-none" strokeWidth={1} />
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-16">
          {sortedPlans.map((plan) => {
            const thisLevel = planOrder[plan.code] || 0;
            const isCurrent = !subscriptionExpired && subscription.plan === plan.code;
            const isLower = !subscriptionExpired && thisLevel < currentPlanLevel;

            const isPro = plan.code === "pro";
            const isUnlimited = plan.code === "unlimited";

            const bgClass = isPro
              ? "bg-[#1a2b88] text-white ring-4 ring-[#1a2b88]/20 ring-offset-2"
              : isUnlimited
              ? "bg-[#0f172a] text-white"
              : "bg-white text-[#0f172a] border border-[#eef2f6]";
            const titleColor = isPro || isUnlimited ? "text-white" : "text-[#0f172a]";
            const subtitleColor = isPro ? "text-[#93c5fd]" : isUnlimited ? "text-[#94a3b8]" : "text-[#64748b]";
            const checkColor = isPro ? "text-[#60a5fa]" : isUnlimited ? "text-[#e2e8f0]" : "text-[#10b981]";
            const dividerColor = isPro ? "border-[#3143aa]" : isUnlimited ? "border-[#1e293b]" : "border-[#f1f5f9]";

            const btnDisabledClass =
              isPro || isUnlimited
                ? "bg-white/10 text-white/40 cursor-not-allowed"
                : "bg-[#f1f5f9] text-[#94a3b8] cursor-not-allowed";
            const btnActiveClass = isPro
              ? "bg-white text-[#1a2b88] hover:bg-[#eff6ff] shadow-lg"
              : isUnlimited
              ? "bg-white text-[#0f172a] hover:bg-[#f8fafc] shadow-lg"
              : "bg-[#1a2b88] text-white hover:bg-[#152473] shadow-md";

            const featureKeys = planFeatureKeys[plan.code] || planFeatureKeys.plus;

            return (
              <div
                key={plan.code}
                className={`rounded-[32px] p-8 flex flex-col relative ${bgClass} shadow-sm transition-transform duration-300 ${isPro ? "md:-translate-y-4" : ""}`}
                data-testid={`plan-card-${plan.code}`}
              >
                {isPro && (
                  <div className="absolute top-0 right-8 bg-[#3b82f6] text-white text-[10px] font-extrabold uppercase tracking-[0.15em] py-2 px-5 rounded-b-xl shadow-sm">
                    {t("Recommended")}
                  </div>
                )}

                <h3 className={`text-[26px] font-extrabold mb-2 uppercase tracking-tight ${titleColor}`}>{plan.name}</h3>
                <p className={`text-[14px] font-medium mb-8 min-h-[42px] leading-relaxed ${subtitleColor}`}>
                  {planTaglines[language][plan.code as keyof typeof planTaglines.en] ?? plan.name}
                </p>

                <div className="mb-8">
                  <div className={`text-[32px] font-extrabold tracking-tight ${titleColor}`}>
                    {plan.accountLimit ? `${plan.accountLimit}` : t("Unlimited")}
                    {plan.accountLimit && (
                      <span className={`text-[16px] font-bold ml-1 ${subtitleColor}`}>{t("accounts (abbrev)")}</span>
                    )}
                  </div>
                  <div className={`text-[13px] font-bold mt-2 uppercase tracking-wider ${subtitleColor}`}>
                    {t("Valid for {n} days").replace("{n}", String(plan.durationDays))}
                  </div>
                </div>

                <div className={`border-t ${dividerColor} mb-8`} />

                <ul className="space-y-4 mb-10 flex-1">
                  {featureKeys.map((key, i) => (
                    <li key={i} className="flex gap-3.5 text-[14px] font-bold items-start">
                      <Check className={`h-5 w-5 shrink-0 ${checkColor}`} strokeWidth={2.5} />
                      <span className={titleColor}>{t(key)}</span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled={isCurrent || isLower}
                  onClick={() => setSelectedPlanToConfirm(plan.code)}
                  data-testid={`button-select-plan-${plan.code}`}
                  className={`w-full py-4 rounded-xl font-extrabold transition-all active:scale-[0.98] ${
                    isCurrent || isLower ? btnDisabledClass : btnActiveClass
                  }`}
                >
                  {isCurrent ? t("Current plan") : isLower ? t("Already included") : t("Select this plan")}
                </button>
              </div>
            );
          })}
        </div>

        {/* License Activation Area */}
        <div
          id="activation-section"
          className="relative isolate overflow-hidden rounded-[32px] border-2 border-[#c7d4ff] bg-gradient-to-br from-[#eef4ff] via-white to-[#f5f8ff] p-6 shadow-[0_20px_55px_rgba(26,43,136,.14)] ring-1 ring-[#dce5ff] mb-12 flex flex-col lg:flex-row gap-10 items-center sm:p-10"
        >
          <div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-[#dbe6ff]/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 -z-10 h-56 w-56 rounded-full bg-[#e4efff]/80 blur-3xl" />
          <div className="lg:w-1/3 w-full">
            <div className="mb-6 inline-flex items-center justify-center rounded-2xl bg-[#1a2b88] p-3.5 text-white shadow-[0_10px_24px_rgba(26,43,136,.28)]">
              <Key className="h-6 w-6" strokeWidth={2.7} />
            </div>
            <h2 className="mb-3 text-[26px] font-extrabold tracking-tight text-[#12236f]">{t("Activate plan")}</h2>
            <p className="text-[15px] font-semibold leading-relaxed text-[#526789]">
              {t("Enter License Key")}
            </p>
          </div>

          <div className="w-full rounded-3xl border-2 border-[#d5def4] bg-white p-6 shadow-[0_12px_30px_rgba(26,43,136,.08)] lg:w-2/3 sm:p-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleActivate();
              }}
              className="flex flex-col gap-5"
            >
              <label className="block">
                <span className="mb-2.5 block text-[12px] font-extrabold uppercase tracking-wider text-[#1a2b88]">
                  {t("Enter License Key")}
                </span>
                <input
                  ref={licenseInputRef}
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  aria-label={t("Enter License Key")}
                  className="w-full rounded-2xl border-2 border-[#9cadde] bg-[#fbfcff] px-5 py-4 text-center font-mono text-[18px] font-bold tracking-[0.2em] text-[#0f172a] outline-none placeholder:text-[#b4c0da] shadow-inner transition-all focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/15 sm:text-[20px]"
                  data-testid="input-license"
                />
              </label>

              {activateError && (
                <div
                  className="flex items-start gap-3 text-[#e11d48] bg-[#fff1f2] p-4 rounded-xl border border-[#ffe4e6] text-[14px] font-bold"
                  data-testid="error-feedback"
                  role="alert"
                >
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>
                    {localizedErrorMessage(
                      ((activateError as any)?.response?.data?.error ?? (activateError as any)?.response?.data?.message)
                        ? new Error((activateError as any).response.data.error ?? (activateError as any).response.data.message)
                        : activateError,
                      language,
                      t("Invalid or already used activation code."),
                    )}
                  </span>
                </div>
              )}

              {activateSuccess && (
                <div
                  className="flex items-start gap-3 text-[#059669] bg-[#ecfdf5] p-4 rounded-xl border border-[#d1fae5] text-[14px] font-bold"
                  data-testid="success-feedback"
                  role="status"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{t("Activation successful! Dashboard limits have been updated.")}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mt-1">
                <button
                  type="submit"
                  disabled={activateMutation.isPending || licenseKey.length < 8}
                  className="flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#1a2b88] to-[#2847b5] py-4 text-[15px] font-extrabold text-white shadow-[0_10px_22px_rgba(26,43,136,.24)] transition-all hover:from-[#152473] hover:to-[#1a2b88] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="button-activate"
                >
                  {activateMutation.isPending ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )}
                  {activateMutation.isPending ? t("Processing…") : t("Activate key")}
                </button>

                {telegramPurchaseUrl ? (
                  <a
                    href={telegramPurchaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="sm:w-auto w-full px-8 py-4 rounded-xl bg-white border border-[#cbd5e1] text-[#475569] font-extrabold hover:bg-[#f8fafc] hover:text-[#0f172a] transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2.5 text-[15px]"
                    data-testid="button-buy-key"
                  >
                    <CreditCard className="h-5 w-5 text-[#94a3b8]" />
                    {t("Buy key")}
                    <ExternalLink className="h-4 w-4 text-[#94a3b8]" />
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="sm:w-auto w-full px-8 py-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8] font-extrabold cursor-not-allowed flex items-center justify-center gap-2.5 text-[15px]"
                    data-testid="button-buy-key"
                  >
                    <CreditCard className="h-5 w-5" />
                    {t("Buy key")}
                  </button>
                )}
              </div>

              {!telegramPurchaseUrl && (
                <div
                  className="flex items-start gap-2.5 rounded-xl border border-[#fef3c7] bg-[#fffbeb] px-4 py-3 text-[13px] font-semibold leading-relaxed text-[#92400e]"
                  data-testid="purchase-link-unavailable"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("Purchasing is not configured yet. Please contact an administrator to get a license key.")}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {selectedPlanToConfirm && (
        <Modal
          title={t("Confirm plan selection")}
          onClose={() => setSelectedPlanToConfirm(null)}
        >
          <div className="flex flex-col items-center text-center py-4" data-testid="modal-confirm-plan">
            <div className="bg-[#eff6ff] p-5 rounded-full mb-6">
              <Shield className="h-8 w-8 text-[#1a2b88]" strokeWidth={2} />
            </div>
            <p className="text-[#475569] text-[15px] font-medium mb-8 max-w-sm leading-relaxed">
              {t("You have selected the {plan} plan. To complete the upgrade, enter the activation code for this plan.").replace(
                "{plan}",
                selectedPlanToConfirm.toUpperCase()
              )}
            </p>
            <div className="flex gap-3 w-full">
              <button
                className="flex-1 py-4 rounded-xl bg-white border border-[#cbd5e1] text-[#475569] font-extrabold hover:bg-[#f8fafc] transition-colors"
                onClick={() => setSelectedPlanToConfirm(null)}
                data-testid="button-cancel-confirm"
              >
                {t("Cancel")}
              </button>
              <button
                className="flex-1 py-4 rounded-xl bg-[#1a2b88] text-white font-extrabold hover:bg-[#152473] transition-colors shadow-sm"
                onClick={() => {
                  setSelectedPlanToConfirm(null);
                  setTimeout(() => {
                    licenseInputRef.current?.focus();
                    licenseInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 100);
                }}
                data-testid="button-proceed-confirm"
              >
                {t("Proceed")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toasts */}
      {toastMessage && (
        <Toast message={toastMessage.title} onDismiss={() => setToastMessage(null)} />
      )}
    </AppLayout>
  );
}
