import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Save, CheckCircle2, XCircle, AlertCircle, LoaderCircle } from "lucide-react";
import {
  Panel,
  PrimaryButton,
  StatusBadge,
  Modal,
  Toast,
} from "@/components/layout/AppLayout";
import {
  useGetAdminPurchaseOrderSettings,
  getAdminPurchaseOrderSettings,
  useUpdateAdminPurchaseOrderSettings,
  useListAdminPurchaseOrders,
  useReviewPurchaseOrder,
  PurchaseOrderSettings,
  PurchaseOrder,
  getGetAdminPurchaseOrderSettingsQueryKey,
  getGetPurchaseOrderSettingsQueryKey,
  getListAdminPurchaseOrdersQueryKey
} from "@workspace/api-client-react";
import { useLanguage, localizedErrorMessage } from "@/lib/i18n";
import { format } from "date-fns";

const planCodes = ["PLUS", "PRO", "UNLIMITED"] as const;
type PlanCode = typeof planCodes[number];

export function AdminPurchaseOrders() {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useGetAdminPurchaseOrderSettings();
  const { data: orders, isLoading: ordersLoading } = useListAdminPurchaseOrders({ query: { queryKey: getListAdminPurchaseOrdersQueryKey(), refetchInterval: 5000 } });

  const updateSettingsMutation = useUpdateAdminPurchaseOrderSettings();
  const reviewMutation = useReviewPurchaseOrder();

  const [form, setForm] = useState<PurchaseOrderSettings | null>(null);
  const [priceInputs, setPriceInputs] = useState<Record<string, string> | null>(null);
  const [toast, setToast] = useState<{title: string, type: "success"|"error"} | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [savingPrices, setSavingPrices] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<PurchaseOrder | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"paid" | "rejected" | null>(null);

  useEffect(() => {
    if (settings && !form) {
      setForm(settings);
      setPriceInputs(Object.fromEntries(planCodes.flatMap(plan => [
        [`VND-${plan}`, String(settings.pricesVnd[plan] ?? 0)],
        [`USDT-${plan}`, String(settings.pricesUsdt[plan] ?? 0)],
      ])));
    }
  }, [settings, form]);

  const handleSaveSettings = async (pricesOnly = false) => {
    if (!form || !priceInputs) return;
    setDestinationError(null);
    const pricesVnd = {} as Record<PlanCode, number>;
    const pricesUsdt = {} as Record<PlanCode, number>;
    for (const plan of planCodes) {
      const vnd = priceInputs[`VND-${plan}`].trim();
      const usdt = priceInputs[`USDT-${plan}`].trim();
      const normalizedVnd = /^\d{1,3}(?:\.\d{3})+$/.test(vnd) ? vnd.replaceAll(".", "") : vnd;
      if (!/^\d+$/.test(normalizedVnd) || !/^\d+(?:\.\d{1,8})?$/.test(usdt)
        || Number(normalizedVnd) > 10_000_000_000 || Number(usdt) > 1_000_000) {
        setToast({
          title: language === "vi"
            ? `${plan}: VND cần là số nguyên, USDT tối đa 8 chữ số sau dấu chấm (0 = chưa mở bán).`
            : `${plan}: VND must be a whole number; USDT allows up to 8 decimal places (0 = not for sale).`,
          type: "error",
        });
        return;
      }
      pricesVnd[plan] = Number(normalizedVnd);
      pricesUsdt[plan] = Number(usdt);
    }
    const normalizedForm = {
      ...form,
      vnBankCode: form.vnBankCode.trim().toUpperCase(),
      vnBankName: form.vnBankName.trim(),
      vnBankAccount: form.vnBankAccount.replace(/\s/g, ""),
      vnAccountName: form.vnAccountName.trim(),
      vietQrTemplate: form.vietQrTemplate.trim(),
      usdtBep20Address: form.usdtBep20Address.trim(),
      usdtTrc20Address: form.usdtTrc20Address.trim(),
    };
    if (!pricesOnly) {
      const invalid = [
        [normalizedForm.vnBankCode, /^(?:|[A-Z0-9]{2,20})$/, "Mã ngân hàng (2–20 chữ cái/số)", "Bank code (2–20 letters/digits)"],
        [normalizedForm.vnBankName, /^(?:|.+)$/, "Tên ngân hàng", "Bank name"],
        [normalizedForm.vnBankAccount, /^(?:|[0-9]{4,30})$/, "Số tài khoản ngân hàng (4–30 chữ số)", "Bank account (4–30 digits)"],
        [normalizedForm.vnAccountName, /^(?:|[\p{L}\p{M}0-9 .'-]{2,120})$/u, "Tên tài khoản ngân hàng", "Bank account name"],
        [normalizedForm.usdtBep20Address, /^(?:|0x[0-9a-fA-F]{40})$/, "Địa chỉ USDT BEP20 (0x + 40 ký tự hex)", "USDT BEP20 address (0x + 40 hex characters)"],
        [normalizedForm.usdtTrc20Address, /^(?:|T[1-9A-HJ-NP-Za-km-z]{33})$/, "Địa chỉ USDT TRC20 (T + 33 ký tự)", "USDT TRC20 address (T + 33 characters)"],
      ] as const;
      const bad = invalid.find(([value, pattern]) => !pattern.test(value));
      if (bad) {
        setDestinationError(language === "vi" ? `Chưa lưu: ${bad[2]} không hợp lệ. Sửa hoặc để trống ô này; bạn cũng có thể lưu giá riêng.` : `Not saved: Invalid ${bad[3]}. Fix or clear this field, or save prices separately.`);
        return;
      }
    }
    try {
      setSavingPrices(pricesOnly);
      // Fetch the latest saved destinations so saving prices cannot overwrite
      // unsaved or invalid payment details (or another admin's recent changes).
      const current = pricesOnly ? await getAdminPurchaseOrderSettings() : normalizedForm;
      const newSettings = await updateSettingsMutation.mutateAsync({ data: {
        ...current,
        pricesVnd,
        pricesUsdt,
        durationsDays: form.durationsDays,
      } });
      if (!pricesOnly) setForm(newSettings);
      setToast({ title: pricesOnly ? (language === "vi" ? "Đã lưu giá gói. Thông tin nhận tiền chưa lưu." : "Plan prices saved. Payment details not saved.") : t("Settings saved"), type: "success" });
      queryClient.invalidateQueries({ queryKey: getGetAdminPurchaseOrderSettingsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPurchaseOrderSettingsQueryKey() });
    } catch (err) {
      setToast({ title: localizedErrorMessage(err, language, t("Could not save settings")), type: "error" });
    } finally {
      setSavingPrices(false);
    }
  };

  const handleReview = () => {
    if (!reviewOrder || !reviewDecision) return;
    reviewMutation.mutate({
      orderId: reviewOrder.id,
      data: { decision: reviewDecision }
    }, {
      onSuccess: () => {
        setToast({ title: t("Order " + reviewDecision), type: "success" });
        setReviewOrder(null);
        setReviewDecision(null);
        queryClient.invalidateQueries({ queryKey: getListAdminPurchaseOrdersQueryKey() });
      },
      onError: (err) => {
        setToast({ title: localizedErrorMessage(err, language, t("Could not review order")), type: "error" });
      }
    });
  };

  if (settingsError) {
    return (
      <div className="p-8 text-center text-[#e11d48]">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <h2 className="mb-2 text-lg font-bold">{t("Could not load settings.")}</h2>
      </div>
    );
  }

  if (settingsLoading || !form || !priceInputs) {
    return <div className="p-8 flex justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-[#1a2b88]" /></div>;
  }

  const formatVnd = (val: string | number) => new Intl.NumberFormat("vi-VN").format(Number(val));
  const formatUsdt = (val: string | number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(val));

  return (
    <div className="flex flex-col gap-6 mt-12">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-[#eff6ff] p-3 rounded-2xl text-[#1a2b88]">
          <CreditCard className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[20px] font-extrabold text-[#0f172a]">{t("Order Settings")}</h2>
          <p className="text-[#64748b] text-[13px] font-medium">{t("Configure prices, durations, and payment details for checkout.")}</p>
        </div>
      </div>

      <Panel className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Prices & Durations */}
          <div className="flex flex-col gap-6">
            <h3 className="text-[15px] font-extrabold text-[#0f172a] border-b border-[#e2e8f0] pb-2 uppercase tracking-wider">{t("Plan Pricing & Durations")}</h3>
            <p className="text-[13px] text-[#64748b]">{language === "vi" ? "Nhập 2.32 cho USDT. Giá 0 = chưa mở bán; có thể lưu giá trước và thêm thông tin nhận tiền sau." : "Enter 2.32 for USDT. A price of 0 means not for sale; you can save prices before adding payment destinations."}</p>

            {planCodes.map((plan) => (
              <div key={plan} className="flex flex-col gap-3 bg-[#f8fafc] p-4 rounded-2xl border border-[#e2e8f0]">
                <h4 className="font-extrabold text-[#1a2b88] uppercase tracking-wider text-[14px]">{plan}</h4>
                <div className="grid grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-bold text-[#64748b]">VND</span>
                    <input type="text" inputMode="numeric" value={priceInputs[`VND-${plan}`]} onFocus={e => e.currentTarget.select()} onChange={e => setPriceInputs({...priceInputs, [`VND-${plan}`]: e.target.value})} className="w-full min-w-0 border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88]" data-testid={`price-vnd-${plan.toLowerCase()}`} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-bold text-[#64748b]">USDT</span>
                    <input type="text" inputMode="decimal" value={priceInputs[`USDT-${plan}`]} onFocus={e => e.currentTarget.select()} onChange={e => setPriceInputs({...priceInputs, [`USDT-${plan}`]: e.target.value.replace(",", ".")})} className="w-full min-w-0 border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88]" data-testid={`price-usdt-${plan.toLowerCase()}`} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-bold text-[#64748b]">{t("Duration")}</span>
                    <input type="number" value={form.durationsDays?.[plan] || 30} onChange={e => setForm({...form, durationsDays: {...(form.durationsDays || {}), [plan]: Number(e.target.value)}})} className="border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88]" />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* Payment Details */}
          <div className="flex flex-col gap-6">
            <h3 className="text-[15px] font-extrabold text-[#0f172a] border-b border-[#e2e8f0] pb-2 uppercase tracking-wider">{t("Payment Details")}</h3>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[#64748b]">{language === "vi" ? "Mã ngân hàng VietQR (MB hoặc 970422; không dùng mã SWIFT)" : "VietQR bank code (MB or 970422; not a SWIFT code)"}</span>
                <input type="text" value={form.vnBankCode} onChange={e => setForm({...form, vnBankCode: e.target.value.toUpperCase()})} className="border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88]" data-testid="input-vietqr-bank-code" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[#64748b]">{t("Bank Name")}</span>
                <input type="text" value={form.vnBankName} onChange={e => setForm({...form, vnBankName: e.target.value})} className="border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88]" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[#64748b]">{t("Bank Account Number")}</span>
                <input type="text" value={form.vnBankAccount} onChange={e => setForm({...form, vnBankAccount: e.target.value})} className="border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88]" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[#64748b]">{t("Account Name")}</span>
                <input type="text" value={form.vnAccountName} onChange={e => setForm({...form, vnAccountName: e.target.value})} className="border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88]" />
              </label>
            </div>

            <div className="flex flex-col gap-3 mt-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[#64748b]">{t("USDT BEP20 Address")}</span>
                <input type="text" value={form.usdtBep20Address} onChange={e => setForm({...form, usdtBep20Address: e.target.value})} className="border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88] font-mono" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[#64748b]">{t("USDT TRC20 Address")}</span>
                <input type="text" value={form.usdtTrc20Address} onChange={e => setForm({...form, usdtTrc20Address: e.target.value})} className="border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[#1a2b88] font-mono" />
              </label>
            </div>
          </div>
        </div>

        {destinationError && <p role="alert" className="mt-6 text-[13px] font-semibold text-[#be123c]" data-testid="payment-destination-error">{destinationError}</p>}
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => void handleSaveSettings(true)} disabled={updateSettingsMutation.isPending || savingPrices} className="rounded-xl border border-[#1a2b88] px-4 py-2 font-bold text-[#1a2b88] disabled:opacity-50" data-testid="button-save-prices-only">
            {language === "vi" ? "Chỉ lưu giá gói" : "Save plan prices only"}
          </button>
          <PrimaryButton onClick={() => void handleSaveSettings()} disabled={updateSettingsMutation.isPending || savingPrices} data-testid="button-save-order-settings">
            <Save className="h-4 w-4" />
            {t("Save Settings")}
          </PrimaryButton>
        </div>
      </Panel>

      <div className="flex items-center gap-3 mt-8 mb-2">
        <div className="bg-[#f0fdf4] p-3 rounded-2xl text-[#16a34a]">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[20px] font-extrabold text-[#0f172a]">{t("Orders")}</h2>
          <p className="text-[#64748b] text-[13px] font-medium">{t("Verify money received before approving orders.")}</p>
        </div>
      </div>

      <Panel className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[#475569]">
              <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">ID / User</th>
              <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Plan")}</th>
              <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Amount")}</th>
              <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Reference")}</th>
              <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Proof")}</th>
              <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Status")}</th>
              <th className="px-6 py-4 font-extrabold uppercase tracking-wider text-[11px]">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {!orders || orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-[#64748b] font-medium">
                  {ordersLoading ? <LoaderCircle className="h-6 w-6 animate-spin mx-auto" /> : t("No orders found")}
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-mono text-[12px] text-[#94a3b8]">{order.id.slice(0, 8)}</div>
                    <div className="font-bold text-[#0f172a]">{order.ownerUserId.slice(0, 8)}</div>
                  </td>
                  <td className="px-6 py-4 font-extrabold text-[#0f172a] uppercase">{order.plan}</td>
                  <td className="px-6 py-4 font-bold text-[#475569]">
                    {order.currency === "VND" ? formatVnd(order.amount) + " đ" : formatUsdt(order.amount) + " USDT"}
                  </td>
                  <td className="px-6 py-4 font-mono text-[13px] text-[#64748b]">{order.reference}</td>
                  <td className="px-6 py-4 max-w-[200px] truncate text-[13px] text-[#64748b]">
                    {order.txHash || order.proofInfo || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge
                      status={order.status === "paid" ? "success" : order.status === "rejected" ? "failed" : order.status === "pending" ? "warning" : "draft"}
                      label={order.status === "paid" ? "Paid" : order.status === "rejected" ? "Rejected" : order.status === "pending" ? "Pending" : order.status}
                    />
                  </td>
                  <td className="px-6 py-4">
                    {order.status === "pending" && (
                      <button
                        onClick={() => { setReviewOrder(order); setReviewDecision("paid"); }}
                        className="bg-white border border-[#cbd5e1] text-[#0f172a] px-3 py-1.5 rounded-lg text-[13px] font-bold hover:bg-[#f8fafc]"
                      >
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>

      {reviewOrder && reviewDecision && (
        <Modal title={reviewDecision === "paid" ? t("Confirm Approval") : t("Confirm Rejection")} onClose={() => setReviewOrder(null)}>
          <div className="flex flex-col gap-6 py-2">
            <div className={`p-4 rounded-xl border-2 flex items-start gap-3 ${reviewDecision === "paid" ? "bg-[#f0fdf4] border-[#bbf7d0] text-[#166534]" : "bg-[#fef2f2] border-[#fecdd3] text-[#991b1b]"}`}>
              <AlertCircle className="h-6 w-6 shrink-0" />
              <div>
                <h4 className="font-extrabold text-[15px] mb-1">
                  {reviewDecision === "paid" ? t("Verify Money Received!") : t("Reject Order")}
                </h4>
                <p className="text-[13px] font-medium">
                  {reviewDecision === "paid"
                    ? t("Do not approve this order unless you have successfully verified the funds in your bank or crypto wallet. Once approved, the user's limits will be instantly expanded.")
                    : t("Are you sure you want to reject this order? The user will have to create a new one to try again.")}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setReviewOrder(null)} className="flex-1 py-3 rounded-xl border border-[#cbd5e1] font-bold hover:bg-[#f8fafc]" data-testid="button-cancel-review">{t("Cancel")}</button>
              <button
                onClick={handleReview}
                disabled={reviewMutation.isPending}
                data-testid="button-submit-review"
                className={`flex-1 py-3 rounded-xl font-bold text-white shadow-sm flex items-center justify-center gap-2 ${reviewDecision === "paid" ? "bg-[#16a34a] hover:bg-[#15803d]" : "bg-[#dc2626] hover:bg-[#b91c1c]"}`}
              >
                {reviewMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {reviewDecision === "paid" ? t("Approve Order") : t("Reject Order")}
              </button>
            </div>

            {reviewDecision === "paid" && (
              <button
                onClick={() => setReviewDecision("rejected")}
                className="text-[13px] font-bold text-[#dc2626] hover:underline mx-auto mt-2"
              >
                {t("Actually, reject this order")}
              </button>
            )}
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.title} onDismiss={() => setToast(null)} />}
    </div>
  );
}