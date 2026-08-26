import type { AdminNotification } from "@workspace/db";

export type NotificationLifecycle = "draft" | "scheduled" | "published" | "expired";

export function notificationLifecycle(
  notification: AdminNotification,
  now = new Date(),
): NotificationLifecycle {
  if (notification.expiresAt && notification.expiresAt <= now) return "expired";
  if (notification.status === "draft") return "draft";
  if (notification.status === "scheduled" && notification.scheduledAt && notification.scheduledAt > now) return "scheduled";
  return "published";
}

export function isNotificationActive(notification: AdminNotification, now = new Date()): boolean {
  if (notification.expiresAt && notification.expiresAt <= now) return false;
  if (notification.status === "draft") return false;
  if (notification.status === "scheduled") return Boolean(notification.scheduledAt && notification.scheduledAt <= now);
  return Boolean(!notification.publishedAt || notification.publishedAt <= now);
}

export function adminNotificationResponse(notification: AdminNotification) {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    status: notificationLifecycle(notification),
    mediaUrl: notification.mediaPath ? `/api/storage/admin-notifications/${notification.id}/media` : null,
    mediaType: notification.mediaType === "video" ? "video" as const : notification.mediaType === "image" ? "image" as const : null,
    mediaName: notification.mediaName,
    mediaSize: notification.mediaSize,
    scheduledAt: notification.scheduledAt,
    publishedAt: notification.publishedAt,
    expiresAt: notification.expiresAt,
    pinned: notification.pinned,
    dashboardVisible: notification.dashboardVisible,
    createdBy: notification.createdBy,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}