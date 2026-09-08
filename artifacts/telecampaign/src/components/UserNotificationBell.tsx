import { useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, KeyRound, Megaphone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  getListUserNotificationsQueryKey,
  useListUserNotifications,
  useMarkAllUserNotificationsRead,
  useMarkUserNotificationRead,
  type UserNotification,
  type UserNotificationList,
} from "@workspace/api-client-react";
import { useLanguage } from "@/lib/i18n";

const copy = {
  vi: {
    label: "Thông báo",
    title: "Thông báo",
    empty: "Chưa có thông báo mới",
    markAll: "Đánh dấu tất cả đã đọc",
    marked: "Đã đọc",
    admin: "Thông báo từ Admin",
    subscription: "Nhắc gia hạn key",
  },
  en: {
    label: "Notifications",
    title: "Notifications",
    empty: "No new notifications",
    markAll: "Mark all as read",
    marked: "Read",
    admin: "Admin announcement",
    subscription: "Renewal reminder",
  },
} as const;

function formatDate(value: string, language: "vi" | "en") {
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function NotificationIcon({ kind }: { kind: UserNotification["kind"] }) {
  return kind === "subscription"
    ? <KeyRound className="h-4 w-4" />
    : <Megaphone className="h-4 w-4" />;
}

export function UserNotificationBell() {
  const { language } = useLanguage();
  const text = copy[language];
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const notificationsQuery = useListUserNotifications({
    query: {
      queryKey: getListUserNotificationsQueryKey(),
      enabled: true,
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  });
  const markOneMutation = useMarkUserNotificationRead();
  const markAllMutation = useMarkAllUserNotificationsRead();
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", onDocumentPointerDown);
  }, []);

  const patchReadState = (notificationId?: string) => {
    queryClient.setQueryData<UserNotificationList>(getListUserNotificationsQueryKey(), (old) => {
      if (!old) return old;
      if (!notificationId) {
        return {
          ...old,
          unreadCount: 0,
          notifications: old.notifications.map((notification) => ({ ...notification, isRead: true })),
        };
      }
      const wasUnread = old.notifications.some((notification) => notification.id === notificationId && !notification.isRead);
      return {
        ...old,
        unreadCount: Math.max(0, old.unreadCount - (wasUnread ? 1 : 0)),
        notifications: old.notifications.map((notification) => notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification),
      };
    });
  };

  const markRead = (notification: UserNotification) => {
    if (notification.isRead || markOneMutation.isPending) return;
    patchReadState(notification.id);
    markOneMutation.mutate({ notificationId: notification.id }, {
      onError: () => void queryClient.invalidateQueries({ queryKey: getListUserNotificationsQueryKey() }),
    });
  };

  const openNotification = (notification: UserNotification) => {
    markRead(notification);
    setOpen(false);
    if (notification.kind === "admin") {
      setLocation(`/dashboard?notificationId=${encodeURIComponent(notification.id)}`);
    } else if (notification.href) {
      setLocation(notification.href);
    }
  };

  const markAll = () => {
    if (!unreadCount || markAllMutation.isPending) return;
    patchReadState();
    markAllMutation.mutate(undefined, {
      onError: () => void queryClient.invalidateQueries({ queryKey: getListUserNotificationsQueryKey() }),
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) void notificationsQuery.refetch();
        }}
        className={`relative grid h-10 w-10 place-items-center rounded-xl border transition-colors ${
          open
            ? "border-[#b8d9d5] bg-[#e8f1f0] text-[#075e68]"
            : "border-[#dfe7ea] bg-[#fcfdfd] text-[#61727b] hover:border-[#b8d9d5] hover:bg-[#f4faf9] hover:text-[#075e68]"
        }`}
        aria-label={`${text.label}${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        data-testid="user-notifications-bell"
      >
        <Bell className="h-[19px] w-[19px]" strokeWidth={2.2} />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-[#c65b4d] px-1 text-[9px] font-extrabold leading-none text-white"
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-4 right-4 top-[82px] z-50 w-auto overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[min(370px,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-[#eef2f6] px-4 py-3.5">
            <div>
              <p className="text-sm font-extrabold text-[#0f172a]">{text.title}</p>
              {unreadCount > 0 && <p className="mt-0.5 text-[11px] font-semibold text-[#64748b]">{unreadCount} {language === "vi" ? "chưa đọc" : "unread"}</p>}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={markAllMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-extrabold text-[#1a2b88] transition hover:bg-[#eef2ff] disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {text.markAll}
              </button>
            )}
          </div>
          <div className="max-h-[min(500px,calc(100vh-170px))] overflow-y-auto p-2">
            {!notificationsQuery.data?.notifications.length ? (
              <div className="px-4 py-10 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#f1f5f9] text-[#94a3b8]"><Bell className="h-5 w-5" /></span>
                <p className="mt-3 text-sm font-bold text-[#64748b]">{text.empty}</p>
              </div>
            ) : (
              notificationsQuery.data.notifications.map((notification) => {
                const title = language === "en" ? notification.titleEn : notification.title;
                const body = language === "en" ? notification.bodyEn : notification.body;
                return (
                  <button
                    type="button"
                    key={notification.id}
                    onClick={() => openNotification(notification)}
                    className={`flex w-full gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f8fafc] ${notification.isRead ? "bg-white" : "bg-[#f5f8ff]"}`}
                    data-testid={`user-notification-${notification.id}`}
                  >
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      notification.kind === "subscription" ? "bg-[#fff7ed] text-[#ea580c]" : "bg-[#eef2ff] text-[#1d4ed8]"
                    }`}>
                      <NotificationIcon kind={notification.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-[13px] leading-5 ${notification.isRead ? "font-bold text-[#475569]" : "font-extrabold text-[#0f172a]"}`}>{title}</span>
                        {!notification.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#1d4ed8]" aria-label={text.label} />}
                      </span>
                       <span
                         className="mt-1 block max-h-10 overflow-hidden text-[12px] font-medium leading-5 text-[#64748b]"
                         style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
                       >
                         {body || (notification.kind === "subscription" ? text.subscription : text.admin)}
                       </span>
                      <span className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-[#94a3b8]">
                        {formatDate(notification.createdAt, language)}
                        {notification.isRead && <><Check className="h-3 w-3" />{text.marked}</>}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}