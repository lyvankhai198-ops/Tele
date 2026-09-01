import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { db, destinationsTable, proxiesTable, telegramAccountsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./crypto";
import { requireTelegramConfiguration } from "./telegram-config";
import { recordActivity } from "./activity";
import { resolvePublicProxyAddress } from "./proxy-test";
import { TelegramProxyError, TelegramProxySocket, type TelegramProxyConfig } from "./telegram-proxy-socket";
import { logger } from "./logger";
import {
  TelegramPostingPermissionError,
  telegramSendRestrictionIsActive,
} from "./telegram-errors";

type TelegramEntity = {
  id?: bigint | number;
  title?: string;
  username?: string;
  participantsCount?: number;
  className?: string;
  broadcast?: boolean;
  megagroup?: boolean;
  forum?: boolean;
  creator?: boolean;
  adminRights?: {
    postMessages?: boolean;
  };
  bannedRights?: {
    sendMessages?: boolean;
    untilDate?: number;
  };
  defaultBannedRights?: {
    sendMessages?: boolean;
    untilDate?: number;
  };
};

export type TelegramCredentials = { apiId: number; apiHash: string };
export type TelegramLoginUser = { id: string; username: string | null; phone: string | null; name: string | null };
export const DEVELOPMENT_DEMO_TELEGRAM_PHONE = "+84987654321";

export function createTelegramClient(session = "", credentials?: TelegramCredentials, proxy?: TelegramProxyConfig) {
  const { apiId, apiHash } = credentials ?? requireTelegramConfiguration();
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
    ...(proxy ? {
      proxy: proxy as any,
      networkSocket: TelegramProxySocket as unknown as typeof import("telegram/extensions/index.js").PromisedNetSockets,
    } : {}),
  });
}

export function credentialsForAccount(account: typeof telegramAccountsTable.$inferSelect): TelegramCredentials {
  if (!account.apiId || !account.apiHashEncrypted) {
    throw new Error("Telegram account is missing its API credentials");
  }
  return { apiId: account.apiId, apiHash: decryptSecret(account.apiHashEncrypted) };
}

export function phoneForAccount(account: typeof telegramAccountsTable.$inferSelect): string {
  if (!account.phoneEncrypted) throw new Error("Telegram account is missing its phone number");
  return decryptSecret(account.phoneEncrypted);
}

export function isDevelopmentDemoTelegramAccount(account: typeof telegramAccountsTable.$inferSelect): boolean {
  return process.env.NODE_ENV !== "production" && phoneForAccount(account) === DEVELOPMENT_DEMO_TELEGRAM_PHONE;
}

const savedSession = (client: TelegramClient) => (client.session as unknown as { save: () => string }).save();
const requiresTwoFactor = (error: unknown) => (error as { errorMessage?: string })?.errorMessage === "SESSION_PASSWORD_NEEDED";

function telegramLoginUser(user: any): TelegramLoginUser {
  if (user?.id === undefined || user?.id === null) {
    throw new Error("Telegram authorization did not include a user");
  }
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    id: String(user.id),
    username: user.username ?? null,
    phone: user.phone ?? null,
    name: name || null,
  };
}

export function isTelegramSessionRevoked(error: unknown): boolean {
  const telegramError = error as { errorMessage?: unknown; message?: unknown } | null;
  const details = [telegramError?.errorMessage, telegramError?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toUpperCase();
  return /SESSION_REVOKED|AUTH_KEY_UNREGISTERED|SESSION_EXPIRED|USER_DEACTIVATED/.test(details);
}

async function invalidateTelegramSession(accountId: string): Promise<void> {
  await db.update(telegramAccountsTable).set({
    status: "saved",
    sessionEncrypted: null,
    telegramUserId: null,
    updatedAt: new Date(),
  }).where(and(
    eq(telegramAccountsTable.id, accountId),
    isNull(telegramAccountsTable.deletedAt),
  ));
}

export async function startTelegramPhoneLogin(credentials: TelegramCredentials, phone: string, proxy?: TelegramProxyConfig) {
  const client = createTelegramClient("", credentials, proxy);
  try {
    await client.connect();
    const result = await client.sendCode(credentials, phone);
    return {
      phoneCodeHash: result.phoneCodeHash,
      session: savedSession(client),
      delivery: result.isCodeViaApp ? "app" as const : "sms" as const,
    };
  } finally {
    await destroyQuietly(client);
  }
}

export async function confirmTelegramPhoneCode(input: {
  credentials: TelegramCredentials;
  phone: string;
  phoneCodeHash: string;
  session: string;
  code: string;
  proxy?: TelegramProxyConfig;
}): Promise<
  | { status: "connected"; session: string; user: TelegramLoginUser }
  | { status: "requires_2fa"; session: string }
> {
  const client = createTelegramClient(input.session, input.credentials, input.proxy);
  try {
    await client.connect();
    const authorization = await client.invoke(new Api.auth.SignIn({
      phoneNumber: input.phone,
      phoneCodeHash: input.phoneCodeHash,
      phoneCode: input.code,
    })) as unknown as { user?: unknown };
    return {
      status: "connected",
      session: savedSession(client),
      user: telegramLoginUser(authorization.user),
    };
  } catch (error) {
    if (requiresTwoFactor(error)) return { status: "requires_2fa", session: savedSession(client) };
    throw error;
  } finally {
    await destroyQuietly(client);
  }
}

export async function confirmTelegramTwoFactorPassword(input: {
  credentials: TelegramCredentials;
  session: string;
  password: string;
  proxy?: TelegramProxyConfig;
}): Promise<{ session: string; user: TelegramLoginUser }> {
  const client = createTelegramClient(input.session, input.credentials, input.proxy);
  try {
    await client.connect();
    const user = await client.signInWithPassword(input.credentials, {
      password: async () => input.password,
      onError: async () => true,
    });
    return { session: savedSession(client), user: telegramLoginUser(user) };
  } finally {
    await destroyQuietly(client);
  }
}

function telegramId(entity: TelegramEntity): string {
  return String(entity.id ?? "");
}

function displayTitle(entity: TelegramEntity): string {
  return entity.title ?? (entity.username ? `@${entity.username}` : "Telegram destination");
}

function canPostToEntity(entity: TelegramEntity): boolean {
  if (entity.broadcast) {
    return Boolean(entity.creator || entity.adminRights?.postMessages);
  }

  // For groups and megagroups, Telegram may return an individual ban as
  // well as the default group restriction. Individual rights take priority.
  if (entity.bannedRights?.sendMessages !== undefined) {
    return !telegramSendRestrictionIsActive(entity.bannedRights);
  }
  if (entity.defaultBannedRights?.sendMessages !== undefined) {
    return !telegramSendRestrictionIsActive(entity.defaultBannedRights);
  }
  // Telegram omits ban rights when a known group has no sending restriction.
  return true;
}

function restrictionUntilFromRights(rights: TelegramEntity["bannedRights"] | TelegramEntity["defaultBannedRights"]): Date | null {
  if (!rights?.sendMessages || typeof rights.untilDate !== "number" || !Number.isFinite(rights.untilDate)) {
    return null;
  }
  const restrictedUntil = new Date(rights.untilDate * 1000);
  return restrictedUntil.getTime() > Date.now() ? restrictedUntil : null;
}

function postingRestrictionUntil(entity: TelegramEntity): Date | null {
  if (entity.broadcast) return null;
  if (entity.bannedRights?.sendMessages !== undefined) {
    return restrictionUntilFromRights(entity.bannedRights);
  }
  return restrictionUntilFromRights(entity.defaultBannedRights);
}

type TelegramDestination = {
  telegramId: string;
  topicId: number | null;
  username: string | null;
  title: string;
};

type TelegramForumTopic = {
  id: number;
  date: number;
  topMessage: number;
  title: string;
  closed?: boolean;
  hidden?: boolean;
};

type SyncedDestination = {
  id: string;
  telegramId: string;
  topicId: number | null;
};

export function destinationIdsToMarkUnavailableAfterSync(
  previousDestinations: SyncedDestination[],
  syncedTelegramIds: ReadonlySet<string>,
  syncedDestinationKeys: ReadonlySet<string>,
  topicSyncVerifiedForTelegramIds: ReadonlySet<string>,
): string[] {
  const destinationKey = (telegramId: string, topicId: number | null) =>
    `${telegramId}:${topicId ?? "chat"}`;

  return previousDestinations
    .filter((destination) => {
      if (!syncedTelegramIds.has(destination.telegramId)) return true;
      if (destination.topicId === null) return false;
      return topicSyncVerifiedForTelegramIds.has(destination.telegramId)
        && !syncedDestinationKeys.has(destinationKey(destination.telegramId, destination.topicId));
    })
    .map((destination) => destination.id);
}

async function listForumTopics(client: TelegramClient, channel: any): Promise<TelegramForumTopic[]> {
  const topics: TelegramForumTopic[] = [];
  let offsetDate = 0;
  let offsetId = 0;
  let offsetTopic = 0;
  const pageSize = 100;

  for (let page = 0; page < 100; page += 1) {
    const result = await client.invoke(new Api.channels.GetForumTopics({
      channel,
      offsetDate,
      offsetId,
      offsetTopic,
      limit: pageSize,
    })) as unknown as { topics?: TelegramForumTopic[]; count?: number };
    const batch = (result.topics ?? []).filter((topic) =>
      Number.isSafeInteger(topic.id)
      && topic.id > 0
      && typeof topic.title === "string",
    );
    topics.push(...batch);
    if (!batch.length || batch.length < pageSize || topics.length >= (result.count ?? 0)) break;

    const last = batch.at(-1)!;
    offsetDate = last.date;
    offsetId = last.topMessage;
    offsetTopic = last.id;
  }
  return topics;
}

async function resolveDestinationEntity(client: TelegramClient, destination: TelegramDestination) {
  const validate = async (inputEntity: any): Promise<any> => {
    const entity = await client.getEntity(inputEntity as any) as unknown as TelegramEntity;
    if (telegramId(entity) !== destination.telegramId) {
      throw new Error(`Telegram destination "${destination.title}" is no longer the same destination as when it was saved.`);
    }
    if (!canPostToEntity(entity)) {
      throw new TelegramPostingPermissionError(
        `Telegram posting permission is no longer available for "${destination.title}". The account may be restricted or banned from posting.`,
        postingRestrictionUntil(entity),
      );
    }
    return inputEntity;
  };

  try {
    return await validate(await client.getInputEntity(destination.telegramId));
  } catch (error) {
    if (error instanceof TelegramPostingPermissionError) throw error;
    // Numeric IDs for users do not include the access hash. Loading dialogs
    // gives GramJS the complete entity and refreshes its session cache.
  }

  if (destination.username) {
    try {
      return await validate(await client.getInputEntity(destination.username));
    } catch (error) {
      if (error instanceof TelegramPostingPermissionError) throw error;
      // The username may have changed; fall back to the account's dialogs.
    }
  }

  for await (const dialog of client.iterDialogs({})) {
    const entity = dialog.entity as unknown as TelegramEntity;
    if (telegramId(entity) === destination.telegramId) {
      return validate(dialog.inputEntity);
    }
  }

  throw new TelegramPostingPermissionError(
    `Telegram destination "${destination.title}" is unavailable to this account. Check that the account still belongs to the group; automatic group sync is not attempted for this delivery.`,
  );
}

async function markDestinationPostingAvailable(destinationId: string): Promise<void> {
  const checkedAt = new Date();
  try {
    await db.update(destinationsTable).set({
      canPost: true,
      permissionReason: "Posting permission available",
      permissionCheckedAt: checkedAt,
      restrictedUntil: null,
      updatedAt: checkedAt,
    }).where(eq(destinationsTable.id, destinationId));
  } catch (error) {
    // Telegram already accepted the message. Metadata refresh must never turn
    // that success into an automatic retry that could duplicate the delivery.
    logger.warn({ err: error, destinationId }, "Could not refresh restored destination posting permission");
  }
}

export async function getAccountClient(accountId: string, ownerUserId?: string): Promise<{
  client: TelegramClient;
  account: typeof telegramAccountsTable.$inferSelect;
}> {
  const accountFilters = [
    eq(telegramAccountsTable.id, accountId),
    isNull(telegramAccountsTable.deletedAt),
  ];
  if (ownerUserId) accountFilters.push(eq(telegramAccountsTable.ownerUserId, ownerUserId));
  const [account] = await db.select().from(telegramAccountsTable).where(and(...accountFilters));
  if (!account) throw new Error("Telegram account not found");
  if (account.status !== "connected") throw new Error("Telegram account is not connected");
  if (!account.sessionEncrypted || !account.telegramUserId) {
    throw new Error("Telegram account has not completed authorization");
  }
  const proxy = await getTelegramProxyConfig(account);
  const client = createTelegramClient(decryptSecret(account.sessionEncrypted), credentialsForAccount(account), proxy);
  try {
    await client.connect();
    const currentUser = await getCurrentUser(client);
    if (currentUser.id !== account.telegramUserId) {
      throw new Error("Telegram session identity does not match the saved account");
    }
    return { client, account };
  } catch (error) {
    if (isTelegramSessionRevoked(error)) {
      await invalidateTelegramSession(account.id);
    }
    await disconnectQuietly(client);
    throw error;
  }
}

export async function getTelegramProxyConfig(account: typeof telegramAccountsTable.$inferSelect): Promise<TelegramProxyConfig | undefined> {
  if (!account.proxyId) return undefined;
  const [proxy] = await db.select().from(proxiesTable).where(and(
    eq(proxiesTable.id, account.proxyId),
    eq(proxiesTable.ownerUserId, account.ownerUserId),
  ));
  if (!proxy || proxy.status !== "active") throw new TelegramProxyError("The Telegram account proxy is not active.");
  const resolved = await resolvePublicProxyAddress(proxy.host);
  return {
    type: proxy.type === "socks5" ? "socks5" : "http",
    host: proxy.host,
    address: resolved.address,
    family: resolved.family,
    port: proxy.port,
    username: proxy.usernameEncrypted ? decryptSecret(proxy.usernameEncrypted) : undefined,
    password: proxy.passwordEncrypted ? decryptSecret(proxy.passwordEncrypted) : undefined,
  };
}

export async function syncAccountDestinations(accountId: string) {
  const { client, account } = await getAccountClient(accountId);
  let count = 0;
  try {
    const previousDestinations = await db.select().from(destinationsTable)
      .where(eq(destinationsTable.accountId, accountId));
    const syncedDestinationKeys = new Set<string>();
    const syncedTelegramIds = new Set<string>();
    const topicSyncVerifiedForTelegramIds = new Set<string>();

    const destinationKey = (telegramId: string, topicId: number | null) =>
      `${telegramId}:${topicId ?? "chat"}`;

    const upsertDestination = async (values: {
      telegramId: string;
      topicId: number | null;
      parentTitle: string | null;
      title: string;
      username: string | null;
      kind: "channel" | "group" | "forum" | "topic";
      memberCount: number | null;
      canPost: boolean;
      permissionReason: string;
      restrictedUntil: Date | null;
    }) => {
      const conditions = [
        eq(destinationsTable.accountId, accountId),
        eq(destinationsTable.telegramId, values.telegramId),
        values.topicId === null
          ? isNull(destinationsTable.topicId)
          : eq(destinationsTable.topicId, values.topicId),
      ];
      const storedValues = {
        accountId,
        ...values,
        permissionCheckedAt: new Date(),
        updatedAt: new Date(),
      };
      const [sameDestination] = await db.select().from(destinationsTable).where(and(...conditions));
      if (sameDestination) {
        await db.update(destinationsTable).set(storedValues).where(eq(destinationsTable.id, sameDestination.id));
      } else {
        await db.insert(destinationsTable).values(storedValues);
      }
      syncedDestinationKeys.add(destinationKey(values.telegramId, values.topicId));
      count += 1;
    };

    for await (const dialog of (client as any).iterDialogs({})) {
      const entity = dialog.entity as TelegramEntity;
      if (!entity || (!entity.megagroup && !entity.broadcast && !String(entity.className ?? "").includes("Chat"))) {
        continue;
      }
      const id = telegramId(entity);
      if (!id) continue;
      const canPost = canPostToEntity(entity);
      syncedTelegramIds.add(id);
      await upsertDestination({
        telegramId: id,
        topicId: null,
        parentTitle: null,
        title: displayTitle(entity),
        username: entity.username ?? null,
        kind: entity.broadcast ? "channel" : entity.forum ? "forum" : "group",
        memberCount: entity.participantsCount ?? null,
        canPost,
        permissionReason: canPost ? "Posting permission available" : "Posting is restricted by Telegram",
        restrictedUntil: canPost ? null : postingRestrictionUntil(entity),
      });

      if (!entity.forum || entity.broadcast) {
        topicSyncVerifiedForTelegramIds.add(id);
        continue;
      }

      try {
        const topics = await listForumTopics(client, dialog.inputEntity);
        topicSyncVerifiedForTelegramIds.add(id);
        for (const topic of topics) {
          // The parent forum destination represents the General topic. Keeping
          // it as a single destination preserves existing campaign behavior.
          if (topic.id === 1) continue;
          const topicCanPost = canPost && !topic.closed && !topic.hidden;
          await upsertDestination({
            telegramId: id,
            topicId: topic.id,
            parentTitle: displayTitle(entity),
            title: topic.title,
            username: entity.username ?? null,
            kind: "topic",
            memberCount: entity.participantsCount ?? null,
            canPost: topicCanPost,
            permissionReason: topicCanPost
              ? "Posting permission available"
              : topic.closed
                ? "Topic is closed by Telegram"
                : topic.hidden
                  ? "Topic is hidden by Telegram"
                  : "Posting is restricted by Telegram",
            restrictedUntil: topicCanPost ? null : postingRestrictionUntil(entity),
          });
        }
      } catch (error) {
        // Retain previously synced topics if Telegram temporarily refuses the
        // forum-topic request; marking all of them unavailable would pause
        // campaigns for a transient API failure.
        logger.warn({ err: error, accountId, telegramId: id }, "Telegram forum topic sync failed");
      }
    }
    const unavailableDestinationIds = destinationIdsToMarkUnavailableAfterSync(
      previousDestinations,
      syncedTelegramIds,
      syncedDestinationKeys,
      topicSyncVerifiedForTelegramIds,
    );
    await Promise.all(unavailableDestinationIds
      .map((destinationId) => db.update(destinationsTable).set({
        canPost: false,
        permissionReason: "This destination is no longer available to the connected account",
        permissionCheckedAt: new Date(),
        restrictedUntil: null,
        updatedAt: new Date(),
      }).where(eq(destinationsTable.id, destinationId))));
    await db.update(telegramAccountsTable).set({ status: "connected", lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(telegramAccountsTable.id, accountId));
    await recordActivity({
      event: "destinations.synced",
      message: `Synced ${count} Telegram destinations`,
      level: "success",
      accountId,
      ownerUserId: account.ownerUserId,
      metadata: { count },
    });
    return count;
  } catch (error) {
    if (isTelegramSessionRevoked(error)) {
      await invalidateTelegramSession(account.id);
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

function toTelegramSavedMessage(message: any) {
  if (!message?.id || !(message.message || message.media)) return null;
  return {
    id: String(message.id),
    text: String(message.message || (message.media ? "Tin nhắn đa phương tiện" : "")),
    date: message.date ? new Date(Number(message.date) * 1000) : null,
    hasMedia: Boolean(message.media),
  };
}

async function getTelegramSavedMessagesPeer(client: TelegramClient) {
  const dialogs = await client.getDialogs({ limit: 500 });
  const savedDialog = dialogs.find((dialog: any) => {
    const title = [dialog.name, dialog.entity?.firstName, dialog.entity?.lastName]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .trim()
      .toLowerCase();
    return /saved messages|tin nhắn đã lưu|messages enregistrés|mensagens salvas|保存的消息|保存メッセージ/.test(title);
  });
  return savedDialog?.entity ?? new Api.InputPeerSelf();
}

export async function listTelegramSavedMessages(accountId: string) {
  const { client, account } = await getAccountClient(accountId);
  try {
    const savedMessagesPeer = await getTelegramSavedMessagesPeer(client);
    const messages: any[] = [];
    let offsetId: number | undefined;
    const pageSize = 100;
    const maxPages = 10;

    for (let page = 0; page < maxPages; page += 1) {
      const batch = await client.getMessages(savedMessagesPeer, {
        limit: pageSize,
        ...(offsetId === undefined ? {} : { offsetId }),
      });
      messages.push(...batch);
      if (batch.length < pageSize) break;

      const oldestId = Number(batch.at(-1)?.id);
      if (!Number.isSafeInteger(oldestId) || oldestId <= 0 || oldestId === offsetId) break;
      offsetId = oldestId;
    }

    return messages
      .map(toTelegramSavedMessage)
      .filter((message): message is NonNullable<typeof message> => message !== null);
  } catch (error) {
    if (isTelegramSessionRevoked(error)) {
      await invalidateTelegramSession(account.id);
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

export async function getTelegramSavedMessage(accountId: string, sourceMessageId: string) {
  const numericSourceMessageId = Number(sourceMessageId);
  if (!Number.isSafeInteger(numericSourceMessageId) || numericSourceMessageId <= 0) {
    throw new Error("The saved Telegram message ID is invalid");
  }
  const { client, account } = await getAccountClient(accountId);
  try {
    const savedMessagesPeer = await getTelegramSavedMessagesPeer(client);
    const messages = await client.getMessages(savedMessagesPeer, { ids: [numericSourceMessageId] });
    return messages
      .map(toTelegramSavedMessage)
      .find((message): message is NonNullable<typeof message> => message !== null) ?? null;
  } catch (error) {
    if (isTelegramSessionRevoked(error)) {
      await invalidateTelegramSession(account.id);
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

export async function sendTelegramMessage(accountId: string, destinationId: string, content: string, ownerUserId: string) {
  const { client, account } = await getAccountClient(accountId, ownerUserId);
  try {
    const [destination] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, destinationId));
    if (!destination || destination.accountId !== accountId) throw new Error("Destination does not belong to this account");
    const entity = await resolveDestinationEntity(client, destination);
    const sent = await client.sendMessage(entity, {
      message: content,
      ...(destination.topicId === null ? {} : { topMsgId: destination.topicId }),
    });
    await markDestinationPostingAvailable(destination.id);
    return String((sent as any).id ?? "");
  } catch (error) {
    if (isTelegramSessionRevoked(error)) {
      await invalidateTelegramSession(account.id);
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

export async function forwardTelegramSavedMessage(accountId: string, destinationId: string, sourceMessageId: string, ownerUserId: string) {
  const { client, account } = await getAccountClient(accountId, ownerUserId);
  try {
    const [destination] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, destinationId));
    if (!destination || destination.accountId !== accountId) throw new Error("Destination does not belong to this account");
    const entity = await resolveDestinationEntity(client, destination);
    const numericSourceMessageId = Number(sourceMessageId);
    if (!Number.isSafeInteger(numericSourceMessageId) || numericSourceMessageId <= 0) {
      throw new Error("The saved Telegram message ID is invalid");
    }
    const savedMessagesPeer = await getTelegramSavedMessagesPeer(client);
    const forwardOnce = async () => {
      if (destination.topicId === null) {
        const messages = await client.forwardMessages(entity, {
          messages: numericSourceMessageId,
          fromPeer: savedMessagesPeer,
        });
        return String((messages[0] as any)?.id ?? "");
      }
      const request = new Api.messages.ForwardMessages({
        fromPeer: await client.getInputEntity(savedMessagesPeer),
        id: [numericSourceMessageId],
        toPeer: entity,
        topMsgId: destination.topicId,
      });
      const result = await client.invoke(request);
      const sent = await (client as any)._getResponseMessage(request, result, entity);
      return String(sent?.id ?? "");
    };
    const isInvalidSavedMessage = (error: unknown) => {
      const details = [error, (error as { errorMessage?: unknown })?.errorMessage, (error as { message?: unknown })?.message]
        .filter((value): value is string => typeof value === "string")
        .join(" ");
      return /MESSAGE_ID_INVALID|saved Telegram message ID is invalid/i.test(details);
    };
    const refreshSavedMessage = async () => {
      try {
        const messages = await client.getMessages(savedMessagesPeer, { ids: [numericSourceMessageId] });
        return messages.some((message: any) => Number(message?.id) === numericSourceMessageId);
      } catch {
        return false;
      }
    };
    const forwardAndRefreshPermission = async () => {
      const messageId = await forwardOnce();
      await markDestinationPostingAvailable(destination.id);
      return messageId;
    };
    if (destination.topicId === null) {
      try {
        return await forwardAndRefreshPermission();
      } catch (error) {
        if (!isInvalidSavedMessage(error)) throw error;
        if (!(await refreshSavedMessage())) {
          throw new Error("The saved Telegram message was changed or deleted. Select the current message again from Saved Messages. (MESSAGE_ID_INVALID)");
        }
        try {
          return await forwardAndRefreshPermission();
        } catch (retryError) {
          if (isInvalidSavedMessage(retryError)) {
            throw new Error("The saved Telegram message was changed or deleted. Select the current message again from Saved Messages. (MESSAGE_ID_INVALID)");
          }
          throw retryError;
        }
      }
    }
    try {
      return await forwardAndRefreshPermission();
    } catch (error) {
      if (!isInvalidSavedMessage(error)) throw error;
      if (!(await refreshSavedMessage())) {
        throw new Error("The saved Telegram message was changed or deleted. Select the current message again from Saved Messages. (MESSAGE_ID_INVALID)");
      }
      try {
        return await forwardAndRefreshPermission();
      } catch (retryError) {
        if (isInvalidSavedMessage(retryError)) {
          throw new Error("The saved Telegram message was changed or deleted. Select the current message again from Saved Messages. (MESSAGE_ID_INVALID)");
        }
        throw retryError;
      }
    }
  } catch (error) {
    if (isTelegramSessionRevoked(error)) {
      await invalidateTelegramSession(account.id);
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

export async function getCurrentUser(client: TelegramClient): Promise<TelegramLoginUser> {
  return telegramLoginUser(await client.getMe());
}

export async function disconnectQuietly(client: TelegramClient) {
  try {
    await client.disconnect();
  } catch {
    // Disconnect is best effort and must not mask the original auth error.
  }
}

async function destroyQuietly(client: TelegramClient) {
  try {
    await client.destroy();
  } catch {
    // Login clients are single-use. Destruction is best effort and must not
    // mask a Telegram authentication response.
  }
}

export { Api, encryptSecret };