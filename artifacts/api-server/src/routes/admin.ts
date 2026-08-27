import { Router, type IRouter } from "express";
import {
  CreateAdminLicenseKeyBody,
  CreateAdminLicenseKeyResponse,
  GetAdminPurchaseSettingsResponse,
  ListAdminLicenseKeysQueryParams,
  ListAdminLicenseKeysResponse,
  UpdateAdminPurchaseSettingsBody,
  UpdateAdminPurchaseSettingsResponse,
  RevokeAdminLicenseKeyParams,
  GetAdminOverviewResponse,
  ListAdminUsersQueryParams,
  ListAdminUsersResponse,
  GetAdminUserParams,
  GetAdminUserResponse,
  GetAdminUserSupportResponse,
  GetAdminUserSupportCampaignTargetsQueryParams,
  GetAdminUserSupportCampaignTargetsResponse,
  CloneAdminUserCampaignParams,
  CloneAdminUserCampaignBody,
  CloneAdminUserCampaignResponse,
  UpdateAdminUserSubscriptionParams,
  UpdateAdminUserSubscriptionBody,
  UpdateAdminUserSubscriptionResponse,
  UpdateAdminUserQuotaParams,
  UpdateAdminUserQuotaBody,
  UpdateAdminUserQuotaResponse,
  GetAdminSystemSettingsResponse,
  UpdateAdminSystemSettingsBody,
  UpdateAdminSystemSettingsResponse,
  GetAdminOperationsResponse,
  GetAdminActiveGroupDirectoryResponse,
  SyncAdminGroupLibraryResponse,
  UpdateAdminCampaignStatusParams,
  UpdateAdminCampaignStatusBody,
  UpdateAdminCampaignStatusResponse,
  UpdateAdminUserCampaignStatusParams,
  UpdateAdminUserCampaignStatusBody,
  UpdateAdminUserCampaignStatusResponse,
  RetryAdminCampaignTargetParams,
  RetryAdminCampaignTargetResponse,
  RetryAdminUserSupportCampaignTargetParams,
  RetryAdminUserSupportCampaignTargetResponse,
  GetAdminLicenseKeySecretParams,
  GetAdminLicenseKeySecretResponse,
  ListAdminNotificationsResponse,
  CreateAdminNotificationBody,
  CreateAdminNotificationResponse,
  UpdateAdminNotificationParams,
  UpdateAdminNotificationBody,
  UpdateAdminNotificationResponse,
  DeleteAdminNotificationParams,
  SetAdminNotificationPinnedParams,
  SetAdminNotificationPinnedBody,
  SetAdminNotificationVisibilityParams,
  SetAdminNotificationVisibilityBody,
  RequestAdminNotificationUploadUrlBody,
  RequestAdminNotificationUploadUrlResponse,
} from "@workspace/api-zod";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  adminNotificationsTable,
  activityLogsTable,
  appUsersTable,
  campaignTargetsTable,
  campaignsTable,
  destinationsTable,
  messageTemplatesTable,
  proxiesTable,
  telegramAccountsTable,
  db,
} from "@workspace/db";
import {
  createAdminLicenseKeys,
  listAdminLicenseKeys,
  revokeAdminLicenseKey,
  getAdminOverview,
  listAdminUsers,
  getAdminUser,
  updateSubscriptionByAdmin,
  updateUserDailyQuotaExemption,
  revealAdminLicenseKey,
} from "../lib/subscriptions";
import { getAdminUserSupport, getAdminUserSupportCampaignTargets } from "../lib/admin-user-support";
import { getAdminActiveGroupDirectory, syncAdminGroupLibrary } from "../lib/admin-active-group-directory";
import { requireAdmin } from "../middlewares/authMiddleware";
import { isTelegramPurchaseUrl, getPurchaseSettings, updatePurchaseSettings } from "../lib/purchase-settings";
import { recordActivity } from "../lib/activity";
import { getSystemSettings, updateSystemSettings } from "../lib/system-settings";
import {
  pauseCampaignsOverCurrentQuotaAfterSettingsUpdate,
  resumeQuotaPausedCampaignsAfterSettingsUpdate,
} from "../lib/campaigns";
import { rebasePastPendingSchedule } from "../lib/campaign-schedule";
import { campaignSummary } from "../lib/campaigns";
import { adminNotificationResponse } from "../lib/admin-notifications";
import {
  NotificationMediaNotFoundError,
  NotificationMediaStorage,
  NotificationMediaUploadError,
} from "../lib/notificationMediaStorage";
import { getStorageStatus } from "../lib/storage-status";

const router: IRouter = Router();
const notificationMediaStorage = new NotificationMediaStorage();
const PLAN_LIMIT_MAXIMUMS = {
  accountLimit: 100_000,
  campaignLimit: 100_000,
  messageDailyLimit: 10_000_000,
  userMessageDailyLimit: 100_000_000,
} as const;

function sendError(res: any, status: number, error: string): void {
  res.status(status).json({ error });
}

router.use("/admin", requireAdmin);

router.get("/admin/overview", async (_req, res): Promise<void> => {
  res.json(GetAdminOverviewResponse.parse(await getAdminOverview()));
});

router.get("/admin/active-groups", async (_req, res): Promise<void> => {
  res.json(GetAdminActiveGroupDirectoryResponse.parse(await getAdminActiveGroupDirectory()));
});

router.post("/admin/active-groups", async (_req, res): Promise<void> => {
  res.status(201).json(SyncAdminGroupLibraryResponse.parse(await syncAdminGroupLibrary()));
});

router.get("/admin/notifications", async (_req, res): Promise<void> => {
  const notifications = await db.select().from(adminNotificationsTable)
    .orderBy(desc(adminNotificationsTable.createdAt));
  res.json(ListAdminNotificationsResponse.parse(notifications.map(adminNotificationResponse)));
});

function notificationInputError(data: {
  title: string;
  body?: string;
  mediaPath?: string | null;
  mediaType?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  scheduledAt?: Date | null;
  expiresAt?: Date | null;
}): string | null {
  if (!data.title.trim()) return "Tiêu đề thông báo không được để trống.";
  if (data.mediaPath && !notificationMediaStorage.isAdminNotificationMediaPath(data.mediaPath)) return "Đường dẫn media không hợp lệ.";
  if (data.mediaType && !["image", "video"].includes(data.mediaType)) return "Loại media không được hỗ trợ.";
  if (data.mediaSize !== null && data.mediaSize !== undefined && (!Number.isInteger(data.mediaSize) || data.mediaSize < 1 || data.mediaSize > 52_428_800)) {
    return "Dung lượng media phải từ 1 byte đến 50 MB.";
  }
  if (data.scheduledAt && data.expiresAt && data.expiresAt <= data.scheduledAt) return "Thời điểm hết hạn phải sau thời điểm phát.";
  return null;
}

async function notificationMediaError(data: {
  mediaPath?: string | null;
  mediaType?: "image" | "video" | null;
  mediaSize?: number | null;
}): Promise<string | null> {
  if (!data.mediaPath) return null;
  if (!data.mediaType || !data.mediaSize) return "Thông tin media không đầy đủ.";
  try {
    const verified = await notificationMediaStorage.verifyAdminNotificationMedia(data.mediaPath);
    if (verified.mediaType !== data.mediaType || verified.size !== data.mediaSize) {
      return "Media tải lên không khớp với loại hoặc dung lượng đã khai báo.";
    }
    return null;
  } catch {
    return "Không thể xác thực media đã tải lên.";
  }
}

async function deleteUnusedNotificationMedia(mediaPath: string | null, req: any): Promise<void> {
  if (!mediaPath || !notificationMediaStorage.isAdminNotificationMediaPath(mediaPath)) return;
  const [{ references }] = await db.select({ references: count() }).from(adminNotificationsTable)
    .where(eq(adminNotificationsTable.mediaPath, mediaPath));
  if (references !== 0) return;
  try {
    await notificationMediaStorage.deleteAdminNotificationMedia(mediaPath);
  } catch (error) {
    req.log.warn({ err: error, mediaPath }, "Unable to delete unused notification media");
  }
}

async function cleanupOrphanedNotificationMedia(req: any): Promise<void> {
  try {
    await notificationMediaStorage.cleanupUnreferencedAdminNotificationMedia(async (mediaPath) => {
      const reference = await db.select({ id: adminNotificationsTable.id }).from(adminNotificationsTable)
        .where(eq(adminNotificationsTable.mediaPath, mediaPath)).limit(1);
      return reference.length > 0;
    });
  } catch (error) {
    req.log.warn({ err: error }, "Unable to clean orphaned notification media");
  }
}

function notificationDbValues(data: {
  title: string;
  body?: string;
  titleEn?: string | null;
  bodyEn?: string | null;
  mediaPath?: string | null;
  mediaType?: "image" | "video" | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  scheduledAt?: Date | null;
  expiresAt?: Date | null;
  createdBy?: string;
}) {
  const now = new Date();
  const scheduledAt = data.scheduledAt ?? null;
  const isFuture = Boolean(scheduledAt && scheduledAt > now);
  return {
    title: data.title.trim(),
    body: data.body?.trim() ?? "",
    titleEn: data.titleEn?.trim() || null,
    bodyEn: data.bodyEn?.trim() || null,
    mediaPath: data.mediaPath ?? null,
    mediaType: data.mediaType ?? null,
    mediaName: data.mediaName ?? null,
    mediaSize: data.mediaSize ?? null,
    status: isFuture ? "scheduled" : "published",
    scheduledAt: isFuture ? scheduledAt : null,
    publishedAt: isFuture ? null : now,
    expiresAt: data.expiresAt ?? null,
    ...(data.createdBy ? { createdBy: data.createdBy } : {}),
    updatedAt: now,
  };
}

router.post("/admin/notifications/upload-url", async (req, res): Promise<void> => {
  const parsed = RequestAdminNotificationUploadUrlBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, "Ảnh/video không hợp lệ hoặc vượt quá dung lượng 50 MB.");
  try {
    await cleanupOrphanedNotificationMedia(req);
    const upload = await notificationMediaStorage.prepareAdminNotificationUpload({
      ownerUserId: req.userId!,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
    });
    res.json(RequestAdminNotificationUploadUrlResponse.parse({
      uploadURL: upload.uploadURL,
      objectPath: upload.objectPath,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Unable to generate notification media upload URL");
    sendError(res, 500, "Không thể chuẩn bị nơi tải media lên.");
  }
});

router.put("/admin/notifications/uploads/:uploadId", async (req, res): Promise<void> => {
  try {
    await notificationMediaStorage.storeAdminNotificationUpload({
      uploadId: req.params.uploadId,
      ownerUserId: req.userId!,
      contentType: req.get("content-type") ?? "",
      body: req,
    });
    res.status(204).end();
  } catch (error) {
    if (error instanceof NotificationMediaNotFoundError) return void sendError(res, 404, "Phiên tải media đã hết hạn.");
    if (error instanceof NotificationMediaUploadError) return void sendError(res, 400, "Media tải lên không hợp lệ.");
    req.log.error({ err: error }, "Unable to store notification media");
    sendError(res, 500, "Không thể tải media lên.");
  }
});

router.post("/admin/notifications", async (req, res): Promise<void> => {
  const parsed = CreateAdminNotificationBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, "Thông tin thông báo không hợp lệ.");
  const error = notificationInputError(parsed.data);
  if (error) return void sendError(res, 400, error);
  const mediaError = await notificationMediaError(parsed.data);
  if (mediaError) return void sendError(res, 400, mediaError);
  const [notification] = await db.insert(adminNotificationsTable).values(
    notificationDbValues({ ...parsed.data, createdBy: req.userId! }),
  ).returning();
  await recordActivity({
    ownerUserId: req.userId!,
    event: "admin_notification.created",
    level: "success",
    message: "Created an admin notification",
    metadata: { notificationId: notification.id, status: notification.status },
  });
  res.status(201).json(CreateAdminNotificationResponse.parse(adminNotificationResponse(notification)));
});

router.patch("/admin/notifications/:notificationId", async (req, res): Promise<void> => {
  const params = UpdateAdminNotificationParams.safeParse(req.params);
  const parsed = UpdateAdminNotificationBody.safeParse(req.body);
  if (!params.success || !parsed.success) return void sendError(res, 400, "Thông tin thông báo không hợp lệ.");
  const [existing] = await db.select().from(adminNotificationsTable)
    .where(eq(adminNotificationsTable.id, params.data.notificationId)).limit(1);
  if (!existing) return void sendError(res, 404, "Không tìm thấy thông báo.");
  const nextData = {
    ...parsed.data,
    titleEn: parsed.data.titleEn === undefined ? existing.titleEn : parsed.data.titleEn,
    bodyEn: parsed.data.bodyEn === undefined ? existing.bodyEn : parsed.data.bodyEn,
    mediaPath: parsed.data.mediaPath === undefined ? existing.mediaPath : parsed.data.mediaPath,
    mediaType: parsed.data.mediaType === undefined ? existing.mediaType as "image" | "video" | null : parsed.data.mediaType,
    mediaName: parsed.data.mediaName === undefined ? existing.mediaName : parsed.data.mediaName,
    mediaSize: parsed.data.mediaSize === undefined ? existing.mediaSize : parsed.data.mediaSize,
  };
  const error = notificationInputError(nextData);
  if (error) return void sendError(res, 400, error);
  if (parsed.data.mediaPath !== undefined) {
    const mediaError = await notificationMediaError(nextData);
    if (mediaError) return void sendError(res, 400, mediaError);
  }
  const [notification] = await db.update(adminNotificationsTable)
    .set(notificationDbValues(nextData))
    .where(eq(adminNotificationsTable.id, params.data.notificationId))
    .returning();
  await recordActivity({
    ownerUserId: req.userId!,
    event: "admin_notification.updated",
    level: "success",
    message: "Updated an admin notification",
    metadata: { notificationId: notification.id, status: notification.status },
  });
  if (existing.mediaPath !== notification.mediaPath) await deleteUnusedNotificationMedia(existing.mediaPath, req);
  res.json(UpdateAdminNotificationResponse.parse(adminNotificationResponse(notification)));
});

router.delete("/admin/notifications/:notificationId", async (req, res): Promise<void> => {
  const params = DeleteAdminNotificationParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, "Thông báo không hợp lệ.");
  const [notification] = await db.delete(adminNotificationsTable)
    .where(eq(adminNotificationsTable.id, params.data.notificationId))
    .returning({ id: adminNotificationsTable.id, mediaPath: adminNotificationsTable.mediaPath });
  if (!notification) return void sendError(res, 404, "Không tìm thấy thông báo.");
  await recordActivity({
    ownerUserId: req.userId!,
    event: "admin_notification.deleted",
    level: "success",
    message: "Deleted an admin notification",
    metadata: { notificationId: notification.id },
  });
  await deleteUnusedNotificationMedia(notification.mediaPath, req);
  res.status(204).end();
});

router.patch("/admin/notifications/:notificationId/pin", async (req, res): Promise<void> => {
  const params = SetAdminNotificationPinnedParams.safeParse(req.params);
  const parsed = SetAdminNotificationPinnedBody.safeParse(req.body);
  if (!params.success || !parsed.success) return void sendError(res, 400, "Trạng thái ghim không hợp lệ.");
  const [notification] = await db.update(adminNotificationsTable)
    .set({ pinned: parsed.data.pinned, updatedAt: new Date() })
    .where(eq(adminNotificationsTable.id, params.data.notificationId))
    .returning();
  if (!notification) return void sendError(res, 404, "Không tìm thấy thông báo.");
  await recordActivity({
    ownerUserId: req.userId!,
    event: parsed.data.pinned ? "admin_notification.pinned" : "admin_notification.unpinned",
    level: "success",
    message: parsed.data.pinned ? "Pinned an admin notification" : "Unpinned an admin notification",
    metadata: { notificationId: notification.id },
  });
  res.json(adminNotificationResponse(notification));
});

router.patch("/admin/notifications/:notificationId/visibility", async (req, res): Promise<void> => {
  const params = SetAdminNotificationVisibilityParams.safeParse(req.params);
  const parsed = SetAdminNotificationVisibilityBody.safeParse(req.body);
  if (!params.success || !parsed.success) return void sendError(res, 400, "Trạng thái hiển thị không hợp lệ.");
  const [notification] = await db.update(adminNotificationsTable)
    .set({ dashboardVisible: parsed.data.dashboardVisible, updatedAt: new Date() })
    .where(eq(adminNotificationsTable.id, params.data.notificationId))
    .returning();
  if (!notification) return void sendError(res, 404, "Không tìm thấy thông báo.");
  await recordActivity({
    ownerUserId: req.userId!,
    event: parsed.data.dashboardVisible ? "admin_notification.restored" : "admin_notification.hidden",
    level: "success",
    message: parsed.data.dashboardVisible ? "Restored an admin notification" : "Removed an admin notification from dashboards",
    metadata: { notificationId: notification.id },
  });
  res.json(adminNotificationResponse(notification));
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const parsed = ListAdminUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "Bộ lọc người dùng không hợp lệ.");
    return;
  }
  res.json(ListAdminUsersResponse.parse(await listAdminUsers(parsed.data)));
});

router.get("/admin/users/:userId", async (req, res): Promise<void> => {
  const parsed = GetAdminUserParams.safeParse(req.params);
  if (!parsed.success) {
    sendError(res, 400, "Người dùng không hợp lệ.");
    return;
  }
  const user = await getAdminUser(parsed.data.userId);
  if (!user) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }
  res.json(GetAdminUserResponse.parse(user));
});

router.get("/admin/users/:userId/support", async (req, res): Promise<void> => {
  const parsed = GetAdminUserParams.safeParse(req.params);
  if (!parsed.success) {
    sendError(res, 400, "Người dùng không hợp lệ.");
    return;
  }
  const support = await getAdminUserSupport(parsed.data.userId);
  if (!support) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }
  res.json(GetAdminUserSupportResponse.parse(support));
});

router.post("/admin/users/:userId/campaigns/:campaignId/clone", async (req, res): Promise<void> => {
  const params = CloneAdminUserCampaignParams.safeParse(req.params);
  const body = CloneAdminUserCampaignBody.safeParse(req.body);
  if (!params.success || !body.success) {
    sendError(res, 400, "Thông tin clone campaign không hợp lệ.");
    return;
  }
  const adminUserId = req.userId!;
  const outcome = await db.transaction(async (tx) => {
    const [sourceCampaignCandidate] = await tx.select().from(campaignsTable).where(and(
      eq(campaignsTable.id, params.data.campaignId),
      eq(campaignsTable.ownerUserId, params.data.userId),
    ));
    if (!sourceCampaignCandidate) return { kind: "error" as const, status: 404, message: "Không tìm thấy campaign nguồn của người dùng." };
    await tx.execute(sql`SELECT 1 FROM ${campaignsTable} WHERE ${campaignsTable.id} = ${sourceCampaignCandidate.id} FOR UPDATE`);
    const [sourceCampaign] = await tx.select().from(campaignsTable).where(and(
      eq(campaignsTable.id, sourceCampaignCandidate.id),
      eq(campaignsTable.ownerUserId, params.data.userId),
    ));
    if (!sourceCampaign) return { kind: "error" as const, status: 404, message: "Campaign nguồn không còn tồn tại." };
    await tx.execute(sql`SELECT 1 FROM ${campaignTargetsTable} WHERE ${campaignTargetsTable.campaignId} = ${sourceCampaign.id} FOR SHARE`);
    const [adminAccount] = await tx.select().from(telegramAccountsTable).where(and(
      eq(telegramAccountsTable.id, body.data.telegramAccountId),
      eq(telegramAccountsTable.ownerUserId, adminUserId),
      isNull(telegramAccountsTable.deletedAt),
    ));
    if (!adminAccount) return { kind: "error" as const, status: 404, message: "Không tìm thấy tài khoản Telegram của admin." };
    await tx.execute(sql`SELECT 1 FROM ${telegramAccountsTable} WHERE ${telegramAccountsTable.id} = ${adminAccount.id} FOR UPDATE`);
    if (!adminAccount.sessionEncrypted || adminAccount.status !== "connected") {
      return { kind: "error" as const, status: 409, message: "Tài khoản Telegram của admin cần đăng nhập trước khi clone." };
    }
    const sourceTargetRows = await tx.select({ destinationId: campaignTargetsTable.destinationId })
      .from(campaignTargetsTable)
      .where(eq(campaignTargetsTable.campaignId, sourceCampaign.id));
    const sourceDestinationIds = [...new Set(sourceTargetRows.map((row) => row.destinationId))];
    const sourceDestinations = sourceDestinationIds.length
      ? await tx.select().from(destinationsTable).where(inArray(destinationsTable.id, sourceDestinationIds))
      : [];
    const [placeholderTemplate] = await tx.insert(messageTemplatesTable).values({
      ownerUserId: adminUserId,
      name: `Chờ forward · ${sourceCampaign.name}`,
      mode: "forward",
      content: "",
      sourceAccountId: null,
      sourceMessageId: null,
    }).returning();
    const [clone] = await tx.insert(campaignsTable).values({
      ownerUserId: adminUserId,
      name: `${sourceCampaign.name} (Clone admin)`,
      content: "",
      telegramAccountId: adminAccount.id,
      templateId: placeholderTemplate.id,
      templateMode: "forward",
      templateSourceAccountId: null,
      templateSourceMessageId: null,
      clonedFromCampaignId: sourceCampaign.id,
      clonedFromUserId: sourceCampaign.ownerUserId,
      mediaUrl: null,
      status: "draft",
      scheduledAt: sourceCampaign.scheduledAt,
      timezone: sourceCampaign.timezone,
      maxRetries: sourceCampaign.maxRetries,
      repeatCount: sourceCampaign.repeatCount,
      delayMinSeconds: sourceCampaign.delayMinSeconds,
      delayMaxSeconds: sourceCampaign.delayMaxSeconds,
      roundDelayMinSeconds: sourceCampaign.roundDelayMinSeconds,
      roundDelayMaxSeconds: sourceCampaign.roundDelayMaxSeconds,
    }).returning();
    const existingAdminDestinations = await tx.select().from(destinationsTable)
      .where(eq(destinationsTable.accountId, adminAccount.id));
    const byTelegramDestination = new Map(existingAdminDestinations.map((destination) => [
      `${destination.telegramId}:${destination.topicId ?? "chat"}`,
      destination,
    ]));
    const clonedDestinationIds: string[] = [];
    for (const sourceDestination of sourceDestinations) {
      const key = `${sourceDestination.telegramId}:${sourceDestination.topicId ?? "chat"}`;
      let destination = byTelegramDestination.get(key);
      if (!destination) {
        const [created] = await tx.insert(destinationsTable).values({
          accountId: adminAccount.id,
          telegramId: sourceDestination.telegramId,
          topicId: sourceDestination.topicId,
          parentTitle: sourceDestination.parentTitle,
          title: sourceDestination.title,
          username: sourceDestination.username,
          kind: sourceDestination.kind,
          memberCount: sourceDestination.memberCount,
          canPost: false,
          permissionReason: "Cần xác nhận quyền gửi bằng tài khoản Telegram của admin trước khi chạy.",
          permissionCheckedAt: null,
        }).returning();
        destination = created;
        byTelegramDestination.set(key, created);
      }
      clonedDestinationIds.push(destination.id);
    }
    if (clonedDestinationIds.length) {
      await tx.insert(campaignTargetsTable).values(Array.from(
        { length: sourceCampaign.repeatCount },
        () => clonedDestinationIds.map((destinationId) => ({
          campaignId: clone.id,
          destinationId,
          status: "pending" as const,
          attempts: 0,
          quotaReservedAt: null,
          nextAttemptAt: null,
          lastError: null,
          sentMessageId: null,
          sentAt: null,
        })),
      ).flat());
    }
    await tx.insert(activityLogsTable).values([
      {
        ownerUserId: adminUserId,
        event: "campaign.cloned",
        message: `Cloned "${sourceCampaign.name}" into a draft waiting for a Saved Message.`,
        campaignId: clone.id,
        accountId: adminAccount.id,
        level: "success",
        metadata: { sourceCampaignId: sourceCampaign.id, sourceUserId: sourceCampaign.ownerUserId },
      },
      {
        ownerUserId: sourceCampaign.ownerUserId,
        event: "campaign.cloned_by_admin",
        message: `An administrator cloned "${sourceCampaign.name}" for support.`,
        campaignId: sourceCampaign.id,
        level: "info",
        metadata: { clonedCampaignId: clone.id, adminUserId },
      },
    ]);
    return { kind: "success" as const, campaign: clone };
  });
  if (outcome.kind === "error") return void sendError(res, outcome.status, outcome.message);
  res.status(201).json(CloneAdminUserCampaignResponse.parse(await campaignSummary(outcome.campaign)));
});

router.get("/admin/user-support/campaign-targets", async (req, res): Promise<void> => {
  const parsed = GetAdminUserSupportCampaignTargetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "Tham số campaign không hợp lệ.");
    return;
  }
  const targetPage = await getAdminUserSupportCampaignTargets(parsed.data);
  if (!targetPage) {
    sendError(res, 404, "Không tìm thấy campaign của người dùng.");
    return;
  }
  res.json(GetAdminUserSupportCampaignTargetsResponse.parse(targetPage));
});

router.patch("/admin/users/:userId/subscription", async (req, res): Promise<void> => {
  const params = UpdateAdminUserSubscriptionParams.safeParse(req.params);
  const body = UpdateAdminUserSubscriptionBody.safeParse(req.body);
  if (!params.success || !body.success || !Number.isInteger(body.data.durationDays)) {
    sendError(res, 400, "Thông tin gói đăng ký không hợp lệ.");
    return;
  }
  const outcome = await updateSubscriptionByAdmin({
    userId: params.data.userId,
    adminUserId: req.userId!,
    plan: body.data.plan,
    durationDays: body.data.durationDays,
  });
  if (!outcome.ok && outcome.reason === "not_found") {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }
  if (!outcome.ok) {
    sendError(res, 400, "Thông tin thời hạn gói đăng ký không hợp lệ.");
    return;
  }
  res.json(UpdateAdminUserSubscriptionResponse.parse(outcome.subscription));
});

router.patch("/admin/users/:userId/quota", async (req, res): Promise<void> => {
  const params = UpdateAdminUserQuotaParams.safeParse(req.params);
  const body = UpdateAdminUserQuotaBody.safeParse(req.body);
  if (!params.success || !body.success) {
    sendError(res, 400, "Thiết lập quota người dùng không hợp lệ.");
    return;
  }
  const hasNoSchedule = body.data.dailyQuotaExemptFrom === null && body.data.dailyQuotaExemptUntil === null;
  const hasValidSchedule = body.data.dailyQuotaExemptFrom !== null
    && body.data.dailyQuotaExemptUntil !== null
    && body.data.dailyQuotaExemptFrom <= body.data.dailyQuotaExemptUntil;
  if (!hasNoSchedule && !hasValidSchedule) {
    sendError(res, 400, "Ngày bắt đầu và ngày kết thúc miễn quota không hợp lệ.");
    return;
  }
  const outcome = await updateUserDailyQuotaExemption({
    userId: params.data.userId,
    adminUserId: req.userId!,
    dailyQuotaExemptFrom: body.data.dailyQuotaExemptFrom,
    dailyQuotaExemptUntil: body.data.dailyQuotaExemptUntil,
  });
  if (!outcome.ok) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }
  if (outcome.subscription.dailyQuotaExempt) {
    await resumeQuotaPausedCampaignsAfterSettingsUpdate({
      ownerUserId: params.data.userId,
      pauseReasons: ["Daily user message limit reached. Campaign paused and will resume automatically on a new day."],
      trigger: "admin_quota_exemption",
    });
  }
  res.json(UpdateAdminUserQuotaResponse.parse(outcome.subscription));
});

router.get("/admin/purchase-settings", async (_req, res): Promise<void> => {
  res.json(GetAdminPurchaseSettingsResponse.parse(await getPurchaseSettings()));
});

router.patch("/admin/purchase-settings", async (req, res): Promise<void> => {
  const parsed = UpdateAdminPurchaseSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Link Telegram Bot không hợp lệ.");
    return;
  }

  const telegramPurchaseUrl = parsed.data.telegramPurchaseUrl.trim();
  if (!isTelegramPurchaseUrl(telegramPurchaseUrl)) {
    sendError(res, 400, "Link phải có dạng https://t.me/ten_bot hoặc https://telegram.me/ten_bot.");
    return;
  }

  const settings = await updatePurchaseSettings({
    telegramPurchaseUrl,
    updatedBy: req.userId!,
  });
  await recordActivity({
    ownerUserId: req.userId!,
    event: "purchase_settings.updated",
    message: "Updated Telegram purchase link",
    level: "success",
    metadata: { hostname: new URL(telegramPurchaseUrl).hostname },
  });
  res.json(UpdateAdminPurchaseSettingsResponse.parse(settings));
});

router.get("/admin/system-settings", async (_req, res): Promise<void> => {
  res.json(GetAdminSystemSettingsResponse.parse(await getSystemSettings()));
});

router.patch("/admin/system-settings", async (req, res): Promise<void> => {
  const parsed = UpdateAdminSystemSettingsBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, "Cấu hình hệ thống không hợp lệ.");
  const settings = parsed.data;
  const previousSettings = await getSystemSettings();
  const allLimits = Object.values(settings.planLimits);
  const allIntegerLimits = allLimits.every((limit) => (
    (Object.entries(PLAN_LIMIT_MAXIMUMS) as Array<[keyof typeof PLAN_LIMIT_MAXIMUMS, number]>)
      .every(([field, maximum]) => {
        const value = limit[field];
        return value === null || (Number.isInteger(value) && value >= 0 && value <= maximum);
      })
  ));
  const defaults = settings.campaignDefaults;
  const validDefaults = [
    defaults.maxRetries,
    defaults.roundDelayMinSeconds,
    defaults.roundDelayMaxSeconds,
    settings.defaultAccountDailyLimit,
  ].every(Number.isInteger)
    && defaults.roundDelayMinSeconds <= defaults.roundDelayMaxSeconds;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: settings.defaultTimezone });
  } catch {
    return void sendError(res, 400, "Múi giờ mặc định không hợp lệ.");
  }
  if (!allIntegerLimits || !validDefaults) return void sendError(res, 400, "Cấu hình giới hạn hoặc delay không hợp lệ.");
  const updated = await updateSystemSettings(settings, req.userId!);
  const quotaWasIncreased = (Object.keys(updated.planLimits) as Array<keyof typeof updated.planLimits>).some((plan) => {
    const previous = previousSettings.planLimits[plan];
    const next = updated.planLimits[plan];
    const increased = (before: number | null, after: number | null) => before !== null && (after === null || after > before);
    return increased(previous.messageDailyLimit, next.messageDailyLimit)
      || increased(previous.userMessageDailyLimit, next.userMessageDailyLimit);
  });
  await pauseCampaignsOverCurrentQuotaAfterSettingsUpdate();
  if (quotaWasIncreased) await resumeQuotaPausedCampaignsAfterSettingsUpdate();
  await recordActivity({
    ownerUserId: req.userId!,
    event: "system_settings.updated",
    level: "success",
    message: "Updated system settings",
    metadata: {
      registrationEnabled: updated.registrationEnabled,
      maintenanceMode: updated.maintenanceMode,
      defaultTimezone: updated.defaultTimezone,
    },
  });
  res.json(UpdateAdminSystemSettingsResponse.parse(updated));
});

router.get("/admin/operations", async (_req, res): Promise<void> => {
  const [users, accounts, proxies, campaigns, targets, logs] = await Promise.all([
    db.select({ id: appUsersTable.id, username: appUsersTable.username }).from(appUsersTable),
    db.select({
      id: telegramAccountsTable.id,
      ownerUserId: telegramAccountsTable.ownerUserId,
      name: telegramAccountsTable.name,
      status: telegramAccountsTable.status,
      proxyId: telegramAccountsTable.proxyId,
      lastSyncAt: telegramAccountsTable.lastSyncAt,
      cooldownUntil: telegramAccountsTable.cooldownUntil,
    }).from(telegramAccountsTable),
    db.select({ id: proxiesTable.id, name: proxiesTable.name, status: proxiesTable.status }).from(proxiesTable),
    db.select({
      id: campaignsTable.id,
      ownerUserId: campaignsTable.ownerUserId,
      name: campaignsTable.name,
      status: campaignsTable.status,
    }).from(campaignsTable).orderBy(desc(campaignsTable.createdAt)),
    db.select({
      id: campaignTargetsTable.id,
      campaignId: campaignTargetsTable.campaignId,
      destinationId: campaignTargetsTable.destinationId,
      status: campaignTargetsTable.status,
      attempts: campaignTargetsTable.attempts,
      nextAttemptAt: campaignTargetsTable.nextAttemptAt,
      lastError: campaignTargetsTable.lastError,
    }).from(campaignTargetsTable).orderBy(desc(campaignTargetsTable.updatedAt)),
    db.select({
      id: activityLogsTable.id,
      ownerUserId: activityLogsTable.ownerUserId,
      level: activityLogsTable.level,
      event: activityLogsTable.event,
      message: activityLogsTable.message,
      metadata: activityLogsTable.metadata,
      campaignId: activityLogsTable.campaignId,
      accountId: activityLogsTable.accountId,
      createdAt: activityLogsTable.createdAt,
    }).from(activityLogsTable).orderBy(desc(activityLogsTable.createdAt)).limit(200),
  ]);
  const destinations = await db.select({ id: destinationsTable.id, title: destinationsTable.title }).from(destinationsTable);
  const storage = await getStorageStatus();
  const usernames = new Map(users.map((user) => [user.id, user.username]));
  const proxyById = new Map(proxies.map((proxy) => [proxy.id, proxy]));
  const destinationTitles = new Map(destinations.map((destination) => [destination.id, destination.title]));
  const targetsByCampaign = new Map<string, typeof targets>();
  for (const target of targets) targetsByCampaign.set(target.campaignId, [...(targetsByCampaign.get(target.campaignId) ?? []), target]);
  const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

  res.json(GetAdminOperationsResponse.parse({
    accounts: accounts.map((account) => {
      const proxy = account.proxyId ? proxyById.get(account.proxyId) : undefined;
      const failedTargets = targets.filter((target) => target.status === "failed" && campaignsById.get(target.campaignId)?.ownerUserId === account.ownerUserId).length;
      return {
        id: account.id,
        ownerUsername: usernames.get(account.ownerUserId) ?? "Unknown",
        name: account.name,
        status: account.status,
        proxyName: proxy?.name ?? null,
        proxyStatus: proxy?.status ?? null,
        lastSyncAt: account.lastSyncAt,
        cooldownUntil: account.cooldownUntil,
        failedTargets,
      };
    }),
    campaigns: campaigns.slice(0, 100).map((campaign) => {
      const campaignTargets = targetsByCampaign.get(campaign.id) ?? [];
      return {
        id: campaign.id,
        ownerUsername: usernames.get(campaign.ownerUserId) ?? "Unknown",
        name: campaign.name,
        status: campaign.status,
        pendingTargets: campaignTargets.filter((target) => ["pending", "sending"].includes(target.status)).length,
        failedTargets: campaignTargets.filter((target) => target.status === "failed").length,
        reviewTargets: campaignTargets.filter((target) => target.status === "requires_review").length,
        sentTargets: campaignTargets.filter((target) => target.status === "sent").length,
      };
    }),
    targets: targets.filter((target) => ["pending", "sending", "failed", "requires_review"].includes(target.status)).slice(0, 200).map((target) => {
      const campaign = campaignsById.get(target.campaignId);
      return {
        id: target.id,
        campaignId: target.campaignId,
        campaignName: campaign?.name ?? "Unknown campaign",
        ownerUsername: campaign ? usernames.get(campaign.ownerUserId) ?? "Unknown" : "Unknown",
        destinationTitle: destinationTitles.get(target.destinationId) ?? null,
        status: target.status,
        attempts: target.attempts,
        nextAttemptAt: target.nextAttemptAt,
        lastError: target.lastError,
      };
    }),
    auditLogs: logs.map((log) => ({
      id: log.id,
      actorUsername: usernames.get(log.ownerUserId) ?? "Unknown",
      level: log.level,
      event: log.event,
      message: log.message,
      ip: log.metadata && typeof log.metadata === "object" && "ip" in log.metadata && typeof log.metadata.ip === "string" ? log.metadata.ip : null,
      campaignId: log.campaignId,
      accountId: log.accountId,
      createdAt: log.createdAt,
    })),
    storage,
  }));
});

async function adminCampaignOperationResponse(campaign: typeof campaignsTable.$inferSelect) {
  const [targets, owner] = await Promise.all([
    db.select({ status: campaignTargetsTable.status }).from(campaignTargetsTable)
      .where(eq(campaignTargetsTable.campaignId, campaign.id)),
    db.select({ username: appUsersTable.username }).from(appUsersTable)
      .where(eq(appUsersTable.id, campaign.ownerUserId)).limit(1),
  ]);
  return {
    id: campaign.id,
    ownerUsername: owner[0]?.username ?? "Unknown",
    name: campaign.name,
    status: campaign.status,
    pendingTargets: targets.filter((target) => ["pending", "sending"].includes(target.status)).length,
    failedTargets: targets.filter((target) => target.status === "failed").length,
    reviewTargets: targets.filter((target) => target.status === "requires_review").length,
    sentTargets: targets.filter((target) => target.status === "sent").length,
  };
}

type TransactionalQuery = Pick<typeof db, "execute" | "select">;

async function checkCampaignReadiness(
  tx: TransactionalQuery,
  campaign: typeof campaignsTable.$inferSelect,
) {
  if (!campaign.telegramAccountId || !campaign.templateId) {
    return { ready: false as const, message: "Campaign cần tài khoản Telegram và mẫu tin trước khi chạy." };
  }
  await Promise.all([
    tx.execute(sql`SELECT 1 FROM ${telegramAccountsTable} WHERE ${telegramAccountsTable.id} = ${campaign.telegramAccountId} FOR SHARE`),
    tx.execute(sql`SELECT 1 FROM ${messageTemplatesTable} WHERE ${messageTemplatesTable.id} = ${campaign.templateId} FOR SHARE`),
    tx.execute(sql`
      SELECT 1 FROM ${campaignTargetsTable}
      INNER JOIN ${destinationsTable} ON ${campaignTargetsTable.destinationId} = ${destinationsTable.id}
      WHERE ${campaignTargetsTable.campaignId} = ${campaign.id}
      FOR SHARE
    `),
  ]);
  const [accountRows, templateRows, targetDestinations] = await Promise.all([
    tx.select().from(telegramAccountsTable).where(and(
      eq(telegramAccountsTable.id, campaign.telegramAccountId),
      eq(telegramAccountsTable.ownerUserId, campaign.ownerUserId),
      isNull(telegramAccountsTable.deletedAt),
    )).limit(1),
    tx.select().from(messageTemplatesTable).where(and(
      eq(messageTemplatesTable.id, campaign.templateId),
      eq(messageTemplatesTable.ownerUserId, campaign.ownerUserId),
    )).limit(1),
    tx.select({ destination: destinationsTable }).from(campaignTargetsTable)
      .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
      .where(eq(campaignTargetsTable.campaignId, campaign.id)),
  ]);
  const account = accountRows[0];
  const template = templateRows[0];
  if (!account || !account.sessionEncrypted || account.status !== "connected") {
    return { ready: false as const, message: "Tài khoản Telegram của campaign cần được kết nối trước khi chạy." };
  }
  if (!template) {
    return { ready: false as const, message: "Mẫu tin của campaign không còn khả dụng." };
  }
  if (template.mode === "forward" && (
    template.sourceAccountId !== campaign.telegramAccountId || !template.sourceMessageId
  )) {
    return { ready: false as const, message: "Campaign forward cần một Tin nhắn đã lưu hợp lệ trước khi chạy." };
  }
  if (!targetDestinations.length || targetDestinations.some(({ destination }) => (
    destination.accountId !== campaign.telegramAccountId || !destination.canPost
  ))) {
    return { ready: false as const, message: "Mọi group đích cần được đồng bộ và có quyền gửi trước khi chạy." };
  }
  return { ready: true as const };
}

async function updateCampaignStatusAsAdmin(input: {
  actorUserId: string;
  campaignId: string;
  ownerUserId?: string;
  status: "queued" | "paused";
}) {
  const filters = [
    eq(campaignsTable.id, input.campaignId),
    ...(input.ownerUserId ? [eq(campaignsTable.ownerUserId, input.ownerUserId)] : []),
  ];
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ${campaignsTable} WHERE ${and(...filters)} FOR UPDATE`);
    const [existing] = await tx.select().from(campaignsTable).where(and(...filters)).limit(1);
    if (!existing) return { kind: "error" as const, status: 404, message: "Không tìm thấy campaign của người dùng." };
    if (input.status === "paused" && !["queued", "running"].includes(existing.status)) {
      return { kind: "error" as const, status: 409, message: "Chỉ có thể dừng campaign đang chờ hoặc đang chạy." };
    }
    if (input.status === "queued" && existing.status !== "paused") {
      return { kind: "error" as const, status: 409, message: "Chỉ có thể tiếp tục campaign đang tạm dừng." };
    }

    let scheduleRebase: { rebasedTargetCount: number; clearedPastSchedule: boolean; nextRunAt: Date | null } | null = null;
    const now = new Date();
    if (input.status === "queued") {
      const readiness = await checkCampaignReadiness(tx, existing);
      if (!readiness.ready) return { kind: "error" as const, status: 409, message: readiness.message };
      await tx.execute(sql`SELECT 1 FROM ${campaignTargetsTable} WHERE ${campaignTargetsTable.campaignId} = ${existing.id} FOR UPDATE`);
      const targets = await tx.select({
        id: campaignTargetsTable.id,
        status: campaignTargetsTable.status,
        lastError: campaignTargetsTable.lastError,
        nextAttemptAt: campaignTargetsTable.nextAttemptAt,
      }).from(campaignTargetsTable).where(eq(campaignTargetsTable.campaignId, existing.id));
      const rebase = rebasePastPendingSchedule(targets, now);
      let rebasedTargetCount = 0;
      for (const update of rebase.updates) {
        const [updated] = await tx.update(campaignTargetsTable).set({
          nextAttemptAt: update.nextAttemptAt,
          updatedAt: now,
        }).where(and(
          eq(campaignTargetsTable.id, update.id),
          eq(campaignTargetsTable.status, "pending"),
          isNull(campaignTargetsTable.lastError),
          eq(campaignTargetsTable.nextAttemptAt, update.previousNextAttemptAt),
        )).returning({ id: campaignTargetsTable.id });
        if (!updated) throw new Error(`Campaign target ${update.id} changed while resuming.`);
        rebasedTargetCount += 1;
      }
      const clearedPastSchedule = Boolean(existing.scheduledAt && existing.scheduledAt <= now);
      if (clearedPastSchedule) {
        await tx.update(campaignsTable).set({ scheduledAt: null, updatedAt: now })
          .where(and(eq(campaignsTable.id, existing.id), eq(campaignsTable.status, "paused")));
      }
      scheduleRebase = { rebasedTargetCount, clearedPastSchedule, nextRunAt: rebase.nextRunAt };
    }

    const [campaign] = await tx.update(campaignsTable).set({
      status: input.status,
      pauseReason: input.status === "paused" ? "manual" : null,
      updatedAt: now,
    }).where(and(
      ...filters,
      eq(campaignsTable.status, existing.status),
    )).returning();
    if (!campaign) return { kind: "error" as const, status: 409, message: "Trạng thái campaign đã thay đổi. Hãy tải lại và thử lại." };
    return { kind: "success" as const, campaign, existing, scheduleRebase };
  });
  if (outcome.kind === "error") return outcome;

  await recordActivity({
    ownerUserId: input.actorUserId,
    event: "campaign.admin_status_updated",
    level: "success",
    campaignId: outcome.campaign.id,
    message: `Admin changed customer campaign status from ${outcome.existing.status} to ${input.status}.`,
    metadata: {
      targetOwnerUserId: outcome.campaign.ownerUserId,
      previousStatus: outcome.existing.status,
      status: input.status,
      ...(outcome.scheduleRebase?.rebasedTargetCount
        ? { scheduleRebased: true, pendingTargetCount: outcome.scheduleRebase.rebasedTargetCount }
        : {}),
    },
  });
  return { kind: "success" as const, campaign: outcome.campaign };
}

async function retryCampaignTargetAsAdmin(input: {
  actorUserId: string;
  ownerUserId?: string;
  targetId: string;
}) {
  const outcome = await db.transaction(async (tx) => {
    const [candidate] = await tx.select({
      target: campaignTargetsTable,
      campaign: campaignsTable,
    }).from(campaignTargetsTable)
      .innerJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
      .where(and(
        eq(campaignTargetsTable.id, input.targetId),
        ...(input.ownerUserId ? [eq(campaignsTable.ownerUserId, input.ownerUserId)] : []),
      )).limit(1);
    if (!candidate) return { kind: "error" as const, status: 404, message: "Không tìm thấy target của người dùng." };
    await tx.execute(sql`SELECT 1 FROM ${campaignsTable} WHERE ${campaignsTable.id} = ${candidate.campaign.id} FOR UPDATE`);
    await tx.execute(sql`SELECT 1 FROM ${campaignTargetsTable} WHERE ${campaignTargetsTable.id} = ${candidate.target.id} FOR UPDATE`);
    const [target] = await tx.select().from(campaignTargetsTable).where(eq(campaignTargetsTable.id, candidate.target.id));
    if (!target || target.status !== "failed") {
      return {
        kind: "error" as const,
        status: 409,
        message: target?.status === "requires_review"
          ? "Target cần xác minh kết quả gửi trước khi retry để tránh gửi trùng và giữ quota chính xác."
          : "Chỉ có thể retry target đang lỗi.",
      };
    }
    const [campaign] = await tx.select().from(campaignsTable).where(eq(campaignsTable.id, target.campaignId));
    if (!campaign) return { kind: "error" as const, status: 404, message: "Không tìm thấy campaign." };
    const shouldResumeCompletedCampaign = ["completed", "completed_with_errors"].includes(campaign.status);
    if (shouldResumeCompletedCampaign) {
      const readiness = await checkCampaignReadiness(tx, campaign);
      if (!readiness.ready) {
        return { kind: "error" as const, status: 409, message: readiness.message };
      }
    }
    const now = new Date();
    const [retriedTarget] = await tx.update(campaignTargetsTable).set({
      status: "pending",
      quotaReservedAt: null,
      nextAttemptAt: now,
      lastError: null,
      updatedAt: now,
    }).where(and(
      eq(campaignTargetsTable.id, target.id),
      eq(campaignTargetsTable.status, "failed"),
    )).returning();
    if (!retriedTarget) return { kind: "error" as const, status: 409, message: "Target đã thay đổi trạng thái. Hãy tải lại và thử lại." };

    const [updatedCampaign] = shouldResumeCompletedCampaign
      ? await tx.update(campaignsTable).set({ status: "queued", pauseReason: null, updatedAt: now })
        .where(and(eq(campaignsTable.id, campaign.id), eq(campaignsTable.status, campaign.status))).returning()
      : [campaign];
    if (!updatedCampaign) return { kind: "error" as const, status: 409, message: "Campaign đã thay đổi trạng thái. Hãy tải lại và thử lại." };
    const [destination] = await tx.select({ title: destinationsTable.title }).from(destinationsTable)
      .where(eq(destinationsTable.id, retriedTarget.destinationId)).limit(1);
    return { kind: "success" as const, target: retriedTarget, campaign: updatedCampaign, destinationTitle: destination?.title ?? null };
  });
  if (outcome.kind === "error") return outcome;

  const [owner] = await db.select({ username: appUsersTable.username }).from(appUsersTable)
    .where(eq(appUsersTable.id, outcome.campaign.ownerUserId)).limit(1);
  await recordActivity({
    ownerUserId: input.actorUserId,
    event: "campaign.target.admin_retried",
    level: "success",
    campaignId: outcome.target.campaignId,
    targetId: outcome.target.id,
    message: `Admin requeued a failed target for customer campaign "${outcome.campaign.name}".`,
    metadata: { targetOwnerUserId: outcome.campaign.ownerUserId },
  });
  return {
    kind: "success" as const,
    response: {
      id: outcome.target.id,
      campaignId: outcome.target.campaignId,
      campaignName: outcome.campaign.name,
      ownerUsername: owner?.username ?? "Unknown",
      destinationTitle: outcome.destinationTitle,
      status: outcome.target.status,
      attempts: outcome.target.attempts,
      nextAttemptAt: outcome.target.nextAttemptAt,
      lastError: outcome.target.lastError,
    },
  };
}

router.patch("/admin/campaigns/:campaignId", async (req, res): Promise<void> => {
  const params = UpdateAdminCampaignStatusParams.safeParse(req.params);
  const body = UpdateAdminCampaignStatusBody.safeParse(req.body);
  if (!params.success || !body.success) return void sendError(res, 400, "Trạng thái campaign không hợp lệ.");
  const outcome = await updateCampaignStatusAsAdmin({
    actorUserId: req.userId!,
    campaignId: params.data.campaignId,
    status: body.data.status,
  });
  if (outcome.kind === "error") return void sendError(res, outcome.status, outcome.message);
  res.json(UpdateAdminCampaignStatusResponse.parse(await adminCampaignOperationResponse(outcome.campaign)));
});

router.patch("/admin/users/:userId/campaigns/:campaignId", async (req, res): Promise<void> => {
  const params = UpdateAdminUserCampaignStatusParams.safeParse(req.params);
  const body = UpdateAdminUserCampaignStatusBody.safeParse(req.body);
  if (!params.success || !body.success) return void sendError(res, 400, "Trạng thái campaign không hợp lệ.");
  const outcome = await updateCampaignStatusAsAdmin({
    actorUserId: req.userId!,
    campaignId: params.data.campaignId,
    ownerUserId: params.data.userId,
    status: body.data.status,
  });
  if (outcome.kind === "error") return void sendError(res, outcome.status, outcome.message);
  res.json(UpdateAdminUserCampaignStatusResponse.parse(await adminCampaignOperationResponse(outcome.campaign)));
});

router.post("/admin/targets/:targetId/retry", async (req, res): Promise<void> => {
  const params = RetryAdminCampaignTargetParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, "Target không hợp lệ.");
  const outcome = await retryCampaignTargetAsAdmin({ actorUserId: req.userId!, targetId: params.data.targetId });
  if (outcome.kind === "error") return void sendError(res, outcome.status, outcome.message);
  res.json(RetryAdminCampaignTargetResponse.parse(outcome.response));
});

router.post("/admin/users/:userId/targets/:targetId/retry", async (req, res): Promise<void> => {
  const params = RetryAdminUserSupportCampaignTargetParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, "Target không hợp lệ.");
  const outcome = await retryCampaignTargetAsAdmin({
    actorUserId: req.userId!,
    ownerUserId: params.data.userId,
    targetId: params.data.targetId,
  });
  if (outcome.kind === "error") return void sendError(res, outcome.status, outcome.message);
  res.json(RetryAdminUserSupportCampaignTargetResponse.parse(outcome.response));
});

router.get("/admin/license-keys", async (req, res): Promise<void> => {
  const parsed = ListAdminLicenseKeysQueryParams.safeParse(req.query);
  if (!parsed.success) return void sendError(res, 400, "Bộ lọc license key không hợp lệ.");
  const licenses = await listAdminLicenseKeys(parsed.data);
  res.json(ListAdminLicenseKeysResponse.parse(licenses));
});

router.get("/admin/license-keys/:licenseKeyId/secret", async (req, res): Promise<void> => {
  const parsed = GetAdminLicenseKeySecretParams.safeParse(req.params);
  if (!parsed.success) return void sendError(res, 400, "License key không hợp lệ.");
  const outcome = await revealAdminLicenseKey(parsed.data.licenseKeyId);
  if (!outcome.ok && outcome.reason === "not_found") {
    return void sendError(res, 404, "Không tìm thấy license key.");
  }
  if (!outcome.ok) {
    return void sendError(res, 409, "License key này được tạo trước khi hỗ trợ sao chép lại.");
  }
  res.json(GetAdminLicenseKeySecretResponse.parse(outcome));
});

router.post("/admin/license-keys", async (req, res): Promise<void> => {
  const parsed = CreateAdminLicenseKeyBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, "Thông tin license key không hợp lệ.");
  if (!Number.isInteger(parsed.data.durationDays) || !Number.isInteger(parsed.data.quantity)) {
    return void sendError(res, 400, "Thời hạn và số lượng license key phải là số nguyên.");
  }
  try {
    const created = await createAdminLicenseKeys({
      ...parsed.data,
      createdBy: req.userId!,
      createdByUsername: req.authUser!.username,
    });
    res.status(201).json(CreateAdminLicenseKeyResponse.parse(created));
  } catch (error) {
    req.log.error({ err: error }, "Unable to create license key");
    sendError(res, 500, "Không thể tạo license key lúc này.");
  }
});

router.post("/admin/license-keys/:licenseKeyId/revoke", async (req, res): Promise<void> => {
  const parsed = RevokeAdminLicenseKeyParams.safeParse(req.params);
  if (!parsed.success) return void sendError(res, 400, "License key không hợp lệ.");
  const outcome = await revokeAdminLicenseKey(parsed.data.licenseKeyId, req.userId!);
  if (outcome === "not_found") return void sendError(res, 404, "Không tìm thấy license key.");
  if (outcome === "not_available") {
    return void sendError(res, 409, "Chỉ có thể vô hiệu hóa key chưa được kích hoạt.");
  }
  res.status(204).send();
});

export default router;