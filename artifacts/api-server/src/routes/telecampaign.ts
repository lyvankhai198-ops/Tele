import { Router, type IRouter } from "express";
import { and, count, desc, eq, gt, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import {
  CreateCampaignBody,
  CreateCampaignResponse,
  ActivateLicenseBody,
  ActivateLicenseResponse,
  GetAccountSummaryResponse,
  GetDashboardResponse,
  GetUpgradeSummaryResponse,
  GetSystemDefaultsResponse,
  GetTelegramConfigResponse,
  ListActivityQueryParams,
  ListActivityResponse,
  ListCalendarItemsQueryParams,
  ListCalendarItemsResponse,
  ListCampaignsResponse,
  ListDestinationsResponse,
  ListMessageTemplatesResponse,
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
import { campaignSummary } from "../lib/campaigns";
import { recordActivity } from "../lib/activity";
import { getTelegramConfiguration } from "../lib/telegram-config";
import { getPurchaseSettings } from "../lib/purchase-settings";
import {
  confirmTelegramPhoneCode,
  confirmTelegramTwoFactorPassword,
  credentialsForAccount,
  encryptSecret,
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

const router: IRouter = Router();
const sendError = (res: any, status: number, error: string) => {
  res.status(status).json({ error });
};
const currentUserId = (req: any): string => req.userId;
const normalizePhone = (phone: string) => phone.trim().replace(/[\s-]/g, "");
const maskPhone = (phone: string) => `••••${phone.slice(-4)}`;
const LOGIN_CHALLENGE_TTL_MS = 10 * 60_000;
const MAX_LOGIN_ATTEMPTS = 5;
type WaitingLoginStatus = "waiting_code" | "waiting_password";
type ProcessingLoginStatus = "processing_code" | "processing_password";
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
  const login = await startTelegramPhoneLogin(credentialsForAccount(account), phoneForAccount(account));
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
  const dayStart = sql`date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
  const [[profile], subscription, [telegramAccounts], [campaigns], [messagesToday]] = await Promise.all([
    db.select({
      username: appUsersTable.username,
      joinedAt: appUsersTable.createdAt,
    }).from(appUsersTable).where(eq(appUsersTable.id, ownerUserId)).limit(1),
    getSubscription(ownerUserId),
    db.select({ value: count() }).from(telegramAccountsTable).where(and(eq(telegramAccountsTable.ownerUserId, ownerUserId), isNull(telegramAccountsTable.deletedAt))),
    db.select({ value: count() }).from(campaignsTable).where(eq(campaignsTable.ownerUserId, ownerUserId)),
    db.select({ value: count() }).from(activityLogsTable).where(and(
      eq(activityLogsTable.ownerUserId, ownerUserId),
      eq(activityLogsTable.event, "campaign.target.sent"),
      gte(activityLogsTable.createdAt, dayStart),
    )),
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
      messagesToday: usage(messagesToday.value, subscription.messageDailyLimit),
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

router.use(requireActiveSubscription);

router.get("/dashboard", async (req, res): Promise<void> => {
  const ownerUserId = currentUserId(req);
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
    adminNotifications,
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
    db.select().from(activityLogsTable).where(eq(activityLogsTable.ownerUserId, ownerUserId))
      .orderBy(desc(activityLogsTable.createdAt)).limit(8),
    db.select().from(adminNotificationsTable)
      .where(lte(adminNotificationsTable.publishedAt, new Date()))
      .orderBy(desc(adminNotificationsTable.publishedAt)).limit(8),
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
    recentActivity,
    adminNotifications,
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
    const [account] = await db.insert(telegramAccountsTable).values({
      ownerUserId: currentUserId(req),
      name: `Telegram ${phone}`,
      phoneMasked: maskPhone(phone),
      phoneEncrypted: encryptSecret(phone),
      apiId: parsed.data.api_id,
      apiHashEncrypted: encryptSecret(apiHash),
      dailyLimit: parsed.data.daily_limit,
      status: "saved",
    }).returning();
    createdAccountId = account.id;

    const loginStart = await startLoginChallenge(account);
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
    const loginStart = await startLoginChallenge(account);
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
  try {
    const result = await confirmTelegramPhoneCode({
      credentials: credentialsForAccount(account),
      phone: phoneForAccount(account),
      phoneCodeHash: decryptSecret(reservation.challenge.phoneCodeHashEncrypted),
      session: decryptSecret(reservation.challenge.sessionEncrypted),
      code,
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
    const count = await syncAccountDestinations(params.data.accountId);
    res.status(202).json(SyncTelegramDestinationsResponse.parse({ count }));
  } catch (error) {
    req.log.warn({ err: error }, "Telegram destination sync failed");
    sendError(res, 409, error instanceof Error ? error.message : "Destination sync failed");
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
    sendError(res, 409, error instanceof Error ? error.message : "Không thể đồng bộ Tin nhắn đã lưu.");
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
  const scheduledAt = parsed.data.scheduledAt ?? null;
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
  let roundStartAt = (scheduledAt ?? now).getTime();
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
      if (template.mode === "forward" && (template.sourceAccountId !== telegramAccountId || !template.sourceMessageId)) {
        return { kind: "error" as const, status: 409, message: "Forward templates must use the Telegram account that owns the saved message" };
      }
      const destinations = await tx.select().from(destinationsTable).where(and(
        inArray(destinationsTable.id, destinationIds),
        eq(destinationsTable.accountId, telegramAccountId),
      ));
      if (destinations.length !== destinationIds.length || destinations.some((destination) => !destination.canPost)) {
        return { kind: "error" as const, status: 409, message: "Every campaign destination must exist and have verified posting permission" };
      }

      const scheduledAt = parsed.data.scheduledAt === undefined ? lockedCampaign.scheduledAt : parsed.data.scheduledAt;
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
        scheduledAt?.getTime() ?? Number.NEGATIVE_INFINITY,
        Date.now(),
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
  const [campaign] = await db.update(campaignsTable).set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(campaignsTable.id, existing.id)).returning();
  if (nextStatus === "cancelled") {
    await db.update(campaignTargetsTable).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(campaignTargetsTable.campaignId, campaign.id), inArray(campaignTargetsTable.status, ["pending", "sending"])));
  }
  await recordActivity({
    event: `campaign.${nextStatus}`,
    message: `${nextStatus[0].toUpperCase()}${nextStatus.slice(1)} campaign "${campaign.name}"`,
    ownerUserId: currentUserId(req),
    campaignId: campaign.id,
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
  const logs = await db.select().from(activityLogsTable).where(eq(activityLogsTable.ownerUserId, currentUserId(req)))
    .orderBy(desc(activityLogsTable.createdAt)).limit(parsed.data.limit);
  res.json(ListActivityResponse.parse(logs));
});

export default router;