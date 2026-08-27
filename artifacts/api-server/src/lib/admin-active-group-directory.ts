import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  campaignTargetsTable,
  campaignsTable,
  db,
  destinationsTable,
  groupLibraryEntriesTable,
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

export type RunningGroupLibraryCandidate = {
  telegramId: string;
  title: string;
  username: string | null;
  kind: string;
  memberCount: number | null;
  sourceDestinationId: string;
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

export function dedupeRunningGroupLibraryCandidates(
  rows: RunningGroupLibraryCandidate[],
): RunningGroupLibraryCandidate[] {
  const candidatesByTelegramId = new Map<string, RunningGroupLibraryCandidate>();
  for (const row of rows) {
    if (!candidatesByTelegramId.has(row.telegramId)) {
      candidatesByTelegramId.set(row.telegramId, row);
    }
  }
  return [...candidatesByTelegramId.values()];
}

export async function syncAdminGroupLibrary(): Promise<{ addedCount: number; candidateCount: number }> {
  const candidateRows = await db.select({
    telegramId: destinationsTable.telegramId,
    title: destinationsTable.title,
    username: destinationsTable.username,
    kind: destinationsTable.kind,
    memberCount: destinationsTable.memberCount,
    sourceDestinationId: destinationsTable.id,
  }).from(campaignTargetsTable)
    .innerJoin(campaignsTable, and(
      eq(campaignTargetsTable.campaignId, campaignsTable.id),
      eq(campaignsTable.status, "running"),
    ))
    .innerJoin(destinationsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .where(and(
      inArray(destinationsTable.kind, ["group", "forum"]),
      isNull(destinationsTable.topicId),
    ));
  const candidates = dedupeRunningGroupLibraryCandidates(candidateRows);
  if (!candidates.length) return { addedCount: 0, candidateCount: 0 };

  const inserted = await db.insert(groupLibraryEntriesTable)
    .values(candidates.map((candidate) => ({
      telegramId: candidate.telegramId,
      title: candidate.title,
      username: candidate.username,
      kind: candidate.kind,
      memberCount: candidate.memberCount,
      sourceDestinationId: candidate.sourceDestinationId,
    })))
    .onConflictDoNothing({ target: groupLibraryEntriesTable.telegramId })
    .returning({ id: groupLibraryEntriesTable.id });
  return { addedCount: inserted.length, candidateCount: candidates.length };
}

export async function getAdminActiveGroupDirectory(): Promise<AdminActiveGroupDirectoryRecord> {
  const rows = await db.select({
    telegramId: groupLibraryEntriesTable.telegramId,
    title: groupLibraryEntriesTable.title,
    username: groupLibraryEntriesTable.username,
    kind: groupLibraryEntriesTable.kind,
    memberCount: groupLibraryEntriesTable.memberCount,
    roundDelayMinSeconds: campaignsTable.roundDelayMinSeconds,
    roundDelayMaxSeconds: campaignsTable.roundDelayMaxSeconds,
  }).from(groupLibraryEntriesTable)
    .leftJoin(destinationsTable, and(
      eq(destinationsTable.telegramId, groupLibraryEntriesTable.telegramId),
      isNull(destinationsTable.topicId),
    ))
    .leftJoin(campaignTargetsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
    .leftJoin(campaignsTable, and(
      eq(campaignTargetsTable.campaignId, campaignsTable.id),
      eq(campaignsTable.status, "running"),
    ))
    .where(and(
      inArray(groupLibraryEntriesTable.kind, ["group", "forum"]),
    ))
    .orderBy(desc(groupLibraryEntriesTable.updatedAt), asc(groupLibraryEntriesTable.title));

  return aggregateSavedGroupRows(rows);
}