import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
  isPublished?: boolean;
  roundDelayMinSeconds: number | null;
  roundDelayMaxSeconds: number | null;
};

export type DelayOutcomeRow = {
  telegramId: string;
  roundDelayMinSeconds: number;
  roundDelayMaxSeconds: number;
  sentCount: number;
  errorCount: number;
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
    isPublished: boolean;
    roundDelays: Array<{
      minSeconds: number;
      maxSeconds: number;
      sentCount: number;
      errorCount: number;
      sampleCount: number;
      errorRate: number | null;
      isPreferred: boolean;
    }>;
  }>;
};

export function redactGroupLibraryGroups(
  groups: AdminActiveGroupDirectoryRecord["groups"],
  canOpenLinks: boolean,
): AdminActiveGroupDirectoryRecord["groups"] {
  if (canOpenLinks) return groups;
  return groups.map((group, index) => ({
    ...group,
    id: `locked-group-${index + 1}`,
    title: "••••••••••",
    username: null,
    telegramLink: null,
    isPublished: true,
  }));
}

function delayKey(telegramId: string, minSeconds: number, maxSeconds: number): string {
  return `${telegramId}:${minSeconds}:${maxSeconds}`;
}

function wilsonErrorUpperBound(errorCount: number, sampleCount: number): number {
  if (sampleCount <= 0) return Number.POSITIVE_INFINITY;
  const z = 1.96;
  const proportion = errorCount / sampleCount;
  const zSquaredPerSample = (z * z) / sampleCount;
  const center = proportion + zSquaredPerSample / 2;
  const margin = z * Math.sqrt((proportion * (1 - proportion) + zSquaredPerSample / 4) / sampleCount);
  return (center + margin) / (1 + zSquaredPerSample);
}

function compareDelaySafety(
  left: AdminActiveGroupDirectoryRecord["groups"][number]["roundDelays"][number],
  right: AdminActiveGroupDirectoryRecord["groups"][number]["roundDelays"][number],
): number {
  const leftHasSamples = left.sampleCount > 0;
  const rightHasSamples = right.sampleCount > 0;
  if (leftHasSamples !== rightHasSamples) return leftHasSamples ? -1 : 1;
  if (leftHasSamples && rightHasSamples) {
    const scoreDifference = wilsonErrorUpperBound(left.errorCount, left.sampleCount)
      - wilsonErrorUpperBound(right.errorCount, right.sampleCount);
    if (Math.abs(scoreDifference) > Number.EPSILON) return scoreDifference;
    if (left.sampleCount !== right.sampleCount) return right.sampleCount - left.sampleCount;
  }

  const averageDifference = (right.minSeconds + right.maxSeconds) - (left.minSeconds + left.maxSeconds);
  if (averageDifference !== 0) return averageDifference;
  const spreadDifference = (right.maxSeconds - right.minSeconds) - (left.maxSeconds - left.minSeconds);
  if (spreadDifference !== 0) return spreadDifference;
  return right.minSeconds - left.minSeconds || right.maxSeconds - left.maxSeconds;
}

export function aggregateSavedGroupRows(
  rows: SavedGroupRow[],
  delayOutcomeRows: DelayOutcomeRow[] = [],
): AdminActiveGroupDirectoryRecord {
  const outcomesByDelay = new Map(delayOutcomeRows.map((outcome) => [
    delayKey(outcome.telegramId, outcome.roundDelayMinSeconds, outcome.roundDelayMaxSeconds),
    outcome,
  ]));
  const rowsByTelegramId = new Map<string, {
    id: string;
    title: string;
    username: string | null;
    telegramLink: string | null;
    kind: string;
    memberCount: number | null;
    isPublished: boolean;
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
      isPublished: row.isPublished !== false,
      roundDelays: [],
    };
    if (
      row.roundDelayMinSeconds !== null
      && row.roundDelayMaxSeconds !== null
      && !group.roundDelays.some((delay) =>
        delay.minSeconds === row.roundDelayMinSeconds && delay.maxSeconds === row.roundDelayMaxSeconds,
      )
    ) {
      const outcome = outcomesByDelay.get(delayKey(
        row.telegramId,
        row.roundDelayMinSeconds,
        row.roundDelayMaxSeconds,
      ));
      const sentCount = outcome?.sentCount ?? 0;
      const errorCount = outcome?.errorCount ?? 0;
      const sampleCount = sentCount + errorCount;
      group.roundDelays.push({
        minSeconds: row.roundDelayMinSeconds,
        maxSeconds: row.roundDelayMaxSeconds,
        sentCount,
        errorCount,
        sampleCount,
        errorRate: sampleCount > 0 ? errorCount / sampleCount : null,
        isPreferred: false,
      });
    }
    rowsByTelegramId.set(row.telegramId, group);
  }

  return {
    groups: [...rowsByTelegramId.values()]
      .map((group) => ({
        ...group,
        roundDelays: group.roundDelays
          .sort(compareDelaySafety)
          .map((delay, index) => ({ ...delay, isPreferred: index === 0 })),
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
      isPublished: false,
    })))
    .onConflictDoNothing({ target: groupLibraryEntriesTable.telegramId })
    .returning({ id: groupLibraryEntriesTable.id });
  return { addedCount: inserted.length, candidateCount: candidates.length };
}

export async function importAdminGroupLibraryEntry(telegramId: string): Promise<{ imported: true } | null> {
  const [entry] = await db.select({
    id: groupLibraryEntriesTable.id,
    isPublished: groupLibraryEntriesTable.isPublished,
  }).from(groupLibraryEntriesTable)
    .where(eq(groupLibraryEntriesTable.telegramId, telegramId))
    .limit(1);
  if (!entry) return null;
  if (!entry.isPublished) {
    await db.update(groupLibraryEntriesTable)
      .set({ isPublished: true, updatedAt: new Date() })
      .where(eq(groupLibraryEntriesTable.id, entry.id));
  }
  return { imported: true };
}

export async function getAdminActiveGroupDirectory(
  options: { includeUnpublished?: boolean } = {},
): Promise<AdminActiveGroupDirectoryRecord> {
  const visibilityCondition = options.includeUnpublished === false
    ? eq(groupLibraryEntriesTable.isPublished, true)
    : undefined;
  const [rows, delayOutcomeRows] = await Promise.all([
    db.select({
      telegramId: groupLibraryEntriesTable.telegramId,
      title: groupLibraryEntriesTable.title,
      username: groupLibraryEntriesTable.username,
      kind: groupLibraryEntriesTable.kind,
      memberCount: groupLibraryEntriesTable.memberCount,
      isPublished: groupLibraryEntriesTable.isPublished,
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
        visibilityCondition,
      ))
      .orderBy(desc(groupLibraryEntriesTable.updatedAt), asc(groupLibraryEntriesTable.title)),
    db.select({
      telegramId: destinationsTable.telegramId,
      roundDelayMinSeconds: campaignsTable.roundDelayMinSeconds,
      roundDelayMaxSeconds: campaignsTable.roundDelayMaxSeconds,
      sentCount: sql<number>`count(*) filter (where ${campaignTargetsTable.status} = 'sent')`.mapWith(Number),
      errorCount: sql<number>`count(*) filter (where ${campaignTargetsTable.status} in ('failed', 'requires_review'))`.mapWith(Number),
    }).from(groupLibraryEntriesTable)
      .innerJoin(destinationsTable, and(
        eq(destinationsTable.telegramId, groupLibraryEntriesTable.telegramId),
        isNull(destinationsTable.topicId),
      ))
      .innerJoin(campaignTargetsTable, eq(campaignTargetsTable.destinationId, destinationsTable.id))
      .innerJoin(campaignsTable, eq(campaignTargetsTable.campaignId, campaignsTable.id))
      .where(and(
        inArray(groupLibraryEntriesTable.kind, ["group", "forum"]),
        inArray(campaignTargetsTable.status, ["sent", "failed", "requires_review"]),
        visibilityCondition,
      ))
      .groupBy(
        destinationsTable.telegramId,
        campaignsTable.roundDelayMinSeconds,
        campaignsTable.roundDelayMaxSeconds,
      ),
  ]);

  return aggregateSavedGroupRows(rows, delayOutcomeRows);
}