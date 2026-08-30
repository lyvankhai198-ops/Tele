import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckSquare,
  LoaderCircle,
  Search,
  Square,
} from "lucide-react";
import type { Campaign, Destination } from "@workspace/api-client-react";
import {
  useCreateCampaign,
  useGetSystemDefaults,
  useListDestinations,
  useListMessageTemplates,
  useListTelegramAccounts,
  useUpdateCampaignStatus,
} from "@workspace/api-client-react";
import { Modal, PrimaryButton } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

type CampaignForm = {
  name: string;
  accountId: string;
  templateId: string;
  destinationIds: string[];
  repeatCount: string;
  roundDelayMinSeconds: string;
  roundDelayMaxSeconds: string;
  scheduleDate: string;
  scheduleTime: string;
};

export type CampaignFormPrefill = {
  destinationTelegramId?: string;
  destinationTitle?: string;
  roundDelayMinSeconds?: number;
  roundDelayMaxSeconds?: number;
  preferredAccountId?: string;
};

type CampaignFormModalProps = {
  editingCampaign: Campaign | null;
  prefill?: CampaignFormPrefill | null;
  onClose: () => void;
  onSaved: (campaign: Campaign) => void | Promise<void>;
};

const copy = {
  en: {
    modalTitle: "Create campaign",
    editTitle: "Edit campaign",
    fieldName: "Campaign name",
    fieldAccount: "Telegram account",
    fieldAccountPlaceholder: "Select account",
    fieldTemplate: "Message template",
    fieldTemplatePlaceholder: "Select template",
    fieldDestinations: "Select destinations",
    deselectAll: "Deselect all",
    selectAll: "Select all",
    searchGroupPlaceholder: "Search groups…",
    pickAccountHint: "Select a Telegram account to see active groups.",
    noGroupsHint: "No groups with posting permission.",
    unavailableDestination: "No posting permission",
    generalTopic: "General",
    topicBadge: "Topic",
    fieldRepeatCount: "Repeat count",
    repeatCountHint: "Max 300 (admin configured).",
    delayBetweenRounds: "Delay between rounds",
    delayMinRoundLabel: "Min delay between rounds (sec)",
    delayMaxRoundLabel: "Max delay between rounds (sec)",
    delayMaxHint: (max: number) => `Max ${max.toLocaleString("en-US")} seconds.`,
    fieldSchedule: "Schedule (optional)",
    validationRequired: "Please enter a name, select an account, template, and at least one destination.",
    validationNumbers: "Repeat count and delays must be valid integers.",
    validationDelayOrder: "Minimum delay cannot exceed maximum delay.",
    validationSchedule: "Invalid schedule date/time.",
    createButton: "Create campaign",
    editButton: "Save changes",
    cloneFixed: "The Telegram account and forward template are fixed for this cloned campaign.",
    genericError: "Could not complete the operation. Please try again.",
  },
  vi: {
    modalTitle: "Tạo chiến dịch",
    editTitle: "Chỉnh sửa chiến dịch",
    fieldName: "Tên chiến dịch",
    fieldAccount: "Tài khoản Telegram",
    fieldAccountPlaceholder: "Chọn tài khoản",
    fieldTemplate: "Mẫu tin",
    fieldTemplatePlaceholder: "Chọn mẫu",
    fieldDestinations: "Chọn nhóm gửi",
    deselectAll: "Bỏ chọn tất cả",
    selectAll: "Chọn tất cả",
    searchGroupPlaceholder: "Tìm nhóm...",
    pickAccountHint: "Chọn tài khoản Telegram để hiển thị nhóm đang hoạt động.",
    noGroupsHint: "Không có nhóm nào được phép gửi.",
    unavailableDestination: "Không có quyền đăng",
    generalTopic: "Chung",
    topicBadge: "Chủ đề",
    fieldRepeatCount: "Số lần lặp",
    repeatCountHint: "Tối đa 300 (admin cấu hình).",
    delayBetweenRounds: "Delay giữa các vòng lặp",
    delayMinRoundLabel: "Delay min giữa mỗi vòng lặp (giây)",
    delayMaxRoundLabel: "Delay max giữa mỗi vòng lặp (giây)",
    delayMaxHint: (max: number) => `Tối đa ${max.toLocaleString("vi-VN")} giây.`,
    fieldSchedule: "Lên lịch (tùy chọn)",
    validationRequired: "Hãy nhập tên, chọn tài khoản, mẫu tin và ít nhất một nhóm gửi.",
    validationNumbers: "Số lần lặp và delay phải là số nguyên hợp lệ.",
    validationDelayOrder: "Delay tối thiểu không thể lớn hơn delay tối đa.",
    validationSchedule: "Thời gian lên lịch không hợp lệ.",
    createButton: "Tạo chiến dịch",
    editButton: "Lưu thay đổi",
    cloneFixed: "Tài khoản Telegram và mẫu forward được cố định cho bản clone này.",
    genericError: "Không thể hoàn tất thao tác. Vui lòng thử lại.",
  },
} as const;

const emptyForm = (prefill?: CampaignFormPrefill | null): CampaignForm => ({
  name: prefill?.destinationTitle ? `Gửi nhóm ${prefill.destinationTitle}` : "",
  accountId: prefill?.preferredAccountId ?? "",
  templateId: "",
  destinationIds: [],
  repeatCount: "1",
  roundDelayMinSeconds: prefill?.roundDelayMinSeconds !== undefined
    ? String(prefill.roundDelayMinSeconds)
    : "1",
  roundDelayMaxSeconds: prefill?.roundDelayMaxSeconds !== undefined
    ? String(prefill.roundDelayMaxSeconds)
    : "3",
  scheduleDate: "",
  scheduleTime: "",
});

function destinationLabel(
  destination: Destination,
  generalTopic: string,
) {
  if (destination.kind === "topic") {
    return `${destination.parentTitle ?? "Telegram"} › ${destination.title}`;
  }
  if (destination.kind === "forum") {
    return `${destination.title} › ${generalTopic}`;
  }
  return destination.title;
}

function initialForm(
  editingCampaign: Campaign | null,
  prefill?: CampaignFormPrefill | null,
): CampaignForm {
  if (!editingCampaign) return emptyForm(prefill);
  const schedule = editingCampaign.scheduledAt ? new Date(editingCampaign.scheduledAt) : null;
  return {
    name: editingCampaign.name,
    accountId: editingCampaign.telegramAccountId ?? "",
    templateId: editingCampaign.templateId ?? "",
    destinationIds: editingCampaign.destinationIds,
    repeatCount: String(editingCampaign.repeatCount),
    roundDelayMinSeconds: String(editingCampaign.roundDelayMinSeconds),
    roundDelayMaxSeconds: String(editingCampaign.roundDelayMaxSeconds),
    scheduleDate: schedule ? new Intl.DateTimeFormat("en-CA").format(schedule) : "",
    scheduleTime: schedule ? schedule.toTimeString().slice(0, 5) : "",
  };
}

export function CampaignFormModal({
  editingCampaign,
  prefill,
  onClose,
  onSaved,
}: CampaignFormModalProps) {
  const { language } = useLanguage();
  const c = copy[language];
  const accounts = useListTelegramAccounts();
  const destinations = useListDestinations();
  const templates = useListMessageTemplates();
  const systemDefaults = useGetSystemDefaults();
  const createCampaign = useCreateCampaign();
  const updateStatus = useUpdateCampaignStatus();
  const [form, setForm] = useState<CampaignForm>(() => initialForm(editingCampaign, prefill));
  const [groupSearch, setGroupSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const connectedAccounts = (accounts.data ?? []).filter((account) => account.status === "connected");
  const accountDestinations = useMemo(() => {
    const needle = groupSearch.trim().toLowerCase();
    return (destinations.data ?? [])
      .filter((destination) =>
        destination.accountId === form.accountId
        && (
          destination.canPost
          || Boolean(editingCampaign && form.destinationIds.includes(destination.id))
        )
        && (!needle
          || destination.title.toLowerCase().includes(needle)
          || (destination.parentTitle ?? "").toLowerCase().includes(needle)
          || (destination.username ?? "").toLowerCase().includes(needle)),
      )
      .sort((left, right) =>
        destinationLabel(left, c.generalTopic).localeCompare(destinationLabel(right, c.generalTopic), language === "vi" ? "vi" : "en"),
      );
  }, [
    c.generalTopic,
    destinations.data,
    editingCampaign?.clonedFromCampaignId,
    form.accountId,
    form.destinationIds,
    groupSearch,
    language,
  ]);
  const accountTemplates = useMemo(() => (templates.data ?? []).filter((template) =>
    template.mode !== "forward"
    || template.sourceAccountId === form.accountId
    || Boolean(editingCampaign?.clonedFromCampaignId && template.id === form.templateId),
  ), [
    editingCampaign?.clonedFromCampaignId,
    form.accountId,
    form.templateId,
    templates.data,
  ]);
  const selectedTemplate = (templates.data ?? []).find((template) => template.id === form.templateId);

  useEffect(() => {
    if (editingCampaign || prefill?.roundDelayMinSeconds !== undefined || !systemDefaults.data) return;
    setForm((current) => (
      current.roundDelayMinSeconds === "1" && current.roundDelayMaxSeconds === "3"
        ? {
            ...current,
            roundDelayMinSeconds: String(systemDefaults.data!.campaignDefaults.roundDelayMinSeconds),
            roundDelayMaxSeconds: String(systemDefaults.data!.campaignDefaults.roundDelayMaxSeconds),
          }
        : current
    ));
  }, [editingCampaign, prefill?.roundDelayMinSeconds, systemDefaults.data]);

  useEffect(() => {
    if (editingCampaign || !prefill?.destinationTelegramId || !form.accountId) return;
    const matchingDestination = (destinations.data ?? []).find((destination) =>
      destination.accountId === form.accountId
      && destination.telegramId === prefill.destinationTelegramId
      && destination.topicId === null
      && destination.canPost,
    );
    if (matchingDestination) {
      setForm((current) => ({
        ...current,
        destinationIds: [matchingDestination.id],
      }));
    }
  }, [
    destinations.data,
    editingCampaign,
    form.accountId,
    prefill?.destinationTelegramId,
  ]);

  function changeAccount(accountId: string) {
    setForm((current) => ({ ...current, accountId, templateId: "", destinationIds: [] }));
  }

  function toggleDestination(destinationId: string) {
    setForm((current) => ({
      ...current,
      destinationIds: current.destinationIds.includes(destinationId)
        ? current.destinationIds.filter((id) => id !== destinationId)
        : [...current.destinationIds, destinationId],
    }));
  }

  function toggleAllDestinations() {
    const visibleIds = accountDestinations.map((destination) => destination.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => form.destinationIds.includes(id));
    setForm((current) => ({
      ...current,
      destinationIds: allVisibleSelected
        ? current.destinationIds.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current.destinationIds, ...visibleIds])],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const values = [
      Number(form.repeatCount),
      Number(form.roundDelayMinSeconds),
      Number(form.roundDelayMaxSeconds),
    ];
    if (!form.name.trim() || !form.accountId || !form.templateId || !form.destinationIds.length) {
      setFormError(c.validationRequired);
      return;
    }
    if (!values.every(Number.isInteger) || values.some((value) => value < 0) || values[0] < 1) {
      setFormError(c.validationNumbers);
      return;
    }
    if (values[1] > values[2]) {
      setFormError(c.validationDelayOrder);
      return;
    }
    let scheduledAt: string | null = null;
    if (form.scheduleDate) {
      const date = new Date(`${form.scheduleDate}T${form.scheduleTime || "00:00"}`);
      if (Number.isNaN(date.getTime())) {
        setFormError(c.validationSchedule);
        return;
      }
      scheduledAt = date.toISOString();
    }
    try {
      if (editingCampaign) {
        const isAdminClonedCampaign = editingCampaign.cloneMode === "admin";
        const updatedCampaign = await updateStatus.mutateAsync({
          campaignId: editingCampaign.id,
          data: {
            name: form.name.trim(),
            ...(isAdminClonedCampaign ? {} : {
              telegramAccountId: form.accountId,
              templateId: form.templateId,
            }),
            destinationIds: form.destinationIds,
            scheduledAt,
            timezone: systemDefaults.data?.defaultTimezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh"),
            repeatCount: values[0],
            roundDelayMinSeconds: values[1],
            roundDelayMaxSeconds: values[2],
          },
        });
        await onSaved(updatedCampaign);
      } else {
        const createdCampaign = await createCampaign.mutateAsync({
          data: {
            name: form.name.trim(),
            content: selectedTemplate?.content ?? "",
            telegramAccountId: form.accountId,
            templateId: form.templateId,
            destinationIds: form.destinationIds,
            scheduledAt,
            timezone: systemDefaults.data?.defaultTimezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh"),
            repeatCount: values[0],
            roundDelayMinSeconds: values[1],
            roundDelayMaxSeconds: values[2],
          },
        });
        await onSaved(createdCampaign);
      }
    } catch (error) {
      setFormError(localizedErrorMessage(error, language, c.genericError));
    }
  }

  return (
    <Modal title={editingCampaign ? c.editTitle : c.modalTitle} onClose={onClose} wide>
      <form className="space-y-5" onSubmit={(event) => void submit(event)}>
        <label className="block">
          <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldName}</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="campaign-name" />
        </label>

        <label className="block">
          <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldAccount}</span>
          <select value={form.accountId} onChange={(event) => changeAccount(event.target.value)} disabled={editingCampaign?.cloneMode === "admin"} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] disabled:bg-[#f8fafc]" data-testid="campaign-account">
            <option value="">{c.fieldAccountPlaceholder}</option>
            {connectedAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}{account.phone ? ` · ${account.phone}` : ""}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldTemplate}</span>
          <select value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })} disabled={!form.accountId || editingCampaign?.cloneMode === "admin"} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] disabled:bg-[#f8fafc]" data-testid="campaign-template">
            <option value="">{c.fieldTemplatePlaceholder}</option>
            {accountTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}{template.mode === "forward" ? " · Forward" : ""}</option>)}
          </select>
          {editingCampaign?.cloneMode === "admin" && <span className="mt-2 block text-[12px] font-medium leading-relaxed text-[#64748b]">{c.cloneFixed}</span>}
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[14px] font-bold text-[#0f172a]">{c.fieldDestinations}</span>
            {form.accountId && (
              <button type="button" onClick={toggleAllDestinations} className="text-[12px] font-extrabold text-[#1d3bb8]">
                {accountDestinations.length && accountDestinations.every((item) => form.destinationIds.includes(item.id)) ? c.deselectAll : c.selectAll}
              </button>
            )}
          </div>
          <div className="rounded-xl border border-[#e2e8f0] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <input value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder={c.searchGroupPlaceholder} className="h-10 w-full rounded-xl border border-[#e2e8f0] pl-9 pr-3 text-[14px] font-medium outline-none focus:border-[#1a2b88]" />
            </div>
            {!form.accountId
              ? <p className="px-1 py-4 text-[13px] font-medium leading-relaxed text-[#64748b]">{c.pickAccountHint}</p>
              : <div className="mt-2 max-h-40 divide-y divide-[#f1f5f9] overflow-y-auto">
                  {accountDestinations.length
                    ? accountDestinations.map((destination) => (
                        <button type="button" key={destination.id} onClick={() => toggleDestination(destination.id)} className="flex w-full items-center gap-3 px-2 py-2.5 text-left">
                          <span className="text-[#1d3bb8]">{form.destinationIds.includes(destination.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-[#cbd5e1]" />}</span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#334155]">{destinationLabel(destination, c.generalTopic)}</span>
                          {destination.kind === "topic" && <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[10px] font-extrabold text-[#c2410c]">{c.topicBadge}</span>}
                           {!destination.canPost && <span className="rounded-full bg-[#fff1f2] px-2 py-0.5 text-[10px] font-extrabold text-[#be123c]">{c.unavailableDestination}</span>}
                        </button>
                      ))
                    : <p className="px-2 py-4 text-[13px] font-medium text-[#64748b]">{c.noGroupsHint}</p>}
                </div>}
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldRepeatCount}</span>
          <span className="mb-2 block text-[12px] font-medium text-[#64748b]">{c.repeatCountHint}</span>
          <input type="number" min="1" max="300" value={form.repeatCount} onChange={(event) => setForm({ ...form, repeatCount: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
        </label>

        <div className="border-t border-[#eef2f6] pt-5">
          <p className="mb-4 text-[13px] font-medium text-[#64748b]">{c.delayBetweenRounds}</p>
          <DelayFields
            form={form}
            setForm={setForm}
            firstLabel={c.delayMinRoundLabel}
            secondLabel={c.delayMaxRoundLabel}
            firstKey="roundDelayMinSeconds"
            secondKey="roundDelayMaxSeconds"
            max={259200}
            maxHint={c.delayMaxHint}
          />
        </div>

        <div>
          <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{c.fieldSchedule}</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="date" value={form.scheduleDate} onChange={(event) => setForm({ ...form, scheduleDate: event.target.value })} className="h-11 rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
            <input type="time" value={form.scheduleTime} onChange={(event) => setForm({ ...form, scheduleTime: event.target.value })} className="h-11 rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
          </div>
        </div>

        {formError && <p className="rounded-xl bg-[#fff1f2] px-3.5 py-3 text-[13px] font-semibold text-[#be123c]">{formError}</p>}

        <PrimaryButton type="submit" disabled={createCampaign.isPending || updateStatus.isPending}>
          {(createCampaign.isPending || updateStatus.isPending) && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {editingCampaign ? c.editButton : c.createButton}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function DelayFields({
  form,
  setForm,
  firstLabel,
  secondLabel,
  firstKey,
  secondKey,
  max,
  maxHint,
}: {
  form: CampaignForm;
  setForm: (form: CampaignForm) => void;
  firstLabel: string;
  secondLabel: string;
  firstKey: "roundDelayMinSeconds";
  secondKey: "roundDelayMaxSeconds";
  max: number;
  maxHint: (max: number) => string;
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-bold text-[#0f172a]">{firstLabel}</span>
        <span className="mb-2 block text-[12px] font-medium text-[#64748b]">{maxHint(max)}</span>
        <input type="number" min="0" max={max} value={form[firstKey]} onChange={(event) => setForm({ ...form, [firstKey]: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-bold text-[#0f172a]">{secondLabel}</span>
        <span className="mb-2 block text-[12px] font-medium text-[#64748b]">{maxHint(max)}</span>
        <input type="number" min="0" max={max} value={form[secondKey]} onChange={(event) => setForm({ ...form, [secondKey]: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" />
      </label>
    </div>
  );
}