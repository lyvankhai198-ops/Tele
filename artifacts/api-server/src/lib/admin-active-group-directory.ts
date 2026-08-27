import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  campaignTargetsTable,
  campaignsTable,
  db,
  destinationsTable,
} from "@workspace/db";

function destinationLink(username: string | null): string | null {
  if (!username) return null;
  const normalized = username.replace(/^@/, "").trim();
  return normalized ? `https://t.me/${normalized}` : null;
}

export type SavedGroupRow = {
  telegramId: string;
  title: string;
  username: string | null;
  kind: string;
  memberCount: number | null;
  roundDelayMinSeconds: number | null;
  roundDelayMaxSeconds: number | null;
};

export type AdminActiveGroupDirectoryRecord = {
  groups: Array<{
    id: string;
    title: string;
    username: string | null;
    telegramLink: string | null;
    kind: string;
    memberCount: number | null;
    roundDelays: Array<{
      minSeconds: number;
      maxSeconds: number;
    }>;
  }>;
};

export function aggregateSavedGroupRows(rows: SavedGroupRow[]): AdminActiveGroupDirectoryRecord {
  const rowsByTelegramId = new Map<string, {
    id: string;
    title: string;
    username: string | null;
    telegramLink: string | null;
    kind: string;
    memberCount: number | null;
    roundDelays: AdminActiveGroupDirectoryRecord["groups"][number]["roundDelays"];
  }>();

  for (const row of rows) {
    const group = rowsByTelegramId.get(row.telegramId) ?? {
      id: row.telegramId,
      title: row.title,
      username: row.username,
      telegramLink: destinationLink(row.username),
      kind: row.kind,
      memberCount: row.memberCount,
      roundDelays: [],
    };
    if (
      row.roundDelayMinSeconds !== null
      && row.roundDelayMaxSeconds !== null
      && !group.roundDelays.some((delay) =>
        delay.minSeconds === row.roundDelayMinSeconds && delay.maxSeconds === row.roundDelayMaxSeconds,
      )
    ) {
      group.roundDelays.push({
        minSeconds: row.roundDelayMinSeconds,
        maxSeconds: row.roundDelayMaxSeconds,
      });
    }
    rowsByTelegramId.set(row.telegramId, group);
  }

  return {
    groups: [...rowsByTelegramId.values()]
      .map((group) => ({
        ...group,
        roundDelays: group.roundDelays.sort((left, right) =>
          left.minSeconds - right.minSeconds || left.maxSeconds - right.maxSeconds,
        ),
      }))
      .sort((left, right) => left.title.localeCompare(right.title)),
  };
}

export async function getAdminActiveGroupDirectory(): Promise<AdminActiveGroupDirectoryRecord> {
  const rows = await db.select({
    telegramId: destinationsTable.telegramId,
    title: destinationsTable.title,
    username: destinationsTable.username,
    kind: destinationsTable.kind,
    memberCount: destinationsTable.memberCount,
    roundDelayMinSeconds: campaignsTable.roundDelayMinSeconds,
    roundDelayMaxSeconds: campaignsTable.roundDelayMaxSeconds,
  }).from(destinationsTable)
    .leftJoin(campaignTargetsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .leftJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
    .where(and(
      inArray(destinationsTable.kind, ["group", "forum"]),
      isNull(destinationsTable.topicId),
    ))
    .orderBy(desc(destinationsTable.updatedAt), asc(destinationsTable.title));

  return aggregateSavedGroupRows(rows);
}