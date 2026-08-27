import { Router, type IRouter } from "express";
import { createReadStream } from "node:fs";
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  CreateCampaignBody,
  CreateCampaignResponse,
  CloneCampaignParams,
  CloneCampaignBody,
  CloneCampaignResponse,
  ActivateLicenseBody,
  ActivateLicenseResponse,
  GetAccountSummaryResponse,
  GetDashboardResponse,
  GetUpgradeSummaryResponse,
  GetSystemDefaultsResponse,
  GetGroupLibraryAccessResponse,
  GetGroupLibraryResponse,
  GetTelegramConfigResponse,
  ListActivityQueryParams,
  ListActivityResponse,
  ListCalendarItemsQueryParams,
  ListCalendarItemsResponse,
  ListCampaignsResponse,
  GetCampaignCloneReadinessParams,
  GetCampaignCloneReadinessResponse,
  ListDestinationsResponse,
  ListMessageTemplatesResponse,
  GetTelegramSavedMessageParams,
  GetTelegramSavedMessageResponse,
  ListTelegramSavedMessagesParams,
  ListTelegramSavedMessagesResponse,
  ListTelegramAccountsResponse,
  CreateMessageTemplateBody,
  CreateMessageTemplateResponse,
  CreateTelegramAccountBody,
  CreateTelegramAccountResponse,
  StartTelegramLoginParams,
  StartTelegramLoginResponse,
  ConfirmTelegramLoginCodeParams,
  ConfirmTelegramLoginCodeBody,
  ConfirmTelegramLoginCodeResponse,
  ConfirmTelegramLoginPasswordParams,
  ConfirmTelegramLoginPasswordBody,
  ConfirmTelegramLoginPasswordResponse,
  DeleteTelegramAccountParams,
  DeleteTelegramAccountResponse,
  SyncTelegramDestinationsParams,
  SyncTelegramDestinationsResponse,
  UpdateMessageTemplateBody,
  UpdateMessageTemplateParams,
  UpdateMessageTemplateResponse,
  DeleteMessageTemplateParams,
  AttachProxyAccountParams,
  CreateProxyBody,
  CreateProxyResponse,
  DeleteProxyParams,
  DetachProxyAccountParams,
  ListProxiesResponse,
  ProxyTestResponseSchema,
  TestProxyParams,
  UpdateProxyBody,
  UpdateProxyParams,
  UpdateProxyResponse,
  UpdateCampaignStatusBody,
  UpdateCampaignStatusParams,
  UpdateCampaignStatusResponse,
} from "@workspace/api-zod";
import {
  activityLogsTable,
  adminNotificationsTable,
  appUsersTable,
  authChallengesTable,
  campaignTargetsTable,
  campaignsTable,
  db,
  destinationsTable,
  messageTemplatesTable,
  proxiesTable,
  telegramAccountsTable,
} from "@workspace/db";
import { campaignCloneMode, campaignSummary, rebaseCampaignScheduleForResume } from "../lib/campaigns";
import { getUserDailyQuotaUsage } from "../lib/user-daily-quota";
import { recordActivity } from "../lib/activity";
import { getTelegramConfiguration } from "../lib/telegram-config";
import { getPurchaseSettings } from "../lib/purchase-settings";
import {
  confirmTelegramPhoneCode,
  confirmTelegramTwoFactorPassword,
  credentialsForAccount,
  encryptSecret,
  getAccountClient,
  getTelegramProxyConfig,
  getTelegramSavedMessage,
  isDevelopmentDemoTelegramAccount,
  isTelegramSessionRevoked,
  listTelegramSavedMessages,
  phoneForAccount,
  startTelegramPhoneLogin,
  syncAccountDestinations,
} from "../lib/telegram";
import { decryptSecret } from "../lib/crypto";
import {
  activateLicenseForUser,
  getCampaignAllowance,
  getSubscription,
  getTelegramAccountAllowance,
  getConfiguredPlanCatalog,
} from "../lib/subscriptions";
import { requireActiveSubscription, requireAuth } from "../middlewares/authMiddleware";
import { getSystemSettings } from "../lib/system-settings";
import { getAdminActiveGroupDirectory } from "../lib/admin-active-group-directory";
import { testProxyConnection } from "../lib/proxy-test";
import { resolveCampaignScheduleStart } from "../lib/campaign-schedule";
import { adminNotificationResponse, isNotificationActive } from "../lib/admin-notifications";
import { NotificationMediaNotFoundError, NotificationMediaStorage } from "../lib/notificationMediaStorage";

const router: IRouter = Router();
const activityDestinationAccounts = alias(telegramAccountsTable, "activity_destination_accounts");
const notificationMediaStorage = new NotificationMediaStorage();
const sendError = (res: any, status: number, error: string) => {
  res.status(status).json({ error });
};
const currentUserId = (req: any): string => req.userId;
const normalizePhone = (phone: string) => phone.trim().replace(/[\s-]/g, "");
const maskPhone = (phone: string) => `••••${phone.slice(-4)}`;
const revokedTelegramSessionMessage = "Phiên Telegram đã hết hiệu lực. Hãy vào mục Tài khoản Telegram và bấm Xác minh để đăng nhập lại.";
const LOGIN_CHALLENGE_TTL_MS = 10 * 60_000;
const MAX_LOGIN_ATTEMPTS = 5;
const PROXY_TEST_WINDOW_MS = 5 * 60_000;
const MAX_PROXY_TESTS_PER_WINDOW = 3;
const MAX_CONCURRENT_PROXY_TESTS_PER_USER = 1;
const proxyTestLimits = new Map<string, { active: number; attempts: number[] }>();
type WaitingLoginStatus = "waiting_code" | "waiting_password";
type ProcessingLoginStatus = "processing_code" | "processing_password";

function acquireProxyTestSlot(ownerUserId: string): (() => void) | null {
  const now = Date.now();
  const state = proxyTestLimits.get(ownerUserId) ?? { active: 0, attempts: [] };
  state.attempts = state.attempts.filter((attempt) => now - attempt < PROXY_TEST_WINDOW_MS);
  if (state.active >= MAX_CONCURRENT_PROXY_TESTS_PER_USER || state.attempts.length >= MAX_PROXY_TESTS_PER_WINDOW) {
    proxyTestLimits.set(ownerUserId, state);
    return null;
  }
  state.active += 1;
  state.attempts.push(now);
  proxyTestLimits.set(ownerUserId, state);
  return () => {
    state.active = Math.max(0, state.active - 1);
    if (state.active === 0 && state.attempts.every((attempt) => Date.now() - attempt >= PROXY_TEST_WINDOW_MS)) {
      proxyTestLimits.delete(ownerUserId);
    }
  };
}
const telegramAccountResponse = (account: typeof telegramAccountsTable.$inferSelect) => ({
  id: account.id,
  name: account.name,
  username: account.username,
  phone: account.phoneEncrypted ? decryptSecret(account.phoneEncrypted) : account.phoneMasked,
  api_id: account.apiId,
  telegramUserId: account.telegramUserId,
  status: account.status,
  daily_limit: account.dailyLimit,
  proxyId: account.proxyId,
  lastSyncAt: account.lastSyncAt,
  createdAt: account.createdAt,
});

async function ownedTelegramAccount(accountId: string, ownerUserId: string) {
  const [account] = await db.select().from(telegramAccountsTable).where(and(
    eq(telegramAccountsTable.id, accountId),
    eq(telegramAccountsTable.ownerUserId, ownerUserId),
    isNull(telegramAccountsTable.deletedAt),
  ));
  return account;
}

async function ownedProxy(proxyId: string, ownerUserId: string) {
  const [proxy] = await db.select().from(proxiesTable).where(and(
    eq(proxiesTable.id, proxyId),
    eq(proxiesTable.ownerUserId, ownerUserId),
  ));
  return proxy;
}

async function proxyResponse(proxy: typeof proxiesTable.$inferSelect) {
  const accounts = await db.select({
    id: telegramAccountsTable.id,
    name: telegramAccountsTable.name,
    phoneEncrypted: telegramAccountsTable.phoneEncrypted,
    phoneMasked: telegramAccountsTable.phoneMasked,
  }).from(telegramAccountsTable).where(and(
    eq(telegramAccountsTable.proxyId, proxy.id),
    isNull(telegramAccountsTable.deletedAt),
  ));
  return {
    id: proxy.id,
    name: proxy.name,
    type: proxy.type === "socks5" ? "socks5" as const : "http" as const,
    host: proxy.host,
    port: proxy.port,
    hasAuth: Boolean(proxy.usernameEncrypted || proxy.passwordEncrypted),
    status: proxy.status === "inactive" ? "inactive" as const : "active" as const,
    accountCount: accounts.length,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      phone: account.phoneEncrypted ? decryptSecret(account.phoneEncrypted) : account.phoneMasked,
    })),
    lastCheckedAt: proxy.lastCheckedAt,
    createdAt: proxy.createdAt,
    updatedAt: proxy.updatedAt,
  };
}

function templateResponse(template: typeof messageTemplatesTable.$inferSelect) {
  return {
    id: template.id,
    name: template.name,
    mode: template.mode === "forward" ? "forward" as const : "text" as const,
    content: template.content,
    sourceAccountId: template.sourceAccountId,
    sourceMessageId: template.sourceMessageId,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

async function validateForwardTemplateSource(sourceAccountId: string | null | undefined, sourceMessageId: string | null | undefined, ownerUserId: string) {
  if (!sourceAccountId || !sourceMessageId) {
    return { error: "Hãy chọn tài khoản Telegram và tin nhắn đã lưu để forward." };
  }
  const account = await ownedTelegramAccount(sourceAccountId, ownerUserId);
  if (!account) return { error: "Không tìm thấy tài khoản Telegram đã chọn.", status: 404 };
  if (!account.sessionEncrypted || account.status !== "connected") {
    return { error: "Tài khoản Telegram cần đăng nhập trước khi dùng Tin nhắn đã lưu.", status: 409 };
  }
  return { account };
}

async function startLoginChallenge(account: typeof telegramAccountsTable.$inferSelect) {
  const login = await startTelegramPhoneLogin(credentialsForAccount(account), phoneForAccount(account), await getTelegramProxyConfig(account));
  const expiresAt = new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS);
  await db.update(authChallengesTable).set({ status: "expired" })
    .where(and(
      eq(authChallengesTable.accountId, account.id),
      inArray(authChallengesTable.status, ["waiting_code", "waiting_password", "processing_code", "processing_password"]),
    ));
  const [challenge] = await db.insert(authChallengesTable).values({
    accountId: account.id,
    ownerUserId: account.ownerUserId,
    status: "waiting_code",
    phoneCodeHashEncrypted: encryptSecret(login.phoneCodeHash),
    sessionEncrypted: encryptSecret(login.session),
    expiresAt,
  }).returning();
  const [authorizingAccount] = await db.update(telegramAccountsTable).set({
    status: "authorizing",
    updatedAt: new Date(),
  }).where(eq(telegramAccountsTable.id, account.id)).returning();
  return {
    account: authorizingAccount,
    challenge: { id: challenge.id, expiresAt: challenge.expiresAt, delivery: login.delivery },
  };
}

async function startDevelopmentDemoLoginChallenge(account: typeof telegramAccountsTable.$inferSelect) {
  const expiresAt = new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS);
  await db.update(authChallengesTable).set({ status: "expired" })
    .where(and(
      eq(authChallengesTable.accountId, account.id),
      inArray(authChallengesTable.status, ["waiting_code", "waiting_password", "processing_code", "processing_password"]),
    ));
  const [challenge] = await db.insert(authChallengesTable).values({
    accountId: account.id,
    ownerUserId: account.ownerUserId,
    status: "waiting_code",
    phoneCodeHashEncrypted: encryptSecret("development-demo-code"),
    sessionEncrypted: encryptSecret("development-demo-session"),
    expiresAt,
  }).returning();
  const [authorizingAccount] = await db.update(telegramAccountsTable).set({
    status: "authorizing",
    updatedAt: new Date(),
  }).where(eq(telegramAccountsTable.id, account.id)).returning();
  return {
    account: authorizingAccount,
    challenge: { id: challenge.id, expiresAt: challenge.expiresAt, delivery: "app" as const },
  };
}

async function activeLoginChallenge(input: {
  accountId: string;
  ownerUserId: string;
  challengeId: string;
  status: WaitingLoginStatus;
}) {
  const processingStatus: ProcessingLoginStatus = input.status === "waiting_code" ? "processing_code" : "processing_password";
  const [challenge] = await db.update(authChallengesTable).set({
    attempts: sql`${authChallengesTable.attempts} + 1`,
    status: processingStatus,
  }).where(and(
    eq(authChallengesTable.id, input.challengeId),
    eq(authChallengesTable.accountId, input.accountId),
    eq(authChallengesTable.ownerUserId, input.ownerUserId),
    eq(authChallengesTable.status, input.status),
    gt(authChallengesTable.expiresAt, new Date()),
    lt(authChallengesTable.attempts, MAX_LOGIN_ATTEMPTS),
  )).returning();
  if (!challenge) {
    const expiredChallenges = await db.update(authChallengesTable).set({
      status: "expired",
      error: "Telegram verification challenge expired",
    }).where(and(
      eq(authChallengesTable.id, input.challengeId),
      eq(authChallengesTable.accountId, input.accountId),
      eq(authChallengesTable.ownerUserId, input.ownerUserId),
      inArray(authChallengesTable.status, ["waiting_code", "waiting_password", "processing_code", "processing_password"]),
      lte(authChallengesTable.expiresAt, new Date()),
    )).returning();
    if (expiredChallenges.length) {
      await db.update(telegramAccountsTable).set({ status: "saved", updatedAt: new Date() })
        .where(and(eq(telegramAccountsTable.id, input.accountId), eq(telegramAccountsTable.status, "authorizing")));
    }
    return null;
  }
  return { challenge, processingStatus, retryStatus: input.status };
}

async function recordLoginAttemptFailure(input: {
  challenge: typeof authChallengesTable.$inferSelect;
  accountId: string;
  processingStatus: ProcessingLoginStatus;
  retryStatus: WaitingLoginStatus;
}) {
  const expired = input.challenge.expiresAt.getTime() <= Date.now();
  const exhausted = input.challenge.attempts >= MAX_LOGIN_ATTEMPTS;
  const [updated] = await db.update(authChallengesTable).set({
    status: expired ? "expired" : exhausted ? "error" : input.retryStatus,
    error: expired
      ? "Telegram verification challenge expired"
      : exhausted ? "Too many verification attempts" : "Telegram verification was not accepted",
  }).where(and(
    eq(authChallengesTable.id, input.challenge.id),
    eq(authChallengesTable.status, input.processingStatus),
  )).returning();
  if (updated && (updated.status === "error" || updated.status === "expired")) {
    await db.update(telegramAccountsTable).set({ status: "saved", updatedAt: new Date() })
      .where(and(eq(telegramAccountsTable.id, input.accountId), eq(telegramAccountsTable.status, "authorizing")));
  }
}

async function completeTelegramLogin(input: {
  account: typeof telegramAccountsTable.$inferSelect;
  challengeId: string;
  challengeStatus: ProcessingLoginStatus;
  session: string;
  user: { id: string; username: string | null; name: string | null };
}) {
  const [authorizedChallenge] = await db.update(authChallengesTable).set({
    status: "authorized",
    completedAt: new Date(),
    sessionEncrypted: null,
    phoneCodeHashEncrypted: null,
    error: null,
  }).where(and(
    eq(authChallengesTable.id, input.challengeId),
    eq(authChallengesTable.accountId, input.account.id),
    eq(authChallengesTable.ownerUserId, input.account.ownerUserId),
    eq(authChallengesTable.status, input.challengeStatus),
    gt(authChallengesTable.expiresAt, new Date()),
  )).returning();
  if (!authorizedChallenge) throw new Error("Telegram login challenge is no longer active");
  const [account] = await db.update(telegramAccountsTable).set({
    name: input.user.name ?? input.account.name,
    username: input.user.username,
    telegramUserId: input.user.id,
    sessionEncrypted: encryptSecret(input.session),
    status: "connected",
    updatedAt: new Date(),
  }).where(eq(telegramAccountsTable.id, input.account.id)).returning();
  await recordActivity({
    ownerUserId: input.account.ownerUserId,
    event: "account.connected",
    message: "Telegram account authenticated with phone verification",
    accountId: input.account.id,
    level: "success",
  });
  return account;
}

async function completeDevelopmentDemoLogin(input: {
  account: typeof telegramAccountsTable.$inferSelect;
  challengeId: string;
  challengeStatus: ProcessingLoginStatus;
}) {
  const account = await completeTelegramLogin({
    account: input.account,
    challengeId: input.challengeId,
    challengeStatus: input.challengeStatus,
    session: "development-demo-session",
    user: {
      id: `development-demo-${input.account.id}`,
      username: "telecampaign_demo",
      name: "TeleCampaign Demo",
    },
  });
  await db.insert(destinationsTable).values({
    accountId: account.id,
    telegramId: "development-demo-group",
    title: "Nhóm demo TeleCampaign",
    username: "telecampaign_demo_group",
    kind: "group",
    memberCount: 42,
    canPost: true,
    permissionReason: null,
    permissionCheckedAt: new Date(),
  });
  await recordActivity({
    ownerUserId: account.ownerUserId,
    event: "account.demo_connected",
    message: "Development demo account verified without contacting Telegram.",
    accountId: account.id,
    level: "info",
  });
  return account;
}

router.use(requireAuth);

router.get("/upgrade", async (req, res): Promise<void> => {
  const [subscription, purchaseSettings, plans] = await Promise.all([
    getSubscription(currentUserId(req)),
    getPurchaseSettings(),
    getConfiguredPlanCatalog(),
  ]);
  res.json(GetUpgradeSummaryResponse.parse({
    plans,
    subscription,
    telegramPurchaseUrl: purchaseSettings.telegramPurchaseUrl,
  }));
});

router.get("/system-defaults", async (_req, res): Promise<void> => {
  const settings = await getSystemSettings();
  res.json(GetSystemDefaultsResponse.parse({
    defaultAccountDailyLimit: settings.defaultAccountDailyLimit,
    campaignDefaults: settings.campaignDefaults,
    defaultTimezone: settings.defaultTimezone,
  }));
});

router.get("/account", async (req, res): Promise<void> => {
  const ownerUserId = currentUserId(req);
  const [subscription, settings] = await Promise.all([
    getSubscription(ownerUserId),
    getSystemSettings(),
  ]);
  const [[profile], [telegramAccounts], [campaigns], messagesToday] = await Promise.all([
    db.select({
      username: appUsersTable.username,
      joinedAt: appUsersTable.createdAt,
    }).from(appUsersTable).where(eq(appUsersTable.id, ownerUserId)).limit(1),
    db.select({ value: count() }).from(telegramAccountsTable).where(and(eq(telegramAccountsTable.ownerUserId, ownerUserId), isNull(telegramAccountsTable.deletedAt))),
    db.select({ value: count() }).from(campaignsTable).where(eq(campaignsTable.ownerUserId, ownerUserId)),
    getUserDailyQuotaUsage({ ownerUserId, timezone: settings.defaultTimezone }),
  ]);

  if (!profile) return void sendError(res, 404, "Không tìm thấy tài khoản");
  const usage = (used: number, limit: number | null) => ({
    used,
    limit,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    percentage: limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100)),
  });

  res.json(GetAccountSummaryResponse.parse({
    profile: { username: profile.username, joinedAt: profile.joinedAt, email: null },
    subscription,
    usage: {
      telegramAccounts: usage(telegramAccounts.value, subscription.accountLimit),
      campaigns: usage(campaigns.value, subscription.campaignLimit),
      messagesToday: usage(messagesToday, subscription.userMessageDailyLimit),
    },
  }));
});

router.post("/upgrade/activate", async (req, res): Promise<void> => {
  const parsed = ActivateLicenseBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, "License key không hợp lệ");
  const result = await activateLicenseForUser(currentUserId(req), parsed.data.licenseKey);
  if (!result.ok) {
    const messages = {
      invalid_format: "Định dạng license key không hợp lệ",
      invalid_or_used: "License key không hợp lệ hoặc đã được kích hoạt",
      not_an_upgrade: "License key này không thể dùng để nâng cấp gói hiện tại",
    };
    return void sendError(res, 409, messages[result.reason]);
  }
  await recordActivity({
    ownerUserId: currentUserId(req),
    event: "subscription.upgraded",
    level: "success",
    message: `Activated ${result.subscription.plan.toUpperCase()} subscription`,
    metadata: { plan: result.subscription.plan, expiresAt: result.subscription.expiresAt?.toISOString() ?? null },
  });
  res.json(ActivateLicenseResponse.parse({
    message: "Kích hoạt gói dịch vụ thành công",
    subscription: result.subscription,
  }));
});

function planMeetsGroupLibraryMinimum(
  plan: "plus" | "pro" | "unlimited",
  minimumPlan: "pro" | "unlimited",
): boolean {
  return plan === "unlimited" || (minimumPlan === "pro" && plan === "pro");
}

async function requireGroupLibrarySubscription(req: any, res: any, next: any): Promise<void> {
  // Administrators retain access to the directory even when their own
  // subscription has expired.
  if (req.authUser?.role === "admin") {
    next();
    return;
  }
  await requireActiveSubscription(req, res, next);
}

router.get("/group-library/access", async (req, res): Promise<void> => {
  const settings = await getSystemSettings();
  const isAdmin = req.authUser?.role === "admin";
  if (isAdmin) {
    res.json(GetGroupLibraryAccessResponse.parse({
      visible: settings.groupLibraryVisibleToUsers,
      minimumJoinPlan: settings.groupLibraryMinimumJoinPlan,
      canView: true,
      canOpenLinks: true,
    }));
    return;
  }

  const subscription = await getSubscription(currentUserId(req));
  const canView = settings.groupLibraryVisibleToUsers;
  const canOpenLinks = canView
    && subscription.status === "active"
    && planMeetsGroupLibraryMinimum(subscription.plan, settings.groupLibraryMinimumJoinPlan);
  res.json(GetGroupLibraryAccessResponse.parse({
    visible: settings.groupLibraryVisibleToUsers,
    minimumJoinPlan: settings.groupLibraryMinimumJoinPlan,
    canView,
    canOpenLinks,
  }));
});

router.get("/group-library", requireGroupLibrarySubscription, async (req, res): Promise<void> => {
  const settings = await getSystemSettings();
  const isAdmin = req.authUser?.role === "admin";
  if (!isAdmin && !settings.groupLibraryVisibleToUsers) {
    return void sendError(res, 403, "Thư viện nhóm hiện không khả dụng cho người dùng.");
  }

  const subscription = isAdmin ? null : await getSubscription(currentUserId(req));
  const canOpenLinks = isAdmin || (
    subscription?.status === "active"
    && planMeetsGroupLibraryMinimum(subscription.plan, settings.groupLibraryMinimumJoinPlan)
  );
  const directory = await getAdminActiveGroupDirectory();
  res.json(GetGroupLibraryResponse.parse({
    groups: directory.groups.map((group) => ({
      ...group,
      username: canOpenLinks ? group.username : null,
      telegramLink: canOpenLinks ? group.telegramLink : null,
    })),
  }));
});

router.use(requireActiveSubscription);

router.get("/storage/admin-notifications/:notificationId/media", async (req, res): Promise<void> => {
  const [notification] = await db.select().from(adminNotificationsTable)
    .where(eq(adminNotificationsTable.id, req.params.notificationId)).limit(1);
  if (!notification?.mediaPath || (!isNotificationActive(notification) && req.authUser?.role !== "admin")) {
    sendError(res, 404, "Media không tồn tại.");
    return;
  }
  try {
    const media = await notificationMediaStorage.readAdminNotificationMedia(notification.mediaPath);
    const commonHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
      "Content-Type": media.contentType,
      "X-Content-Type-Options": "nosniff",
    };
    const requestedRange = req.headers.range;
    let start = 0;
    let end = media.size - 1;
    if (requestedRange) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(requestedRange);
      if (!match) {
        res.status(416).set({ ...commonHeaders, "Content-Range": `bytes */${media.size}` }).end();
        return;
      }
      if (!match[1] && !match[2]) {
        res.status(416).set({ ...commonHeaders, "Content-Range": `bytes */${media.size}` }).end();
        return;
      }
      if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) {
          res.status(416).set({ ...commonHeaders, "Content-Range": `bytes */${media.size}` }).end();
          return;
        }
        start = Math.max(media.size - suffixLength, 0);
        end = media.size - 1;
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), media.size - 1) : media.size - 1;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= media.size) {
        res.status(416).set({ ...commonHeaders, "Content-Range": `bytes */${media.size}` }).end();
        return;
      }
      res.status(206).set({
        ...commonHeaders,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${media.size}`,
      });
    } else {
      res.status(200).set({ ...commonHeaders, "Content-Length": String(media.size) });
    }

    const stream = createReadStream(media.filePath, { start, end });
    stream.once("error", (error) => {
      req.log.error({ err: error, notificationId: notification.id }, "Unable to stream notification media");
      if (res.headersSent) res.destroy(error);
      else sendError(res, 500, "Không thể tải media.");
    });
    stream.pipe(res);
  } catch (error) {
    if (error instanceof NotificationMediaNotFoundError) {
      sendError(res, 404, "Media không tồn tại.");
      return;
    }
    req.log.error({ err: error, notificationId: notification.id }, "Unable to serve notification media");
    sendError(res, 500, "Không thể tải media.");
  }
});

router.get("/dashboard", async (req, res): Promise<void> => {
  const ownerUserId = currentUserId(req);
  const now = new Date();
  const dayStart = sql`date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
  const [
    [telegramAccounts],
    [activeGroups],
    [messageTemplates],
    [campaigns],
    [sentToday],
    [failedToday],
    recentCampaignRows,
    recentActivity,
    adminNotificationRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(telegramAccountsTable).where(and(eq(telegramAccountsTable.ownerUserId, ownerUserId), isNull(telegramAccountsTable.deletedAt))),
    db.select({ value: count() }).from(destinationsTable)
      .innerJoin(telegramAccountsTable, eq(destinationsTable.accountId, telegramAccountsTable.id))
      .where(and(eq(telegramAccountsTable.ownerUserId, ownerUserId), eq(destinationsTable.canPost, true))),
    db.select({ value: count() }).from(messageTemplatesTable).where(eq(messageTemplatesTable.ownerUserId, ownerUserId)),
    db.select({ value: count() }).from(campaignsTable).where(eq(campaignsTable.ownerUserId, ownerUserId)),
    db.select({ value: count() }).from(activityLogsTable).where(and(
      eq(activityLogsTable.ownerUserId, ownerUserId),
      eq(activityLogsTable.event, "campaign.target.sent"),
      gte(activityLogsTable.createdAt, dayStart),
    )),
    db.select({ value: count() }).from(activityLogsTable).where(and(
      eq(activityLogsTable.ownerUserId, ownerUserId),
      eq(activityLogsTable.level, "error"),
      gte(activityLogsTable.createdAt, dayStart),
    )),
    db.select().from(campaignsTable).where(eq(campaignsTable.ownerUserId, ownerUserId))
      .orderBy(desc(campaignsTable.createdAt)).limit(8),
    db.select({
      id: activityLogsTable.id,
      level: activityLogsTable.level,
      event: activityLogsTable.event,
      message: activityLogsTable.message,
      accountId: activityLogsTable.accountId,
      campaignId: activityLogsTable.campaignId,
      targetId: activityLogsTable.targetId,
      metadata: activityLogsTable.metadata,
      createdAt: activityLogsTable.createdAt,
      campaignName: campaignsTable.name,
    }).from(activityLogsTable)
      .leftJoin(campaignsTable, and(
        eq(activityLogsTable.campaignId, campaignsTable.id),
        eq(campaignsTable.ownerUserId, ownerUserId),
      ))
      .where(eq(activityLogsTable.ownerUserId, ownerUserId))
      .orderBy(desc(activityLogsTable.createdAt)).limit(8),
    db.select().from(adminNotificationsTable)
      .where(and(
        or(
          eq(adminNotificationsTable.status, "published"),
          and(eq(adminNotificationsTable.status, "scheduled"), lte(adminNotificationsTable.scheduledAt, now)),
        ),
        eq(adminNotificationsTable.dashboardVisible, true),
        or(isNull(adminNotificationsTable.expiresAt), gt(adminNotificationsTable.expiresAt, now)),
      ))
      .orderBy(desc(adminNotificationsTable.pinned), desc(sql`coalesce(${adminNotificationsTable.publishedAt}, ${adminNotificationsTable.scheduledAt}, ${adminNotificationsTable.createdAt})`))
      .limit(8),
  ]);

  res.json(GetDashboardResponse.parse({
    metrics: {
      telegramAccounts: telegramAccounts.value,
      activeGroups: activeGroups.value,
      messageTemplates: messageTemplates.value,
      campaigns: campaigns.value,
      sentToday: sentToday.value,
      failedToday: failedToday.value,
    },
    recentCampaigns: await Promise.all(recentCampaignRows.map(campaignSummary)),
    recentActivity: recentActivity.map((log) => ({
      ...log,
      campaignName: log.campaignName ?? null,
      accountName: null,
      destinationTitle: null,
      destinationUsername: null,
      targetStatus: null,
      targetAttempts: null,
      targetLastError: null,
      targetNextAttemptAt: null,
    })),
    adminNotifications: adminNotificationRows.filter((notification) => isNotificationActive(notification)).map(adminNotificationResponse),
  }));
});

router.get("/telegram/config", (_req, res): void => {
  res.json(GetTelegramConfigResponse.parse(getTelegramConfiguration()));
});

router.get("/proxies", async (req, res): Promise<void> => {
  const proxies = await db.select().from(proxiesTable)
    .where(eq(proxiesTable.ownerUserId, currentUserId(req)))
    .orderBy(desc(proxiesTable.createdAt));
  res.json(ListProxiesResponse.parse(await Promise.all(proxies.map(proxyResponse))));
});

router.post("/proxies", async (req, res): Promise<void> => {
  const parsed = CreateProxyBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  if (!Number.isInteger(parsed.data.port)) return void sendError(res, 400, "Port phải là số nguyên.");
  const host = parsed.data.host.trim();
  if (!host || /\s/.test(host)) return void sendError(res, 400, "Host / IP không hợp lệ.");
  const ownerUserId = currentUserId(req);
  if (parsed.data.accountId && !await ownedTelegramAccount(parsed.data.accountId, ownerUserId)) {
    return void sendError(res, 404, "Không tìm thấy tài khoản Telegram.");
  }
  const [proxy] = await db.insert(proxiesTable).values({
    ownerUserId,
    name: parsed.data.name.trim(),
    type: parsed.data.type,
    host,
    port: parsed.data.port,
    usernameEncrypted: parsed.data.username?.trim() ? encryptSecret(parsed.data.username.trim()) : null,
    passwordEncrypted: parsed.data.password ? encryptSecret(parsed.data.password) : null,
  }).returning();
  if (parsed.data.accountId) {
    await db.update(telegramAccountsTable).set({ proxyId: proxy.id, updatedAt: new Date() })
      .where(eq(telegramAccountsTable.id, parsed.data.accountId));
  }
  await recordActivity({ ownerUserId, event: "proxy.created", message: `Created proxy: ${proxy.name}`, level: "success", metadata: { type: proxy.type, host: proxy.host, port: proxy.port } });
  res.status(201).json(CreateProxyResponse.parse(await proxyResponse(proxy)));
});

router.post("/proxies/:proxyId/test", async (req, res): Promise<void> => {
  const params = TestProxyParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);

  const ownerUserId = currentUserId(req);
  const existing = await ownedProxy(params.data.proxyId, ownerUserId);
  if (!existing) return void sendError(res, 404, "Không tìm thấy proxy.");
  const releaseSlot = acquireProxyTestSlot(ownerUserId);
  if (!releaseSlot) return void sendError(res, 429, "Bạn đang test proxy quá nhanh. Vui lòng thử lại sau vài phút.");

  const checkedAt = new Date();
  const [attachedAccount] = await db.select({
    id: telegramAccountsTable.id,
    name: telegramAccountsTable.name,
  }).from(telegramAccountsTable).where(and(
    eq(telegramAccountsTable.proxyId, existing.id),
    eq(telegramAccountsTable.ownerUserId, ownerUserId),
    eq(telegramAccountsTable.status, "connected"),
    isNull(telegramAccountsTable.deletedAt),
  )).orderBy(desc(telegramAccountsTable.updatedAt)).limit(1);

  let ok = false;
  let transportOk = false;
  let verification: "tunnel" | "telegram" | "account" = "tunnel";
  let message = "Could not connect through the proxy. Check the host, port, and credentials.";
  try {
    await testProxyConnection({
      type: existing.type === "socks5" ? "socks5" : "http",
      host: existing.host,
      port: existing.port,
      username: existing.usernameEncrypted ? decryptSecret(existing.usernameEncrypted) : undefined,
      password: existing.passwordEncrypted ? decryptSecret(existing.passwordEncrypted) : undefined,
    });
    transportOk = true;
    await db.update(proxiesTable).set({
      status: "active",
      lastCheckedAt: checkedAt,
      updatedAt: checkedAt,
    }).where(eq(proxiesTable.id, existing.id));

    if (!attachedAccount) {
      ok = true;
      message = "Proxy tunnel to Telegram is working. Attach a connected Telegram account to verify MTProto traffic.";
    } else {
      verification = "telegram";
      try {
        const { client } = await getAccountClient(attachedAccount.id, ownerUserId);
        await client.disconnect();
        ok = true;
        message = "Telegram MTProto connected through the attached proxy.";
      } catch (error) {
        verification = "account";
        message = isTelegramSessionRevoked(error)
          ? revokedTelegramSessionMessage
          : "The proxy tunnel is working, but Telegram could not authenticate the attached account through it.";
      }
    }
  } catch (error) {
    message = error instanceof Error && error.name === "ProxyTestError"
      ? error.message
      : "Could not connect through the proxy. Check the host, port, and credentials.";
  } finally {
    releaseSlot();
  }

  await db.update(proxiesTable).set({
    status: transportOk ? "active" : "inactive",
    lastCheckedAt: checkedAt,
    updatedAt: checkedAt,
  }).where(eq(proxiesTable.id, existing.id));
  await recordActivity({
    ownerUserId,
    event: ok ? "proxy.tested" : "proxy.test_failed",
    message: `${ok ? "Proxy test succeeded" : "Proxy test could not verify Telegram"}: ${existing.name}`,
    level: ok ? "success" : "warning",
    metadata: { type: existing.type, host: existing.host, port: existing.port, transportOk, verification },
  });

  res.json(ProxyTestResponseSchema.parse({
    ok,
    transportOk,
    verification,
    status: ok ? "connected" : "failed",
    message,
    checkedAt,
  }));
});

router.patch("/proxies/:proxyId", async (req, res): Promise<void> => {
  const params = UpdateProxyParams.safeParse(req.params);
  const parsed = UpdateProxyBody.safeParse(req.body);
  if (!params.success) return void sendError(res, 400, params.error.message);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  if (parsed.data.port !== undefined && !Number.isInteger(parsed.data.port)) return void sendError(res, 400, "Port phải là số nguyên.");
  const existing = await ownedProxy(params.data.proxyId, currentUserId(req));
  if (!existing) return void sendError(res, 404, "Không tìm thấy proxy.");
  if (parsed.data.host !== undefined && (!parsed.data.host.trim() || /\s/.test(parsed.data.host))) return void sendError(res, 400, "Host / IP không hợp lệ.");
  const [updated] = await db.update(proxiesTable).set({
    ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
    ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
    ...(parsed.data.host !== undefined ? { host: parsed.data.host.trim() } : {}),
    ...(parsed.data.port !== undefined ? { port: parsed.data.port } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.username !== undefined ? { usernameEncrypted: parsed.data.username.trim() ? encryptSecret(parsed.data.username.trim()) : null } : {}),
    ...(parsed.data.password !== undefined ? { passwordEncrypted: parsed.data.password ? encryptSecret(parsed.data.password) : null } : {}),
    updatedAt: new Date(),
  }).where(eq(proxiesTable.id, existing.id)).returning();
  await recordActivity({ ownerUserId: currentUserId(req), event: "proxy.updated", message: `Updated proxy: ${updated.name}`, level: "success" });
  res.json(UpdateProxyResponse.parse(await proxyResponse(updated)));
});

router.delete("/proxies/:proxyId", async (req, res): Promise<void> => {
  const params = DeleteProxyParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const existing = await ownedProxy(params.data.proxyId, currentUserId(req));
  if (!existing) return void sendError(res, 404, "Không tìm thấy proxy.");
  await db.update(telegramAccountsTable).set({ proxyId: null, updatedAt: new Date() })
    .where(eq(telegramAccountsTable.proxyId, existing.id));
  await db.delete(proxiesTable).where(eq(proxiesTable.id, existing.id));
  await recordActivity({ ownerUserId: currentUserId(req), event: "proxy.deleted", message: `Deleted proxy: ${existing.name}`, level: "info" });
  res.status(204).send();
});

router.post("/proxies/:proxyId/accounts/:accountId", async (req, res): Promise<void> => {
  const params = AttachProxyAccountParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const ownerUserId = currentUserId(req);
  const [proxy, account] = await Promise.all([ownedProxy(params.data.proxyId, ownerUserId), ownedTelegramAccount(params.data.accountId, ownerUserId)]);
  if (!proxy || !account) return void sendError(res, 404, "Không tìm thấy proxy hoặc tài khoản Telegram.");
  await db.update(telegramAccountsTable).set({ proxyId: proxy.id, updatedAt: new Date() }).where(eq(telegramAccountsTable.id, account.id));
  await recordActivity({ ownerUserId, event: "proxy.attached", message: `Attached proxy "${proxy.name}" to ${account.name}`, level: "success", accountId: account.id });
  res.status(204).send();
});

router.delete("/proxies/:proxyId/accounts/:accountId", async (req, res): Promise<void> => {
  const params = DetachProxyAccountParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const ownerUserId = currentUserId(req);
  const [proxy, account] = await Promise.all([ownedProxy(params.data.proxyId, ownerUserId), ownedTelegramAccount(params.data.accountId, ownerUserId)]);
  if (!proxy || !account || account.proxyId !== proxy.id) return void sendError(res, 404, "Không tìm thấy gắn kết proxy.");
  await db.update(telegramAccountsTable).set({ proxyId: null, updatedAt: new Date() }).where(eq(telegramAccountsTable.id, account.id));
  await recordActivity({ ownerUserId, event: "proxy.detached", message: `Detached proxy "${proxy.name}" from ${account.name}`, level: "info", accountId: account.id });
  res.status(204).send();
});

router.get("/telegram/accounts", async (req, res): Promise<void> => {
  const accounts = await db.select().from(telegramAccountsTable)
    .where(and(eq(telegramAccountsTable.ownerUserId, currentUserId(req)), isNull(telegramAccountsTable.deletedAt))).orderBy(desc(telegramAccountsTable.createdAt));
  res.json(ListTelegramAccountsResponse.parse(accounts.map(telegramAccountResponse)));
});

router.post("/telegram/accounts", async (req, res): Promise<void> => {
  const parsed = CreateTelegramAccountBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  if (!Number.isInteger(parsed.data.api_id) || !Number.isInteger(parsed.data.daily_limit)) {
    return void sendError(res, 400, "API ID và Limit/ngày phải là số nguyên.");
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    return void sendError(res, 400, "Số điện thoại Telegram phải ở định dạng quốc tế, ví dụ +84901234567.");
  }
  const apiHash = parsed.data.api_hash.trim();
  if (!apiHash) return void sendError(res, 400, "API Hash không được để trống.");

  const allowance = await getTelegramAccountAllowance(currentUserId(req));
  if (allowance.accountLimit !== null && allowance.used >= allowance.accountLimit) {
    return void sendError(res, 403, `Gói ${allowance.plan.toUpperCase()} chỉ cho phép ${allowance.accountLimit} tài khoản Telegram. Hãy nâng cấp để kết nối thêm.`);
  }
  let createdAccountId: string | null = null;
  try {
    const isDemo = process.env.NODE_ENV !== "production" && phone === "+84987654321";
    const [account] = await db.insert(telegramAccountsTable).values({
      ownerUserId: currentUserId(req),
      name: isDemo ? "TeleCampaign Demo" : `Telegram ${phone}`,
      phoneMasked: maskPhone(phone),
      phoneEncrypted: encryptSecret(phone),
      apiId: parsed.data.api_id,
      apiHashEncrypted: encryptSecret(apiHash),
      dailyLimit: parsed.data.daily_limit,
      status: "saved",
    }).returning();
    createdAccountId = account.id;

    const loginStart = isDemo
      ? await startDevelopmentDemoLoginChallenge(account)
      : await startLoginChallenge(account);
    await recordActivity({
      ownerUserId: currentUserId(req),
      event: "account.login_started",
      message: "Telegram phone verification started",
      accountId: account.id,
      level: "info",
    });
    res.status(201).json(CreateTelegramAccountResponse.parse({
      account: telegramAccountResponse(loginStart.account),
      challenge: loginStart.challenge,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Unable to create Telegram account");
    if (createdAccountId) {
      await db.delete(telegramAccountsTable).where(eq(telegramAccountsTable.id, createdAccountId)).catch((cleanupError) => {
        req.log.error({ err: cleanupError, accountId: createdAccountId }, "Unable to clean up failed Telegram account");
      });
    }
    sendError(res, 500, "Không thể thêm tài khoản Telegram lúc này. Hãy kiểm tra cấu hình máy chủ hoặc thử lại sau.");
  }
});

router.post("/telegram/accounts/:accountId/login", async (req, res): Promise<void> => {
  const params = StartTelegramLoginParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const account = await ownedTelegramAccount(params.data.accountId, currentUserId(req));
  if (!account) return void sendError(res, 404, "Không tìm thấy tài khoản Telegram.");
  if (account.sessionEncrypted) return void sendError(res, 409, "Tài khoản này đã đăng nhập.");
  try {
    const loginStart = isDevelopmentDemoTelegramAccount(account)
      ? await startDevelopmentDemoLoginChallenge(account)
      : await startLoginChallenge(account);
    res.status(201).json(StartTelegramLoginResponse.parse({
      account: telegramAccountResponse(loginStart.account),
      challenge: loginStart.challenge,
    }));
  } catch {
    await db.update(telegramAccountsTable).set({ status: "saved", updatedAt: new Date() })
      .where(eq(telegramAccountsTable.id, account.id));
    sendError(res, 502, "Không thể gửi mã xác minh Telegram. Hãy thử lại sau.");
  }
});

router.post("/telegram/accounts/:accountId/login/code", async (req, res): Promise<void> => {
  const params = ConfirmTelegramLoginCodeParams.safeParse(req.params);
  const parsed = ConfirmTelegramLoginCodeBody.safeParse(req.body);
  if (!params.success || !parsed.success) return void sendError(res, 400, "Mã xác minh không hợp lệ.");
  const account = await ownedTelegramAccount(params.data.accountId, currentUserId(req));
  if (!account) return void sendError(res, 404, "Không tìm thấy tài khoản Telegram.");
  const code = parsed.data.code.replace(/\s+/g, "");
  if (!/^\d{3,16}$/.test(code)) return void sendError(res, 400, "Mã xác minh không hợp lệ.");
  const reservation = await activeLoginChallenge({
    accountId: account.id,
    ownerUserId: currentUserId(req),
    challengeId: parsed.data.challengeId,
    status: "waiting_code",
  });
  if (!reservation?.challenge.phoneCodeHashEncrypted || !reservation.challenge.sessionEncrypted) {
    return void sendError(res, 409, "Mã xác minh đã hết hạn hoặc không còn hợp lệ. Hãy gửi lại mã.");
  }
  if (isDevelopmentDemoTelegramAccount(account)) {
    if (code !== "12345") {
      await recordLoginAttemptFailure({
        challenge: reservation.challenge,
        accountId: account.id,
        processingStatus: reservation.processingStatus,
        retryStatus: reservation.retryStatus,
      });
      return void sendError(res, 401, "Mã xác minh không đúng hoặc đã hết hạn.");
    }
    const connectedAccount = await completeDevelopmentDemoLogin({
      account,
      challengeId: reservation.challenge.id,
      challengeStatus: reservation.processingStatus,
    });
    return void res.json(ConfirmTelegramLoginCodeResponse.parse({
      status: "connected",
      account: telegramAccountResponse(connectedAccount),
    }));
  }
  try {
    const result = await confirmTelegramPhoneCode({
      credentials: credentialsForAccount(account),
      phone: phoneForAccount(account),
      phoneCodeHash: decryptSecret(reservation.challenge.phoneCodeHashEncrypted),
      session: decryptSecret(reservation.challenge.sessionEncrypted),
      code,
      proxy: await getTelegramProxyConfig(account),
    });
    if (result.status === "requires_2fa") {
      const [passwordChallenge] = await db.update(authChallengesTable).set({
        status: "waiting_password",
        requiresTwoFactor: true,
        sessionEncrypted: encryptSecret(result.session),
        phoneCodeHashEncrypted: null,
        error: null,
      }).where(and(
        eq(authChallengesTable.id, reservation.challenge.id),
        eq(authChallengesTable.status, reservation.processingStatus),
        gt(authChallengesTable.expiresAt, new Date()),
      )).returning();
      if (!passwordChallenge) throw new Error("Telegram login challenge is no longer active");
      return void res.json(ConfirmTelegramLoginCodeResponse.parse({
        status: "requires_2fa",
        account: telegramAccountResponse(account),
      }));
    }
    const connectedAccount = await completeTelegramLogin({
      account,
      challengeId: reservation.challenge.id,
      challengeStatus: reservation.processingStatus,
      session: result.session,
      user: result.user,
    });
    res.json(ConfirmTelegramLoginCodeResponse.parse({
      status: "connected",
      account: telegramAccountResponse(connectedAccount),
    }));
  } catch {
    await recordLoginAttemptFailure({
      challenge: reservation.challenge,
      accountId: account.id,
      processingStatus: reservation.processingStatus,
      retryStatus: reservation.retryStatus,
    });
    sendError(res, 401, "Mã xác minh không đúng hoặc đã hết hạn.");
  }
});

router.post("/telegram/accounts/:accountId/login/password", async (req, res): Promise<void> => {
  const params = ConfirmTelegramLoginPasswordParams.safeParse(req.params);
  const parsed = ConfirmTelegramLoginPasswordBody.safeParse(req.body);
  if (!params.success || !parsed.success) return void sendError(res, 400, "Mật khẩu 2FA không hợp lệ.");
  const account = await ownedTelegramAccount(params.data.accountId, currentUserId(req));
  if (!account) return void sendError(res, 404, "Không tìm thấy tài khoản Telegram.");
  const reservation = await activeLoginChallenge({
    accountId: account.id,
    ownerUserId: currentUserId(req),
    challengeId: parsed.data.challengeId,
    status: "waiting_password",
  });
  if (!reservation?.challenge.sessionEncrypted) {
    return void sendError(res, 409, "Yêu cầu xác minh 2FA đã hết hạn. Hãy gửi lại mã.");
  }
  try {
    const result = await confirmTelegramTwoFactorPassword({
      credentials: credentialsForAccount(account),
      session: decryptSecret(reservation.challenge.sessionEncrypted),
      password: parsed.data.password,
      proxy: await getTelegramProxyConfig(account),
    });
    const connectedAccount = await completeTelegramLogin({
      account,
      challengeId: reservation.challenge.id,
      challengeStatus: reservation.processingStatus,
      session: result.session,
      user: result.user,
    });
    res.json(ConfirmTelegramLoginPasswordResponse.parse({
      status: "connected",
      account: telegramAccountResponse(connectedAccount),
    }));
  } catch {
    await recordLoginAttemptFailure({
      challenge: reservation.challenge,
      accountId: account.id,
      processingStatus: reservation.processingStatus,
      retryStatus: reservation.retryStatus,
    });
    sendError(res, 401, "Mật khẩu 2FA không đúng.");
  }
});

router.delete("/telegram/accounts/:accountId", async (req, res): Promise<void> => {
  const params = DeleteTelegramAccountParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const [account] = await db.select().from(telegramAccountsTable)
    .where(and(eq(telegramAccountsTable.id, params.data.accountId), eq(telegramAccountsTable.ownerUserId, currentUserId(req)), isNull(telegramAccountsTable.deletedAt)));
  if (!account) return void sendError(res, 404, "Không tìm thấy tài khoản Telegram.");

  const destinations = await db.select({ id: destinationsTable.id }).from(destinationsTable)
    .where(eq(destinationsTable.accountId, account.id));
  const destinationIds = destinations.map((destination) => destination.id);
  if (destinationIds.length) {
    const affectedTargets = await db.select({ campaignId: campaignTargetsTable.campaignId }).from(campaignTargetsTable)
      .where(and(inArray(campaignTargetsTable.destinationId, destinationIds), inArray(campaignTargetsTable.status, ["pending", "sending"])));
    await db.update(campaignTargetsTable).set({
      status: "requires_review",
      quotaReservedAt: null,
      nextAttemptAt: null,
      lastError: "Telegram account was removed",
      updatedAt: new Date(),
    }).where(and(inArray(campaignTargetsTable.destinationId, destinationIds), inArray(campaignTargetsTable.status, ["pending", "sending"])));
    const campaignIds = [...new Set(affectedTargets.map((target) => target.campaignId))];
    if (campaignIds.length) {
      await db.update(campaignsTable).set({ status: "paused", updatedAt: new Date() })
        .where(inArray(campaignsTable.id, campaignIds));
    }
  }

  const [deleted] = await db.update(telegramAccountsTable).set({
    status: "deleted",
    apiHashEncrypted: null,
    phoneEncrypted: null,
    sessionEncrypted: null,
    deletedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(telegramAccountsTable.id, account.id)).returning({ id: telegramAccountsTable.id });
  if (!deleted) return void sendError(res, 404, "Không tìm thấy tài khoản Telegram.");
  await recordActivity({
    ownerUserId: currentUserId(req),
    event: "account.deleted",
    message: "Telegram account deleted",
    level: "info",
  });
  res.json(DeleteTelegramAccountResponse.parse({ message: "Đã xóa tài khoản Telegram." }));
});

router.post("/telegram/accounts/:accountId/sync", async (req, res): Promise<void> => {
  const params = SyncTelegramDestinationsParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const [account] = await db.select().from(telegramAccountsTable)
    .where(and(eq(telegramAccountsTable.id, params.data.accountId), eq(telegramAccountsTable.ownerUserId, currentUserId(req)), isNull(telegramAccountsTable.deletedAt)));
  if (!account) return void sendError(res, 404, "Telegram account not found");
  try {
    if (isDevelopmentDemoTelegramAccount(account)) {
      await db.update(telegramAccountsTable).set({
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(telegramAccountsTable.id, account.id));
      const destinations = await db.select({ id: destinationsTable.id }).from(destinationsTable)
        .where(eq(destinationsTable.accountId, account.id));
      await recordActivity({
        ownerUserId: account.ownerUserId,
        event: "account.demo_synced",
        message: "Development demo destinations refreshed without contacting Telegram.",
        accountId: account.id,
        level: "info",
      });
      return void res.status(202).json(SyncTelegramDestinationsResponse.parse({ count: destinations.length }));
    }
    const count = await syncAccountDestinations(params.data.accountId);
    res.status(202).json(SyncTelegramDestinationsResponse.parse({ count }));
  } catch (error) {
    req.log.warn({ err: error }, "Telegram destination sync failed");
    sendError(res, 409, isTelegramSessionRevoked(error)
      ? revokedTelegramSessionMessage
      : error instanceof Error ? error.message : "Destination sync failed");
  }
});

router.get("/destinations", async (req, res): Promise<void> => {
  const accounts = await db.select({ id: telegramAccountsTable.id }).from(telegramAccountsTable)
    .where(and(eq(telegramAccountsTable.ownerUserId, currentUserId(req)), isNull(telegramAccountsTable.deletedAt)));
  const destinations = accounts.length
    ? await db.select().from(destinationsTable).where(inArray(destinationsTable.accountId, accounts.map((account) => account.id))).orderBy(desc(destinationsTable.permissionCheckedAt))
    : [];
  res.json(ListDestinationsResponse.parse(destinations));
});

router.get("/telegram/accounts/:accountId/saved-messages", async (req, res): Promise<void> => {
  const params = ListTelegramSavedMessagesParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const account = await ownedTelegramAccount(params.data.accountId, currentUserId(req));
  if (!account) return void sendError(res, 404, "Không tìm thấy tài khoản Telegram.");
  if (!account.sessionEncrypted || account.status !== "connected") {
    return void sendError(res, 409, "Tài khoản Telegram cần đăng nhập trước khi đồng bộ Tin nhắn đã lưu.");
  }
  try {
    res.json(ListTelegramSavedMessagesResponse.parse(await listTelegramSavedMessages(account.id)));
  } catch (error) {
    req.log.warn({ err: error }, "Telegram saved messages sync failed");
    sendError(res, 409, isTelegramSessionRevoked(error)
      ? revokedTelegramSessionMessage
      : error instanceof Error ? error.message : "Không thể đồng bộ Tin nhắn đã lưu.");
  }
});

router.get("/telegram/accounts/:accountId/saved-messages/:messageId", async (req, res): Promise<void> => {
  const params = GetTelegramSavedMessageParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const account = await ownedTelegramAccount(params.data.accountId, currentUserId(req));
  if (!account) return void sendError(res, 404, "Không tìm thấy tài khoản Telegram.");
  if (!account.sessionEncrypted || account.status !== "connected") {
    return void sendError(res, 409, "Tài khoản Telegram cần đăng nhập trước khi đồng bộ Tin nhắn đã lưu.");
  }
  try {
    const message = await getTelegramSavedMessage(account.id, params.data.messageId);
    if (!message) return void sendError(res, 404, "Tin nhắn đã lưu không còn tồn tại.");
    res.json(GetTelegramSavedMessageResponse.parse(message));
  } catch (error) {
    req.log.warn({ err: error }, "Telegram saved message preview failed");
    sendError(res, 409, isTelegramSessionRevoked(error)
      ? revokedTelegramSessionMessage
      : error instanceof Error ? error.message : "Không thể tải Tin nhắn đã lưu.");
  }
});

router.get("/message-templates", async (req, res): Promise<void> => {
  const templates = await db.select().from(messageTemplatesTable)
    .where(eq(messageTemplatesTable.ownerUserId, currentUserId(req)))
    .orderBy(desc(messageTemplatesTable.updatedAt));
  res.json(ListMessageTemplatesResponse.parse(templates.map(templateResponse)));
});

router.post("/message-templates", async (req, res): Promise<void> => {
  const parsed = CreateMessageTemplateBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  const ownerUserId = currentUserId(req);
  const name = parsed.data.name.trim();
  const mode = parsed.data.mode;
  const content = parsed.data.content?.trim() ?? "";
  if (!name) return void sendError(res, 400, "Tên mẫu không được để trống.");
  if (mode === "text" && !content) return void sendError(res, 400, "Nội dung mẫu không được để trống.");
  if (mode === "forward") {
    const validation = await validateForwardTemplateSource(parsed.data.sourceAccountId, parsed.data.sourceMessageId, ownerUserId);
    if (validation.error) return void sendError(res, validation.status ?? 400, validation.error);
  }
  const [template] = await db.insert(messageTemplatesTable).values({
    ownerUserId,
    name,
    mode,
    content,
    sourceAccountId: mode === "forward" ? parsed.data.sourceAccountId ?? null : null,
    sourceMessageId: mode === "forward" ? parsed.data.sourceMessageId ?? null : null,
  }).returning();
  await recordActivity({ ownerUserId, event: "template.created", message: `Created message template: ${template.name}`, level: "success" });
  res.status(201).json(CreateMessageTemplateResponse.parse(templateResponse(template)));
});

router.patch("/message-templates/:templateId", async (req, res): Promise<void> => {
  const params = UpdateMessageTemplateParams.safeParse(req.params);
  const parsed = UpdateMessageTemplateBody.safeParse(req.body);
  if (!params.success) return void sendError(res, 400, params.error.message);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  const ownerUserId = currentUserId(req);
  const [existing] = await db.select().from(messageTemplatesTable).where(and(
    eq(messageTemplatesTable.id, params.data.templateId),
    eq(messageTemplatesTable.ownerUserId, ownerUserId),
  ));
  if (!existing) return void sendError(res, 404, "Không tìm thấy mẫu tin nhắn.");
  const mode = parsed.data.mode ?? (existing.mode === "forward" ? "forward" : "text");
  const name = parsed.data.name === undefined ? existing.name : parsed.data.name.trim();
  const content = parsed.data.content === undefined ? existing.content : parsed.data.content.trim();
  const sourceAccountId = parsed.data.sourceAccountId === undefined ? existing.sourceAccountId : parsed.data.sourceAccountId;
  const sourceMessageId = parsed.data.sourceMessageId === undefined ? existing.sourceMessageId : parsed.data.sourceMessageId;
  const clonedCampaignsUsingTemplate = await db.select({
    id: campaignsTable.id,
    ownerUserId: campaignsTable.ownerUserId,
    telegramAccountId: campaignsTable.telegramAccountId,
    clonedFromCampaignId: campaignsTable.clonedFromCampaignId,
    clonedFromUserId: campaignsTable.clonedFromUserId,
  }).from(campaignsTable).where(and(
    eq(campaignsTable.templateId, existing.id),
    isNotNull(campaignsTable.clonedFromCampaignId),
  ));
  const adminClonesUsingTemplate = clonedCampaignsUsingTemplate.filter((campaign) => campaignCloneMode(campaign) === "admin");
  if (adminClonesUsingTemplate.length) {
    if (mode !== "forward") {
      return void sendError(res, 409, "A cloned campaign must keep its forward message template.");
    }
    if (adminClonesUsingTemplate.some((campaign) => campaign.telegramAccountId !== sourceAccountId)) {
      return void sendError(res, 409, "A cloned campaign must forward a Saved Message from its assigned Telegram account.");
    }
  }
  if (!name) return void sendError(res, 400, "Tên mẫu không được để trống.");
  if (mode === "text" && !content) return void sendError(res, 400, "Nội dung mẫu không được để trống.");
  if (mode === "forward") {
    const validation = await validateForwardTemplateSource(sourceAccountId, sourceMessageId, ownerUserId);
    if (validation.error) return void sendError(res, validation.status ?? 400, validation.error);
  }
  const [updated] = await db.update(messageTemplatesTable).set({
    name,
    mode,
    content,
    sourceAccountId: mode === "forward" ? sourceAccountId : null,
    sourceMessageId: mode === "forward" ? sourceMessageId : null,
    updatedAt: new Date(),
  }).where(eq(messageTemplatesTable.id, existing.id)).returning();
  await db.update(campaignsTable).set({
    content: updated.content,
    templateMode: updated.mode,
    templateSourceAccountId: updated.mode === "forward" ? updated.sourceAccountId : null,
    templateSourceMessageId: updated.mode === "forward" ? updated.sourceMessageId : null,
    updatedAt: new Date(),
  }).where(and(
    eq(campaignsTable.templateId, updated.id),
    inArray(campaignsTable.status, ["draft", "paused"]),
  ));
  await recordActivity({ ownerUserId, event: "template.updated", message: `Updated message template: ${updated.name}`, level: "success" });
  res.json(UpdateMessageTemplateResponse.parse(templateResponse(updated)));
});

router.delete("/message-templates/:templateId", async (req, res): Promise<void> => {
  const params = DeleteMessageTemplateParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const ownerUserId = currentUserId(req);
  const [deleted] = await db.delete(messageTemplatesTable).where(and(
    eq(messageTemplatesTable.id, params.data.templateId),
    eq(messageTemplatesTable.ownerUserId, ownerUserId),
  )).returning();
  if (!deleted) return void sendError(res, 404, "Không tìm thấy mẫu tin nhắn.");
  await recordActivity({ ownerUserId, event: "template.deleted", message: `Deleted message template: ${deleted.name}`, level: "info" });
  res.status(204).send();
});

router.get("/campaigns", async (req, res): Promise<void> => {
  const campaigns = await db.select().from(campaignsTable)
    .where(eq(campaignsTable.ownerUserId, currentUserId(req))).orderBy(desc(campaignsTable.createdAt));
  res.json(ListCampaignsResponse.parse(await Promise.all(campaigns.map(campaignSummary))));
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  const systemSettings = await getSystemSettings();
  const numericValues = [
    parsed.data.repeatCount,
    parsed.data.roundDelayMinSeconds,
    parsed.data.roundDelayMaxSeconds,
  ];
  if (!numericValues.every(Number.isInteger)) return void sendError(res, 400, "Số lần lặp và khoảng delay phải là số nguyên.");
  if (parsed.data.repeatCount < 1) return void sendError(res, 400, "Số lần lặp phải lớn hơn hoặc bằng 1.");
  if (parsed.data.roundDelayMinSeconds > parsed.data.roundDelayMaxSeconds) {
    return void sendError(res, 400, "Delay tối thiểu không thể lớn hơn delay tối đa.");
  }
  if (parsed.data.mediaUrl) {
    return void sendError(res, 400, "Media delivery is not supported yet; remove the attachment before starting this campaign.");
  }
  const campaignAllowance = await getCampaignAllowance(currentUserId(req));
  if (campaignAllowance.campaignLimit !== null && campaignAllowance.used >= campaignAllowance.campaignLimit) {
    return void sendError(res, 409, `Campaign limit reached for your ${campaignAllowance.plan.toUpperCase()} plan`);
  }
  const accounts = await db.select({ id: telegramAccountsTable.id }).from(telegramAccountsTable)
    .where(and(eq(telegramAccountsTable.ownerUserId, currentUserId(req)), isNull(telegramAccountsTable.deletedAt)));
  if (!accounts.length) return void sendError(res, 409, "Connect a Telegram account before creating a campaign");
  const accountIds = accounts.map((account) => account.id);
  if (parsed.data.telegramAccountId && !accountIds.includes(parsed.data.telegramAccountId)) {
    return void sendError(res, 404, "Telegram account not found");
  }
  const destinationIds = [...new Set(parsed.data.destinationIds)];
  const destinations = await db.select().from(destinationsTable)
    .where(and(
      inArray(destinationsTable.id, destinationIds),
      inArray(destinationsTable.accountId, parsed.data.telegramAccountId ? [parsed.data.telegramAccountId] : accountIds),
    ));
  if (destinations.length !== destinationIds.length || destinations.some((destination) => !destination.canPost)) {
    return void sendError(res, 409, "Every campaign destination must exist and have verified posting permission");
  }
  let content = parsed.data.content.trim();
  let templateMode: "text" | "forward" = "text";
  let templateSourceAccountId: string | null = null;
  let templateSourceMessageId: string | null = null;
  if (parsed.data.templateId) {
    const [template] = await db.select().from(messageTemplatesTable).where(and(
      eq(messageTemplatesTable.id, parsed.data.templateId),
      eq(messageTemplatesTable.ownerUserId, currentUserId(req)),
    ));
    if (!template) return void sendError(res, 404, "Message template not found");
    content = template.content;
    templateMode = template.mode === "forward" ? "forward" : "text";
    templateSourceAccountId = template.sourceAccountId;
    templateSourceMessageId = template.sourceMessageId;
    if (templateMode === "forward" && (!parsed.data.telegramAccountId || templateSourceAccountId !== parsed.data.telegramAccountId || !templateSourceMessageId)) {
      return void sendError(res, 409, "Forward templates must use the Telegram account that owns the saved message.");
    }
  }
  if (templateMode === "text" && !content) return void sendError(res, 400, "Choose a message template or enter campaign content.");
  const now = new Date();
  const { scheduledAt, roundStartAt: initialRoundStartAt } = resolveCampaignScheduleStart(
    parsed.data.scheduledAt,
    now,
  );
  const [campaign] = await db.insert(campaignsTable).values({
    ownerUserId: currentUserId(req),
    name: parsed.data.name,
    content,
    telegramAccountId: parsed.data.telegramAccountId ?? null,
    templateId: parsed.data.templateId ?? null,
    templateMode,
    templateSourceAccountId,
    templateSourceMessageId,
    mediaUrl: parsed.data.mediaUrl ?? null,
    scheduledAt,
    scheduleAnchorAt: initialRoundStartAt,
    timezone: parsed.data.timezone,
    status: "queued",
    maxRetries: systemSettings.campaignDefaults.maxRetries,
    repeatCount: parsed.data.repeatCount,
    // Retained legacy columns are fixed at zero. New schedules no longer
    // offset groups within the same delivery round.
    delayMinSeconds: 0,
    delayMaxSeconds: 0,
    roundDelayMinSeconds: parsed.data.roundDelayMinSeconds,
    roundDelayMaxSeconds: parsed.data.roundDelayMaxSeconds,
  }).returning();
  let roundStartAt = initialRoundStartAt.getTime();
  const targetRows = [];
  for (let round = 0; round < parsed.data.repeatCount; round += 1) {
    for (const destination of destinations) {
      targetRows.push({
        campaignId: campaign.id,
        destinationId: destination.id,
        status: "pending",
        nextAttemptAt: new Date(roundStartAt),
      });
    }
    if (round < parsed.data.repeatCount - 1) {
      roundStartAt += (parsed.data.roundDelayMinSeconds + Math.floor(Math.random() * (parsed.data.roundDelayMaxSeconds - parsed.data.roundDelayMinSeconds + 1))) * 1000;
    }
  }
  await db.insert(campaignTargetsTable).values(targetRows);
  await recordActivity({
    event: "campaign.created",
    message: `Created campaign "${campaign.name}" with ${targetRows.length} scheduled deliveries`,
    ownerUserId: currentUserId(req),
    campaignId: campaign.id,
    metadata: { destinationCount: destinations.length, repeatCount: parsed.data.repeatCount, targetCount: targetRows.length },
  });
  res.status(201).json(CreateCampaignResponse.parse(await campaignSummary(campaign)));
});

router.post("/campaigns/:campaignId/clone", async (req, res): Promise<void> => {
  const params = CloneCampaignParams.safeParse(req.params);
  const body = CloneCampaignBody.safeParse(req.body);
  if (!params.success || !body.success) return void sendError(res, 400, "Thông tin nhân bản campaign không hợp lệ.");

  const ownerUserId = currentUserId(req);
  const campaignAllowance = await getCampaignAllowance(ownerUserId);
  if (campaignAllowance.campaignLimit !== null && campaignAllowance.used >= campaignAllowance.campaignLimit) {
    return void sendError(res, 409, `Campaign limit reached for your ${campaignAllowance.plan.toUpperCase()} plan`);
  }

  const outcome = await db.transaction(async (tx) => {
    const [sourceCandidate] = await tx.select().from(campaignsTable).where(and(
      eq(campaignsTable.id, params.data.campaignId),
      eq(campaignsTable.ownerUserId, ownerUserId),
    ));
    if (!sourceCandidate) return { kind: "error" as const, status: 404, message: "Không tìm thấy campaign nguồn." };

    await tx.execute(sql`SELECT 1 FROM ${campaignsTable} WHERE ${campaignsTable.id} = ${sourceCandidate.id} FOR UPDATE`);
    const [sourceCampaign] = await tx.select().from(campaignsTable).where(and(
      eq(campaignsTable.id, sourceCandidate.id),
      eq(campaignsTable.ownerUserId, ownerUserId),
    ));
    if (!sourceCampaign) return { kind: "error" as const, status: 404, message: "Campaign nguồn không còn tồn tại." };

    const [targetAccount] = await tx.select().from(telegramAccountsTable).where(and(
      eq(telegramAccountsTable.id, body.data.telegramAccountId),
      eq(telegramAccountsTable.ownerUserId, ownerUserId),
      isNull(telegramAccountsTable.deletedAt),
    ));
    if (!targetAccount) return { kind: "error" as const, status: 404, message: "Không tìm thấy tài khoản Telegram đã chọn." };
    if (!targetAccount.sessionEncrypted || targetAccount.status !== "connected") {
      return { kind: "error" as const, status: 409, message: "Tài khoản Telegram đã chọn cần được kết nối trước khi nhân bản." };
    }

    const sourceTargets = await tx.select({ destinationId: campaignTargetsTable.destinationId })
      .from(campaignTargetsTable)
      .where(eq(campaignTargetsTable.campaignId, sourceCampaign.id));
    const sourceDestinationIds = [...new Set(sourceTargets.map((target) => target.destinationId))];
    const sourceDestinations = sourceDestinationIds.length
      ? await tx.select().from(destinationsTable).where(inArray(destinationsTable.id, sourceDestinationIds))
      : [];
    const targetDestinations = await tx.select().from(destinationsTable)
      .where(eq(destinationsTable.accountId, targetAccount.id));
    const targetDestinationByKey = new Map(targetDestinations.map((destination) => [
      `${destination.telegramId}:${destination.topicId ?? "chat"}`,
      destination,
    ]));
    const clonedDestinationIds = sourceDestinations.flatMap((destination) => {
      if (destination.accountId === targetAccount.id) return [destination.id];
      const matchingDestination = targetDestinationByKey.get(`${destination.telegramId}:${destination.topicId ?? "chat"}`);
      return matchingDestination ? [matchingDestination.id] : [];
    });

    const sourceTemplate = sourceCampaign.templateId
      ? (await tx.select().from(messageTemplatesTable).where(and(
        eq(messageTemplatesTable.id, sourceCampaign.templateId),
        eq(messageTemplatesTable.ownerUserId, ownerUserId),
      )))[0]
      : undefined;
    const keepTemplate = Boolean(sourceTemplate && (
      sourceTemplate.mode === "text"
      || sourceTemplate.sourceAccountId === targetAccount.id
    ));
    const templateId = keepTemplate ? sourceTemplate!.id : null;
    const templateMode = keepTemplate && sourceTemplate!.mode === "forward" ? "forward" : "text";
    const templateSourceAccountId = keepTemplate ? sourceTemplate!.sourceAccountId : null;
    const templateSourceMessageId = keepTemplate ? sourceTemplate!.sourceMessageId : null;
    const content = keepTemplate ? sourceTemplate!.content : templateMode === "text" ? sourceCampaign.content : "";

    const [clone] = await tx.insert(campaignsTable).values({
      ownerUserId,
      name: `${sourceCampaign.name} (Bản sao)`,
      content,
      telegramAccountId: targetAccount.id,
      templateId,
      templateMode,
      templateSourceAccountId,
      templateSourceMessageId,
      clonedFromCampaignId: sourceCampaign.id,
      clonedFromUserId: ownerUserId,
      mediaUrl: null,
      status: "draft",
      scheduledAt: sourceCampaign.scheduledAt,
      scheduleAnchorAt: sourceCampaign.scheduleAnchorAt ?? sourceCampaign.scheduledAt ?? sourceCampaign.createdAt,
      timezone: sourceCampaign.timezone,
      maxRetries: sourceCampaign.maxRetries,
      repeatCount: sourceCampaign.repeatCount,
      delayMinSeconds: sourceCampaign.delayMinSeconds,
      delayMaxSeconds: sourceCampaign.delayMaxSeconds,
      roundDelayMinSeconds: sourceCampaign.roundDelayMinSeconds,
      roundDelayMaxSeconds: sourceCampaign.roundDelayMaxSeconds,
    }).returning();
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
    await tx.insert(activityLogsTable).values({
      ownerUserId,
      event: "campaign.cloned_by_user",
      message: `Cloned campaign "${sourceCampaign.name}" into a draft.`,
      campaignId: clone.id,
      accountId: targetAccount.id,
      level: "success",
      metadata: {
        sourceCampaignId: sourceCampaign.id,
        sourceAccountId: sourceCampaign.telegramAccountId,
        targetAccountId: targetAccount.id,
        destinationCount: clonedDestinationIds.length,
        templateReused: keepTemplate,
      },
    });
    return { kind: "success" as const, campaign: clone };
  });

  if (outcome.kind === "error") return void sendError(res, outcome.status, outcome.message);
  res.status(201).json(CloneCampaignResponse.parse(await campaignSummary(outcome.campaign)));
});

router.get("/campaigns/:campaignId/clone-readiness", async (req, res): Promise<void> => {
  const params = GetCampaignCloneReadinessParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const ownerUserId = currentUserId(req);
  const [campaign] = await db.select().from(campaignsTable).where(and(
    eq(campaignsTable.id, params.data.campaignId),
    eq(campaignsTable.ownerUserId, ownerUserId),
  ));
  if (!campaign || !campaign.clonedFromCampaignId) {
    return void sendError(res, 404, "Cloned campaign not found");
  }
  const [account] = campaign.telegramAccountId
    ? await db.select().from(telegramAccountsTable).where(and(
      eq(telegramAccountsTable.id, campaign.telegramAccountId),
      eq(telegramAccountsTable.ownerUserId, ownerUserId),
      isNull(telegramAccountsTable.deletedAt),
    ))
    : [];
  const [template] = campaign.templateId
    ? await db.select().from(messageTemplatesTable).where(and(
      eq(messageTemplatesTable.id, campaign.templateId),
      eq(messageTemplatesTable.ownerUserId, ownerUserId),
    ))
    : [];
  const targets = await db.select({ destination: destinationsTable }).from(campaignTargetsTable)
    .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .where(eq(campaignTargetsTable.campaignId, campaign.id));
  const seenDestinationIds = new Set<string>();
  const destinations = targets.flatMap(({ destination }) => {
    if (seenDestinationIds.has(destination.id)) return [];
    seenDestinationIds.add(destination.id);
    const ready = Boolean(account && destination.accountId === account.id && destination.canPost);
    return [{
      id: destination.id,
      title: destination.title,
      ready,
      reason: ready
        ? null
        : destination.permissionReason || "Hãy đồng bộ tài khoản Telegram admin để kiểm tra quyền gửi.",
    }];
  });
  res.json(GetCampaignCloneReadinessResponse.parse({
    accountReady: Boolean(account?.sessionEncrypted && account.status === "connected"),
    messageReady: Boolean(
      template?.mode === "forward"
      && template.sourceAccountId === campaign.telegramAccountId
      && template.sourceMessageId,
    ),
    destinations,
  }));
});

router.patch("/campaigns/:campaignId", async (req, res): Promise<void> => {
  const params = UpdateCampaignStatusParams.safeParse(req.params);
  const parsed = UpdateCampaignStatusBody.safeParse(req.body);
  if (!params.success) return void sendError(res, 400, params.error.message);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  const ownerUserId = currentUserId(req);
  const [existing] = await db.select().from(campaignsTable)
    .where(and(eq(campaignsTable.id, params.data.campaignId), eq(campaignsTable.ownerUserId, ownerUserId)));
  if (!existing) return void sendError(res, 404, "Campaign not found");

  const editing = parsed.data.name !== undefined || parsed.data.telegramAccountId !== undefined
    || parsed.data.templateId !== undefined || parsed.data.destinationIds !== undefined
    || parsed.data.scheduledAt !== undefined || parsed.data.timezone !== undefined
    || parsed.data.repeatCount !== undefined || parsed.data.roundDelayMinSeconds !== undefined
    || parsed.data.roundDelayMaxSeconds !== undefined;
  if (!editing && !parsed.data.status) return void sendError(res, 400, "No campaign changes were provided");
  if (editing && parsed.data.status !== undefined) {
    return void sendError(res, 400, "Update campaign details and status in separate requests");
  }
  if (editing && !["draft", "paused"].includes(existing.status)) {
    return void sendError(res, 409, "Only draft or paused campaigns can be edited");
  }
  const isAdminClone = campaignCloneMode(existing) === "admin";
  if (isAdminClone && (
    (parsed.data.telegramAccountId !== undefined && parsed.data.telegramAccountId !== existing.telegramAccountId)
    || (parsed.data.templateId !== undefined && parsed.data.templateId !== existing.templateId)
  )) {
    return void sendError(res, 409, "A cloned campaign keeps its assigned Telegram account and forward template. Select a Saved Message when running it.");
  }

  if (editing) {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM ${campaignsTable} WHERE ${campaignsTable.id} = ${existing.id} FOR UPDATE`);
      const [lockedCampaign] = await tx.select().from(campaignsTable)
        .where(and(eq(campaignsTable.id, existing.id), eq(campaignsTable.ownerUserId, ownerUserId)));
      if (!lockedCampaign) return { kind: "error" as const, status: 404, message: "Campaign not found" };
      if (!["draft", "paused"].includes(lockedCampaign.status)) {
        return { kind: "error" as const, status: 409, message: "Only draft or paused campaigns can be edited" };
      }

      await tx.execute(sql`SELECT 1 FROM ${campaignTargetsTable} WHERE ${campaignTargetsTable.campaignId} = ${lockedCampaign.id} FOR UPDATE`);
      const existingTargets = await tx.select({
        destinationId: campaignTargetsTable.destinationId,
        status: campaignTargetsTable.status,
        sentAt: campaignTargetsTable.sentAt,
      }).from(campaignTargetsTable)
        .where(eq(campaignTargetsTable.campaignId, lockedCampaign.id));
      if (lockedCampaign.status === "paused" && existingTargets.some((target) => target.status === "sending")) {
        return { kind: "error" as const, status: 409, message: "Please wait for the current delivery to finish before editing this paused campaign" };
      }

      const name = parsed.data.name ?? lockedCampaign.name;
      const telegramAccountId = parsed.data.telegramAccountId === undefined ? lockedCampaign.telegramAccountId : parsed.data.telegramAccountId;
      const templateId = parsed.data.templateId === undefined ? lockedCampaign.templateId : parsed.data.templateId;
      const destinationIds = [...new Set(parsed.data.destinationIds
        ?? existingTargets.map((target) => target.destinationId))];
      const repeatCount = parsed.data.repeatCount ?? lockedCampaign.repeatCount;
      const roundDelayMinSeconds = parsed.data.roundDelayMinSeconds ?? lockedCampaign.roundDelayMinSeconds;
      const roundDelayMaxSeconds = parsed.data.roundDelayMaxSeconds ?? lockedCampaign.roundDelayMaxSeconds;
      if (!name.trim() || !telegramAccountId || !templateId || !destinationIds.length) {
        return { kind: "error" as const, status: 400, message: "Campaign name, account, template, and at least one destination are required" };
      }
      if (![repeatCount, roundDelayMinSeconds, roundDelayMaxSeconds].every(Number.isInteger)) {
        return { kind: "error" as const, status: 400, message: "Repeat count and delays must be integers" };
      }
      if (roundDelayMinSeconds > roundDelayMaxSeconds) {
        return { kind: "error" as const, status: 400, message: "Minimum delay cannot exceed maximum delay" };
      }

      const [account] = await tx.select({ id: telegramAccountsTable.id }).from(telegramAccountsTable).where(and(
        eq(telegramAccountsTable.id, telegramAccountId),
        eq(telegramAccountsTable.ownerUserId, ownerUserId),
        isNull(telegramAccountsTable.deletedAt),
      ));
      if (!account) return { kind: "error" as const, status: 404, message: "Telegram account not found" };
      const [template] = await tx.select().from(messageTemplatesTable).where(and(
        eq(messageTemplatesTable.id, templateId),
        eq(messageTemplatesTable.ownerUserId, ownerUserId),
      ));
      if (!template) return { kind: "error" as const, status: 404, message: "Message template not found" };
       if (campaignCloneMode(lockedCampaign) !== "admin" && template.mode === "forward" && (template.sourceAccountId !== telegramAccountId || !template.sourceMessageId)) {
        return { kind: "error" as const, status: 409, message: "Forward templates must use the Telegram account that owns the saved message" };
      }
      const destinations = await tx.select().from(destinationsTable).where(and(
        inArray(destinationsTable.id, destinationIds),
        eq(destinationsTable.accountId, telegramAccountId),
      ));
       if (destinations.length !== destinationIds.length || (campaignCloneMode(lockedCampaign) !== "admin" && destinations.some((destination) => !destination.canPost))) {
        return { kind: "error" as const, status: 409, message: "Every campaign destination must exist and have verified posting permission" };
      }

      const editSetAt = new Date();
      const requestedScheduledAt = parsed.data.scheduledAt === undefined
        ? lockedCampaign.scheduledAt
        : parsed.data.scheduledAt;
      const { scheduledAt, roundStartAt: configuredRoundStartAt } = resolveCampaignScheduleStart(
        requestedScheduledAt,
        editSetAt,
      );
      const scheduleAnchorAt = parsed.data.scheduledAt === undefined
        ? lockedCampaign.scheduleAnchorAt ?? lockedCampaign.scheduledAt ?? lockedCampaign.createdAt
        : configuredRoundStartAt;
      const targetRows: (typeof campaignTargetsTable.$inferInsert)[] = [];
      const sentByDestination = new Map<string, number>();
      let latestSentAt: Date | null = null;
      for (const target of existingTargets) {
        if (target.status === "sent") {
          sentByDestination.set(target.destinationId, (sentByDestination.get(target.destinationId) ?? 0) + 1);
          if (target.sentAt && (!latestSentAt || target.sentAt.getTime() > latestSentAt.getTime())) {
            latestSentAt = target.sentAt;
          }
        }
      }
      const randomRoundDelay = () => roundDelayMinSeconds
        + Math.floor(Math.random() * (roundDelayMaxSeconds - roundDelayMinSeconds + 1));
      const firstRoundAfterLastSend = latestSentAt
        ? latestSentAt.getTime() + randomRoundDelay() * 1000
        : Number.NEGATIVE_INFINITY;
      let roundStartAt = Math.max(
        configuredRoundStartAt.getTime(),
        editSetAt.getTime(),
        firstRoundAfterLastSend,
      );
      const remainingByDestination = new Map(destinations.map((destination) => [
        destination.id,
        Math.max(0, repeatCount - (sentByDestination.get(destination.id) ?? 0)),
      ]));
      let remainingDeliveries = [...remainingByDestination.values()].reduce((total, count) => total + count, 0);
      while (remainingDeliveries > 0) {
        for (const destination of destinations) {
          const remaining = remainingByDestination.get(destination.id) ?? 0;
          if (remaining === 0) continue;
          targetRows.push({
            campaignId: lockedCampaign.id,
            destinationId: destination.id,
            status: "pending",
            nextAttemptAt: new Date(roundStartAt),
          });
          remainingByDestination.set(destination.id, remaining - 1);
          remainingDeliveries -= 1;
        }
        if (remainingDeliveries > 0) {
          roundStartAt += randomRoundDelay() * 1000;
        }
      }

      const [campaign] = await tx.update(campaignsTable).set({
        name: name.trim(),
        content: template.content,
        telegramAccountId,
        templateId,
        templateMode: template.mode,
        templateSourceAccountId: template.sourceAccountId,
        templateSourceMessageId: template.sourceMessageId,
        scheduledAt,
        scheduleAnchorAt,
        timezone: parsed.data.timezone ?? lockedCampaign.timezone,
        repeatCount,
        delayMinSeconds: 0,
        delayMaxSeconds: 0,
        roundDelayMinSeconds,
        roundDelayMaxSeconds,
        updatedAt: new Date(),
      }).where(eq(campaignsTable.id, lockedCampaign.id)).returning();
      await tx.delete(campaignTargetsTable).where(and(
        eq(campaignTargetsTable.campaignId, lockedCampaign.id),
        inArray(campaignTargetsTable.status, ["pending", "failed", "requires_review", "cancelled"]),
      ));
      if (targetRows.length > 0) await tx.insert(campaignTargetsTable).values(targetRows);
      return { kind: "success" as const, campaign };
    });
    if (result.kind === "error") return void sendError(res, result.status, result.message);
    const campaign = result.campaign;
    await recordActivity({
      ownerUserId,
      event: "campaign.updated",
      message: `Updated campaign "${campaign.name}"`,
      level: "success",
      campaignId: campaign.id,
    });
    return void res.json(UpdateCampaignStatusResponse.parse(await campaignSummary(campaign)));
  }

  const nextStatus = parsed.data.status;
  if (!nextStatus) return void sendError(res, 400, "No campaign status was provided");
  const isResumingPausedCampaign = nextStatus === "queued" && existing.status === "paused";
  if (nextStatus === "queued") {
    if (!existing.telegramAccountId || !existing.templateId) {
      return void sendError(res, 409, "Campaign needs a Telegram account and a message template before it can run.");
    }
    const [account] = await db.select().from(telegramAccountsTable).where(and(
      eq(telegramAccountsTable.id, existing.telegramAccountId),
      eq(telegramAccountsTable.ownerUserId, ownerUserId),
      isNull(telegramAccountsTable.deletedAt),
    ));
    if (!account || !account.sessionEncrypted || account.status !== "connected") {
      return void sendError(res, 409, "The campaign Telegram account must be connected before it can run.");
    }
    const [template] = await db.select().from(messageTemplatesTable).where(and(
      eq(messageTemplatesTable.id, existing.templateId),
      eq(messageTemplatesTable.ownerUserId, ownerUserId),
    ));
    if (!template) return void sendError(res, 409, "The campaign message template is unavailable.");
     if (campaignCloneMode(existing) === "admin" && template.mode !== "forward") {
      return void sendError(res, 409, "A cloned campaign must use a Saved Message forward template.");
    }
    if (template.mode === "forward" && (
      template.sourceAccountId !== existing.telegramAccountId || !template.sourceMessageId
    )) {
      return void sendError(res, 409, "Select a Saved Message from this campaign's Telegram account before running.");
    }
    const targetDestinations = await db.select({ destination: destinationsTable }).from(campaignTargetsTable)
      .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
      .where(eq(campaignTargetsTable.campaignId, existing.id));
    if (!targetDestinations.length || targetDestinations.some(({ destination }) => (
      destination.accountId !== existing.telegramAccountId || !destination.canPost
    ))) {
      return void sendError(res, 409, "Every destination must be synced and have verified posting permission before running.");
    }
    if (existing.clonedFromCampaignId && existing.status === "draft") {
      const pendingTargets = await db.select({
        id: campaignTargetsTable.id,
        destinationId: campaignTargetsTable.destinationId,
      }).from(campaignTargetsTable).where(and(
        eq(campaignTargetsTable.campaignId, existing.id),
        eq(campaignTargetsTable.status, "pending"),
      ));
      const targetsByDestination = new Map<string, string[]>();
      for (const target of pendingTargets) {
        const rows = targetsByDestination.get(target.destinationId) ?? [];
        rows.push(target.id);
        targetsByDestination.set(target.destinationId, rows);
      }
      const { roundStartAt: initialRoundStartAt } = resolveCampaignScheduleStart(existing.scheduledAt, new Date());
      let roundStartAt = initialRoundStartAt.getTime();
      const destinationIds = [...targetsByDestination.keys()];
      for (let round = 0; round < existing.repeatCount; round += 1) {
        await Promise.all(destinationIds.map(async (destinationId) => {
          const targetId = targetsByDestination.get(destinationId)?.shift();
          if (!targetId) return;
          await db.update(campaignTargetsTable).set({
            nextAttemptAt: new Date(roundStartAt),
            updatedAt: new Date(),
          }).where(eq(campaignTargetsTable.id, targetId));
        }));
        if (round < existing.repeatCount - 1) {
          roundStartAt += (existing.roundDelayMinSeconds + Math.floor(
            Math.random() * (existing.roundDelayMaxSeconds - existing.roundDelayMinSeconds + 1),
          )) * 1000;
        }
      }
    }
  }
  const scheduleRebase = isResumingPausedCampaign
    ? await rebaseCampaignScheduleForResume(existing.id)
    : null;
  const [campaign] = await db.update(campaignsTable).set({
    status: nextStatus,
    pauseReason: nextStatus === "paused" ? "manual" : null,
    updatedAt: scheduleRebase?.resumedAt ?? new Date(),
  })
    .where(eq(campaignsTable.id, existing.id)).returning();
  if (nextStatus === "cancelled") {
    await db.update(campaignTargetsTable).set({ status: "cancelled", quotaReservedAt: null, updatedAt: new Date() })
      .where(and(eq(campaignTargetsTable.campaignId, campaign.id), inArray(campaignTargetsTable.status, ["pending", "sending"])));
  }
  const isCloneConfirmation = nextStatus === "queued"
    && Boolean(existing.clonedFromCampaignId)
    && existing.status === "draft";
  const activityMetadata = {
    ...(existing.clonedFromCampaignId ? { clonedFromCampaignId: existing.clonedFromCampaignId } : {}),
    ...(scheduleRebase?.rebasedTargetCount
      ? {
        scheduleRebased: true,
        pendingTargetCount: scheduleRebase.rebasedTargetCount,
        nextRunAt: scheduleRebase.nextRunAt?.toISOString() ?? null,
      }
      : {}),
  };
  await recordActivity({
    event: isCloneConfirmation
      ? "campaign.clone.queued"
      : isResumingPausedCampaign ? "campaign.resumed" : `campaign.${nextStatus}`,
    message: isCloneConfirmation
      ? `Confirmed and queued cloned campaign "${campaign.name}".`
      : isResumingPausedCampaign
        ? scheduleRebase?.rebasedTargetCount
          ? `Resumed campaign "${campaign.name}" and moved its remaining schedule forward.`
          : `Resumed campaign "${campaign.name}".`
        : `${nextStatus[0].toUpperCase()}${nextStatus.slice(1)} campaign "${campaign.name}"`,
    ownerUserId: currentUserId(req),
    campaignId: campaign.id,
    metadata: Object.keys(activityMetadata).length ? activityMetadata : undefined,
  });
  res.json(UpdateCampaignStatusResponse.parse(await campaignSummary(campaign)));
});

router.delete("/campaigns/:campaignId", async (req, res): Promise<void> => {
  const params = UpdateCampaignStatusParams.safeParse(req.params);
  if (!params.success) return void sendError(res, 400, params.error.message);
  const [campaign] = await db.delete(campaignsTable)
    .where(and(eq(campaignsTable.id, params.data.campaignId), eq(campaignsTable.ownerUserId, currentUserId(req)))).returning();
  if (!campaign) return void sendError(res, 404, "Campaign not found");
  await recordActivity({ event: "campaign.deleted", message: `Deleted campaign "${campaign.name}"`, ownerUserId: currentUserId(req) });
  res.sendStatus(204);
});

router.get("/calendar", async (req, res): Promise<void> => {
  const parsed = ListCalendarItemsQueryParams.safeParse(req.query);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  const conditions = [eq(campaignsTable.ownerUserId, currentUserId(req)), inArray(campaignsTable.status, ["queued", "running", "paused"])];
  if (parsed.data.from) conditions.push(gte(campaignsTable.scheduledAt, parsed.data.from));
  if (parsed.data.to) conditions.push(lte(campaignsTable.scheduledAt, parsed.data.to));
  const rows = await db.select().from(campaignsTable).where(and(...conditions)).orderBy(campaignsTable.scheduledAt);
  const result = await Promise.all(rows.filter((row) => row.scheduledAt).map(async (row) => {
    const summary = await campaignSummary(row);
    return { id: row.id, campaignId: row.id, name: row.name, scheduledAt: row.scheduledAt!, status: row.status, targetCount: summary.targetCount };
  }));
  res.json(ListCalendarItemsResponse.parse(result));
});

router.get("/activity", async (req, res): Promise<void> => {
  const parsed = ListActivityQueryParams.safeParse(req.query);
  if (!parsed.success) return void sendError(res, 400, parsed.error.message);
  const logs = await db.select({
    id: activityLogsTable.id,
    level: activityLogsTable.level,
    event: activityLogsTable.event,
    message: activityLogsTable.message,
    accountId: activityLogsTable.accountId,
    campaignId: activityLogsTable.campaignId,
    targetId: activityLogsTable.targetId,
    metadata: activityLogsTable.metadata,
    createdAt: activityLogsTable.createdAt,
    campaignName: campaignsTable.name,
    accountName: sql<string | null>`coalesce(${telegramAccountsTable.name}, ${activityDestinationAccounts.name})`,
    destinationTitle: sql<string | null>`case when ${activityDestinationAccounts.id} is not null then ${destinationsTable.title} else null end`,
    destinationUsername: sql<string | null>`case when ${activityDestinationAccounts.id} is not null then ${destinationsTable.username} else null end`,
    targetStatus: campaignTargetsTable.status,
    targetAttempts: campaignTargetsTable.attempts,
    targetLastError: campaignTargetsTable.lastError,
    targetNextAttemptAt: campaignTargetsTable.nextAttemptAt,
  }).from(activityLogsTable)
    .leftJoin(campaignsTable, and(
      eq(activityLogsTable.campaignId, campaignsTable.id),
      eq(campaignsTable.ownerUserId, currentUserId(req)),
    ))
    .leftJoin(telegramAccountsTable, and(
      eq(activityLogsTable.accountId, telegramAccountsTable.id),
      eq(telegramAccountsTable.ownerUserId, currentUserId(req)),
    ))
    .leftJoin(campaignTargetsTable, and(
      eq(activityLogsTable.targetId, campaignTargetsTable.id),
      eq(campaignTargetsTable.campaignId, campaignsTable.id),
    ))
    .leftJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .leftJoin(activityDestinationAccounts, and(
      eq(destinationsTable.accountId, activityDestinationAccounts.id),
      eq(activityDestinationAccounts.ownerUserId, currentUserId(req)),
    ))
    .where(eq(activityLogsTable.ownerUserId, currentUserId(req)))
    .orderBy(desc(activityLogsTable.createdAt)).limit(parsed.data.limit);
  res.json(ListActivityResponse.parse(logs));
});

export default router;