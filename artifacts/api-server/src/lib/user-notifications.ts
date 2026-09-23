import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import {
  adminNotificationsTable,
  activityLogsTable,
  campaignTargetsTable,
  campaignsTable,
  db,
  userNotificationReadsTable,
} from "@workspace/db";
import { getSubscription } from "./subscriptions";

const RENEWAL_REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type UserNotification = {
  id: string;
  kind: "admin" | "subscription" | "campaign";
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
       ? "Gói của bạn đã hết hạn. Hãy gia hạn gói để tiếp tục sử dụng."
       : `Gói của bạn còn khoảng ${days} ngày. Hãy gia hạn gói để không bị gián đoạn.`,
    titleEn: isExpired ? "Your subscription has expired" : `Your ${plan} plan is expiring soon`,
     bodyEn: isExpired
       ? "Your subscription has expired. Renew your plan to continue using the service."
       : `Your plan expires in about ${days} day${days === 1 ? "" : "s"}. Renew your plan to avoid interruption.`,
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
  const campaignCompletionRows = await db
    .select({
      id: activityLogsTable.id,
      campaignId: activityLogsTable.campaignId,
      campaignName: campaignsTable.name,
      message: activityLogsTable.message,
      level: activityLogsTable.level,
      metadata: activityLogsTable.metadata,
      createdAt: activityLogsTable.createdAt,
    })
    .from(activityLogsTable)
    .innerJoin(campaignsTable, and(
      eq(activityLogsTable.campaignId, campaignsTable.id),
      eq(campaignsTable.ownerUserId, input.userId),
    ))
    .where(and(
      eq(activityLogsTable.ownerUserId, input.userId),
      eq(activityLogsTable.event, "campaign.completed"),
    ))
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(20);
  const campaignIds = [...new Set(campaignCompletionRows.map((row) => row.campaignId).filter((id): id is string => Boolean(id)))];
  const failedTargetRows = campaignIds.length === 0
    ? []
    : await db
      .select({
        campaignId: campaignTargetsTable.campaignId,
        status: campaignTargetsTable.status,
      })
      .from(campaignTargetsTable)
      .where(and(
        inArray(campaignTargetsTable.campaignId, campaignIds),
        inArray(campaignTargetsTable.status, ["failed", "requires_review"]),
      ));
  const failedCounts = new Map<string, number>();
  for (const row of failedTargetRows) {
    failedCounts.set(row.campaignId, (failedCounts.get(row.campaignId) ?? 0) + 1);
  }

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
    ...campaignCompletionRows
      .filter((row): row is typeof row & { campaignId: string } => Boolean(row.campaignId))
      .map((row) => {
        const failedCount = failedCounts.get(row.campaignId) ?? Number(
          (row.metadata && typeof row.metadata === "object" && "failedCount" in row.metadata)
            ? row.metadata.failedCount
            : 0,
        );
        const hasErrors = failedCount > 0;
        return {
          id: row.id,
          kind: "campaign" as const,
          level: hasErrors ? "warning" as const : "success" as const,
          title: hasErrors ? `Chiến dịch "${row.campaignName}" đã hoàn tất với lỗi` : `Chiến dịch "${row.campaignName}" đã hoàn tất`,
          body: hasErrors
            ? `Có ${failedCount} lượt lỗi. Bấm vào thông báo để mở danh sách chiến dịch Hoàn thành và xử lý lỗi.`
            : "Bấm vào thông báo để xem chi tiết hoặc chạy lại chiến dịch nếu cần.",
          titleEn: hasErrors ? `Campaign "${row.campaignName}" completed with errors` : `Campaign "${row.campaignName}" completed`,
          bodyEn: hasErrors
            ? `${failedCount} delivery${failedCount === 1 ? "" : "ies"} failed. Open the notification to see the completed campaigns and fix the issue.`
            : "Open this notification to view details or run the campaign again if needed.",
          href: `/dashboard/campaigns?status=completed&focusCampaignId=${encodeURIComponent(row.campaignId)}`,
          isRead: false,
          createdAt: row.createdAt,
        };
      }),
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