import { useState, useRef, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout, Modal, Toast, StatusBadge } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";
import { Check, Key, Shield, Zap, CreditCard, LoaderCircle, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import {
  useGetUpgradeSummary, getGetUpgradeSummaryQueryKey, useActivateLicense,
  useGetPurchaseOrderSettings, useListPurchaseOrders, useCreatePurchaseOrder, useSubmitPurchaseOrderProof, getListPurchaseOrdersQueryKey
} from "@workspace/api-client-react";

const planOrder: Record<string, number> = { plus: 1, pro: 2, unlimited: 3 };

export default function Upgrade() {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: summary, isLoading, isError } = useGetUpgradeSummary();
  const { data: purchaseSettings } = useGetPurchaseOrderSettings();
  const { data: purchaseOrders } = useListPurchaseOrders({ query: { queryKey: getListPurchaseOrdersQueryKey(), refetchInterval: 5000 } });
  const activateMutation = useActivateLicense();
  const createOrderMutation = useCreatePurchaseOrder();
  const submitProofMutation = useSubmitPurchaseOrderProof();

  const [selectedPlanToConfirm, setSelectedPlanToConfirm] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutCurrency, setCheckoutCurrency] = useState<"VND" | "USDT">("VND");
  const [checkoutNetwork, setCheckoutNetwork] = useState<"BEP20" | "TRC20">("BEP20");
  const [createdOrder, setCreatedOrder] = useState<any>(null);
  const [txHash, setTxHash] = useState("");
  const [proofInfo, setProofInfo] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [toastMessage, setToastMessage] = useState<{ title: string; type: "success" | "error" } | null>(null);
  const [activateError, setActivateError] = useState<Error | null>(null);
  const [activateSuccess, setActivateSuccess] = useState(false);

  const licenseInputRef = useRef<HTMLInputElement>(null);

  const lastPaidIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (purchaseOrders) {
      const paidOrders = purchaseOrders.filter(o => o.status === "paid").map(o => o.id);
      const newPaidIds = new Set(paidOrders);
      let hasNew = false;
      for (const id of newPaidIds) {
        if (!lastPaidIds.current.has(id)) {
          hasNew = true;
          break;
        }
      }
      if (hasNew) {
        queryClient.invalidateQueries({ queryKey: getGetUpgradeSummaryQueryKey() });
      }
      lastPaidIds.current = newPaidIds;
    }
  }, [purchaseOrders, queryClient]);

  const handleCopy = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setToastMessage({ title: t("Copied!"), type: "success" });
  };

  const handleCreateOrder = () => {
    if (!checkoutPlan) return;
    createOrderMutation.mutate({
      data: {
        plan: checkoutPlan.toUpperCase() as any,
        currency: checkoutCurrency as any,
        network: checkoutCurrency === "USDT" ? checkoutNetwork as any : undefined,
      }
    }, {
      onSuccess: (order) => {
        setCreatedOrder(order);
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      },
      onError: (err) => {
        setToastMessage({ title: t("Could not create order"), type: "error" });
      }
    });
  };

  const handleSubmitProof = () => {
    if (!createdOrder) return;
    submitProofMutation.mutate({
      orderId: createdOrder.id,
      data: {
        txHash: txHash.trim() || undefined,
        proofInfo: proofInfo.trim() || undefined,
      }
    }, {
      onSuccess: () => {
        setToastMessage({ title: t("Proof submitted successfully"), type: "success" });
        setCheckoutPlan(null);
        setCreatedOrder(null);
        setTxHash("");
        setProofInfo("");
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      },
      onError: (err) => {
        setToastMessage({ title: t("Could not submit proof"), type: "error" });
      }
    });
  };

  const formatVnd = (val: number | string) => new Intl.NumberFormat("vi-VN").format(Number(val)) + " đ";
  const formatUsdt = (val: number | string) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(val)) + " USDT";

  let destBank = "", destBankCode = "", destAccount = "", destName = "";
  if (createdOrder && createdOrder.currency === "VND") {
    const parts = (createdOrder.paymentDestination || "").split("|");
    destBankCode = parts[0] || "";
    destBank = parts[1] || "";
    destAccount = parts[2] || "";
    destName = parts[3] || "";
  }

  const renderVietQr = (bank: string, acc: string, name: string, amount: string, reference: string) => {
    const encodedName = encodeURIComponent(name);
    const encodedRef = encodeURIComponent(reference);
    return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(acc)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodedRef}&accountName=${encodedName}`;
  };

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

  const { plans, subscription } = summary;
  const sortedPlans = [...plans].sort((a, b) => (planOrder[a.code] || 0) - (planOrder[b.code] || 0));
  const subscriptionExpired = subscription.status === "expired";
  const currentPlanLevel = subscriptionExpired ? 0 : planOrder[subscription.plan] || 0;
  const isForever = !subscription.expiresAt;
  const canActivate = licenseKey.trim().length >= 8;
  const activationErrorMessage = (() => {
    const error = activateError as any;
    const payload = error?.data ?? error?.response?.data;
    const serverMessage =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : null;
    if (serverMessage) return serverMessage;
    if (error?.status === 409) return t("Invalid or already used activation code.");
    return localizedErrorMessage(activateError, language, t("Invalid or already used activation code."));
  })();

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
        <div id="purchase-plans" className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-16">
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

            const features = language === "vi" ? plan.features : plan.featuresEn;

            const hasVndDest = Boolean(purchaseSettings?.vnBankCode && purchaseSettings?.vnBankName && purchaseSettings?.vnBankAccount);
            const hasUsdtDest = Boolean(purchaseSettings?.usdtBep20Address || purchaseSettings?.usdtTrc20Address);
            const priceVnd = purchaseSettings?.pricesVnd?.[plan.code.toUpperCase()] || 0;
            const priceUsdt = purchaseSettings?.pricesUsdt?.[plan.code.toUpperCase()] || 0;
            const hasPriceVnd = priceVnd > 0 && hasVndDest;
            const hasPriceUsdt = priceUsdt > 0 && hasUsdtDest;
            const hasPrice = language === "vi" ? hasPriceVnd : hasPriceUsdt;

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
                  {language === "vi" ? plan.tagline : plan.taglineEn}
                </p>

                <div className="mb-8">
                  <div className={`text-[32px] font-extrabold tracking-tight ${titleColor}`}>
                    {plan.accountLimit ? `${plan.accountLimit}` : t("Unlimited")}
                    {plan.accountLimit && (
                      <span className={`text-[16px] font-bold ml-1 ${subtitleColor}`}>{t("accounts (abbrev)")}</span>
                    )}
                  </div>
                  <div className={`text-[13px] font-bold mt-2 uppercase tracking-wider ${subtitleColor} flex items-center justify-between`}>
                    <span>{t("Valid for {n} days").replace("{n}", String(purchaseSettings?.durationsDays?.[plan.code.toUpperCase()] || plan.durationDays))}</span>
                    {hasPrice ? (
                      <span className={`text-[15px] ${titleColor}`}>
                        {language === "vi" ? formatVnd(priceVnd) : formatUsdt(priceUsdt)}
                      </span>
                    ) : (
                      <span className={`text-[12px] opacity-70 ${titleColor}`}>
                        {t("Price unavailable")}
                      </span>
                    )}
                  </div>
                </div>

                <div className={`border-t ${dividerColor} mb-8`} />

                <ul className="space-y-4 mb-10 flex-1">
                  {features.map((feature, i) => (
                    <li key={i} className="flex gap-3.5 text-[14px] font-bold items-start">
                      <Check className={`h-5 w-5 shrink-0 ${checkColor}`} strokeWidth={2.5} />
                      <span className={titleColor}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled={isCurrent || isLower || !hasPrice}
                  onClick={() => {
                    if (hasPrice) {
                      setCheckoutPlan(plan.code);
                      setCheckoutCurrency(language === "vi" ? "VND" : "USDT");
                      setCreatedOrder(null);
                    } else {
                      setSelectedPlanToConfirm(plan.code);
                    }
                  }}
                  data-testid={`button-select-plan-${plan.code}`}
                  className={`w-full py-4 rounded-xl font-extrabold transition-all active:scale-[0.98] ${
                    isCurrent || isLower || !hasPrice ? btnDisabledClass : btnActiveClass
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
                  <span>{activationErrorMessage}</span>
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
                  disabled={activateMutation.isPending || !canActivate}
                  className={`flex flex-1 items-center justify-center gap-2.5 rounded-xl py-4 text-[15px] font-extrabold transition-all active:scale-[0.98] ${
                    canActivate && !activateMutation.isPending
                      ? "bg-gradient-to-r from-[#2454d6] to-[#3b82f6] text-white shadow-[0_12px_28px_rgba(37,84,214,.38)] ring-2 ring-[#93b4ff]/45 hover:from-[#1d45bd] hover:to-[#2563eb]"
                      : "cursor-not-allowed bg-[#aeb9dd] text-white/80 shadow-none"
                  }`}
                  data-testid="button-activate"
                >
                  {activateMutation.isPending ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )}
                  {activateMutation.isPending ? t("Processing…") : t("Activate key")}
                </button>

                <button
                  type="button"
                  onClick={() => document.getElementById("purchase-plans")?.scrollIntoView({ behavior: "smooth" })}
                  disabled={!purchaseSettings || !sortedPlans.some(plan =>
                    language === "vi"
                      ? Number(purchaseSettings.pricesVnd?.[plan.code.toUpperCase()]) > 0 && !!purchaseSettings.vnBankCode && !!purchaseSettings.vnBankAccount
                      : Number(purchaseSettings.pricesUsdt?.[plan.code.toUpperCase()]) > 0 && (!!purchaseSettings.usdtBep20Address || !!purchaseSettings.usdtTrc20Address)
                  )}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-[#1a2b88] bg-[#1a2b88] px-8 py-4 text-[15px] font-extrabold text-white hover:bg-[#152473] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  data-testid="button-buy-on-web"
                >
                  <CreditCard className="h-5 w-5" />
                  {language === "vi"
                    ? purchaseSettings?.pricesVnd && sortedPlans.some(plan => Number(purchaseSettings.pricesVnd[plan.code.toUpperCase()]) > 0 && !!purchaseSettings.vnBankCode && !!purchaseSettings.vnBankAccount) ? "Chọn gói để mua trên web" : "Thanh toán chưa được cấu hình"
                    : purchaseSettings?.pricesUsdt && sortedPlans.some(plan => Number(purchaseSettings.pricesUsdt[plan.code.toUpperCase()]) > 0 && (!!purchaseSettings.usdtBep20Address || !!purchaseSettings.usdtTrc20Address)) ? "Choose a plan to buy online" : "Payments are not configured"}
                </button>
              </div>
            </form>
          </div>
        </div>
        {/* Purchase Orders History */}
        {purchaseOrders && purchaseOrders.length > 0 && (
          <div className="mb-12">
            <h2 className="mb-6 text-[22px] font-extrabold tracking-tight text-[#0f172a]">{t("Order History")}</h2>
            <div className="bg-white border-2 border-[#eef2f6] rounded-[24px] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[#475569]">
                      <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Plan")}</th>
                      <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Amount")}</th>
                      <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Transfer Reference")}</th>
                      <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {purchaseOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-6 py-4 font-extrabold text-[#0f172a] uppercase">{order.plan}</td>
                        <td className="px-6 py-4 font-bold text-[#475569]">
                          {order.currency === "VND" ? formatVnd(order.amount) : formatUsdt(order.amount)}
                        </td>
                        <td className="px-6 py-4 font-mono text-[13px] text-[#64748b]">{order.reference}</td>
                        <td className="px-6 py-4">
                          <StatusBadge
                            status={order.status === "paid" ? "success" : order.status === "rejected" ? "failed" : order.status === "pending" ? "warning" : "draft"}
                            label={order.status === "paid" ? t("Approved") : order.status === "rejected" ? t("Rejected") : t("Pending")}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

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

      {/* Checkout Modal */}
      {checkoutPlan && purchaseSettings && (
        <Modal
          title={t("Order checkout")}
          onClose={() => {
            if (!createdOrder || createdOrder.status !== "pending") {
              setCheckoutPlan(null);
              setCreatedOrder(null);
            }
          }}
        >
          <div className="py-2 flex flex-col gap-6" data-testid="modal-checkout-plan">
            {!createdOrder ? (
              <>
                <div className="bg-[#f8fafc] rounded-2xl p-5 border border-[#e2e8f0]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[#64748b] text-[14px] font-bold">{t("Plan")}</span>
                    <span className="text-[#0f172a] text-[16px] font-extrabold uppercase tracking-tight">{checkoutPlan}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748b] text-[14px] font-bold">{t("Price")}</span>
                    <span className="text-[#1a2b88] text-[18px] font-extrabold">
                      {checkoutCurrency === "VND"
                        ? formatVnd(purchaseSettings.pricesVnd[checkoutPlan.toUpperCase()] || 0)
                        : formatUsdt(purchaseSettings.pricesUsdt[checkoutPlan.toUpperCase()] || 0)}
                    </span>
                  </div>
                </div>

                {checkoutCurrency === "USDT" && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-extrabold text-[#475569] uppercase tracking-wider">{t("Select network")}</label>
                    <div className="flex gap-3">
                      <label className={`flex-1 flex items-center justify-center gap-2 border-2 rounded-xl py-3 cursor-pointer transition-colors ${checkoutNetwork === "BEP20" ? "border-[#1a2b88] bg-[#eff6ff] text-[#1a2b88]" : "border-[#cbd5e1] hover:bg-[#f8fafc]"}`}>
                        <input type="radio" name="network" value="BEP20" checked={checkoutNetwork === "BEP20"} onChange={() => setCheckoutNetwork("BEP20")} className="hidden" />
                        <span className="font-bold">BSC (BEP20)</span>
                      </label>
                      <label className={`flex-1 flex items-center justify-center gap-2 border-2 rounded-xl py-3 cursor-pointer transition-colors ${checkoutNetwork === "TRC20" ? "border-[#1a2b88] bg-[#eff6ff] text-[#1a2b88]" : "border-[#cbd5e1] hover:bg-[#f8fafc]"}`}>
                        <input type="radio" name="network" value="TRC20" checked={checkoutNetwork === "TRC20"} onChange={() => setCheckoutNetwork("TRC20")} className="hidden" />
                        <span className="font-bold">Tron (TRC20)</span>
                      </label>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleCreateOrder}
                  disabled={createOrderMutation.isPending}
                  data-testid="button-create-order"
                  className="w-full bg-[#1a2b88] text-white py-4 rounded-xl font-extrabold text-[15px] hover:bg-[#152473] transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  {createOrderMutation.isPending && <LoaderCircle className="h-5 w-5 animate-spin" />}
                  {t("Create Order")}
                </button>
              </>
            ) : (
              <>
                <div className="text-center mb-2">
                  <div className="inline-flex items-center justify-center bg-[#eff6ff] text-[#1a2b88] p-4 rounded-full mb-4">
                    <CreditCard className="h-8 w-8" strokeWidth={2} />
                  </div>
                  <h3 className="text-[20px] font-extrabold text-[#0f172a]">{t("Transfer Info")}</h3>
                  <p className="text-[#64748b] text-[14px] font-medium mt-1">
                    {language === "vi" ? t("Please transfer the exact amount with the reference code below.") : t("Please transfer exactly to the address below.")}
                  </p>
                </div>

                <div className="bg-[#f8fafc] rounded-2xl p-5 border border-[#e2e8f0] flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Amount")}</span>
                    <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-lg px-4 py-3">
                      <span className="text-[#0f172a] text-[16px] font-bold">
                        {createdOrder.currency === "VND" ? formatVnd(createdOrder.amount) : formatUsdt(createdOrder.amount)}
                      </span>
                      <button onClick={() => handleCopy(createdOrder.currency === "VND" ? String(Number(createdOrder.amount)) : String(createdOrder.amount))} className="text-[#64748b] hover:text-[#1a2b88]"><Copy className="h-4 w-4" /></button>
                    </div>
                  </div>

                  {createdOrder.currency === "VND" ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Bank Code/Name")}</span>
                        <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-lg px-4 py-3">
                          <span className="text-[#0f172a] text-[15px] font-bold">{destBank}</span>
                          <button onClick={() => handleCopy(destBank)} className="text-[#64748b] hover:text-[#1a2b88]"><Copy className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Bank Account")}</span>
                        <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-lg px-4 py-3">
                          <span className="text-[#0f172a] text-[15px] font-bold">{destAccount}</span>
                          <button onClick={() => handleCopy(destAccount)} className="text-[#64748b] hover:text-[#1a2b88]"><Copy className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Account Name")}</span>
                        <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-lg px-4 py-3">
                          <span className="text-[#0f172a] text-[15px] font-bold uppercase">{destName}</span>
                          <button onClick={() => handleCopy(destName)} className="text-[#64748b] hover:text-[#1a2b88]"><Copy className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Transfer Reference")}</span>
                        <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-lg px-4 py-3">
                          <span className="text-[#1a2b88] text-[16px] font-extrabold tracking-wider">{createdOrder.reference}</span>
                          <button onClick={() => handleCopy(createdOrder.reference)} className="text-[#64748b] hover:text-[#1a2b88]"><Copy className="h-4 w-4" /></button>
                        </div>
                      </div>
                      {destBank && destAccount && (
                        <div className="mt-2 flex justify-center">
                          <img
                            src={renderVietQr(destBankCode, destAccount, destName, String(Number(createdOrder.amount)), createdOrder.reference)}
                            alt="VietQR"
                            className="max-w-[200px] h-auto rounded-xl border-2 border-[#e2e8f0]"
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1">
                        <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Network")}</span>
                        <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-lg px-4 py-3">
                          <span className="text-[#0f172a] text-[15px] font-bold">{createdOrder.network}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Address")}</span>
                        <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-lg px-4 py-3">
                          <span className="text-[#0f172a] text-[13px] font-bold font-mono break-all pr-4">
                            {createdOrder.paymentDestination}
                          </span>
                          <button onClick={() => handleCopy(createdOrder.paymentDestination)} className="text-[#64748b] hover:text-[#1a2b88] shrink-0"><Copy className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Transfer Reference")}</span>
                        <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-lg px-4 py-3">
                          <span className="text-[#1a2b88] text-[16px] font-extrabold tracking-wider">{createdOrder.reference}</span>
                          <button onClick={() => handleCopy(createdOrder.reference)} className="text-[#64748b] hover:text-[#1a2b88]"><Copy className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-4 mt-2">
                  <p className="text-[13px] text-[#475569] font-medium text-center">
                    {language === "en" ? t("Please enter your transaction hash after transferring.") : t("Please enter payment proof info.")}
                  </p>

                  {checkoutCurrency === "USDT" ? (
                    <input
                      type="text"
                      placeholder={t("Transaction Hash")}
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      data-testid="input-txhash"
                      className="w-full border-2 border-[#cbd5e1] rounded-xl px-4 py-3 text-[15px] font-mono outline-none focus:border-[#1a2b88]"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder={t("Message/Proof (Optional)")}
                      value={proofInfo}
                      onChange={(e) => setProofInfo(e.target.value)}
                      data-testid="input-proofinfo"
                      className="w-full border-2 border-[#cbd5e1] rounded-xl px-4 py-3 text-[15px] outline-none focus:border-[#1a2b88]"
                    />
                  )}

                  <button
                    onClick={handleSubmitProof}
                    disabled={submitProofMutation.isPending || (checkoutCurrency === "USDT" && !txHash.trim())}
                    data-testid="button-submit-proof"
                    className="w-full bg-[#1a2b88] text-white py-4 rounded-xl font-extrabold text-[15px] hover:bg-[#152473] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {submitProofMutation.isPending && <LoaderCircle className="h-5 w-5 animate-spin" />}
                    {t("Submit proof")}
                  </button>
                </div>
              </>
            )}
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
