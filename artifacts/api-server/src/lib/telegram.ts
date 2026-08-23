import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { db, destinationsTable, telegramAccountsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./crypto";
import { requireTelegramConfiguration } from "./telegram-config";
import { recordActivity } from "./activity";

type TelegramEntity = {
  id?: bigint | number;
  title?: string;
  username?: string;
  participantsCount?: number;
  className?: string;
  broadcast?: boolean;
  megagroup?: boolean;
  creator?: boolean;
  adminRights?: {
    postMessages?: boolean;
  };
  bannedRights?: {
    sendMessages?: boolean;
  };
  defaultBannedRights?: {
    sendMessages?: boolean;
  };
};

export type TelegramCredentials = { apiId: number; apiHash: string };
export type TelegramLoginUser = { id: string; username: string | null; phone: string | null; name: string | null };

export function createTelegramClient(session = "", credentials?: TelegramCredentials) {
  const { apiId, apiHash } = credentials ?? requireTelegramConfiguration();
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
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

const savedSession = (client: TelegramClient) => (client.session as unknown as { save: () => string }).save();
const requiresTwoFactor = (error: unknown) => (error as { errorMessage?: string })?.errorMessage === "SESSION_PASSWORD_NEEDED";

export async function startTelegramPhoneLogin(credentials: TelegramCredentials, phone: string) {
  const client = createTelegramClient("", credentials);
  try {
    await client.connect();
    const result = await client.sendCode(credentials, phone);
    return {
      phoneCodeHash: result.phoneCodeHash,
      session: savedSession(client),
      delivery: result.isCodeViaApp ? "app" as const : "sms" as const,
    };
  } finally {
    await disconnectQuietly(client);
  }
}

export async function confirmTelegramPhoneCode(input: {
  credentials: TelegramCredentials;
  phone: string;
  phoneCodeHash: string;
  session: string;
  code: string;
}): Promise<
  | { status: "connected"; session: string; user: TelegramLoginUser }
  | { status: "requires_2fa"; session: string }
> {
  const client = createTelegramClient(input.session, input.credentials);
  try {
    await client.connect();
    await client.invoke(new Api.auth.SignIn({
      phoneNumber: input.phone,
      phoneCodeHash: input.phoneCodeHash,
      phoneCode: input.code,
    }));
    return { status: "connected", session: savedSession(client), user: await getCurrentUser(client) };
  } catch (error) {
    if (requiresTwoFactor(error)) return { status: "requires_2fa", session: savedSession(client) };
    throw error;
  } finally {
    await disconnectQuietly(client);
  }
}

export async function confirmTelegramTwoFactorPassword(input: {
  credentials: TelegramCredentials;
  session: string;
  password: string;
}): Promise<{ session: string; user: TelegramLoginUser }> {
  const client = createTelegramClient(input.session, input.credentials);
  try {
    await client.connect();
    await client.signInWithPassword(input.credentials, {
      password: async () => input.password,
      onError: async () => true,
    });
    return { session: savedSession(client), user: await getCurrentUser(client) };
  } finally {
    await disconnectQuietly(client);
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
    return !entity.bannedRights.sendMessages;
  }
  return !entity.defaultBannedRights?.sendMessages;
}

type TelegramDestination = {
  telegramId: string;
  username: string | null;
  title: string;
};

async function resolveDestinationEntity(client: TelegramClient, destination: TelegramDestination) {
  try {
    return await client.getInputEntity(destination.telegramId);
  } catch {
    // Numeric IDs for users do not include the access hash. Loading dialogs
    // gives GramJS the complete entity and refreshes its session cache.
  }

  if (destination.username) {
    try {
      return await client.getInputEntity(destination.username);
    } catch {
      // The username may have changed; fall back to the account's dialogs.
    }
  }

  for await (const dialog of client.iterDialogs({})) {
    const entity = dialog.entity as unknown as TelegramEntity;
    if (telegramId(entity) === destination.telegramId) {
      return dialog.inputEntity;
    }
  }

  throw new Error(
    `Telegram entity for "${destination.title}" is unavailable. Sync this Telegram account before retrying.`,
  );
}

export async function getAccountClient(accountId: string): Promise<{
  client: TelegramClient;
  account: typeof telegramAccountsTable.$inferSelect;
}> {
  const [account] = await db.select().from(telegramAccountsTable).where(eq(telegramAccountsTable.id, accountId));
  if (account?.deletedAt) throw new Error("Telegram account has been deleted");
  if (!account?.sessionEncrypted) throw new Error("Telegram account has not completed authorization");
  const client = createTelegramClient(decryptSecret(account.sessionEncrypted), credentialsForAccount(account));
  await client.connect();
  return { client, account };
}

export async function syncAccountDestinations(accountId: string) {
  const { client, account } = await getAccountClient(accountId);
  let count = 0;
  try {
    const previousDestinations = await db.select().from(destinationsTable)
      .where(eq(destinationsTable.accountId, accountId));
    const syncedTelegramIds = new Set<string>();
    for await (const dialog of (client as any).iterDialogs({})) {
      const entity = dialog.entity as TelegramEntity;
      if (!entity || (!entity.megagroup && !entity.broadcast && !String(entity.className ?? "").includes("Chat"))) {
        continue;
      }
      const id = telegramId(entity);
      if (!id) continue;
      const canPost = canPostToEntity(entity);
      syncedTelegramIds.add(id);
      const values = {
        accountId,
        telegramId: id,
        title: displayTitle(entity),
        username: entity.username ?? null,
        kind: entity.broadcast ? "channel" : "group",
        memberCount: entity.participantsCount ?? null,
        canPost,
        permissionReason: canPost ? "Posting permission available" : "Posting is restricted by Telegram",
        permissionCheckedAt: new Date(),
        updatedAt: new Date(),
      };
      const [sameDestination] = await db.select().from(destinationsTable)
        .where(and(eq(destinationsTable.accountId, accountId), eq(destinationsTable.telegramId, id)));
      if (sameDestination) {
        await db.update(destinationsTable).set(values).where(eq(destinationsTable.id, sameDestination.id));
      } else {
        await db.insert(destinationsTable).values(values);
      }
      count += 1;
    }
    await Promise.all(previousDestinations
      .filter((destination) => !syncedTelegramIds.has(destination.telegramId))
      .map((destination) => db.update(destinationsTable).set({
        canPost: false,
        permissionReason: "This destination is no longer available to the connected account",
        permissionCheckedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(destinationsTable.id, destination.id))));
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
  } finally {
    await client.disconnect();
  }
}

export async function listTelegramSavedMessages(accountId: string) {
  const { client } = await getAccountClient(accountId);
  try {
    const messages = await client.getMessages("me", { limit: 100 });
    return messages
      .filter((message: any) => Boolean(message?.id) && Boolean(message.message || message.media))
      .map((message: any) => ({
        id: String(message.id),
        text: String(message.message || (message.media ? "Tin nhắn đa phương tiện" : "")),
        date: message.date ? new Date(Number(message.date) * 1000) : null,
        hasMedia: Boolean(message.media),
      }));
  } finally {
    await client.disconnect();
  }
}

export async function sendTelegramMessage(accountId: string, destinationId: string, content: string) {
  const { client } = await getAccountClient(accountId);
  try {
    const [destination] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, destinationId));
    if (!destination || destination.accountId !== accountId) throw new Error("Destination does not belong to this account");
    if (!destination.canPost) throw new Error("Telegram posting permission is not available for this destination");
    const entity = await resolveDestinationEntity(client, destination);
    const sent = await client.sendMessage(entity, { message: content });
    return String((sent as any).id ?? "");
  } finally {
    await client.disconnect();
  }
}

export async function forwardTelegramSavedMessage(accountId: string, destinationId: string, sourceMessageId: string) {
  const { client } = await getAccountClient(accountId);
  try {
    const [destination] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, destinationId));
    if (!destination || destination.accountId !== accountId) throw new Error("Destination does not belong to this account");
    if (!destination.canPost) throw new Error("Telegram posting permission is not available for this destination");
    const entity = await resolveDestinationEntity(client, destination);
    const messages = await client.forwardMessages(entity, {
      messages: Number(sourceMessageId),
      fromPeer: "me",
    });
    return String((messages[0] as any)?.id ?? "");
  } finally {
    await client.disconnect();
  }
}

export async function getCurrentUser(client: TelegramClient): Promise<TelegramLoginUser> {
  const user = (await client.getMe()) as any;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return { id: String(user.id), username: user.username ?? null, phone: user.phone ?? null, name: name || null };
}

export async function disconnectQuietly(client: TelegramClient) {
  try {
    await client.disconnect();
  } catch {
    // Disconnect is best effort and must not mask the original auth error.
  }
}

export { Api, encryptSecret };