import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Activity,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Filter,
  KeyRound,
  RefreshCcw,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import {
  getListAdminSystemEventsQueryKey,
  useListAdminSystemEvents,
  useMarkAdminSystemEventRead,
  useMarkAllAdminSystemEventsRead,
  type AdminSystemEvent,
  type AdminSystemEventList,
  type ListAdminSystemEventsParams,
} from "@workspace/api-client-react";
import {
  AppLayout,
  EmptyState,
  Panel,
  PageIntro,
  PrimaryButton,
  Toast,
} from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

type EventFilter = "all" | AdminSystemEvent["eventType"];
type RangeFilter = "all" | "today";

const copy = {
  en: {
    pageTitle: "System events",
    kicker: "Admin / event ledger",
    detail: "A focused record of account and subscription changes. Broadcast announcements stay separate.",
    today: "Today",
    activations: "License activations",
    unread: "Unread",
    unreadSuffix: "need review",
    history: "Event history",
    eventHistory: "System event history",
    range: "Time window",
    allTime: "All time",
    todayOnly: "Today only",
    eventType: "Event type",
    allTypes: "All event types",
    licenseActivated: "License activated",
    userRegistered: "User registered",
    licenseRevoked: "License revoked",
    markAll: "Mark all as read",
    markedAll: "All system events marked as read.",
    markedOne: "Event marked as read.",
    markRead: "Mark as read",
    unreadEvent: "Unread system event",
    loading: "Loading the event ledger",
    loadingDetail: "Retrieving the latest account and subscription changes.",
    loadError: "Could not load system events.",
    loadErrorDetail: "The event ledger did not respond. Try again without changing your filters.",
    retry: "Try again",
    noEvents: "No system events in this view",
    noEventsDetail: "There are no account or subscription changes matching the selected filters.",
    details: "Activation details",
    username: "Username",
    plan: "Plan",
    duration: "Duration",
    days: "days",
    expires: "Expires",
    keyId: "License key ID",
    userId: "User ID",
    system: "System event",
    read: "Read",
    failedRead: "Could not update the read state.",
    failedAll: "Could not mark all events as read.",
  },
  vi: {
    pageTitle: "Sự kiện hệ thống",
    kicker: "Quản trị / nhật ký sự kiện",
    detail: "Theo dõi tập trung các thay đổi tài khoản và gói dịch vụ. Thông báo phát sóng vẫn được tách riêng.",
    today: "Hôm nay",
    activations: "License đã kích hoạt",
    unread: "Chưa đọc",
    unreadSuffix: "cần xem",
    history: "Lịch sử sự kiện",
    eventHistory: "Lịch sử sự kiện hệ thống",
    range: "Khoảng thời gian",
    allTime: "Tất cả thời gian",
    todayOnly: "Chỉ hôm nay",
    eventType: "Loại sự kiện",
    allTypes: "Tất cả loại sự kiện",
    licenseActivated: "Đã kích hoạt license",
    userRegistered: "Người dùng mới đăng ký",
    licenseRevoked: "Đã thu hồi license",
    markAll: "Đánh dấu tất cả đã đọc",
    markedAll: "Đã đánh dấu toàn bộ sự kiện là đã đọc.",
    markedOne: "Đã đánh dấu sự kiện là đã đọc.",
    markRead: "Đánh dấu đã đọc",
    unreadEvent: "Sự kiện hệ thống chưa đọc",
    loading: "Đang tải nhật ký sự kiện",
    loadingDetail: "Đang lấy các thay đổi tài khoản và gói dịch vụ mới nhất.",
    loadError: "Không thể tải sự kiện hệ thống.",
    loadErrorDetail: "Nhật ký sự kiện không phản hồi. Hãy thử lại với bộ lọc hiện tại.",
    retry: "Thử lại",
    noEvents: "Không có sự kiện trong chế độ xem này",
    noEventsDetail: "Không có thay đổi tài khoản hoặc gói dịch vụ nào khớp với bộ lọc đã chọn.",
    details: "Chi tiết kích hoạt",
    username: "Tên người dùng",
    plan: "Gói",
    duration: "Thời hạn",
    days: "ngày",
    expires: "Hết hạn",
    keyId: "Mã license",
    userId: "Mã người dùng",
    system: "Sự kiện hệ thống",
    read: "Đã đọc",
    failedRead: "Không thể cập nhật trạng thái đã đọc.",
    failedAll: "Không thể đánh dấu toàn bộ sự kiện.",
  },
} as const;

type EventCopy = (typeof copy)["en"] | (typeof copy)["vi"];

function formatDate(value: string, language: "vi" | "en") {
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function metadataValue(event: AdminSystemEvent, key: string): string | null {
  const value = event.metadata?.[key];
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function eventLabel(eventType: AdminSystemEvent["eventType"], text: EventCopy) {
  return {
    license_activated: text.licenseActivated,
    user_registered: text.userRegistered,
    license_revoked: text.licenseRevoked,
  }[eventType];
}

function EventIcon({ event }: { event: AdminSystemEvent }) {
  if (event.eventType === "license_activated") return <KeyRound className="h-5 w-5" />;
  if (event.eventType === "user_registered") return <UserRound className="h-5 w-5" />;
  return <ShieldAlert className="h-5 w-5" />;
}

function eventTone(event: AdminSystemEvent) {
  if (event.level === "error") return { icon: "#a94340", bg: "#fcedeb", line: "#e7b8b3" };
  if (event.level === "warning") return { icon: "#98621d", bg: "#f7eddd", line: "#ead2ad" };
  if (event.level === "success") return { icon: "#0b716b", bg: "#e4f2ef", line: "#b9ddd5" };
  return { icon: "#356c7d", bg: "#e9f1f3", line: "#c5d9de" };
}

export default function AdminSystemEventsPage() {
  const { language } = useLanguage();
  const text = copy[language];
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<RangeFilter>("all");
  const [eventType, setEventType] = useState<EventFilter>("all");
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const params = useMemo<ListAdminSystemEventsParams>(() => ({
    range,
    eventType: eventType === "all" ? undefined : eventType,
    limit: 100,
  }), [eventType, range]);

  const eventsQuery = useListAdminSystemEvents(params, {
    query: {
      queryKey: getListAdminSystemEventsQueryKey(params),
      staleTime: 15_000,
      refetchOnMount: "always",
    },
  });
  const markOneMutation = useMarkAdminSystemEventRead();
  const markAllMutation = useMarkAllAdminSystemEventsRead();

  const patchReadState = (eventId?: string) => {
    queryClient.setQueriesData<AdminSystemEventList>(
      { queryKey: getListAdminSystemEventsQueryKey() },
      (old) => {
        if (!old) return old;
        if (eventId) {
          const wasUnread = old.events.some((event) => event.id === eventId && !event.isRead);
          return {
            ...old,
            unreadCount: Math.max(0, old.unreadCount - (wasUnread ? 1 : 0)),
            events: old.events.map((event) => event.id === eventId ? { ...event, isRead: true } : event),
          };
        }
        return {
          ...old,
          unreadCount: 0,
          events: old.events.map((event) => ({ ...event, isRead: true })),
        };
      },
    );
  };

  const markRead = (event: AdminSystemEvent) => {
    if (event.isRead || markOneMutation.isPending) return;
    patchReadState(event.id);
    markOneMutation.mutate({ eventId: event.id }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminSystemEventsQueryKey() });
        setToast({ text: text.markedOne });
      },
      onError: (cause) => {
        void queryClient.invalidateQueries({ queryKey: getListAdminSystemEventsQueryKey() });
        setToast({ text: localizedErrorMessage(cause, language, text.failedRead), isError: true });
      },
    });
  };

  const markAll = () => {
    if (!eventsQuery.data?.unreadCount || markAllMutation.isPending) return;
    patchReadState();
    markAllMutation.mutate(undefined, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminSystemEventsQueryKey() });
        setToast({ text: text.markedAll });
      },
      onError: (cause) => {
        void queryClient.invalidateQueries({ queryKey: getListAdminSystemEventsQueryKey() });
        setToast({ text: localizedErrorMessage(cause, language, text.failedAll), isError: true });
      },
    });
  };

  const retry = () => {
    void eventsQuery.refetch();
  };

  return (
    <AppLayout activePage="admin-system-events" title={text.pageTitle} hideUpgrade>
      <PageIntro
        kicker={text.kicker}
        heading={text.pageTitle}
        detail={text.detail}
        action={
          <button
            type="button"
            onClick={markAll}
            disabled={!eventsQuery.data?.unreadCount || markAllMutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#b9d5d2] bg-[#f7fbfa] px-4 py-3 text-[13px] font-extrabold text-[#075e68] transition hover:border-[#86bdb6] hover:bg-[#e8f1f0] disabled:cursor-not-allowed disabled:opacity-45"
            data-testid="admin-mark-all-read"
          >
            <CheckCheck className="h-4 w-4" />
            {markAllMutation.isPending ? "…" : text.markAll}
          </button>
        }
      />

      <section className="mb-7 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Panel className="relative overflow-hidden border-[#b9d5d2] bg-[#e8f1f0] p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full border-[18px] border-[#c8e1dd]/70" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#4e7779]">{text.today}</p>
              <p className="mt-3 text-[15px] font-extrabold text-[#1b3f43]">{text.activations}</p>
              <p className="mt-1 text-[12px] font-semibold text-[#567477]">UTC+7 · {new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", { dateStyle: "long" }).format(new Date())}</p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f7fbfa] text-[#075e68] shadow-sm">
              <KeyRound className="h-5 w-5" />
            </span>
          </div>
          <strong className="relative mt-7 block text-[38px] font-extrabold leading-none tracking-[-0.05em] text-[#075e68]">
            {eventsQuery.data?.today.licenseActivations ?? "—"}
          </strong>
        </Panel>
        <Panel className="flex items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#77858b]">{text.history}</p>
            <p className="mt-3 text-[15px] font-extrabold text-[#25343a]">{text.unread}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#718088]">{eventsQuery.data?.unreadCount ?? "—"} {text.unreadSuffix}</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f7eddd] text-[#98621d]">
            <CircleAlert className="h-5 w-5" />
          </span>
        </Panel>
      </section>

      <Panel className="mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#34474f]">
            <Filter className="h-4 w-4 text-[#0b716b]" />
            <span>{text.eventHistory}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[520px]">
            <label className="relative block">
              <span className="sr-only">{text.range}</span>
              <select value={range} onChange={(event) => setRange(event.target.value as RangeFilter)} className="w-full appearance-none rounded-xl border border-[#c8d7da] bg-[#fbfdfd] px-3.5 py-3 pr-10 text-[13px] font-bold text-[#34474f] outline-none transition focus:border-[#0e7880] focus:ring-4 focus:ring-[#0e7880]/10">
                <option value="all">{text.allTime}</option>
                <option value="today">{text.todayOnly}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#718088]" />
            </label>
            <label className="relative block">
              <span className="sr-only">{text.eventType}</span>
              <select value={eventType} onChange={(event) => setEventType(event.target.value as EventFilter)} className="w-full appearance-none rounded-xl border border-[#c8d7da] bg-[#fbfdfd] px-3.5 py-3 pr-10 text-[13px] font-bold text-[#34474f] outline-none transition focus:border-[#0e7880] focus:ring-4 focus:ring-[#0e7880]/10">
                <option value="all">{text.allTypes}</option>
                <option value="license_activated">{text.licenseActivated}</option>
                <option value="user_registered">{text.userRegistered}</option>
                <option value="license_revoked">{text.licenseRevoked}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#718088]" />
            </label>
          </div>
        </div>
      </Panel>

      {eventsQuery.error ? (
        <Panel className="border-[#e7b8b3] bg-[#fffaf9] p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#fcedeb] text-[#a94340]"><CircleAlert className="h-5 w-5" /></span>
          <h2 className="mt-4 text-[17px] font-extrabold text-[#573330]">{text.loadError}</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] font-medium leading-6 text-[#86615d]">{text.loadErrorDetail}</p>
          <PrimaryButton onClick={retry}><RefreshCcw className="h-4 w-4" />{text.retry}</PrimaryButton>
        </Panel>
      ) : eventsQuery.isLoading ? (
        <EventSkeleton />
      ) : !eventsQuery.data?.events.length ? (
        <Panel><EmptyState icon={Activity} title={text.noEvents} detail={text.noEventsDetail} /></Panel>
      ) : (
        <div className="relative space-y-3">
          <div className="absolute bottom-8 left-[22px] top-8 hidden w-px bg-[#cbdcde] sm:block" aria-hidden="true" />
          {eventsQuery.data.events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              text={text}
              language={language}
              onRead={() => markRead(event)}
            />
          ))}
        </div>
      )}
      {toast && <Toast message={toast.text} onDismiss={() => setToast(null)} />}
      <button type="button" onClick={() => navigate("/admin")} className="mt-7 text-[12px] font-extrabold text-[#5e747a] underline decoration-[#b9d5d2] underline-offset-4 hover:text-[#075e68]">
        {language === "vi" ? "Quay lại trung tâm quản trị" : "Back to admin center"}
      </button>
    </AppLayout>
  );
}

function EventSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading system events" aria-busy="true">
      {[1, 2, 3].map((item) => (
        <Panel key={item} className="animate-pulse p-5 sm:p-6">
          <div className="flex gap-4">
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-[#e8f1f0]" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-3 w-36 rounded-full bg-[#e8f1f0]" />
              <div className="h-4 w-3/4 rounded-full bg-[#edf2f3]" />
              <div className="h-3 w-1/2 rounded-full bg-[#edf2f3]" />
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function EventCard({ event, text, language, onRead }: {
  event: AdminSystemEvent;
  text: EventCopy;
  language: "vi" | "en";
  onRead: () => void;
}) {
  const tone = eventTone(event);
  const username = metadataValue(event, "username");
  const plan = metadataValue(event, "plan");
  const durationDays = metadataValue(event, "durationDays");
  const expiresAt = metadataValue(event, "expiresAt");
  const licenseKeyId = metadataValue(event, "licenseKeyId");
  const userId = metadataValue(event, "userId");
  const isActivation = event.eventType === "license_activated";

  return (
    <article
      className={`relative sm:ml-0 rounded-2xl border bg-[#fcfdfd] p-5 shadow-[0_4px_18px_rgba(36,67,73,.045)] transition-all sm:p-6 ${event.isRead ? "border-[#dfe7ea]" : "border-[#b9d5d2] bg-[#fbfefd] shadow-[0_8px_24px_rgba(11,113,107,.08)]"}`}
      onClick={() => !event.isRead && onRead()}
      onKeyDown={(keyboardEvent) => {
        if (!event.isRead && (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")) {
          keyboardEvent.preventDefault();
          onRead();
        }
      }}
      role={!event.isRead ? "button" : undefined}
      tabIndex={!event.isRead ? 0 : undefined}
      aria-label={!event.isRead ? text.unreadEvent : undefined}
      data-testid={`system-event-${event.id}`}
    >
      {!event.isRead && <span className="absolute left-0 top-5 h-10 w-1 rounded-r-full bg-[#0b716b]" aria-hidden="true" />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ color: tone.icon, backgroundColor: tone.bg }}>
          <EventIcon event={event} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: tone.icon }}>{eventLabel(event.eventType, text)}</span>
            {!event.isRead ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#b9d5d2] bg-[#e8f1f0] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#075e68]"><span className="h-1.5 w-1.5 rounded-full bg-[#0b716b]" />{text.unread}</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#dfe7ea] bg-[#f3f6f8] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#77858b]"><Check className="h-3 w-3" />{text.read}</span>
            )}
          </div>
          <h2 className="mt-2 text-[16px] font-extrabold tracking-[-0.02em] text-[#25343a]">{language === "en" ? event.titleEn : event.title}</h2>
          <p className="mt-2 max-w-3xl text-[13px] font-medium leading-6 text-[#60737b]">{language === "en" ? event.bodyEn : event.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-bold text-[#829097]">
            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatDate(event.createdAt, language)}</span>
            <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />{text.system}</span>
          </div>
          {isActivation && (username || plan || durationDays || expiresAt || licenseKeyId || userId) && (
            <div className="mt-5 rounded-2xl border border-[#e5ddd0] bg-[#fcf8f1] p-4">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#98621d]">{text.details}</p>
              <div className="grid gap-x-5 gap-y-3 text-[12px] sm:grid-cols-2 lg:grid-cols-3">
                {username && <Meta label={text.username} value={`@${username.replace(/^@/, "")}`} />}
                {plan && <Meta label={text.plan} value={plan.toUpperCase()} />}
                {durationDays && <Meta label={text.duration} value={`${durationDays} ${text.days}`} />}
                {expiresAt && <Meta label={text.expires} value={formatDate(expiresAt, language)} />}
                {licenseKeyId && <Meta label={text.keyId} value={licenseKeyId} />}
                {userId && <Meta label={text.userId} value={userId} />}
              </div>
            </div>
          )}
        </div>
        {!event.isRead && (
          <button type="button" onClick={(clickEvent) => { clickEvent.stopPropagation(); onRead(); }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#b9d5d2] bg-[#f7fbfa] px-3 py-2 text-[11px] font-extrabold text-[#075e68] transition hover:bg-[#e8f1f0] sm:mt-0" aria-label={text.markRead}>
            <CheckCircle2 className="h-4 w-4" />
            <span className="sm:hidden">{text.markRead}</span>
          </button>
        )}
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-[#a2835a]">{label}</span><span className="mt-1 block truncate font-mono text-[11px] font-bold text-[#5e5040]">{value}</span></div>;
}