import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminSystemSettingsQueryKey,
  getGetGroupLibraryAccessQueryKey,
  getGetUpgradeSummaryQueryKey,
  getGetSupportSettingsQueryKey,
  type AdminSystemSettings,
  type PlanDisplayContent,
  type PlanLimitSettings,
  useGetAdminSystemSettings,
  useUpdateAdminSystemSettings,
} from "@workspace/api-client-react";
import { AlertTriangle, Check, Save, ShieldAlert } from "lucide-react";
import { AppLayout, Input, Panel, PrimaryButton, SectionHeader, Toast } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

const copy = {
  en: {
    title: "System Settings",
    subtitle: "Set safe platform-wide defaults for subscriptions, deliveries, and access.",
    loadError: "Could not load system settings.",
    planLimits: "Plan limits",
    planDetail: "These values immediately apply to the active entitlement of every plan.",
    planContent: "Upgrade card content",
    planContentDetail: "Edit the short description and ordered benefits shown for each plan.",
    taglineVi: "Short description · Vietnamese",
    taglineEn: "Short description · English",
    featuresVi: "Benefits · Vietnamese",
    featuresEn: "Benefits · English",
    featuresHint: "Enter one benefit per line, from 1 to 8 lines.",
    accountLimit: "Telegram accounts",
    campaignLimit: "Campaigns",
    messageLimit: "Messages / campaign / day",
    userQuotaTitle: "Daily user budget",
    userMessageLimit: "Messages / user / day",
    userQuotaHint: "Shared across every campaign owned by this user.",
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
    groupLibrary: "Group library access",
    groupLibraryHint: "Show the shared group directory to users. The selected plan controls who can open Telegram links.",
    groupLibraryVisible: "Show group library to users / Hiển thị thư viện nhóm cho user",
    groupLibraryMinimumPlan: "Minimum plan to open links / Gói tối thiểu để mở link",
    timezone: "Default timezone",
    timezoneHint: "Used when a new campaign does not provide its own timezone.",
    save: "Save system settings",
    saving: "Saving…",
    saved: "System settings saved.",
    failed: "Could not save system settings.",
    invalid: "Enter whole numbers and ensure each minimum is not greater than its maximum.",
    invalidContent: "Each plan needs both descriptions and 1–8 non-empty benefits per language.",
    support: "Support channels",
    supportDetail: "Give users a direct way to reach your team. Leave a field empty to hide that channel.",
    telegramSupport: "Telegram support link",
    zaloSupport: "Zalo support link",
    supportHint: "Only HTTPS links on t.me, telegram.me, or zalo.me are accepted.",
    supportInvalid: "Enter valid HTTPS support links, or leave them empty.",
  },
  vi: {
    title: "Cấu hình hệ thống",
    subtitle: "Thiết lập mặc định an toàn cho gói dịch vụ, gửi tin và quyền truy cập toàn hệ thống.",
    loadError: "Không thể tải cấu hình hệ thống.",
    planLimits: "Giới hạn theo gói",
    planDetail: "Các giá trị này áp dụng ngay cho entitlement đang hoạt động của từng gói.",
    planContent: "Nội dung thẻ gói dịch vụ",
    planContentDetail: "Chỉnh mô tả ngắn và danh sách quyền lợi theo thứ tự hiển thị của từng gói.",
    taglineVi: "Mô tả ngắn · Tiếng Việt",
    taglineEn: "Mô tả ngắn · Tiếng Anh",
    featuresVi: "Quyền lợi · Tiếng Việt",
    featuresEn: "Quyền lợi · Tiếng Anh",
    featuresHint: "Mỗi dòng là một quyền lợi, từ 1 đến 8 dòng.",
    accountLimit: "Tài khoản Telegram",
    campaignLimit: "Chiến dịch",
    messageLimit: "Tin nhắn / chiến dịch / ngày",
    userQuotaTitle: "Ngân sách tổng theo user",
    userMessageLimit: "Tổng tin nhắn / user / ngày",
    userQuotaHint: "Dùng chung cho tất cả campaign của user này trong ngày.",
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
    groupLibrary: "Quyền truy cập Thư viện nhóm",
    groupLibraryHint: "Hiển thị thư mục nhóm dùng chung cho user. Gói được chọn quyết định ai có thể mở link Telegram.",
    groupLibraryVisible: "Hiển thị thư viện nhóm cho user / Show group library to users",
    groupLibraryMinimumPlan: "Gói tối thiểu để mở link / Minimum plan to open links",
    timezone: "Múi giờ mặc định",
    timezoneHint: "Dùng khi campaign mới không chỉ định múi giờ riêng.",
    save: "Lưu cấu hình",
    saving: "Đang lưu…",
    saved: "Đã lưu cấu hình hệ thống.",
    failed: "Không thể lưu cấu hình hệ thống.",
    invalid: "Hãy nhập số nguyên và đảm bảo giá trị tối thiểu không lớn hơn tối đa.",
    invalidContent: "Mỗi gói cần đủ mô tả và từ 1–8 quyền lợi không để trống cho từng ngôn ngữ.",
    support: "Kênh hỗ trợ",
    supportDetail: "Cung cấp cách liên hệ trực tiếp cho user. Để trống một ô để ẩn kênh đó.",
    telegramSupport: "Link hỗ trợ Telegram",
    zaloSupport: "Link hỗ trợ Zalo",
    supportHint: "Chỉ chấp nhận link HTTPS thuộc t.me, telegram.me hoặc zalo.me.",
    supportInvalid: "Hãy nhập link HTTPS hỗ trợ hợp lệ hoặc để trống.",
  },
} as const;

const PLAN_NAMES = { plus: "PLUS", pro: "PRO", unlimited: "UNLIMITED" } as const;

const PLAN_LIMIT_MAXIMUMS = {
  accountLimit: 100_000,
  campaignLimit: 100_000,
  messageDailyLimit: 10_000_000,
  userMessageDailyLimit: 100_000_000,
} as const;

function validOptionalSupportUrl(value: string, channel: "telegram" | "zalo"): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    const hostnames = channel === "telegram" ? ["t.me", "telegram.me"] : ["zalo.me"];
    return url.protocol === "https:" && hostnames.includes(url.hostname.toLowerCase()) && url.pathname.length > 1 && !url.username && !url.password;
  } catch {
    return false;
  }
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" onClick={onChange} aria-label={label} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[#1a2b88]" : "bg-[#cbd5e1]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "left-6" : "left-1"}`} /></button>;
}

function LimitControl({
  label,
  value,
  onChange,
  unlimitedLabel,
  maximum,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unlimitedLabel: string;
  maximum: number;
}) {
  return <label className="block">
    <span className="mb-2 block text-[12px] font-bold text-[#475569]">{label}</span>
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        max={maximum}
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
    if (settingsQuery.data && !form) setForm(settingsQuery.data);
  }, [settingsQuery.data, form]);

  const updatePlanLimit = (plan: keyof typeof PLAN_NAMES, field: keyof PlanLimitSettings, value: number | null) => {
    setForm((current) => current ? {
      ...current,
      planLimits: { ...current.planLimits, [plan]: { ...current.planLimits[plan], [field]: value } },
    } : current);
  };

  const updatePlanContent = (
    plan: keyof typeof PLAN_NAMES,
    field: keyof PlanDisplayContent,
    value: string | string[],
  ) => {
    setForm((current) => current ? {
      ...current,
      planContent: { ...current.planContent, [plan]: { ...current.planContent[plan], [field]: value } },
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
      ...Object.values(form.planLimits).flatMap((limits) => [limits.accountLimit, limits.campaignLimit, limits.messageDailyLimit, limits.userMessageDailyLimit].filter((value): value is number => value !== null)),
    ];
    const validPlanLimits = Object.values(form.planLimits).every((limits) => (
      (Object.entries(PLAN_LIMIT_MAXIMUMS) as Array<[keyof typeof PLAN_LIMIT_MAXIMUMS, number]>)
        .every(([field, maximum]) => limits[field] === null || limits[field] <= maximum)
    ));
    const validPlanContent = Object.values(form.planContent).every((content) => (
      [content.tagline, content.taglineEn].every((tagline) => tagline.trim().length >= 1 && tagline.trim().length <= 160)
      && [content.features, content.featuresEn].every((features) => (
        features.length >= 1
        && features.length <= 8
        && features.every((feature) => feature.trim().length >= 1 && feature.trim().length <= 120)
      ))
    ));
    if (!numericValues.every((value) => Number.isInteger(value) && value >= 0) || !validPlanLimits || form.defaultAccountDailyLimit < 1 || defaults.roundDelayMinSeconds > defaults.roundDelayMaxSeconds) {
      setToast({ message: text.invalid, error: true });
      return;
    }
    if (!validPlanContent) {
      setToast({ message: text.invalidContent, error: true });
      return;
    }
    if (!validOptionalSupportUrl(form.supportLinks.telegramUrl ?? "", "telegram") || !validOptionalSupportUrl(form.supportLinks.zaloUrl ?? "", "zalo")) {
      setToast({ message: text.supportInvalid, error: true });
      return;
    }
    update.mutate({ data: form }, {
      onSuccess: (next) => {
        setForm(next);
        void queryClient.invalidateQueries({ queryKey: getGetAdminSystemSettingsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetGroupLibraryAccessQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetUpgradeSummaryQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetSupportSettingsQueryKey() });
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
                <LimitControl label={text.accountLimit} value={form.planLimits[plan].accountLimit} onChange={(value) => updatePlanLimit(plan, "accountLimit", value)} unlimitedLabel={text.unlimited} maximum={PLAN_LIMIT_MAXIMUMS.accountLimit} />
                <LimitControl label={text.campaignLimit} value={form.planLimits[plan].campaignLimit} onChange={(value) => updatePlanLimit(plan, "campaignLimit", value)} unlimitedLabel={text.unlimited} maximum={PLAN_LIMIT_MAXIMUMS.campaignLimit} />
                <LimitControl label={text.messageLimit} value={form.planLimits[plan].messageDailyLimit} onChange={(value) => updatePlanLimit(plan, "messageDailyLimit", value)} unlimitedLabel={text.unlimited} maximum={PLAN_LIMIT_MAXIMUMS.messageDailyLimit} />
                <div className="border-t border-dashed border-[#cbd5e1] pt-3">
                  <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-[#1a2b88]">{text.userQuotaTitle}</p>
                  <p className="mb-3 text-[11px] font-medium leading-4 text-[#64748b]">{text.userQuotaHint}</p>
                  <LimitControl label={text.userMessageLimit} value={form.planLimits[plan].userMessageDailyLimit} onChange={(value) => updatePlanLimit(plan, "userMessageDailyLimit", value)} unlimitedLabel={text.unlimited} maximum={PLAN_LIMIT_MAXIMUMS.userMessageDailyLimit} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-5 sm:p-7">
        <SectionHeader eyebrow="Upgrade" title={text.planContent} detail={text.planContentDetail} />
        <div className="grid gap-5 xl:grid-cols-3">
          {(Object.keys(PLAN_NAMES) as Array<keyof typeof PLAN_NAMES>).map((plan) => {
            const content = form.planContent[plan];
            return (
              <div key={plan} className="rounded-2xl border border-[#e7edf4] bg-[#f8fafc] p-4">
                <p className="mb-4 font-extrabold tracking-wide text-[#1a2b88]">{PLAN_NAMES[plan]}</p>
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-[12px] font-bold text-[#475569]">{text.taglineVi}</span>
                    <input
                      value={content.tagline}
                      maxLength={160}
                      onChange={(event) => updatePlanContent(plan, "tagline", event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]"
                      data-testid={`plan-content-${plan}-tagline-vi`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[12px] font-bold text-[#475569]">{text.taglineEn}</span>
                    <input
                      value={content.taglineEn}
                      maxLength={160}
                      onChange={(event) => updatePlanContent(plan, "taglineEn", event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]"
                      data-testid={`plan-content-${plan}-tagline-en`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[12px] font-bold text-[#475569]">{text.featuresVi}</span>
                    <textarea
                      rows={7}
                      value={content.features.join("\n")}
                      onChange={(event) => updatePlanContent(plan, "features", event.target.value.split("\n"))}
                      className="w-full resize-y rounded-xl border border-[#dbe2ea] bg-white px-3 py-2.5 text-[13px] font-semibold leading-5 outline-none focus:border-[#1a2b88]"
                      data-testid={`plan-content-${plan}-features-vi`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[12px] font-bold text-[#475569]">{text.featuresEn}</span>
                    <textarea
                      rows={7}
                      value={content.featuresEn.join("\n")}
                      onChange={(event) => updatePlanContent(plan, "featuresEn", event.target.value.split("\n"))}
                      className="w-full resize-y rounded-xl border border-[#dbe2ea] bg-white px-3 py-2.5 text-[13px] font-semibold leading-5 outline-none focus:border-[#1a2b88]"
                      data-testid={`plan-content-${plan}-features-en`}
                    />
                  </label>
                  <p className="text-[11px] font-medium leading-4 text-[#64748b]">{text.featuresHint}</p>
                </div>
              </div>
            );
          })}
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
            <div className="rounded-2xl border border-[#e7edf4] p-4">
              <p className="text-[13px] font-extrabold text-[#0f172a]">{text.groupLibrary}</p>
              <p className="mt-1 text-[12px] font-medium text-[#64748b]">{text.groupLibraryHint}</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex-1"><p className="text-[12px] font-bold text-[#475569]">{text.groupLibraryVisible}</p></div>
                <Toggle checked={form.groupLibraryVisibleToUsers} onChange={() => setForm({ ...form, groupLibraryVisibleToUsers: !form.groupLibraryVisibleToUsers })} label={text.groupLibraryVisible} />
              </div>
              <label className="mt-4 block">
                <span className="mb-2 block text-[12px] font-bold text-[#475569]">{text.groupLibraryMinimumPlan}</span>
                <select value={form.groupLibraryMinimumJoinPlan} onChange={(event) => setForm({ ...form, groupLibraryMinimumJoinPlan: event.target.value as typeof form.groupLibraryMinimumJoinPlan })} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-[13px] font-bold outline-none focus:border-[#1a2b88]">
                  <option value="pro">PRO</option>
                  <option value="unlimited">UNLIMITED</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-[#e7edf4] p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef2fa] text-[#1a2b88]"><Check className="h-5 w-5" /></span><div className="flex-1"><p className="text-[13px] font-extrabold text-[#0f172a]">{text.registration}</p></div><Toggle checked={form.registrationEnabled} onChange={() => setForm({ ...form, registrationEnabled: !form.registrationEnabled })} label={text.registration} /></div>
            <div className={`flex items-center gap-4 rounded-2xl border p-4 ${form.maintenanceMode ? "border-[#fecdd3] bg-[#fff1f2]" : "border-[#e7edf4]"}`}><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff1f2] text-[#e11d48]"><ShieldAlert className="h-5 w-5" /></span><div className="flex-1"><p className="text-[13px] font-extrabold text-[#0f172a]">{text.maintenance}</p><p className="mt-1 text-[12px] font-medium text-[#64748b]">{text.maintenanceHint}</p></div><Toggle checked={form.maintenanceMode} onChange={() => setForm({ ...form, maintenanceMode: !form.maintenanceMode })} label={text.maintenance} /></div>
            {form.maintenanceMode && <div className="flex gap-2 rounded-xl border border-[#fecdd3] bg-[#fff7f8] p-3 text-[12px] font-semibold text-[#be123c]"><AlertTriangle className="h-4 w-4 shrink-0" />{text.maintenanceHint}</div>}
          </div>
        </Panel>
      </div>

      <Panel className="p-5 sm:p-7">
        <SectionHeader eyebrow="Support" title={text.support} detail={text.supportDetail} />
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[12px] font-bold text-[#475569]">{text.telegramSupport}</span>
            <input
              type="url"
              value={form.supportLinks.telegramUrl ?? ""}
              onChange={(event) => setForm({ ...form, supportLinks: { ...form.supportLinks, telegramUrl: event.target.value } })}
              placeholder="https://t.me/your_support"
              className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]"
              data-testid="support-telegram-url"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-bold text-[#475569]">{text.zaloSupport}</span>
            <input
              type="url"
              value={form.supportLinks.zaloUrl ?? ""}
              onChange={(event) => setForm({ ...form, supportLinks: { ...form.supportLinks, zaloUrl: event.target.value } })}
              placeholder="https://zalo.me/your_support"
              className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]"
              data-testid="support-zalo-url"
            />
          </label>
        </div>
        <p className="mt-3 text-[11px] font-medium text-[#64748b]">{text.supportHint}</p>
      </Panel>

      <div className="flex justify-end"><PrimaryButton onClick={save} disabled={update.isPending}><Save className="h-4 w-4" />{update.isPending ? text.saving : text.save}</PrimaryButton></div>
    </div>
    {toast && <Toast message={toast.message} onDismiss={() => setToast(null)} />}
  </AppLayout>;
}