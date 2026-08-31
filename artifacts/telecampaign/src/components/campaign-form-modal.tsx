import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CalendarClock,
  CheckSquare,
  LoaderCircle,
  Search,
  Square,
} from "lucide-react";
import type { Campaign, Destination } from "@workspace/api-client-react";
import {
  useCreateCampaign,
  getListDestinationsQueryKey,
  useGetSystemDefaults,
  useListDestinations,
  useListMessageTemplates,
  useListTelegramAccounts,
  useSyncTelegramDestinations,
  useUpdateCampaignStatus,
} from "@workspace/api-client-react";
import { Modal, PrimaryButton } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";
import {
  canChooseRestrictedDestination,
  localScheduleFields,
  scheduleMeetsRestrictionSuggestion,
  suggestedRestrictionSchedule,
  temporaryRestrictionUntil,
} from "@/lib/telegram-restrictions";
import { DESTINATION_SYNC_TTL_MS, destinationSyncIsFresh } from "@/lib/telegram-sync";

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

type DestinationFilter = "all" | "selected" | "available" | "unavailable";

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
    destinationFilterLabel: "Filter",
    destinationFilterAll: "All groups",
    destinationFilterSelected: "Selected in campaign",
    destinationFilterAvailable: "Can post",
    destinationFilterUnavailable: "No posting permission",
    pickAccountHint: "Select a Telegram account to see its groups and posting status.",
    noGroupsHint: "No groups found for this account.",
    unavailableDestination: "No posting permission",
    unavailableDestinationHint: "Telegram posting permission is unavailable for this group.",
    selectedUnavailableWarning: "A selected group no longer has posting permission. Deselect every group marked in red before saving so the campaign can continue with the other groups.",
    syncingDestinations: "Refreshing groups and posting permissions...",
    cachedDestinations: "Groups were synced recently. Showing saved permissions.",
    loadingDestinations: "Loading saved groups...",
    destinationsSynced: (count: number) => `Updated ${count} group${count === 1 ? "" : "s"}.`,
    syncDestinationsFailed: "Groups could not be refreshed. Try again or check the Telegram account.",
    retrySyncDestinations: "Refresh groups",
    temporaryRestrictionHint: (until: string) => `Temporarily restricted until ${until}.`,
    temporaryRestrictionWarning: (count: number, suggestedAt: string) => `${count} selected group${count === 1 ? " is" : "s are"} temporarily restricted. Schedule the campaign for ${suggestedAt} or later.`,
    applySuggestedSchedule: "Use suggested safe time",
    scheduleSafetyHint: "Includes a 5-minute safety buffer and will be checked again by Telegram before sending.",
    validationRestrictionSchedule: (suggestedAt: string) => `Choose a schedule at or after ${suggestedAt} for the temporarily restricted groups.`,
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
    destinationFilterLabel: "Lọc nhóm",
    destinationFilterAll: "Tất cả nhóm",
    destinationFilterSelected: "Nhóm đang chạy",
    destinationFilterAvailable: "Có quyền đăng",
    destinationFilterUnavailable: "Không có quyền đăng",
    pickAccountHint: "Chọn tài khoản Telegram để xem nhóm và trạng thái quyền đăng.",
    noGroupsHint: "Không tìm thấy nhóm nào của tài khoản này.",
    unavailableDestination: "Không có quyền đăng",
    unavailableDestinationHint: "Nhóm này hiện chưa thể nhận tin vì Telegram đã hạn chế quyền đăng.",
    selectedUnavailableWarning: "Có nhóm đang chọn không còn quyền đăng. Hãy bỏ chọn tất cả nhóm có nhãn đỏ trước khi lưu để chiến dịch tiếp tục với các nhóm khác.",
    syncingDestinations: "Đang cập nhật nhóm và quyền đăng...",
    cachedDestinations: "Nhóm đã được đồng bộ gần đây. Đang hiển thị quyền đã lưu.",
    loadingDestinations: "Đang tải các nhóm đã lưu...",
    destinationsSynced: (count: number) => `Đã cập nhật ${count} nhóm.`,
    syncDestinationsFailed: "Không thể cập nhật nhóm. Hãy thử lại hoặc kiểm tra tài khoản Telegram.",
    retrySyncDestinations: "Cập nhật lại nhóm",
    temporaryRestrictionHint: (until: string) => `Telegram tạm hạn chế đến ${until}.`,
    temporaryRestrictionWarning: (count: number, suggestedAt: string) => `${count} nhóm đã chọn đang bị hạn chế tạm thời. Hãy lên lịch từ ${suggestedAt} trở đi.`,
    applySuggestedSchedule: "Dùng thời gian an toàn đề xuất",
    scheduleSafetyHint: "Đã cộng thêm 5 phút an toàn và Telegram sẽ được kiểm tra lại trước khi gửi.",
    validationRestrictionSchedule: (suggestedAt: string) => `Hãy chọn lịch từ ${suggestedAt} trở đi cho các nhóm đang bị hạn chế tạm thời.`,
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
  const destinations = useListDestinations({
    query: {
      queryKey: getListDestinationsQueryKey(),
      staleTime: DESTINATION_SYNC_TTL_MS,
    },
  });
  const templates = useListMessageTemplates();
  const systemDefaults = useGetSystemDefaults();
  const createCampaign = useCreateCampaign();
  const syncDestinations = useSyncTelegramDestinations();
  const updateStatus = useUpdateCampaignStatus();
  const [form, setForm] = useState<CampaignForm>(() => initialForm(editingCampaign, prefill));
  const [groupSearch, setGroupSearch] = useState("");
  const [destinationFilter, setDestinationFilter] = useState<DestinationFilter>("all");
  const [formError, setFormError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const syncedAccounts = useRef(new Set<string>());
  const activeAccountId = useRef(form.accountId);
  activeAccountId.current = form.accountId;

  const connectedAccounts = (accounts.data ?? []).filter((account) => account.status === "connected");
  const accountDestinations = useMemo(() => {
    const needle = groupSearch.trim().toLowerCase();
    return (destinations.data ?? [])
      .filter((destination) =>
        destination.accountId === form.accountId
        && (
          destinationFilter === "all"
          || (destinationFilter === "selected" && form.destinationIds.includes(destination.id))
          || (destinationFilter === "available" && destination.canPost)
          || (destinationFilter === "unavailable" && !destination.canPost)
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
    form.accountId,
    form.destinationIds,
    destinationFilter,
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
  const selectedDestinations = (destinations.data ?? []).filter((destination) =>
    destination.accountId === form.accountId
    && form.destinationIds.includes(destination.id),
  );
  const selectedTemporaryDestinations = selectedDestinations.filter((destination) =>
    temporaryRestrictionUntil(destination) !== null,
  );
  const suggestedScheduleAt = suggestedRestrictionSchedule(selectedTemporaryDestinations);
  const hasSelectedUnavailableDestination = selectedDestinations.some((destination) =>
    destination.accountId === form.accountId
    && !destination.canPost
    && temporaryRestrictionUntil(destination) === null,
  );
  const formatRestrictionTime = (value: Date) => new Intl.DateTimeFormat(
    language === "vi" ? "vi-VN" : "en-US",
    { dateStyle: "short", timeStyle: "short" },
  ).format(value);

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

  useEffect(() => {
    const accountId = form.accountId;
    if (!accountId || syncedAccounts.current.has(accountId) || syncDestinations.isPending) return;

    syncedAccounts.current.add(accountId);
    setSyncMessage(null);
    setSyncError(false);
    const selectedAccount = (accounts.data ?? []).find((account) => account.id === accountId);
    if (destinationSyncIsFresh(selectedAccount?.lastSyncAt)) {
      setSyncMessage(c.cachedDestinations);
      return;
    }
    syncDestinations.mutate({ accountId }, {
      onSuccess: async (result) => {
        if (activeAccountId.current !== accountId) return;
        try {
          await destinations.refetch();
          if (activeAccountId.current !== accountId) return;
          setSyncMessage(c.destinationsSynced(result.count));
        } catch (error) {
          setSyncError(true);
          setSyncMessage(localizedErrorMessage(error, language, c.syncDestinationsFailed));
        }
      },
      onError: (error) => {
        if (activeAccountId.current !== accountId) return;
        setSyncError(true);
        setSyncMessage(localizedErrorMessage(error, language, c.syncDestinationsFailed));
      },
    });
  }, [accounts.data, c, destinations, form.accountId, language, syncDestinations, syncDestinations.isPending]);

  function changeAccount(accountId: string) {
    setForm((current) => ({ ...current, accountId, templateId: "", destinationIds: [] }));
    setSyncMessage(null);
    setSyncError(false);
  }

  function retryDestinationSync() {
    const accountId = form.accountId;
    if (!accountId || syncDestinations.isPending) return;
    setSyncMessage(null);
    setSyncError(false);
    syncDestinations.mutate({ accountId }, {
      onSuccess: async (result) => {
        if (activeAccountId.current !== accountId) return;
        try {
          await destinations.refetch();
          if (activeAccountId.current !== accountId) return;
          setSyncMessage(c.destinationsSynced(result.count));
        } catch (error) {
          setSyncError(true);
          setSyncMessage(localizedErrorMessage(error, language, c.syncDestinationsFailed));
        }
      },
      onError: (error) => {
        if (activeAccountId.current !== accountId) return;
        setSyncError(true);
        setSyncMessage(localizedErrorMessage(error, language, c.syncDestinationsFailed));
      },
    });
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
    const selectableIds = accountDestinations
      .filter((destination) => destination.canPost)
      .map((destination) => destination.id);
    const allSelectableSelected = selectableIds.length > 0 && selectableIds.every((id) => form.destinationIds.includes(id));
    setForm((current) => ({
      ...current,
      destinationIds: allSelectableSelected
        ? current.destinationIds.filter((id) => !selectableIds.includes(id))
        : [...new Set([...current.destinationIds, ...selectableIds])],
    }));
  }

  function applySuggestedRestrictionSchedule() {
    if (!suggestedScheduleAt) return;
    const fields = localScheduleFields(suggestedScheduleAt);
    setForm((current) => ({
      ...current,
      scheduleDate: fields.date,
      scheduleTime: fields.time,
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
    if (!scheduleMeetsRestrictionSuggestion(
      scheduledAt ? new Date(scheduledAt) : null,
      suggestedScheduleAt,
    )) {
      setFormError(c.validationRestrictionSchedule(formatRestrictionTime(suggestedScheduleAt!)));
      return;
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
             {(syncDestinations.isPending || syncMessage) && (
               <div
                 className={`mb-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold leading-relaxed ${
                   syncError ? "border border-[#fecdd3] bg-[#fff1f2] text-[#9f1239]" : "border border-[#dbeafe] bg-[#eff6ff] text-[#1e40af]"
                 }`}
                 role="status"
                 aria-live="polite"
                 data-testid="campaign-destination-sync-status"
               >
                 <span className="flex min-w-0 items-center gap-2">
                   {syncDestinations.isPending && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />}
                   <span>{syncDestinations.isPending ? c.syncingDestinations : syncMessage}</span>
                 </span>
                 {syncError && !syncDestinations.isPending && (
                   <button type="button" onClick={retryDestinationSync} className="shrink-0 font-extrabold underline underline-offset-2">
                     {c.retrySyncDestinations}
                   </button>
                 )}
                  {!syncError && !syncDestinations.isPending && (
                    <button type="button" onClick={retryDestinationSync} className="shrink-0 font-extrabold underline underline-offset-2">
                      {c.retrySyncDestinations}
                    </button>
                  )}
               </div>
             )}
            {hasSelectedUnavailableDestination && (
              <div className="mb-3 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-3 py-2.5 text-[12px] font-bold leading-relaxed text-[#9f1239]">
                {c.selectedUnavailableWarning}
              </div>
            )}
            {suggestedScheduleAt && (
              <div className="mb-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-3 text-[#92400e]" data-testid="campaign-restriction-suggestion">
                <p className="text-[12px] font-bold leading-relaxed">
                  {c.temporaryRestrictionWarning(selectedTemporaryDestinations.length, formatRestrictionTime(suggestedScheduleAt))}
                </p>
                <button type="button" onClick={applySuggestedRestrictionSchedule} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#f59e0b] px-3 py-2 text-[11px] font-extrabold text-white" data-testid="campaign-apply-restriction-schedule">
                  <CalendarClock className="h-3.5 w-3.5" />{c.applySuggestedSchedule}
                </button>
                <p className="mt-2 text-[10px] font-semibold leading-relaxed text-[#a16207]">{c.scheduleSafetyHint}</p>
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <input value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder={c.searchGroupPlaceholder} className="h-10 w-full rounded-xl border border-[#e2e8f0] pl-9 pr-3 text-[14px] font-medium outline-none focus:border-[#1a2b88]" />
            </div>
            {form.accountId && (
              <div className="mt-2 flex items-center gap-2">
                <label htmlFor="campaign-destination-filter" className="shrink-0 text-[11px] font-extrabold text-[#64748b]">
                  {c.destinationFilterLabel}
                </label>
                <select
                  id="campaign-destination-filter"
                  value={destinationFilter}
                  onChange={(event) => setDestinationFilter(event.target.value as DestinationFilter)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[#e2e8f0] bg-white px-2.5 text-[12px] font-bold text-[#334155] outline-none focus:border-[#1a2b88]"
                >
                  <option value="all">{c.destinationFilterAll}</option>
                  <option value="selected">{c.destinationFilterSelected}</option>
                  <option value="available">{c.destinationFilterAvailable}</option>
                  <option value="unavailable">{c.destinationFilterUnavailable}</option>
                </select>
              </div>
            )}
            {!form.accountId
              ? <p className="px-1 py-4 text-[13px] font-medium leading-relaxed text-[#64748b]">{c.pickAccountHint}</p>
                     : <div className="mt-2 max-h-40 divide-y divide-[#f1f5f9] overflow-y-auto">
                  {accountDestinations.length
                    ? accountDestinations.map((destination) => (
                         <button
                           type="button"
                           key={destination.id}
                           onClick={() => toggleDestination(destination.id)}
                            disabled={!canChooseRestrictedDestination(destination) && !form.destinationIds.includes(destination.id)}
                           className="flex w-full items-center gap-3 px-2 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-75"
                         >
                           <span className="text-[#1d3bb8]">{form.destinationIds.includes(destination.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-[#cbd5e1]" />}</span>
                           <span className="min-w-0 flex-1">
                             <span className="block truncate text-[13px] font-bold text-[#334155]">{destinationLabel(destination, c.generalTopic)}</span>
                              {!destination.canPost && (
                               <span className="mt-0.5 block text-[10px] font-semibold leading-snug text-[#be123c]">
                                  {temporaryRestrictionUntil(destination)
                                    ? c.temporaryRestrictionHint(formatRestrictionTime(new Date(destination.restrictedUntil!)))
                                    : c.unavailableDestinationHint}
                               </span>
                             )}
                           </span>
                          {destination.kind === "topic" && <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[10px] font-extrabold text-[#c2410c]">{c.topicBadge}</span>}
                           {!destination.canPost && (
                             <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${temporaryRestrictionUntil(destination) ? "bg-[#fffbeb] text-[#a16207]" : "bg-[#fff1f2] text-[#be123c]"}`}
                               title={c.unavailableDestinationHint}
                             >
                                {temporaryRestrictionUntil(destination) ? formatRestrictionTime(new Date(destination.restrictedUntil!)) : c.unavailableDestination}
                             </span>
                           )}
                        </button>
                      ))
                     : <p className="px-2 py-4 text-[13px] font-medium text-[#64748b]">
                         {syncDestinations.isPending ? c.loadingDestinations : c.noGroupsHint}
                       </p>}
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