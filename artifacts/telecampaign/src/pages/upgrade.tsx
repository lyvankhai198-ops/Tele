import { useState, useRef, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout, Modal, Toast, StatusBadge } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";
import { Check, Key, Shield, Zap, CreditCard, LoaderCircle, CheckCircle2, AlertCircle, Copy, Hourglass } from "lucide-react";
import {
  useGetUpgradeSummary, getGetUpgradeSummaryQueryKey, useActivateLicense,
  useGetPurchaseOrderSettings, useListPurchaseOrders, useCreatePurchaseOrder, useSubmitPurchaseOrderProof, useCancelPurchaseOrder, getListPurchaseOrdersQueryKey
} from "@workspace/api-client-react";
import QRCode from "qrcode";

const planOrder: Record<string, number> = { plus: 1, pro: 2, unlimited: 3 };

const getDerivedStatus = (order: any) => {
  if (order.status === "rejected") return "rejected";
  if (order.status === "paid") return "paid";
  if (order.status === "received") return "received";
  if (order.status === "expired") return "expired";
  if (order.status === "cancelled") return "cancelled";
  if (order.rejectionReason === "TX_HASH_NOT_MATCHED") return "invalid";
  if (order.txHash) return "verifying";
  if (!order.automated) return "pending";
  const expiresAt = new Date(order.createdAt).getTime() + 10 * 60 * 1000;
  if (Date.now() > expiresAt) return "expired";
  return "pending";
};

const QRCodeDisplay = ({ value }: { value: string }) => {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (value) {
      QRCode.toDataURL(value, { width: 300, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
        .then(setSrc)
        .catch(() => setSrc(""));
    }
  }, [value]);

  if (!src) return <div className="w-[180px] h-[180px] bg-[#f1f5f9] animate-pulse rounded-xl mx-auto" />;
  return <img src={src} alt="QR Code" className="w-[180px] h-auto mx-auto rounded-xl" />;
};

const OrderCountdown = ({ createdAt, onExpire }: { createdAt: string, onExpire?: () => void }) => {
  const expiresAt = useMemo(() => new Date(createdAt).getTime() + 10 * 60 * 1000, [createdAt]);
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    let expiredFired = false;
    const interval = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeLeft(remaining);
      if (remaining <= 0 && !expiredFired) {
        expiredFired = true;
        onExpire?.();
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const m = Math.floor(timeLeft / 60000);
  const s = Math.floor((timeLeft % 60000) / 1000);
  return (
    <span className="font-mono tabular-nums">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
};

export default function Upgrade() {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: summary, isLoading, isError } = useGetUpgradeSummary();
  const { data: purchaseSettings } = useGetPurchaseOrderSettings();
  const { data: purchaseOrders, refetch: refetchPurchaseOrders } = useListPurchaseOrders({
    query: {
      queryKey: getListPurchaseOrdersQueryKey(),
      refetchInterval: 3000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    },
  });
  const activateMutation = useActivateLicense();
  const createOrderMutation = useCreatePurchaseOrder();
  const submitProofMutation = useSubmitPurchaseOrderProof();
  const cancelOrderMutation = useCancelPurchaseOrder();

  const [selectedPlanToConfirm, setSelectedPlanToConfirm] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutOrderType, setCheckoutOrderType] = useState<"renewal" | "license">("renewal");
  const [checkoutCurrency, setCheckoutCurrency] = useState<"VND" | "USDT">("VND");
  const [checkoutNetwork, setCheckoutNetwork] = useState<"BEP20" | "TRC20">("BEP20");
  const [createdOrder, setCreatedOrder] = useState<any>(null);
  const [txHash, setTxHash] = useState("");
  const [qrFailed, setQrFailed] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [toastMessage, setToastMessage] = useState<{ title: string; type: "success" | "error" } | null>(null);
  const [activateError, setActivateError] = useState<Error | null>(null);
  const [activateSuccess, setActivateSuccess] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const licenseInputRef = useRef<HTMLInputElement>(null);
  const lastObservedStatuses = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!purchaseOrders) return;
    let hasNewlyPaidOrder = false;
    for (const order of purchaseOrders) {
      const previousStatus = lastObservedStatuses.current.get(order.id);
      if (previousStatus !== "paid" && order.status === "paid") {
        hasNewlyPaidOrder = true;
        if (createdOrder?.id === order.id) {
          setToastMessage({
            title: language === "vi"
              ? `Chúc mừng! Gói ${order.plan.toUpperCase()} đã được kích hoạt thành công.`
              : `Congratulations! Your ${order.plan.toUpperCase()} plan is now active.`,
            type: "success",
          });
        }
      }
      lastObservedStatuses.current.set(order.id, order.status);
    }
    if (hasNewlyPaidOrder) {
      queryClient.invalidateQueries({ queryKey: getGetUpgradeSummaryQueryKey() });
    }
  }, [purchaseOrders, createdOrder?.id, language, queryClient]);

  const handleCopy = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setToastMessage({ title: t("Copied!"), type: "success" });
  };

  const currentOrder = useMemo(() => {
    if (!createdOrder) return null;
    const refreshedOrder = purchaseOrders?.find(o => o.id === createdOrder.id);
    return createdOrder.status === "paid" || createdOrder.status === "received"
      ? createdOrder
      : refreshedOrder || createdOrder;
  }, [createdOrder, purchaseOrders]);

  const handleCreateOrder = () => {
    if (!checkoutPlan) return;
    const activeOrder = purchaseOrders?.find((order) =>
      order.automated && order.status === "pending"
      && new Date(order.createdAt).getTime() + 10 * 60 * 1000 > Date.now()
    );
    if (activeOrder) {
      setToastMessage({
        title: language === "vi"
          ? "Bạn đang có một đơn thanh toán đang chờ. Hãy hoàn tất, hủy đơn hoặc chờ hết thời gian trước khi tạo đơn mới."
          : "You already have a pending payment. Complete it, cancel it, or wait for it to expire before creating a new order.",
        type: "error",
      });
      return;
    }
    createOrderMutation.mutate({
      data: {
        plan: checkoutPlan.toUpperCase() as any,
        currency: checkoutCurrency as any,
        network: checkoutCurrency === "USDT" ? checkoutNetwork as any : undefined,
        orderType: checkoutOrderType,
      }
    }, {
      onSuccess: (order) => {
        setCreatedOrder(order);
        setQrFailed(false);
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      },
      onError: (err) => {
        setToastMessage({ title: language === "vi"
          ? checkoutOrderType === "renewal"
            ? "Không thể tạo đơn gia hạn. Kiểm tra giá và thông tin nhận tiền."
            : "Không thể tạo đơn mua key. Kiểm tra giá, thông tin nhận tiền và kho key."
          : checkoutOrderType === "renewal"
            ? "Cannot create renewal order. Check pricing and payment details."
            : "Cannot create license order. Check pricing, payment details and license stock.", type: "error" });
      }
    });
  };

  const handleSubmitProof = () => {
    if (!currentOrder || currentOrder.currency !== "USDT") return;
    setVerificationError(null);
    submitProofMutation.mutate({
      orderId: currentOrder.id,
      data: {
        txHash: currentOrder.currency === "USDT" ? txHash.trim() : undefined,
      }
    }, {
      onSuccess: (order) => {
        setCreatedOrder(order);
        setToastMessage({ title: order.status === "paid"
          ? (language === "vi" ? "Thanh toán thành công, gói đã được kích hoạt." : "Payment confirmed and your plan is now active.")
          : (language === "vi" ? "TxHash hợp lệ. Đang chờ đủ xác nhận blockchain để hoàn tất." : "TxHash found. Waiting for enough blockchain confirmations to complete verification."), type: "success" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        void refetchPurchaseOrders();
      },
      onError: (err) => {
        const payload = (err as any)?.data ?? (err as any)?.response?.data;
        if (payload?.error === "TX_HASH_NOT_MATCHED") {
          setVerificationError(language === "vi"
            ? "TxHash không khớp với đơn hàng này hoặc giao dịch chưa hợp lệ. Vui lòng kiểm tra lại TxHash và network; nếu vẫn không được, hãy liên hệ admin support."
            : "This TxHash does not match the order or the transaction is invalid. Check the TxHash and network; if the issue persists, contact admin support.");
          setToastMessage({ title: language === "vi" ? "Không xác minh được TxHash." : "TxHash could not be verified.", type: "error" });
          return;
        }
        setToastMessage({ title: localizedErrorMessage(err, language, t("Could not submit proof")), type: "error" });
      }
    });
  };

  const handleCancelOrder = () => {
    if (!currentOrder) return;
    cancelOrderMutation.mutate({ orderId: currentOrder.id }, {
      onSuccess: () => {
        setToastMessage({ title: language === "vi" ? "Đã hủy đơn thanh toán." : "Payment order cancelled.", type: "success" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        setCheckoutPlan(null);
        setCreatedOrder(null);
        setTxHash("");
      },
      onError: () => {
        setToastMessage({ title: language === "vi" ? "Không thể hủy đơn này." : "This order cannot be cancelled.", type: "error" });
      },
    });
  };

  const formatVnd = (val: number | string) => new Intl.NumberFormat("vi-VN").format(Number(val)) + " đ";
  const formatUsdt = (val: number | string) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(val)) + " USDT";

  const renderVietQr = (bank: string, acc: string, name: string, amount: string, reference: string) => {
    const vietQrBank = bank.trim().toUpperCase() === "MSCBVNVX" ? "MB" : bank.trim().toUpperCase();
    const encodedName = encodeURIComponent(name);
    const encodedRef = encodeURIComponent(reference);
    return `https://img.vietqr.io/image/${encodeURIComponent(vietQrBank)}-${encodeURIComponent(acc)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodedRef}&accountName=${encodedName}`;
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
  const activeAutomatedOrder = purchaseOrders?.find((order) =>
    order.automated && order.status === "pending"
    && new Date(order.createdAt).getTime() + 10 * 60 * 1000 > Date.now()
  );
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

  const renderCheckoutModalContent = () => {
    if (!currentOrder) {
      return (
        <div className="py-2 flex flex-col gap-6" data-testid="modal-create-order">
          <div className="bg-[#f8fafc] rounded-2xl p-5 border border-[#e2e8f0]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[#64748b] text-[14px] font-bold">{t("Plan")}</span>
              <span className="text-[#0f172a] text-[16px] font-extrabold uppercase tracking-tight">{checkoutPlan}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#64748b] text-[14px] font-bold">{t("Price")}</span>
              <span className="text-[#1a2b88] text-[18px] font-extrabold">
                {checkoutCurrency === "VND"
                  ? formatVnd(purchaseSettings?.pricesVnd[checkoutPlan?.toUpperCase() || ""] || 0)
                  : formatUsdt(purchaseSettings?.pricesUsdt[checkoutPlan?.toUpperCase() || ""] || 0)}
              </span>
            </div>
          </div>

          {checkoutCurrency === "USDT" && purchaseSettings && (
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-extrabold text-[#475569] uppercase tracking-wider">{t("Select network")}</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 border-2 rounded-xl py-3 transition-colors ${purchaseSettings.usdtBep20Address ? "cursor-pointer" : "cursor-not-allowed opacity-40"} ${checkoutNetwork === "BEP20" ? "border-[#1a2b88] bg-[#eff6ff] text-[#1a2b88]" : "border-[#cbd5e1] hover:bg-[#f8fafc]"}`}>
                  <input type="radio" name="network" value="BEP20" disabled={!purchaseSettings.usdtBep20Address} checked={checkoutNetwork === "BEP20"} onChange={() => setCheckoutNetwork("BEP20")} className="hidden" />
                  <span className="font-bold">BSC (BEP20)</span>
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 border-2 rounded-xl py-3 transition-colors ${purchaseSettings.usdtTrc20Address ? "cursor-pointer" : "cursor-not-allowed opacity-40"} ${checkoutNetwork === "TRC20" ? "border-[#1a2b88] bg-[#eff6ff] text-[#1a2b88]" : "border-[#cbd5e1] hover:bg-[#f8fafc]"}`}>
                  <input type="radio" name="network" value="TRC20" disabled={!purchaseSettings.usdtTrc20Address} checked={checkoutNetwork === "TRC20"} onChange={() => setCheckoutNetwork("TRC20")} className="hidden" />
                  <span className="font-bold">Tron (TRC20)</span>
                </label>
              </div>
            </div>
          )}

          <button
            onClick={handleCreateOrder}
            disabled={createOrderMutation.isPending}
            data-testid="button-create-order"
            className="w-full bg-[#1a2b88] text-white py-4 rounded-xl font-extrabold text-[15px] hover:bg-[#152473] transition-colors shadow-sm flex items-center justify-center gap-2 mt-2"
          >
            {createOrderMutation.isPending && <LoaderCircle className="h-5 w-5 animate-spin" />}
            {t("Create Order")}
          </button>
        </div>
      );
    }

    const derivedStatus = getDerivedStatus(currentOrder);
    const isAutomated = currentOrder.automated === true;
    const expiresAt = new Date(currentOrder.createdAt).getTime() + 10 * 60 * 1000;
    const isExpired = isAutomated && Date.now() > expiresAt;

    if (derivedStatus === 'paid') {
      return (
        <div className="text-center py-10 px-4">
          <CheckCircle2 className="w-16 h-16 text-[#10b981] mx-auto mb-4" />
          <h3 className="text-[22px] font-extrabold text-[#0f172a] mb-2">{language === "vi" ? "Thanh toán thành công" : "Payment Successful"}</h3>
          <p className="text-[#64748b] text-[15px] mb-8 font-medium">
             {language === "vi"
               ? currentOrder.orderType === "renewal"
                 ? `Gói ${currentOrder.plan.toUpperCase()} đã được gia hạn thêm ${currentOrder.durationDays} ngày.`
                 : `Gói ${currentOrder.plan.toUpperCase()} đã được kích hoạt trong ${currentOrder.durationDays} ngày.`
               : currentOrder.orderType === "renewal"
                 ? `Your ${currentOrder.plan.toUpperCase()} plan was renewed for ${currentOrder.durationDays} days.`
                 : `Your ${currentOrder.plan.toUpperCase()} plan has been activated for ${currentOrder.durationDays} days.`}
          </p>
          <button onClick={() => { setCheckoutPlan(null); setCreatedOrder(null); setTxHash(""); }} className="w-full py-4 rounded-xl border border-[#cbd5e1] text-[#475569] font-extrabold hover:bg-[#f8fafc] transition-colors bg-white">
            {t("Close")}
          </button>
        </div>
      );
    }

    if (derivedStatus === 'received' || (derivedStatus === 'verifying' && !verificationError)) {
      return (
        <div className="text-center py-10 px-4">
           <Hourglass className="w-16 h-16 text-[#f59e0b] mx-auto mb-4" />
           <h3 className="text-[20px] font-extrabold text-[#0f172a] mb-2">
             {derivedStatus === "received"
               ? (currentOrder.rejectionReason === "PLAN_DOWNGRADE_NOT_ALLOWED"
                 ? (language === "vi" ? "Đã nhận tiền, cần xử lý gói" : "Payment received, plan needs review")
                  : (language === "vi"
                    ? currentOrder.orderType === "renewal" ? "Đã nhận tiền, chờ gia hạn" : "Đã nhận tiền, chờ key"
                    : currentOrder.orderType === "renewal" ? "Payment received, awaiting renewal" : "Payment received, awaiting key"))
               : !isAutomated
                 ? (language === "vi" ? "Chờ quản trị kiểm tra" : "Awaiting admin review")
                 : (language === "vi" ? "Đang xác minh USDT" : "Verifying USDT")}
           </h3>
           <p className="text-[#475569] text-[14px] leading-relaxed mb-8">
             {derivedStatus === "received"
               ? (currentOrder.rejectionReason === "PLAN_DOWNGRADE_NOT_ALLOWED"
                 ? (language === "vi" ? "Đã nhận tiền nhưng gói này thấp hơn gói đang hoạt động. Chưa kích hoạt; quản trị cần xử lý hoặc hoàn tiền." : "Payment received, but this plan is lower than your active plan. An admin must resolve or refund it.")
                  : (language === "vi"
                    ? currentOrder.orderType === "renewal"
                      ? "Giao dịch đã được xác minh. Hệ thống sẽ hoàn tất gia hạn subscription."
                      : "Giao dịch đã được xác minh, nhưng hiện chưa có key phù hợp. Gói chưa kích hoạt; quản trị sẽ được thông báo."
                    : currentOrder.orderType === "renewal"
                      ? "Payment is verified. The subscription renewal will be completed."
                      : "Payment is verified but no matching key is available yet. Your plan is not active."))
               : !isAutomated
                 ? (language === "vi" ? "Đơn cũ đang chờ quản trị kiểm tra tiền thực nhận. TxHash không tự kích hoạt gói." : "This older order awaits manual review. A TxHash alone will not activate the plan.")
                 : (language === "vi" ? "TxHash không phải bằng chứng thanh toán. Hệ thống đang kiểm tra ví nhận, token, số tiền và xác nhận trên blockchain." : "A TxHash alone is not proof of payment. The system is verifying recipient, token, amount and chain confirmations.")}
           </p>
           <button
             onClick={() => {
               setCheckoutPlan(null);
               setCreatedOrder(null);
               setTxHash("");
             }}
             className="w-full py-4 rounded-xl border border-[#cbd5e1] text-[#475569] font-extrabold hover:bg-[#f8fafc] transition-colors bg-white"
           >
             {t("Close")}
           </button>
           {derivedStatus === "verifying" && isAutomated && !isExpired && (
             <button
               type="button"
               onClick={handleCancelOrder}
               disabled={cancelOrderMutation.isPending}
               className="mt-3 w-full rounded-xl border border-[#be123c] py-4 font-extrabold text-[#be123c] hover:bg-[#fff1f2] disabled:opacity-50"
             >
               {cancelOrderMutation.isPending
                 ? (language === "vi" ? "Đang hủy…" : "Cancelling…")
                 : (language === "vi" ? "Hủy đơn thanh toán" : "Cancel payment order")}
             </button>
           )}
        </div>
      );
    }

    if (currentOrder.currency === 'VND') {
      let destBankCode = "", destBank = "", destAccount = "", destName = "";
      if (currentOrder.paymentDestination) {
        const parts = currentOrder.paymentDestination.split("|");
        destBankCode = parts[0] || "";
        destBank = parts[1] || "";
        destAccount = parts[2] || "";
        destName = parts[3] || "";
      }

      return (
        <div className="flex flex-col gap-5 py-2">
          <div className="text-center">
            <div className="inline-flex items-center justify-center bg-[#eff6ff] text-[#1a2b88] p-4 rounded-full mb-3">
              <CreditCard className="h-7 w-7" strokeWidth={2} />
            </div>
            <h3 className="text-[18px] font-extrabold text-[#0f172a] mb-1">{t("Transfer Info")}</h3>
            <p className="text-[#64748b] text-[13px] font-medium">
              {language === "vi" ? "Vui lòng chuyển khoản đúng số tiền và nội dung." : "Please transfer exactly with the reference below."}
            </p>
          </div>

          <div className="bg-[#f8fafc] rounded-2xl p-5 border border-[#e2e8f0] flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Amount")}</span>
              <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-xl px-4 py-3">
                <span className="text-[#1a2b88] text-[18px] font-extrabold">
                  {formatVnd(currentOrder.amount)}
                </span>
                <button onClick={() => handleCopy(String(Number(currentOrder.amount)))} className="text-[#64748b] hover:text-[#1a2b88] bg-[#f1f5f9] p-2 rounded-lg"><Copy className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Transfer Reference")}</span>
              <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-xl px-4 py-3">
                <span className="text-[#1a2b88] text-[18px] font-extrabold tracking-wider">{currentOrder.reference}</span>
                <button onClick={() => handleCopy(currentOrder.reference)} className="text-[#64748b] hover:text-[#1a2b88] bg-[#f1f5f9] p-2 rounded-lg"><Copy className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Bank Account")}</span>
              <div className="flex items-center justify-between bg-white border border-[#e2e8f0] rounded-xl px-4 py-3">
                <div>
                  <div className="text-[#0f172a] text-[15px] font-bold">{destAccount}</div>
                  <div className="text-[#64748b] text-[12px] font-medium">{destBank} • {destName}</div>
                </div>
                <button onClick={() => handleCopy(destAccount)} className="text-[#64748b] hover:text-[#1a2b88] bg-[#f1f5f9] p-2 rounded-lg"><Copy className="h-4 w-4" /></button>
              </div>
            </div>

            {destBankCode && destAccount && !qrFailed && (
              <div className="mt-2 flex justify-center bg-white p-2 rounded-2xl border-2 border-[#e2e8f0]">
                <img
                  src={renderVietQr(destBankCode, destAccount, destName, String(Number(currentOrder.amount)), currentOrder.reference)}
                  alt="VietQR"
                  onError={() => setQrFailed(true)}
                  className="w-[200px] h-auto rounded-lg"
                />
              </div>
            )}
          </div>

          {!isAutomated ? (
            <div className="flex flex-col gap-3 bg-[#eff6ff] p-4 rounded-2xl border border-[#bfdbfe] text-center">
              <p className="text-[#1e3a8a] text-[13px] font-medium">
                {language === "vi" ? "Đơn cũ được quản trị kiểm tra thủ công; mã chuyển khoản của đơn này vẫn giữ nguyên." : "This older order is reviewed manually; its transfer reference remains unchanged."}
              </p>
            </div>
          ) : !isExpired ? (
            <div className="flex flex-col gap-3 items-center bg-[#eff6ff] p-4 rounded-2xl border border-[#bfdbfe]">
              <div className="flex items-center gap-2 text-[#1a2b88] font-extrabold text-[15px]">
                <Hourglass className="w-5 h-5 animate-pulse" />
                <span>
                  <OrderCountdown createdAt={currentOrder.createdAt} onExpire={() => setTick(t => t+1)} />
                </span>
              </div>
              <p className="text-[#1e3a8a] text-[13px] font-medium text-center">
                {language === "vi"
                  ? "Hệ thống tự động kích hoạt gói khi thanh toán thành công. Hết thời gian chờ mà gói vẫn chưa kích hoạt, vui lòng liên hệ admin support."
                  : "The system activates your plan automatically after successful payment. If it is not activated after the waiting period, please contact admin support."}
              </p>
              <button type="button" onClick={handleCancelOrder} disabled={cancelOrderMutation.isPending}
                className="rounded-xl border border-[#be123c] px-4 py-2 text-[13px] font-extrabold text-[#be123c] disabled:opacity-50">
                {cancelOrderMutation.isPending ? (language === "vi" ? "Đang hủy…" : "Cancelling…") : (language === "vi" ? "Hủy đơn thanh toán" : "Cancel payment order")}
              </button>
            </div>
          ) : (
             <div className="flex flex-col gap-1 items-center bg-[#fff1f2] p-4 rounded-2xl border border-[#fecdd3]">
               <span className="text-[#e11d48] font-extrabold text-[15px]">
                 {language === "vi" ? "Đơn hàng đã hết hạn" : "Order has expired"}
               </span>
            </div>
          )}

          <button
            onClick={() => { setCheckoutPlan(null); setCreatedOrder(null); setTxHash(""); }}
            className="w-full py-4 rounded-xl border border-[#cbd5e1] text-[#475569] font-extrabold hover:bg-[#f8fafc] transition-colors bg-white mt-2"
          >
            {t("Close")}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5 py-2">
        <p className="text-[#1a2b88] text-[14px] font-bold text-center px-4">
          {language === "vi"
            ? `Chỉ gửi đúng ${formatUsdt(currentOrder.amount)} trên mạng ${currentOrder.network} đến ví dưới đây. Sau đó nhập TxHash để hệ thống xác minh.`
            : `Send exactly ${formatUsdt(currentOrder.amount)} on ${currentOrder.network} to the wallet below, then submit the TxHash for verification.`}
        </p>

        <div className="bg-[#f8fafc] rounded-2xl p-4 border border-[#e2e8f0] flex flex-col items-center gap-4">
          <div className="w-full bg-white rounded-xl border border-[#e2e8f0] p-4">
            <div className="flex justify-between items-center mb-3 pb-3 border-b border-[#f1f5f9]">
              <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("Network")}</span>
              <span className="text-[#0f172a] text-[14px] font-extrabold">{currentOrder.network} · {formatUsdt(currentOrder.amount)}</span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[#64748b] text-[12px] font-extrabold uppercase">{t("USDT Address")}</span>
              <div className="flex items-center gap-2">
                 <span className="text-[#0f172a] text-[13px] font-bold font-mono break-all bg-[#f8fafc] p-3 rounded-lg border border-[#e2e8f0] flex-1 leading-tight">
                   {currentOrder.paymentDestination}
                 </span>
                 <button onClick={() => handleCopy(currentOrder.paymentDestination)} className="text-[#64748b] hover:text-[#1a2b88] bg-[#f1f5f9] p-3 rounded-lg shrink-0"><Copy className="h-5 w-5" /></button>
              </div>
            </div>
          </div>

          <div className="bg-white p-2 rounded-2xl border-2 border-[#e2e8f0]">
            <QRCodeDisplay key={`${currentOrder.network}:${currentOrder.paymentDestination}`} value={currentOrder.paymentDestination} />
          </div>

          <p className="text-[#c2410c] text-[13px] font-bold text-center px-4">
            {language === "vi"
              ? "Sau khi chuyển, vui lòng nhập Transaction Hash (TxID) để xác nhận."
              : "After transferring, please enter the Transaction Hash (TxID) to confirm."}
          </p>
          <p className="text-[#64748b] text-[12px] text-center px-4">
            {language === "vi"
              ? "Vui lòng chuyển đúng số lượng USDT theo giá gói. Hệ thống có thể chấp nhận số tiền thực nhận thấp hơn tối đa 0,03 USDT do phí hoặc làm tròn khi chuyển khoản; số tiền cao hơn giá gói sẽ không được tự động xác nhận."
              : "Please transfer the exact USDT amount shown for your plan. The system may accept an amount received up to 0.03 USDT lower due to transfer fees or rounding; amounts higher than the plan price will not be automatically confirmed."}
          </p>
        </div>

        {!isAutomated ? (
          <div className="text-[#475569] text-[13px] text-center bg-[#f8fafc] p-3 rounded-xl">
            {language === "vi" ? "Đơn cũ: gửi TxHash để quản trị đối chiếu thủ công. Không có thời hạn 10 phút." : "Older order: submit the TxHash for manual review. No 10-minute deadline applies."}
          </div>
        ) : !isExpired ? (
          <div className="flex flex-col gap-3 items-center">
            <div className="flex items-center gap-2 text-[#b45309] font-extrabold text-[16px]">
              <Hourglass className="w-5 h-5" />
              <span>
                {language === "vi" ? "Hạn chuyển tiền:" : "Transfer deadline:"} <OrderCountdown createdAt={currentOrder.createdAt} onExpire={() => setTick(t => t+1)} />
              </span>
            </div>
            <div className="text-[#64748b] text-[13px] font-medium">
              {language === "vi" ? "Hết hạn lúc:" : "Expires at:"} {new Date(expiresAt).toLocaleTimeString()} {new Date(expiresAt).toLocaleDateString()}
            </div>
            <p className="max-w-md text-center text-[13px] font-medium text-[#475569]">
              {language === "vi"
                ? "Hệ thống tự động kích hoạt gói khi thanh toán thành công. Hết thời gian chờ mà gói vẫn chưa kích hoạt, vui lòng liên hệ admin support."
                : "The system activates your plan automatically after successful payment. If it is not activated after the waiting period, please contact admin support."}
            </p>
            <button type="button" onClick={handleCancelOrder} disabled={cancelOrderMutation.isPending}
              className="rounded-xl border border-[#be123c] px-4 py-2 text-[13px] font-extrabold text-[#be123c] disabled:opacity-50">
              {cancelOrderMutation.isPending ? (language === "vi" ? "Đang hủy…" : "Cancelling…") : (language === "vi" ? "Hủy đơn thanh toán" : "Cancel payment order")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1 items-center bg-[#fff1f2] p-3 rounded-xl border border-[#fecdd3]">
             <span className="text-[#e11d48] font-extrabold text-[15px]">
               {language === "vi" ? "Đơn hàng đã hết hạn" : "Order has expired"}
             </span>
          </div>
        )}

         <div className="flex flex-col gap-2 mt-2">
          <label className="text-[12px] font-extrabold uppercase text-[#0f172a]">Transaction Hash (TxID)</label>
          <input
            type="text"
            placeholder="0xabc123..."
            value={txHash}
             onChange={(e) => { setTxHash(e.target.value); setVerificationError(null); }}
            disabled={isExpired || submitProofMutation.isPending}
            className="w-full border-2 border-[#e2e8f0] bg-[#f8fafc] rounded-xl px-4 py-3.5 text-[15px] font-mono outline-none focus:border-[#1a2b88] focus:bg-white transition-colors disabled:opacity-50"
          />
           {(verificationError || currentOrder.rejectionReason === "TX_HASH_NOT_MATCHED") && (
             <p role="alert" className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-3 text-[13px] font-semibold leading-relaxed text-[#be123c]">
               {verificationError || (language === "vi"
                 ? "TxHash không khớp với đơn hàng này hoặc giao dịch chưa hợp lệ. Vui lòng kiểm tra lại TxHash và network; nếu vẫn không được, hãy liên hệ admin support."
                 : "This TxHash does not match the order or the transaction is invalid. Check the TxHash and network; if the issue persists, contact admin support.")}
             </p>
           )}
        </div>

        <div className="flex gap-3 mt-2">
          <button
            onClick={() => { setCheckoutPlan(null); setCreatedOrder(null); setTxHash(""); }}
            className="flex-[1] py-4 rounded-xl border border-[#cbd5e1] text-[#475569] font-extrabold hover:bg-[#f8fafc] transition-colors bg-white"
          >
            {language === "vi" ? "Đóng" : "Close"}
          </button>
          <button
            onClick={handleSubmitProof}
            disabled={submitProofMutation.isPending || isExpired || !txHash.trim()}
            className="flex-[2] py-4 rounded-xl bg-[#1a2b88] text-white font-extrabold hover:bg-[#152473] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
          >
            {submitProofMutation.isPending && <LoaderCircle className="h-5 w-5 animate-spin" />}
            {language === "vi" ? "Gửi TxHash để xác minh" : "Submit TxHash for verification"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <AppLayout activePage="upgrade" title={t("Upgrade plan")}>
      <div className="max-w-[1100px] mx-auto py-6 sm:py-10" data-testid="upgrade-page">

        <div className="mb-10 max-w-2xl">
          <h1 className="text-[32px] sm:text-[40px] font-extrabold text-[#0f172a] tracking-tight mb-4 leading-tight">{t("Upgrade plan")}</h1>
          <p className="text-[16px] font-medium text-[#475569] leading-relaxed">
            {subscriptionExpired
                ? (language === "vi"
                ? "Thời hạn đã kết thúc. Chọn gói và thanh toán để gia hạn trực tiếp, không cần mua key mới."
                : "Your access has ended. Choose a plan and pay to renew directly without buying a new key.")
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
                {language === "vi" ? "Gia hạn gói để mở lại toàn bộ chức năng workspace." : "Renew your plan to restore all workspace features."}
              </p>
            )}
          </div>

          <div className="relative z-10 w-full md:w-auto shrink-0">
            <button
              onClick={() => document.getElementById("activation-section")?.scrollIntoView({ behavior: "smooth" })}
              className="w-full md:w-auto bg-white border-2 border-[#e2e8f0] text-[#0f172a] px-6 py-3.5 rounded-xl font-extrabold text-[14px] hover:border-[#cbd5e1] hover:bg-[#f8fafc] transition-all active:scale-95"
            >
              {language === "vi" ? "Gia hạn / Kích hoạt key" : "Renew / Activate key"}
            </button>
          </div>

          <Shield className="absolute -right-8 -bottom-8 h-48 w-48 text-[#f8fafc] pointer-events-none" strokeWidth={1} />
        </div>

        {/* Plans Grid */}
        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-[#dbe4f5] bg-[#f8faff] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-extrabold uppercase tracking-wider text-[#1a2b88]">
              {language === "vi" ? "Bạn muốn thực hiện thao tác nào?" : "What would you like to do?"}
            </p>
            <p className="mt-1 text-[13px] font-medium text-[#64748b]">
              {checkoutOrderType === "renewal"
                ? (language === "vi" ? "Gia hạn trực tiếp vào subscription, không cần license key." : "Renew directly on the subscription without a license key.")
                : (language === "vi" ? "Mua license key để kích hoạt sau hoặc dùng cho người khác." : "Buy a license key to activate later or give to someone else.")}
            </p>
          </div>
          <div className="flex rounded-xl border border-[#cbd5e1] bg-white p-1">
            <button
              type="button"
              onClick={() => setCheckoutOrderType("renewal")}
              className={`rounded-lg px-4 py-2.5 text-[13px] font-extrabold transition-colors ${checkoutOrderType === "renewal" ? "bg-[#1a2b88] text-white" : "text-[#475569] hover:bg-[#f1f5f9]"}`}
            >
              {language === "vi" ? "Gia hạn gói" : "Renew plan"}
            </button>
            <button
              type="button"
              onClick={() => setCheckoutOrderType("license")}
              className={`rounded-lg px-4 py-2.5 text-[13px] font-extrabold transition-colors ${checkoutOrderType === "license" ? "bg-[#1a2b88] text-white" : "text-[#475569] hover:bg-[#f1f5f9]"}`}
            >
              {language === "vi" ? "Mua license key" : "Buy license key"}
            </button>
          </div>
        </div>
        <div id="purchase-plans" className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-16">
          {sortedPlans.map((plan) => {
            const thisLevel = planOrder[plan.code] || 0;
            const isCurrent = !subscriptionExpired && subscription.plan === plan.code;
            const isLower = !subscriptionExpired && thisLevel < currentPlanLevel;
            const planBlocked = checkoutOrderType === "license" ? (isCurrent || isLower) : isLower;

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

            const hasVndDest = Boolean(purchaseSettings?.vnBankCode && purchaseSettings?.vnBankName && purchaseSettings?.vnBankAccount && purchaseSettings?.vnAccountName);
            const hasUsdtDest = Boolean(purchaseSettings?.usdtBep20Address || purchaseSettings?.usdtTrc20Address);
            const priceVnd = purchaseSettings?.pricesVnd?.[plan.code.toUpperCase()] || 0;
            const priceUsdt = purchaseSettings?.pricesUsdt?.[plan.code.toUpperCase()] || 0;
            const hasPrice = language === "vi" ? priceVnd > 0 : priceUsdt > 0;
            const canPurchase = hasPrice && (language === "vi" ? hasVndDest : hasUsdtDest);

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
                   disabled={planBlocked || !canPurchase || Boolean(activeAutomatedOrder)}
                  onClick={() => {
                    if (canPurchase) {
                      setCheckoutPlan(plan.code);
                      setCheckoutCurrency(language === "vi" ? "VND" : "USDT");
                      setCheckoutNetwork(purchaseSettings?.usdtBep20Address ? "BEP20" : "TRC20");
                      setCreatedOrder(null);
                    }
                  }}
                  data-testid={`button-select-plan-${plan.code}`}
                  className={`w-full py-4 rounded-xl font-extrabold transition-all active:scale-[0.98] ${
                      planBlocked || !canPurchase || activeAutomatedOrder ? btnDisabledClass : btnActiveClass
                  }`}
                >
                  {checkoutOrderType === "renewal" && isCurrent ? (language === "vi" ? "Gia hạn gói này" : "Renew this plan") : isLower ? t("Already included") : hasPrice && !canPurchase
                    ? language === "vi" ? "Chưa có thông tin thanh toán" : "Payment details pending"
                    : activeAutomatedOrder ? (language === "vi" ? "Đang có đơn thanh toán chờ xử lý" : "Pending payment order")
                    : checkoutOrderType === "renewal" ? (language === "vi" ? "Chọn gói để gia hạn" : "Select plan to renew") : t("Select this plan")}
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
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {purchaseOrders.map((order) => {
                      const orderStatus = getDerivedStatus(order);
                      return (
                        <tr key={order.id} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="px-6 py-4 font-extrabold text-[#0f172a] uppercase">{order.plan}</td>
                          <td className="px-6 py-4 font-bold text-[#475569]">
                            {order.currency === "VND" ? formatVnd(order.amount) : formatUsdt(order.amount)}
                          </td>
                          <td className="px-6 py-4 font-mono text-[13px] text-[#64748b]">{order.reference}</td>
                          <td className="px-6 py-4">
                            <StatusBadge
                              status={orderStatus === "paid" ? "success" : orderStatus === "rejected" || orderStatus === "expired" || orderStatus === "cancelled" || orderStatus === "invalid" ? "failed" : orderStatus === "received" || orderStatus === "verifying" ? "warning" : "draft"}
                              label={orderStatus === "paid" ? t("Approved") : orderStatus === "rejected" ? t("Rejected") : orderStatus === "expired" ? (language === "vi" ? "Hết hạn" : "Expired") : orderStatus === "cancelled" ? (language === "vi" ? "Đã hủy" : "Cancelled") : orderStatus === "invalid" ? (language === "vi" ? "TxHash không hợp lệ" : "Invalid TxHash") : orderStatus === "received" ? (order.rejectionReason === "PLAN_DOWNGRADE_NOT_ALLOWED" ? (language === "vi" ? "Đã nhận, cần xử lý" : "Received, needs review") : (language === "vi" ? "Đã nhận, chờ key" : "Received, awaiting key")) : orderStatus === "verifying" ? (order.automated ? (language === "vi" ? "Đang xác minh" : "Verifying") : (language === "vi" ? "Chờ quản trị" : "Awaiting admin")) : t("Pending")}
                            />
                            {orderStatus === "paid" && (
                              <div className="text-[11px] text-[#64748b] mt-1.5 font-bold">
                                {language === "vi" ? "Đã kích hoạt" : "Activated"}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {(orderStatus === "pending" || orderStatus === "received" || orderStatus === "verifying" || orderStatus === "invalid" || orderStatus === "paid") && (
                              <button type="button" onClick={() => {
                                setCheckoutPlan(order.plan.toLowerCase());
                                 setCheckoutOrderType(order.orderType === "license" ? "license" : "renewal");
                                setCheckoutCurrency(order.currency as "VND" | "USDT");
                                setCheckoutNetwork((order.network || "BEP20") as "BEP20" | "TRC20");
                                setCreatedOrder(order);
                                setQrFailed(false);
                              }} className="text-[#1a2b88] font-bold whitespace-nowrap underline" data-testid={`button-view-order-${order.id}`}>
                                {language === "vi" ? "Xem đơn hàng" : "View order"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
            setCheckoutPlan(null);
            setCreatedOrder(null);
            setTxHash("");
          }}
        >
          {renderCheckoutModalContent()}
        </Modal>
      )}

      {/* Toasts */}
      {toastMessage && (
        <Toast message={toastMessage.title} onDismiss={() => setToastMessage(null)} />
      )}
    </AppLayout>
  );
}
