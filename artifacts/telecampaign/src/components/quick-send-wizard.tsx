import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronRight,
  Clock3,
  FileText,
  Forward,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Users,
  X,
} from "lucide-react";
import type { Destination } from "@workspace/api-client-react";
import {
  useCreateCampaign,
  useCreateMessageTemplate,
  getGetGroupLibraryQueryKey,
  getListDestinationsQueryKey,
  useGetGroupLibrary,
  useGetGroupLibraryAccess,
  useGetSystemDefaults,
  useListDestinations,
  useListTelegramAccounts,
  useListTelegramSavedMessages,
  useSyncTelegramDestinations,
} from "@workspace/api-client-react";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";
import {
  canChooseRestrictedDestination,
  localScheduleFields,
  scheduleMeetsRestrictionSuggestion,
  suggestedRestrictionSchedule,
  temporaryRestrictionUntil,
} from "@/lib/telegram-restrictions";
import { DESTINATION_SYNC_TTL_MS, destinationSyncIsFresh } from "@/lib/telegram-sync";
import {
  GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT,
  filterDestinationsForAccount,
  getLibraryGroupStatus,
  splitGroupLibrary,
} from "@/lib/quick-send-groups";
import { useLocation } from "wouter";

type QuickSendWizardProps = {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

type SendMode = "text" | "forward";
type ScheduleMode = "now" | "later";
type QuickSendDraft = {
  accountId: string;
  destinationIds: string[];
  mode: SendMode;
  content: string;
  sourceMessageId: string;
  campaignName: string;
  scheduleMode: ScheduleMode;
  scheduleDate: string;
  scheduleTime: string;
  repeatCount: string;
  delayMin: string;
  delayMax: string;
};

const QUICK_SEND_DRAFT_KEY = "telecampaign.quick-send-draft";
function readQuickSendDraft(): QuickSendDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(QUICK_SEND_DRAFT_KEY) ?? "null") as Partial<QuickSendDraft> | null;
    if (!value || typeof value !== "object") return null;
    return {
      accountId: typeof value.accountId === "string" ? value.accountId : "",
      destinationIds: Array.isArray(value.destinationIds) ? value.destinationIds.filter((id): id is string => typeof id === "string") : [],
      mode: value.mode === "forward" ? "forward" : "text",
      content: typeof value.content === "string" ? value.content : "",
      sourceMessageId: typeof value.sourceMessageId === "string" ? value.sourceMessageId : "",
      campaignName: typeof value.campaignName === "string" ? value.campaignName : "",
      scheduleMode: value.scheduleMode === "later" ? "later" : "now",
      scheduleDate: typeof value.scheduleDate === "string" ? value.scheduleDate : "",
      scheduleTime: typeof value.scheduleTime === "string" ? value.scheduleTime : "",
      repeatCount: typeof value.repeatCount === "string" ? value.repeatCount : "1",
      delayMin: typeof value.delayMin === "string" ? value.delayMin : "1",
      delayMax: typeof value.delayMax === "string" ? value.delayMax : "3",
    };
  } catch {
    return null;
  }
}

const copy = {
  vi: {
    eyebrow: "Gửi nhanh",
    title: "Tạo chiến dịch đầu tiên",
    description: "Chỉ 3 bước. Các mẫu tin và cài đặt kỹ thuật sẽ được tạo tự động phía sau.",
    close: "Đóng",
    stepAccount: "Tài khoản & nhóm",
    stepMessage: "Nội dung",
    stepReview: "Xem lại",
    accountTitle: "Bạn muốn gửi bằng tài khoản nào?",
    accountHint: "Nhóm sẽ được đồng bộ tự động sau khi chọn tài khoản.",
    accountPlaceholder: "Chọn tài khoản đã kết nối",
    noAccountTitle: "Chưa có tài khoản Telegram đã kết nối",
    noAccountDetail: "Kết nối tài khoản Telegram trước, sau đó quay lại đây để gửi chiến dịch đầu tiên.",
    connectAccount: "Kết nối tài khoản",
    syncing: "Đang tự động đồng bộ nhóm...",
    cachedSync: "Nhóm đã được đồng bộ gần đây. Đang hiển thị nhóm đã lưu.",
    loadingGroups: "Đang tải các nhóm đã lưu...",
    syncAgain: "Đồng bộ tài khoản",
    syncDone: (count: number) => `Đã cập nhật ${count} nhóm`,
    syncFailed: "Không thể đồng bộ nhóm. Bạn có thể thử lại hoặc kiểm tra tài khoản Telegram.",
    groupsTitle: "Chọn nhóm gửi",
    yourGroups: "Nhóm của bạn",
    yourGroupsDetail: "Các nhóm được đồng bộ từ tài khoản Telegram đang chọn.",
    libraryTitle: "Thư viện nhóm",
    libraryDetail: "Gợi ý thêm nhóm để tham gia và gửi chiến dịch.",
    libraryLoading: "Đang tải thư viện nhóm...",
    libraryUnavailable: "Chưa thể tải thư viện nhóm.",
    libraryEmpty: "Thư viện nhóm hiện chưa có nhóm.",
    afterJoinHint: "Sau khi tham gia nhóm, hãy nhấn “Đồng bộ tài khoản” để cập nhật trạng thái.",
    openGroup: "Tham gia nhóm",
    trial: "Trial",
    lockedTitle: (count: number) => `${count} nhóm khác đang được che`,
    lockedDetail: "Kích hoạt key hợp lệ để xem đầy đủ thư viện nhóm và mở link tham gia.",
    buyKey: "Mua / kích hoạt key",
    members: "thành viên",
    groupJoined: "Đã tham gia · Có thể gửi",
    groupReview: "Đã tham gia · cần đồng bộ lại",
    groupNotJoined: "Chưa tham gia / chưa đồng bộ",
    searchGroups: "Tìm nhóm...",
    selectAll: "Chọn tất cả",
    deselectAll: "Bỏ chọn tất cả",
    noGroups: "Chưa có nhóm được phép gửi. Hãy đồng bộ lại tài khoản.",
    temporaryRestrictionHint: (until: string) => `Tạm hạn chế đến ${until}`,
    temporaryRestrictionWarning: (count: number, suggestedAt: string) => `${count} nhóm đã chọn đang bị hạn chế tạm thời. Hãy xác nhận lịch chạy từ ${suggestedAt}.`,
    applySuggestedSchedule: "Dùng thời gian an toàn đề xuất",
    restrictionSafetyHint: "Đã cộng 5 phút an toàn; worker sẽ kiểm tra lại quyền đăng trước khi gửi.",
    validationRestrictionSchedule: (suggestedAt: string) => `Hãy lên lịch từ ${suggestedAt} trở đi cho nhóm đang bị hạn chế.`,
    selectedGroups: (count: number) => `${count} nhóm được chọn`,
    next: "Tiếp tục",
    back: "Quay lại",
    messageTitle: "Bạn muốn gửi nội dung gì?",
    messageHint: "Không cần tạo mẫu tin riêng — hệ thống sẽ lưu lại tự động khi bạn bắt đầu.",
    textMode: "Nhập tin nhắn",
    forwardMode: "Forward tin đã lưu",
    textLabel: "Nội dung tin nhắn",
    textPlaceholder: "Nhập nội dung bạn muốn gửi...",
    savedLabel: "Chọn tin trong Tin nhắn đã lưu",
    savedPlaceholder: "Chọn một tin nhắn đã lưu",
    savedLoading: "Đang tải tin nhắn...",
    savedEmpty: "Không tìm thấy tin nhắn đã lưu.",
    mediaMessage: "Tin nhắn có media",
    reviewTitle: "Sẵn sàng để bắt đầu?",
    reviewHint: "Kiểm tra nhanh lần cuối trước khi tạo và chạy chiến dịch.",
    campaignName: "Tên chiến dịch",
    campaignNamePlaceholder: "Ví dụ: Gửi thông báo tháng 9",
    sendTiming: "Thời điểm gửi",
    sendNow: "Gửi ngay",
    schedule: "Lên lịch",
    date: "Ngày",
    time: "Giờ",
    advanced: "Cài đặt thêm",
    repeat: "Số vòng",
    delay: "Delay giữa các vòng",
    seconds: "giây",
    defaultSafe: "Mặc định an toàn",
    run: "Tạo & bắt đầu gửi",
    creating: "Đang chuẩn bị chiến dịch...",
    createdTitle: "Đã tạo chiến dịch",
    createdDetail: "Chiến dịch đã được tạo và sẽ bắt đầu theo lựa chọn của bạn.",
    viewCampaigns: "Xem chiến dịch",
    done: "Hoàn tất",
    validationAccount: "Hãy chọn tài khoản Telegram.",
    validationGroups: "Hãy chọn ít nhất một nhóm gửi.",
    validationMessage: "Hãy nhập nội dung tin nhắn.",
    validationSaved: "Hãy chọn một tin nhắn đã lưu.",
    validationName: "Hãy nhập tên chiến dịch.",
    validationSchedule: "Hãy chọn ngày và giờ lên lịch hợp lệ.",
    errorFallback: "Không thể hoàn tất thao tác. Vui lòng thử lại.",
  },
  en: {
    eyebrow: "Quick send",
    title: "Create your first campaign",
    description: "Just 3 steps. Templates and technical settings are created automatically in the background.",
    close: "Close",
    stepAccount: "Account & groups",
    stepMessage: "Message",
    stepReview: "Review",
    accountTitle: "Which account should send this?",
    accountHint: "Groups sync automatically after you choose an account.",
    accountPlaceholder: "Choose a connected account",
    noAccountTitle: "No connected Telegram account",
    noAccountDetail: "Connect a Telegram account first, then come back here to send your first campaign.",
    connectAccount: "Connect account",
    syncing: "Automatically syncing groups...",
    cachedSync: "Groups were synced recently. Showing saved groups.",
    loadingGroups: "Loading saved groups...",
    syncAgain: "Sync account",
    syncDone: (count: number) => `Updated ${count} groups`,
    syncFailed: "Groups could not be synced. Try again or check the Telegram account.",
    groupsTitle: "Choose destination groups",
    yourGroups: "Your groups",
    yourGroupsDetail: "Groups synchronized from the selected Telegram account.",
    libraryTitle: "Group library",
    libraryDetail: "Discover more groups to join and send campaigns to.",
    libraryLoading: "Loading group library...",
    libraryUnavailable: "The group library could not be loaded.",
    libraryEmpty: "There are no groups in the library yet.",
    afterJoinHint: "After joining a group, press “Sync account” to refresh its status.",
    openGroup: "Join group",
    trial: "Trial",
    lockedTitle: (count: number) => `${count} more groups are hidden`,
    lockedDetail: "Activate a valid key to see the full group library and open join links.",
    buyKey: "Buy / activate key",
    members: "members",
    groupJoined: "Joined · Ready to send",
    groupReview: "Joined · sync again to confirm",
    groupNotJoined: "Not joined / not synchronized",
    searchGroups: "Search groups...",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    noGroups: "No groups with posting permission yet. Sync the account again.",
    temporaryRestrictionHint: (until: string) => `Temporarily restricted until ${until}`,
    temporaryRestrictionWarning: (count: number, suggestedAt: string) => `${count} selected group${count === 1 ? " is" : "s are"} temporarily restricted. Confirm a schedule at or after ${suggestedAt}.`,
    applySuggestedSchedule: "Use suggested safe time",
    restrictionSafetyHint: "Includes a 5-minute safety buffer; the worker checks posting permission again before sending.",
    validationRestrictionSchedule: (suggestedAt: string) => `Schedule the campaign at or after ${suggestedAt} for the restricted group.`,
    selectedGroups: (count: number) => `${count} group${count === 1 ? "" : "s"} selected`,
    next: "Continue",
    back: "Back",
    messageTitle: "What would you like to send?",
    messageHint: "No need to create a separate template — it will be saved automatically when you start.",
    textMode: "Enter a message",
    forwardMode: "Forward saved message",
    textLabel: "Message content",
    textPlaceholder: "Enter the message you want to send...",
    savedLabel: "Choose from Saved Messages",
    savedPlaceholder: "Choose a saved message",
    savedLoading: "Loading messages...",
    savedEmpty: "No saved messages found.",
    mediaMessage: "Message with media",
    reviewTitle: "Ready to start?",
    reviewHint: "Take one last look before the campaign is created and queued.",
    campaignName: "Campaign name",
    campaignNamePlaceholder: "For example: September announcement",
    sendTiming: "When to send",
    sendNow: "Send now",
    schedule: "Schedule",
    date: "Date",
    time: "Time",
    advanced: "More settings",
    repeat: "Rounds",
    delay: "Delay between rounds",
    seconds: "seconds",
    defaultSafe: "Safe default",
    run: "Create & start sending",
    creating: "Preparing campaign...",
    createdTitle: "Campaign created",
    createdDetail: "Your campaign is ready and will start according to your choice.",
    viewCampaigns: "View campaigns",
    done: "Done",
    validationAccount: "Choose a Telegram account.",
    validationGroups: "Choose at least one destination group.",
    validationMessage: "Enter a message.",
    validationSaved: "Choose a saved message.",
    validationName: "Enter a campaign name.",
    validationSchedule: "Choose a valid schedule date and time.",
    errorFallback: "Could not complete the operation. Please try again.",
  },
} as const;

function destinationLabel(destination: Destination, generalTopic: string) {
  if (destination.kind === "topic") return `${destination.parentTitle ?? "Telegram"} › ${destination.title}`;
  if (destination.kind === "forum") return `${destination.title} › ${generalTopic}`;
  return destination.title;
}

export function QuickSendWizard({ onClose, onCreated }: QuickSendWizardProps) {
  const { language } = useLanguage();
  const c = copy[language];
  const initialDraft = useRef(readQuickSendDraft());
  const accounts = useListTelegramAccounts();
  const destinations = useListDestinations({
    query: {
      queryKey: getListDestinationsQueryKey(),
      staleTime: DESTINATION_SYNC_TTL_MS,
    },
  });
  const systemDefaults = useGetSystemDefaults();
  const sync = useSyncTelegramDestinations();
  const groupLibraryAccess = useGetGroupLibraryAccess();
  const groupLibrary = useGetGroupLibrary({
    query: {
      queryKey: getGetGroupLibraryQueryKey(),
      enabled: groupLibraryAccess.data?.canView === true,
      refetchOnWindowFocus: true,
    },
  });
  const createTemplate = useCreateMessageTemplate();
  const createCampaign = useCreateCampaign();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState(initialDraft.current?.accountId ?? "");
  const [destinationIds, setDestinationIds] = useState<string[]>(initialDraft.current?.destinationIds ?? []);
  const [groupSearch, setGroupSearch] = useState("");
  const [mode, setMode] = useState<SendMode>(initialDraft.current?.mode ?? "text");
  const [content, setContent] = useState(initialDraft.current?.content ?? "");
  const [sourceMessageId, setSourceMessageId] = useState(initialDraft.current?.sourceMessageId ?? "");
  const [campaignName, setCampaignName] = useState(initialDraft.current?.campaignName ?? "");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(initialDraft.current?.scheduleMode ?? "now");
  const [scheduleDate, setScheduleDate] = useState(initialDraft.current?.scheduleDate ?? "");
  const [scheduleTime, setScheduleTime] = useState(initialDraft.current?.scheduleTime ?? "");
  const [repeatCount, setRepeatCount] = useState(initialDraft.current?.repeatCount ?? "1");
  const [delayMin, setDelayMin] = useState(initialDraft.current?.delayMin ?? "1");
  const [delayMax, setDelayMax] = useState(initialDraft.current?.delayMax ?? "3");
  const [formError, setFormError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [completed, setCompleted] = useState(false);
  const syncedAccounts = useRef(new Set<string>());
  const activeAccountId = useRef(accountId);
  activeAccountId.current = accountId;

  const connectedAccounts = (accounts.data ?? []).filter((account) => account.status === "connected");
  const selectedAccount = connectedAccounts.find((account) => account.id === accountId);
  const accountSavedMessages = useListTelegramSavedMessages(accountId, {
    query: { enabled: Boolean(accountId && mode === "forward") } as any,
  });

  const accountDestinations = useMemo(() => {
    return filterDestinationsForAccount(
      (destinations.data ?? []).filter((destination) => canChooseRestrictedDestination(destination)),
      accountId,
      groupSearch,
    )
      .sort((left, right) => left.title.localeCompare(right.title, language === "vi" ? "vi" : "en"));
  }, [accountId, destinations.data, groupSearch, language]);
  const libraryGroups = groupLibrary.data?.groups ?? [];
  const canOpenLibraryLinks = groupLibraryAccess.data?.canOpenLinks === true;
  const { visibleGroups: visibleLibraryGroups, hiddenCount: hiddenLibraryGroupCount } =
    splitGroupLibrary(libraryGroups, canOpenLibraryLinks);
  const postableDestinationIds = useMemo(
    () => new Set((destinations.data ?? []).filter((destination) => destination.accountId === accountId && destination.canPost).map((destination) => destination.id)),
    [accountId, destinations.data],
  );

  const selectedDestinations = (destinations.data ?? []).filter((destination) => destinationIds.includes(destination.id));
  const selectedTemporaryDestinations = selectedDestinations.filter((destination) =>
    temporaryRestrictionUntil(destination) !== null,
  );
  const suggestedScheduleAt = suggestedRestrictionSchedule(selectedTemporaryDestinations);
  const formatRestrictionTime = (value: Date) => new Intl.DateTimeFormat(
    language === "vi" ? "vi-VN" : "en-US",
    { dateStyle: "short", timeStyle: "short" },
  ).format(value);
  const selectedMessage = (accountSavedMessages.data ?? []).find((message) => message.id === sourceMessageId);
  const allVisibleSelected = accountDestinations.length > 0 && accountDestinations.every((item) => destinationIds.includes(item.id));
  const isCreating = createTemplate.isPending || createCampaign.isPending;

  useEffect(() => {
    if (!accountId && connectedAccounts[0]) setAccountId(connectedAccounts[0].id);
  }, [accountId, connectedAccounts]);

  useEffect(() => {
    if (completed || typeof window === "undefined") return;
    const draft: QuickSendDraft = {
      accountId,
      destinationIds,
      mode,
      content,
      sourceMessageId,
      campaignName,
      scheduleMode,
      scheduleDate,
      scheduleTime,
      repeatCount,
      delayMin,
      delayMax,
    };
    window.localStorage.setItem(QUICK_SEND_DRAFT_KEY, JSON.stringify(draft));
  }, [
    accountId,
    campaignName,
    completed,
    content,
    delayMax,
    delayMin,
    destinationIds,
    mode,
    repeatCount,
    scheduleDate,
    scheduleMode,
    scheduleTime,
    sourceMessageId,
  ]);

  useEffect(() => {
    if (step !== 3 || campaignName.trim()) return;
    const date = new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
    setCampaignName(`${language === "vi" ? "Chiến dịch nhanh" : "Quick campaign"} ${date}`);
  }, [campaignName, language, step]);

  useEffect(() => {
    const defaults = systemDefaults.data?.campaignDefaults;
    if (!defaults) return;
    setDelayMin((current) => current === "1" ? String(defaults.roundDelayMinSeconds) : current);
    setDelayMax((current) => current === "3" ? String(defaults.roundDelayMaxSeconds) : current);
  }, [systemDefaults.data]);

  useEffect(() => {
    if (!accountId || syncedAccounts.current.has(accountId)) return;
    syncedAccounts.current.add(accountId);
    setSyncMessage(null);
    setSyncError(false);
    if (destinationSyncIsFresh(selectedAccount?.lastSyncAt)) {
      setSyncMessage(c.cachedSync);
      return;
    }
    sync.mutate({ accountId }, {
      onSuccess: async (result) => {
        if (activeAccountId.current !== accountId) return;
        await destinations.refetch();
        if (activeAccountId.current !== accountId) return;
        setSyncMessage(c.syncDone(result.count));
      },
      onError: () => {
        if (activeAccountId.current !== accountId) return;
        setSyncError(true);
        setSyncMessage(c.syncFailed);
      },
    });
  }, [accountId, c, destinations, selectedAccount?.lastSyncAt, sync]);

  function chooseAccount(nextAccountId: string) {
    setAccountId(nextAccountId);
    setDestinationIds([]);
    setSourceMessageId("");
    setGroupSearch("");
    setSyncMessage(null);
    setSyncError(false);
  }

  function syncAccount() {
    if (!accountId || sync.isPending) return;
    setSyncMessage(null);
    setSyncError(false);
    sync.mutate({ accountId }, {
      onSuccess: async (result) => {
        if (activeAccountId.current !== accountId) return;
        await destinations.refetch();
        if (activeAccountId.current !== accountId) return;
        setSyncMessage(c.syncDone(result.count));
      },
      onError: () => {
        if (activeAccountId.current !== accountId) return;
        setSyncError(true);
        setSyncMessage(c.syncFailed);
      },
    });
  }

  function toggleDestination(destinationId: string) {
    setDestinationIds((current) => current.includes(destinationId)
      ? current.filter((id) => id !== destinationId)
      : [...current, destinationId]);
  }

  function toggleAllDestinations() {
    setDestinationIds((current) => allVisibleSelected
      ? current.filter((id) => !accountDestinations.some((item) => item.id === id))
      : [...new Set([...current, ...accountDestinations.map((item) => item.id)])]);
  }

  function applySuggestedRestrictionSchedule() {
    if (!suggestedScheduleAt) return;
    const fields = localScheduleFields(suggestedScheduleAt);
    setScheduleMode("later");
    setScheduleDate(fields.date);
    setScheduleTime(fields.time);
    setFormError(null);
  }

  function nextStep() {
    setFormError(null);
    if (step === 1) {
      if (!accountId) return setFormError(c.validationAccount);
      if (!destinationIds.length) return setFormError(c.validationGroups);
    }
    if (step === 2) {
      if (mode === "text" && !content.trim()) return setFormError(c.validationMessage);
      if (mode === "forward" && !sourceMessageId) return setFormError(c.validationSaved);
    }
    setStep((current) => Math.min(3, current + 1));
  }

  function previousStep() {
    setFormError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  async function submit() {
    setFormError(null);
    if (!campaignName.trim()) return setFormError(c.validationName);
    let scheduledAt: string | null = null;
    if (scheduleMode === "later") {
      const date = new Date(`${scheduleDate}T${scheduleTime || "00:00"}`);
      if (!scheduleDate || Number.isNaN(date.getTime())) return setFormError(c.validationSchedule);
      scheduledAt = date.toISOString();
    }
    if (!scheduleMeetsRestrictionSuggestion(
      scheduledAt ? new Date(scheduledAt) : null,
      suggestedScheduleAt,
    )) {
      return setFormError(c.validationRestrictionSchedule(formatRestrictionTime(suggestedScheduleAt!)));
    }
    const numericValues = [Number(repeatCount), Number(delayMin), Number(delayMax)];
    if (!Number.isInteger(numericValues[0]) || numericValues[0] < 1
      || !Number.isInteger(numericValues[1]) || numericValues[1] < 0
      || !Number.isInteger(numericValues[2]) || numericValues[2] < numericValues[1]) {
      return setFormError(c.errorFallback);
    }

    try {
      const template = await createTemplate.mutateAsync({
        data: {
          name: campaignName.trim(),
          mode,
          content: mode === "text" ? content.trim() : selectedMessage?.text ?? "",
          sourceAccountId: mode === "forward" ? accountId : null,
          sourceMessageId: mode === "forward" ? sourceMessageId : null,
        },
      });
      await createCampaign.mutateAsync({
        data: {
          name: campaignName.trim(),
          content: template.content,
          telegramAccountId: accountId,
          templateId: template.id,
          destinationIds,
          scheduledAt,
          timezone: systemDefaults.data?.defaultTimezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh"),
          repeatCount: numericValues[0],
          roundDelayMinSeconds: numericValues[1],
          roundDelayMaxSeconds: numericValues[2],
        },
      });
      window.localStorage.removeItem(QUICK_SEND_DRAFT_KEY);
      await onCreated();
      setCompleted(true);
    } catch (error) {
      setFormError(localizedErrorMessage(error, language, c.errorFallback));
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0f172a]/45 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-[#dbe5f0] bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#eef2f6] bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_68%)] px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8efff] text-[#1d3bb8]"><Sparkles className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#1d3bb8]">{c.eyebrow}</p>
              <h2 className="text-[21px] font-extrabold tracking-tight text-[#0f172a] sm:text-[24px]">{c.title}</h2>
              <p className="mt-1.5 max-w-xl text-[13px] font-medium leading-relaxed text-[#64748b]">{c.description}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a]" aria-label={c.close} data-testid="quick-send-close">
            <X className="h-5 w-5" />
          </button>
        </header>

        {!completed && (
          <div className="border-b border-[#eef2f6] px-5 py-4 sm:px-8">
            <div className="flex items-center gap-2 sm:gap-3">
              {[c.stepAccount, c.stepMessage, c.stepReview].map((label, index) => {
                const itemStep = index + 1;
                const active = step === itemStep;
                const finished = step > itemStep;
                return (
                  <div key={label} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${finished ? "bg-[#dff8ed] text-[#059669]" : active ? "bg-[#1d3bb8] text-white" : "bg-[#f1f5f9] text-[#94a3b8]"}`}>
                      {finished ? <Check className="h-4 w-4" /> : itemStep}
                    </span>
                    <span className={`hidden truncate text-[12px] font-extrabold sm:block ${active ? "text-[#1d3bb8]" : "text-[#64748b]"}`}>{label}</span>
                    {index < 2 && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-[#cbd5e1]" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
          {completed ? (
            <div className="flex min-h-[330px] flex-col items-center justify-center text-center">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-[#dff8ed] text-[#059669]"><Check className="h-10 w-10" strokeWidth={2.5} /></span>
              <h3 className="mt-6 text-[22px] font-extrabold tracking-tight text-[#0f172a]">{c.createdTitle}</h3>
              <p className="mt-2 max-w-sm text-[14px] font-medium leading-relaxed text-[#64748b]">{c.createdDetail}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-2xl bg-[#1a2b88] px-5 py-3 text-[14px] font-extrabold text-white transition hover:bg-[#152473]" data-testid="quick-send-done">
                  {c.done}<ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {step === 1 && (
                <section className="space-y-6" data-testid="quick-send-step-account">
                  <div>
                    <h3 className="text-[19px] font-extrabold tracking-tight text-[#0f172a]">{c.accountTitle}</h3>
                    <p className="mt-1.5 text-[13px] font-medium text-[#64748b]">{c.accountHint}</p>
                  </div>
                  {connectedAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-5 py-8 text-center">
                      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8efff] text-[#1d3bb8]"><Users className="h-6 w-6" /></span>
                      <h4 className="mt-4 text-[15px] font-extrabold text-[#0f172a]">{c.noAccountTitle}</h4>
                      <p className="mx-auto mt-2 max-w-md text-[13px] font-medium leading-relaxed text-[#64748b]">{c.noAccountDetail}</p>
                      <button type="button" onClick={() => setLocation("/dashboard/telegram-accounts")} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1d3bb8] px-4 py-2.5 text-[13px] font-extrabold text-white transition hover:bg-[#19329c]" data-testid="quick-send-connect-account">
                        {c.connectAccount}<ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="block">
                        <span className="mb-2 block text-[13px] font-bold text-[#334155]">{c.accountTitle}</span>
                        <select value={accountId} onChange={(event) => chooseAccount(event.target.value)} className="h-12 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold text-[#0f172a] outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10" data-testid="quick-send-account">
                          <option value="">{c.accountPlaceholder}</option>
                          {connectedAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}{account.phone ? ` · ${account.phone}` : ""}</option>)}
                        </select>
                      </label>
                      <div className="rounded-2xl border border-[#dbe6f0] bg-[#f8fbff] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8efff] text-[#1d3bb8]"><RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} /></span>
                            <div className="min-w-0">
                               <p className="text-[13px] font-extrabold text-[#0f172a]">{sync.isPending ? c.syncing : syncMessage ?? c.accountHint}</p>
                               {syncError && <p className="mt-1 text-[12px] font-semibold text-[#dc2626]">{c.syncFailed}</p>}
                            </div>
                          </div>
                          <button type="button" onClick={syncAccount} disabled={!accountId || sync.isPending} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-[12px] font-extrabold text-[#1d3bb8] transition hover:bg-[#eef2ff] disabled:opacity-50">
                            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />{c.syncAgain}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <section data-testid="quick-send-your-groups">
                          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <span className="text-[14px] font-extrabold text-[#0f172a]">{c.yourGroups}</span>
                              <p className="mt-1 text-[12px] font-medium text-[#64748b]">{c.yourGroupsDetail}</p>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[12px] font-bold text-[#64748b]">{c.selectedGroups(destinationIds.length)}</span>
                              {accountDestinations.length > 0 && <button type="button" onClick={toggleAllDestinations} className="text-[12px] font-extrabold text-[#1d3bb8]">{allVisibleSelected ? c.deselectAll : c.selectAll}</button>}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[#e2e8f0] p-3">
                            <input value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder={c.searchGroups} className="h-10 w-full rounded-xl border border-[#e2e8f0] px-3.5 text-[13px] font-medium outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10" data-testid="quick-send-group-search" />
                            <div className="mt-2 max-h-56 divide-y divide-[#f1f5f9] overflow-y-auto">
                              {accountDestinations.length ? accountDestinations.map((destination) => (
                                <button type="button" key={destination.id} onClick={() => toggleDestination(destination.id)} className="flex w-full items-center gap-3 px-2 py-3 text-left transition hover:bg-[#f8fafc]" data-testid={`quick-send-group-${destination.id}`}>
                                  <span className="text-[#1d3bb8]">{destinationIds.includes(destination.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-[#cbd5e1]" />}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-bold text-[#334155]">{destinationLabel(destination, language === "vi" ? "Chung" : "General")}</span>
                                    {temporaryRestrictionUntil(destination) && (
                                      <span className="mt-0.5 block text-[10px] font-bold text-[#a16207]">
                                        {c.temporaryRestrictionHint(formatRestrictionTime(new Date(destination.restrictedUntil!)))}
                                      </span>
                                    )}
                                  </span>
                                </button>
                              )) : <p className="px-2 py-5 text-center text-[13px] font-medium text-[#64748b]">{sync.isPending ? c.loadingGroups : c.noGroups}</p>}
                            </div>
                          </div>
                        </section>

                        <section className="rounded-2xl border border-[#dbe6f0] bg-[#f8fbff] p-4" data-testid="quick-send-group-library">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-[14px] font-extrabold text-[#0f172a]">{c.libraryTitle}</p>
                              <p className="mt-1 text-[12px] font-medium leading-relaxed text-[#64748b]">{c.libraryDetail}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-[#e8efff] px-2.5 py-1 text-[10px] font-extrabold text-[#1d3bb8]">
                              {visibleLibraryGroups.length}{hiddenLibraryGroupCount > 0 ? ` / ${libraryGroups.length}` : ""}
                            </span>
                          </div>
                          <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-[#64748b]">{c.afterJoinHint}</p>

                          {groupLibrary.isLoading || groupLibraryAccess.isLoading ? (
                            <p className="py-5 text-center text-[12px] font-bold text-[#64748b]">{c.libraryLoading}</p>
                          ) : groupLibrary.error ? (
                            <p className="py-5 text-center text-[12px] font-bold text-[#be123c]">{c.libraryUnavailable}</p>
                          ) : !groupLibraryAccess.data?.canView ? (
                            <p className="py-5 text-center text-[12px] font-bold text-[#64748b]">{c.libraryUnavailable}</p>
                          ) : !visibleLibraryGroups.length ? (
                            <p className="py-5 text-center text-[12px] font-medium text-[#64748b]">{c.libraryEmpty}</p>
                          ) : (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              {visibleLibraryGroups.map((group) => {
                                const status = getLibraryGroupStatus(group, accountId, postableDestinationIds);
                                const statusText = status === "joined"
                                  ? c.groupJoined
                                  : status === "review"
                                    ? c.groupReview
                                    : c.groupNotJoined;
                                return (
                                  <article key={group.id} className="rounded-xl border border-[#dbe2ea] bg-white p-3.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-[13px] font-extrabold text-[#0f172a]">{group.title}</p>
                                        <p className="mt-1 text-[11px] font-medium text-[#64748b]">{group.memberCount?.toLocaleString(language === "vi" ? "vi-VN" : "en-US") ?? "—"} {c.members}</p>
                                      </div>
                                      {!canOpenLibraryLinks && <span className="shrink-0 rounded-full bg-[#fff7ed] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#c2410c]">{c.trial}</span>}
                                    </div>
                                    <p className={`mt-3 text-[10px] font-extrabold ${status === "joined" ? "text-[#047857]" : status === "review" ? "text-[#b45309]" : "text-[#64748b]"}`}>{statusText}</p>
                                    {group.telegramLink && status !== "joined" && (
                                      <a href={group.telegramLink} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-2 text-[10px] font-extrabold text-[#1d4ed8] transition hover:bg-[#dbeafe]" data-testid={`quick-send-library-open-${group.id}`}>
                                        {c.openGroup}<ChevronRight className="h-3 w-3" />
                                      </a>
                                    )}
                                  </article>
                                );
                              })}
                            </div>
                          )}

                          {hiddenLibraryGroupCount > 0 && (
                            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-[11px] font-medium leading-relaxed text-[#a16207]">
                                <strong className="font-extrabold text-[#92400e]">{c.lockedTitle(hiddenLibraryGroupCount)}.</strong>{" "}{c.lockedDetail}
                              </p>
                              <button type="button" onClick={() => setLocation("/upgrade")} className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#f59e0b] px-3 py-2 text-[10px] font-extrabold text-white transition hover:bg-[#d97706]" data-testid="quick-send-library-buy-key">
                                {c.buyKey}
                              </button>
                            </div>
                          )}
                        </section>
                      </div>
                    </>
                  )}
                </section>
              )}

              {step === 2 && (
                <section className="space-y-6" data-testid="quick-send-step-message">
                  <div>
                    <h3 className="text-[19px] font-extrabold tracking-tight text-[#0f172a]">{c.messageTitle}</h3>
                    <p className="mt-1.5 text-[13px] font-medium text-[#64748b]">{c.messageHint}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => { setMode("text"); setFormError(null); }} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${mode === "text" ? "border-[#1d3bb8] bg-[#eef2ff] ring-2 ring-[#1d3bb8]/10" : "border-[#e2e8f0] hover:border-[#cbd5e1]"}`} data-testid="quick-send-mode-text">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${mode === "text" ? "bg-[#1d3bb8] text-white" : "bg-[#f1f5f9] text-[#64748b]"}`}><FileText className="h-5 w-5" /></span>
                      <span><span className="block text-[14px] font-extrabold text-[#0f172a]">{c.textMode}</span><span className="mt-1 block text-[12px] font-medium text-[#64748b]">Plain text</span></span>
                    </button>
                    <button type="button" onClick={() => { setMode("forward"); setFormError(null); }} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${mode === "forward" ? "border-[#1d3bb8] bg-[#eef2ff] ring-2 ring-[#1d3bb8]/10" : "border-[#e2e8f0] hover:border-[#cbd5e1]"}`} data-testid="quick-send-mode-forward">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${mode === "forward" ? "bg-[#1d3bb8] text-white" : "bg-[#f1f5f9] text-[#64748b]"}`}><Forward className="h-5 w-5" /></span>
                      <span><span className="block text-[14px] font-extrabold text-[#0f172a]">{c.forwardMode}</span><span className="mt-1 block text-[12px] font-medium text-[#64748b]">Saved Messages</span></span>
                    </button>
                  </div>
                  {mode === "text" ? (
                    <label className="block">
                      <span className="mb-2 block text-[13px] font-bold text-[#334155]">{c.textLabel}</span>
                      <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={7} placeholder={c.textPlaceholder} className="w-full resize-y rounded-2xl border border-[#dbe2ea] px-4 py-3.5 text-[14px] font-medium leading-relaxed outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10" data-testid="quick-send-content" />
                    </label>
                  ) : (
                    <label className="block">
                      <span className="mb-2 block text-[13px] font-bold text-[#334155]">{c.savedLabel}</span>
                      <select value={sourceMessageId} onChange={(event) => { setSourceMessageId(event.target.value); const message = (accountSavedMessages.data ?? []).find((item) => item.id === event.target.value); if (message?.text) setContent(message.text); }} disabled={accountSavedMessages.isLoading} className="h-12 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10 disabled:bg-[#f8fafc]" data-testid="quick-send-saved-message">
                        <option value="">{accountSavedMessages.isLoading ? c.savedLoading : c.savedPlaceholder}</option>
                        {(accountSavedMessages.data ?? []).map((message) => <option value={message.id} key={message.id}>{message.text.slice(0, 100) || c.mediaMessage}</option>)}
                      </select>
                      {!accountSavedMessages.isLoading && !(accountSavedMessages.data ?? []).length && <p className="mt-2 text-[12px] font-semibold text-[#64748b]">{c.savedEmpty}</p>}
                    </label>
                  )}
                </section>
              )}

              {step === 3 && (
                <section className="space-y-6" data-testid="quick-send-step-review">
                  <div>
                    <h3 className="text-[19px] font-extrabold tracking-tight text-[#0f172a]">{c.reviewTitle}</h3>
                    <p className="mt-1.5 text-[13px] font-medium text-[#64748b]">{c.reviewHint}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ReviewItem icon={Users} label={c.stepAccount} value={selectedAccount?.name ?? "—"} />
                    <ReviewItem icon={Send} label={c.groupsTitle} value={c.selectedGroups(selectedDestinations.length)} />
                    <ReviewItem icon={mode === "forward" ? Forward : FileText} label={c.stepMessage} value={mode === "forward" ? c.forwardMode : c.textMode} />
                  </div>
                  <label className="block">
                    <span className="mb-2 block text-[13px] font-bold text-[#334155]">{c.campaignName}</span>
                    <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder={c.campaignNamePlaceholder} className="h-12 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10" data-testid="quick-send-campaign-name" />
                  </label>
                  {suggestedScheduleAt && (
                    <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[#92400e]" data-testid="quick-send-restriction-suggestion">
                      <p className="text-[12px] font-bold leading-relaxed">
                        {c.temporaryRestrictionWarning(selectedTemporaryDestinations.length, formatRestrictionTime(suggestedScheduleAt))}
                      </p>
                      <button type="button" onClick={applySuggestedRestrictionSchedule} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#f59e0b] px-3.5 py-2.5 text-[12px] font-extrabold text-white" data-testid="quick-send-apply-restriction-schedule">
                        <CalendarClock className="h-4 w-4" />{c.applySuggestedSchedule}
                      </button>
                      <p className="mt-2 text-[10px] font-semibold leading-relaxed text-[#a16207]">{c.restrictionSafetyHint}</p>
                    </div>
                  )}
                  <div>
                    <span className="mb-2 block text-[13px] font-bold text-[#334155]">{c.sendTiming}</span>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button type="button" onClick={() => setScheduleMode("now")} className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${scheduleMode === "now" ? "border-[#1d3bb8] bg-[#eef2ff]" : "border-[#e2e8f0]"}`} data-testid="quick-send-now">
                        <Clock3 className="h-5 w-5 text-[#1d3bb8]" /><span><span className="block text-[14px] font-extrabold text-[#0f172a]">{c.sendNow}</span><span className="mt-1 block text-[12px] font-medium text-[#64748b]">{c.defaultSafe}</span></span>
                      </button>
                      <button type="button" onClick={() => setScheduleMode("later")} className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${scheduleMode === "later" ? "border-[#1d3bb8] bg-[#eef2ff]" : "border-[#e2e8f0]"}`} data-testid="quick-send-schedule">
                        <CalendarClock className="h-5 w-5 text-[#1d3bb8]" /><span className="text-[14px] font-extrabold text-[#0f172a]">{c.schedule}</span>
                      </button>
                    </div>
                    {scheduleMode === "later" && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label><span className="mb-1.5 block text-[12px] font-bold text-[#64748b]">{c.date}</span><input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="quick-send-date" /></label>
                      <label><span className="mb-1.5 block text-[12px] font-bold text-[#64748b]">{c.time}</span><input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="quick-send-time" /></label>
                    </div>}
                  </div>
                  <details className="rounded-2xl border border-[#e2e8f0] px-4 py-3">
                    <summary className="cursor-pointer text-[13px] font-extrabold text-[#334155]">{c.advanced}</summary>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <label><span className="mb-1.5 block text-[12px] font-bold text-[#64748b]">{c.repeat}</span><input type="number" min="1" max="300" value={repeatCount} onChange={(event) => setRepeatCount(event.target.value)} className="h-10 w-full rounded-xl border border-[#dbe2ea] px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]" /></label>
                      <label><span className="mb-1.5 block text-[12px] font-bold text-[#64748b]">{c.delay} ({c.seconds})</span><input type="number" min="0" value={delayMin} onChange={(event) => setDelayMin(event.target.value)} className="h-10 w-full rounded-xl border border-[#dbe2ea] px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]" /></label>
                      <label><span className="mb-1.5 block text-[12px] font-bold text-[#64748b]">{c.delay} max ({c.seconds})</span><input type="number" min="0" value={delayMax} onChange={(event) => setDelayMax(event.target.value)} className="h-10 w-full rounded-xl border border-[#dbe2ea] px-3 text-[13px] font-semibold outline-none focus:border-[#1a2b88]" /></label>
                    </div>
                  </details>
                </section>
              )}
              {formError && <p role="alert" className="mt-6 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-3.5 py-3 text-[13px] font-semibold text-[#be123c]">{formError}</p>}
            </>
          )}
        </div>

        {!completed && (
          <footer className="flex flex-col-reverse gap-3 border-t border-[#eef2f6] bg-[#fbfcfe] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <button type="button" onClick={step === 1 ? onClose : previousStep} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 py-2.5 text-[13px] font-extrabold text-[#475569] transition hover:bg-[#f8fafc]" data-testid="quick-send-back">
              {step === 1 ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}{step === 1 ? c.close : c.back}
            </button>
            {step < 3 ? (
              <button type="button" onClick={nextStep} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a2b88] px-5 py-2.5 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#152473]" data-testid="quick-send-next">
                {c.next}<ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={() => void submit()} disabled={isCreating} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#059669] px-5 py-2.5 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#047857] disabled:cursor-not-allowed disabled:opacity-60" data-testid="quick-send-submit">
                {isCreating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isCreating ? c.creating : c.run}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

function ReviewItem({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-[#fbfcfe] p-3.5">
      <div className="flex items-center gap-2 text-[#64748b]"><Icon className="h-4 w-4" /><span className="text-[11px] font-extrabold uppercase tracking-wide">{label}</span></div>
      <p className="mt-2 truncate text-[13px] font-extrabold text-[#0f172a]">{value}</p>
    </div>
  );
}