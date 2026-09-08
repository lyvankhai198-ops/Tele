import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import {
  adminNotificationsTable,
  db,
  userNotificationReadsTable,
} from "@workspace/db";
import { getSubscription } from "./subscriptions";

const RENEWAL_REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type UserNotification = {
  id: string;
  kind: "admin" | "subscription";
  level: "info" | "warning" | "success";
  title: string;
  body: string;
  titleEn: string;
  bodyEn: string;
  href: string | null;
  isRead: boolean;
  createdAt: Date;
};

function activeNotificationFilter(now: Date) {
  return and(
    or(
      eq(adminNotificationsTable.status, "published"),
      and(eq(adminNotificationsTable.status, "scheduled"), lte(adminNotificationsTable.scheduledAt, now)),
    ),
    eq(adminNotificationsTable.dashboardVisible, true),
    or(isNull(adminNotificationsTable.expiresAt), gt(adminNotificationsTable.expiresAt, now)),
  );
}

function subscriptionReminder(subscription: Awaited<ReturnType<typeof getSubscription>>, now: Date): UserNotification | null {
  if (!subscription.expiresAt) return null;

  const remainingMs = subscription.expiresAt.getTime() - now.getTime();
  if (remainingMs > RENEWAL_REMINDER_WINDOW_MS) return null;

  const isExpired = subscription.status === "expired" || remainingMs <= 0;
  const days = Math.max(1, Math.ceil(Math.max(remainingMs, 0) / DAY_MS));
  const plan = subscription.plan.toUpperCase();
  return {
    id: `subscription-renewal:${subscription.expiresAt.toISOString()}`,
    kind: "subscription",
    level: "warning",
    title: isExpired ? "Gói dịch vụ đã hết hạn" : `Gói ${plan} sắp hết hạn`,
    body: isExpired
      ? "Gói của bạn đã hết hạn. Hãy kích hoạt license key để tiếp tục sử dụng."
      : `Gói của bạn còn khoảng ${days} ngày. Hãy gia hạn license key để không bị gián đoạn.`,
    titleEn: isExpired ? "Your subscription has expired" : `Your ${plan} plan is expiring soon`,
    bodyEn: isExpired
      ? "Your subscription has expired. Activate a license key to continue using the service."
      : `Your plan expires in about ${days} day${days === 1 ? "" : "s"}. Renew your license key to avoid interruption.`,
    href: "/upgrade",
    isRead: false,
    createdAt: subscription.expiresAt,
  };
}

export async function listUserNotifications(input: {
  userId: string;
  includeSubscriptionReminder: boolean;
  limit?: number;
}): Promise<{ notifications: UserNotification[]; unreadCount: number }> {
  const now = new Date();
  const adminRows = await db
    .select()
    .from(adminNotificationsTable)
    .where(activeNotificationFilter(now))
    .orderBy(desc(adminNotificationsTable.createdAt));

  const subscriptionReminderNotification = input.includeSubscriptionReminder
    ? subscriptionReminder(await getSubscription(input.userId), now)
    : null;
  const candidates: UserNotification[] = [
    ...adminRows.map((notification) => ({
      id: notification.id,
      kind: "admin" as const,
      level: "info" as const,
      title: notification.title,
      body: notification.body,
      titleEn: notification.titleEn ?? notification.title,
      bodyEn: notification.bodyEn ?? notification.body,
      href: "/dashboard",
      isRead: false,
      createdAt: notification.publishedAt ?? notification.scheduledAt ?? notification.createdAt,
    })),
    ...(subscriptionReminderNotification ? [subscriptionReminderNotification] : []),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const keys = candidates.map((notification) => notification.id);
  const readRows = keys.length === 0
    ? []
    : await db
      .select({ notificationKey: userNotificationReadsTable.notificationKey })
      .from(userNotificationReadsTable)
      .where(and(
        eq(userNotificationReadsTable.userId, input.userId),
        inArray(userNotificationReadsTable.notificationKey, keys),
      ));
  const readKeys = new Set(readRows.map((row) => row.notificationKey));
  const notifications = candidates.map((notification) => ({
    ...notification,
    isRead: readKeys.has(notification.id),
  }));

  return {
    notifications: input.limit ? notifications.slice(0, input.limit) : notifications,
    unreadCount: notifications.reduce((total, notification) => total + (notification.isRead ? 0 : 1), 0),
  };
}

export async function markUserNotificationRead(input: {
  userId: string;
  notificationId: string;
  includeSubscriptionReminder: boolean;
}): Promise<UserNotification | null> {
  const result = await listUserNotifications({
    userId: input.userId,
    includeSubscriptionReminder: input.includeSubscriptionReminder,
  });
  const notification = result.notifications.find((item) => item.id === input.notificationId);
  if (!notification) return null;

  await db
    .insert(userNotificationReadsTable)
    .values({
      userId: input.userId,
      notificationKey: input.notificationId,
    })
    .onConflictDoNothing();

  return { ...notification, isRead: true };
}

export async function markAllUserNotificationsRead(input: {
  userId: string;
  includeSubscriptionReminder: boolean;
}): Promise<number> {
  const result = await listUserNotifications({
    userId: input.userId,
    includeSubscriptionReminder: input.includeSubscriptionReminder,
  });
  const unread = result.notifications.filter((notification) => !notification.isRead);
  if (unread.length === 0) return 0;

  await db
    .insert(userNotificationReadsTable)
    .values(unread.map((notification) => ({
      userId: input.userId,
      notificationKey: notification.id,
    })))
    .onConflictDoNothing();
  return unread.length;
}