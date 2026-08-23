import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminSystemSettingsQueryKey,
  type AdminSystemSettings,
  type PlanLimitSettings,
  useGetAdminSystemSettings,
  useUpdateAdminSystemSettings,
} from "@workspace/api-client-react";
import { AlertTriangle, Check, Save, Settings2, ShieldAlert } from "lucide-react";
import { AppLayout, Input, Panel, PrimaryButton, SectionHeader, Toast } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

const copy = {
  en: {
    title: "System Settings",
    subtitle: "Set safe platform-wide defaults for subscriptions, deliveries, and access.",
    loadError: "Could not load system settings.",
    planLimits: "Plan limits",
    planDetail: "These values immediately apply to the active entitlement of every plan.",
    accountLimit: "Telegram accounts",
    campaignLimit: "Campaigns",
    messageLimit: "Messages / day",
    unlimited: "Unlimited",
    dailyDefault: "Default account daily limit",
    delivery: "Delivery defaults",
    maxRetries: "Maximum retries",
    roundDelay: "Delay between rounds (seconds)",
    minimum: "Minimum",
    maximum: "Maximum",
    access: "Access controls",
    registration: "Allow new user registration",
    maintenance: "Maintenance mode",
    maintenanceHint: "Non-admin users cannot access their workspace while maintenance mode is enabled.",
    timezone: "Default timezone",
    timezoneHint: "Used when a new campaign does not provide its own timezone.",
    save: "Save system settings",
    saving: "Saving…",
    saved: "System settings saved.",
    failed: "Could not save system settings.",
    invalid: "Enter whole numbers and ensure each minimum is not greater than its maximum.",
  },
  vi: {
    title: "Cấu hình hệ thống",
    subtitle: "Thiết lập mặc định an toàn cho gói dịch vụ, gửi tin và quyền truy cập toàn hệ thống.",
    loadError: "Không thể tải cấu hình hệ thống.",
    planLimits: "Giới hạn theo gói",
    planDetail: "Các giá trị này áp dụng ngay cho entitlement đang hoạt động của từng gói.",
    accountLimit: "Tài khoản Telegram",
    campaignLimit: "Chiến dịch",
    messageLimit: "Tin nhắn / ngày",
    unlimited: "Không giới hạn",
    dailyDefault: "Giới hạn gửi/ngày mặc định cho tài khoản",
    delivery: "Mặc định gửi tin",
    maxRetries: "Số lần retry tối đa",
    roundDelay: "Khoảng delay giữa các vòng (giây)",
    minimum: "Tối thiểu",
    maximum: "Tối đa",
    access: "Kiểm soát truy cập",
    registration: "Cho phép đăng ký user mới",
    maintenance: "Chế độ bảo trì",
    maintenanceHint: "User không phải admin không thể truy cập workspace khi bật chế độ bảo trì.",
    timezone: "Múi giờ mặc định",
    timezoneHint: "Dùng khi campaign mới không chỉ định múi giờ riêng.",
    save: "Lưu cấu hình",
    saving: "Đang lưu…",
    saved: "Đã lưu cấu hình hệ thống.",
    failed: "Không thể lưu cấu hình hệ thống.",
    invalid: "Hãy nhập số nguyên và đảm bảo giá trị tối thiểu không lớn hơn tối đa.",
  },
} as const;

const PLAN_NAMES = { plus: "PLUS", pro: "PRO", unlimited: "UNLIMITED" } as const;

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" onClick={onChange} aria-label={label} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[#1a2b88]" : "bg-[#cbd5e1]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "left-6" : "left-1"}`} /></button>;
}

function LimitControl({
  label,
  value,
  onChange,
  unlimitedLabel,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unlimitedLabel: string;
}) {
  return <label className="block">
    <span className="mb-2 block text-[12px] font-bold text-[#475569]">{label}</span>
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        disabled={value === null}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
        className="h-10 min-w-0 flex-1 rounded-xl border border-[#dbe2ea] px-3 text-[13px] font-bold outline-none focus:border-[#1a2b88] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
      />
      <button type="button" onClick={() => onChange(value === null ? 0 : null)} className={`shrink-0 rounded-lg border px-2.5 py-2 text-[10px] font-extrabold uppercase ${value === null ? "border-[#1a2b88] bg-[#eef2fa] text-[#1a2b88]" : "border-[#dbe2ea] text-[#64748b]"}`}>
        {unlimitedLabel}
      </button>
    </div>
  </label>;
}

export default function AdminSystemSettingsPage() {
  const { language } = useLanguage();
  const text = copy[language];
  const queryClient = useQueryClient();
  const settingsQuery = useGetAdminSystemSettings();
  const update = useUpdateAdminSystemSettings();
  const [form, setForm] = useState<AdminSystemSettings | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const updatePlanLimit = (plan: keyof typeof PLAN_NAMES, field: keyof PlanLimitSettings, value: number | null) => {
    setForm((current) => current ? {
      ...current,
      planLimits: { ...current.planLimits, [plan]: { ...current.planLimits[plan], [field]: value } },
    } : current);
  };

  const save = () => {
    if (!form) return;
    const defaults = form.campaignDefaults;
    const numericValues = [
      form.defaultAccountDailyLimit,
      defaults.maxRetries,
      defaults.roundDelayMinSeconds,
      defaults.roundDelayMaxSeconds,
      ...Object.values(form.planLimits).flatMap((limits) => [limits.accountLimit, limits.campaignLimit, limits.messageDailyLimit].filter((value): value is number => value !== null)),
    ];
    if (!numericValues.every((value) => Number.isInteger(value) && value >= 0) || form.defaultAccountDailyLimit < 1 || defaults.roundDelayMinSeconds > defaults.roundDelayMaxSeconds) {
      setToast({ message: text.invalid, error: true });
      return;
    }
    update.mutate({ data: form }, {
      onSuccess: (next) => {
        setForm(next);
        void queryClient.invalidateQueries({ queryKey: getGetAdminSystemSettingsQueryKey() });
        setToast({ message: text.saved });
      },
      onError: (error) => setToast({ message: localizedErrorMessage(error, language, text.failed), error: true }),
    });
  };

  if (settingsQuery.isLoading || !form) {
    return <AppLayout activePage="admin-system-settings" title={text.title} subtitle={text.subtitle}><Panel className="p-8 text-[14px] font-semibold text-[#64748b]">Loading…</Panel></AppLayout>;
  }
  if (settingsQuery.error) {
    return <AppLayout activePage="admin-system-settings" title={text.title} subtitle={text.subtitle}><Panel className="p-8 text-[14px] font-semibold text-[#be123c]">{text.loadError}</Panel></AppLayout>;
  }

  return <AppLayout activePage="admin-system-settings" title={text.title} subtitle={text.subtitle}>
    <div className="space-y-6">
      <Panel className="p-5 sm:p-7">
        <SectionHeader eyebrow="Admin center" title={text.planLimits} detail={text.planDetail} />
        <div className="grid gap-5 lg:grid-cols-3">
          {(Object.keys(PLAN_NAMES) as Array<keyof typeof PLAN_NAMES>).map((plan) => (
            <div key={plan} className="rounded-2xl border border-[#e7edf4] bg-[#f8fafc] p-4">
              <p className="mb-4 font-extrabold tracking-wide text-[#1a2b88]">{PLAN_NAMES[plan]}</p>
              <div className="space-y-3">
                <LimitControl label={text.accountLimit} value={form.planLimits[plan].accountLimit} onChange={(value) => updatePlanLimit(plan, "accountLimit", value)} unlimitedLabel={text.unlimited} />
                <LimitControl label={text.campaignLimit} value={form.planLimits[plan].campaignLimit} onChange={(value) => updatePlanLimit(plan, "campaignLimit", value)} unlimitedLabel={text.unlimited} />
                <LimitControl label={text.messageLimit} value={form.planLimits[plan].messageDailyLimit} onChange={(value) => updatePlanLimit(plan, "messageDailyLimit", value)} unlimitedLabel={text.unlimited} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-5 sm:p-7">
          <SectionHeader eyebrow="Delivery" title={text.delivery} detail={text.timezoneHint} />
          <div className="space-y-4">
            <Input label={text.dailyDefault} type="number" min={1} value={String(form.defaultAccountDailyLimit)} onChange={(value) => setForm({ ...form, defaultAccountDailyLimit: Number(value) })} />
            <Input label={text.maxRetries} type="number" min={0} max={20} value={String(form.campaignDefaults.maxRetries)} onChange={(value) => setForm({ ...form, campaignDefaults: { ...form.campaignDefaults, maxRetries: Number(value) } })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={`${text.roundDelay} · ${text.minimum}`} type="number" min={0} value={String(form.campaignDefaults.roundDelayMinSeconds)} onChange={(value) => setForm({ ...form, campaignDefaults: { ...form.campaignDefaults, roundDelayMinSeconds: Number(value) } })} />
              <Input label={`${text.roundDelay} · ${text.maximum}`} type="number" min={0} value={String(form.campaignDefaults.roundDelayMaxSeconds)} onChange={(value) => setForm({ ...form, campaignDefaults: { ...form.campaignDefaults, roundDelayMaxSeconds: Number(value) } })} />
            </div>
            <label className="block"><span className="mb-2 block text-[12px] font-bold text-[#475569]">{text.timezone}</span><select value={form.defaultTimezone} onChange={(event) => setForm({ ...form, defaultTimezone: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-[13px] font-bold outline-none focus:border-[#1a2b88]"><option>Asia/Ho_Chi_Minh</option><option>Asia/Bangkok</option><option>Asia/Singapore</option><option>UTC</option></select></label>
          </div>
        </Panel>

        <Panel className="p-5 sm:p-7">
          <SectionHeader eyebrow="Safety" title={text.access} detail={text.maintenanceHint} />
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-2xl border border-[#e7edf4] p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef2fa] text-[#1a2b88]"><Check className="h-5 w-5" /></span><div className="flex-1"><p className="text-[13px] font-extrabold text-[#0f172a]">{text.registration}</p></div><Toggle checked={form.registrationEnabled} onChange={() => setForm({ ...form, registrationEnabled: !form.registrationEnabled })} label={text.registration} /></div>
            <div className={`flex items-center gap-4 rounded-2xl border p-4 ${form.maintenanceMode ? "border-[#fecdd3] bg-[#fff1f2]" : "border-[#e7edf4]"}`}><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff1f2] text-[#e11d48]"><ShieldAlert className="h-5 w-5" /></span><div className="flex-1"><p className="text-[13px] font-extrabold text-[#0f172a]">{text.maintenance}</p><p className="mt-1 text-[12px] font-medium text-[#64748b]">{text.maintenanceHint}</p></div><Toggle checked={form.maintenanceMode} onChange={() => setForm({ ...form, maintenanceMode: !form.maintenanceMode })} label={text.maintenance} /></div>
            {form.maintenanceMode && <div className="flex gap-2 rounded-xl border border-[#fecdd3] bg-[#fff7f8] p-3 text-[12px] font-semibold text-[#be123c]"><AlertTriangle className="h-4 w-4 shrink-0" />{text.maintenanceHint}</div>}
          </div>
        </Panel>
      </div>

      <div className="flex justify-end"><PrimaryButton onClick={save} disabled={update.isPending}><Save className="h-4 w-4" />{update.isPending ? text.saving : text.save}</PrimaryButton></div>
    </div>
    {toast && <Toast message={toast.message} onDismiss={() => setToast(null)} />}
  </AppLayout>;
}