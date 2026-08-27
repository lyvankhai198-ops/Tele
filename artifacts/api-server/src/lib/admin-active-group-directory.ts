import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  appUsersTable,
  campaignTargetsTable,
  campaignsTable,
  db,
  destinationsTable,
  telegramAccountsTable,
} from "@workspace/db";

function destinationLink(username: string | null): string | null {
  if (!username) return null;
  const normalized = username.replace(/^@/, "").trim();
  return normalized ? `https://t.me/${normalized}` : null;
}

export type ActiveGroupRow = {
  telegramId: string;
  title: string;
  username: string | null;
  kind: string;
  memberCount: number | null;
  campaignId: string;
  campaignName: string;
  ownerUsername: string;
  telegramAccountName: string;
  roundDelayMinSeconds: number;
  roundDelayMaxSeconds: number;
};

export type AdminActiveGroupDirectoryRecord = {
  groups: Array<{
    id: string;
    title: string;
    username: string | null;
    telegramLink: string | null;
    kind: string;
    memberCount: number | null;
    campaigns: Array<{
      id: string;
      name: string;
      ownerUsername: string;
      telegramAccountName: string;
      roundDelayMinSeconds: number;
      roundDelayMaxSeconds: number;
    }>;
  }>;
};

export function aggregateActiveGroupRows(rows: ActiveGroupRow[]): AdminActiveGroupDirectoryRecord {
  const rowsByTelegramId = new Map<string, {
    id: string;
    title: string;
    username: string | null;
    telegramLink: string | null;
    kind: string;
    memberCount: number | null;
    campaigns: AdminActiveGroupDirectoryRecord["groups"][number]["campaigns"];
  }>();

  for (const row of rows as ActiveGroupRow[]) {
    const group = rowsByTelegramId.get(row.telegramId) ?? {
      id: row.telegramId,
      title: row.title,
      username: row.username,
      telegramLink: destinationLink(row.username),
      kind: row.kind,
      memberCount: row.memberCount,
      campaigns: [],
    };
    if (!group.campaigns.some((campaign) => campaign.id === row.campaignId)) {
      group.campaigns.push({
        id: row.campaignId,
        name: row.campaignName,
        ownerUsername: row.ownerUsername,
        telegramAccountName: row.telegramAccountName,
        roundDelayMinSeconds: row.roundDelayMinSeconds,
        roundDelayMaxSeconds: row.roundDelayMaxSeconds,
      });
    }
    rowsByTelegramId.set(row.telegramId, group);
  }

  return {
    groups: [...rowsByTelegramId.values()].sort((left, right) => left.title.localeCompare(right.title)),
  };
}

export async function getAdminActiveGroupDirectory(): Promise<AdminActiveGroupDirectoryRecord> {
  const rows = await db.select({
    telegramId: destinationsTable.telegramId,
    title: destinationsTable.title,
    username: destinationsTable.username,
    kind: destinationsTable.kind,
    memberCount: destinationsTable.memberCount,
    campaignId: campaignsTable.id,
    campaignName: campaignsTable.name,
    ownerUsername: appUsersTable.username,
    telegramAccountName: telegramAccountsTable.name,
    roundDelayMinSeconds: campaignsTable.roundDelayMinSeconds,
    roundDelayMaxSeconds: campaignsTable.roundDelayMaxSeconds,
  }).from(campaignTargetsTable)
    .innerJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
    .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .innerJoin(appUsersTable, sql`${campaignsTable.ownerUserId} = ${appUsersTable.id}::text`)
    .innerJoin(telegramAccountsTable, and(
      eq(campaignsTable.telegramAccountId, telegramAccountsTable.id),
      isNull(telegramAccountsTable.deletedAt),
      eq(telegramAccountsTable.status, "connected"),
      isNotNull(telegramAccountsTable.sessionEncrypted),
    ))
    .where(and(
      inArray(campaignsTable.status, ["queued", "running"]),
      eq(destinationsTable.accountId, campaignsTable.telegramAccountId),
      inArray(destinationsTable.kind, ["group", "forum"]),
      isNull(destinationsTable.topicId),
      eq(destinationsTable.canPost, true),
      inArray(campaignTargetsTable.status, ["pending", "sending", "sent"]),
    ))
    .orderBy(asc(destinationsTable.title), asc(campaignsTable.name));

  return aggregateActiveGroupRows(rows);
}