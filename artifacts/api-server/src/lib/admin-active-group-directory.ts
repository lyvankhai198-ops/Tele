import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
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
  trialTitle?: string | null;
  username: string | null;
  kind: string;
  memberCount: number | null;
  isPublished?: boolean;
  trialVisible?: boolean;
  firstCapturedAt?: Date | string | null;
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
    trialTitle: string | null;
    username: string | null;
    telegramLink: string | null;
    kind: string;
    memberCount: number | null;
    isPublished: boolean;
    trialVisible: boolean;
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

const GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT = 2;

export function redactGroupLibraryGroups(
  groups: AdminActiveGroupDirectoryRecord["groups"],
  canOpenLinks: boolean,
): AdminActiveGroupDirectoryRecord["groups"] {
  if (canOpenLinks) return groups;
  const configuredTrialGroups = groups.filter((group) => group.trialVisible).slice(0, GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT);
  const trialGroups = configuredTrialGroups.length > 0
    ? configuredTrialGroups
    : groups.slice(0, GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT);
  const trialIds = new Set(trialGroups.map((group) => group.id));
  const lockedGroups = groups.filter((group) => !trialIds.has(group.id));
  return [
    ...trialGroups.map((group) => ({
      ...group,
      title: group.trialTitle?.trim() || group.title,
    })),
    ...lockedGroups.map((group, index) => ({
      ...group,
      id: `locked-group-${index + 1}`,
      title: "••••••••••",
      trialTitle: null,
      username: null,
      telegramLink: null,
      isPublished: true,
      trialVisible: false,
    })),
  ];
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

function compareMemberCount(
  left: { memberCount: number | null },
  right: { memberCount: number | null },
): number {
  if (left.memberCount === null && right.memberCount !== null) return 1;
  if (left.memberCount !== null && right.memberCount === null) return -1;
  if (left.memberCount !== null && right.memberCount !== null && left.memberCount !== right.memberCount) {
    return right.memberCount - left.memberCount;
  }
  return 0;
}

function capturedAtValue(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
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
    trialTitle: string | null;
    username: string | null;
    telegramLink: string | null;
    kind: string;
    memberCount: number | null;
    isPublished: boolean;
    trialVisible: boolean;
    firstCapturedAt: Date | string | null;
    roundDelays: AdminActiveGroupDirectoryRecord["groups"][number]["roundDelays"];
  }>();

  for (const row of rows) {
    const group = rowsByTelegramId.get(row.telegramId) ?? {
      id: row.telegramId,
      title: row.title,
      trialTitle: row.trialTitle ?? null,
      username: row.username,
      telegramLink: destinationLink(row.username),
      kind: row.kind,
      memberCount: row.memberCount,
      isPublished: row.isPublished !== false,
      trialVisible: row.trialVisible === true,
      firstCapturedAt: row.firstCapturedAt ?? null,
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
      .sort((left, right) => {
        const leftIsNew = !left.isPublished;
        const rightIsNew = !right.isPublished;
        if (leftIsNew !== rightIsNew) return leftIsNew ? -1 : 1;
        if (leftIsNew) {
          const capturedDifference = capturedAtValue(right.firstCapturedAt) - capturedAtValue(left.firstCapturedAt);
          if (capturedDifference !== 0) return capturedDifference;
        }
        return compareMemberCount(left, right)
          || left.title.localeCompare(right.title)
          || left.id.localeCompare(right.id);
      }),
  };
}

export function dedupeRunningGroupLibraryCandidates(
  rows: RunningGroupLibraryCandidate[],
): RunningGroupLibraryCandidate[] {
  const candidatesByTelegramId = new Map<string, RunningGroupLibraryCandidate>();
  for (const row of rows) {
    const existing = candidatesByTelegramId.get(row.telegramId);
    if (!existing) {
      candidatesByTelegramId.set(row.telegramId, row);
      continue;
    }
    candidatesByTelegramId.set(row.telegramId, {
      ...existing,
      username: existing.username ?? row.username,
      memberCount: existing.memberCount === null
        ? row.memberCount
        : row.memberCount === null
          ? existing.memberCount
          : Math.max(existing.memberCount, row.memberCount),
    });
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
  await Promise.all(candidates.map((candidate) =>
    db.update(groupLibraryEntriesTable)
      .set({
        title: candidate.title,
        username: candidate.username,
        kind: candidate.kind,
        memberCount: candidate.memberCount,
        sourceDestinationId: candidate.sourceDestinationId,
        updatedAt: new Date(),
      })
      .where(eq(groupLibraryEntriesTable.telegramId, candidate.telegramId)),
  ));
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
      trialTitle: groupLibraryEntriesTable.trialTitle,
      username: groupLibraryEntriesTable.username,
      kind: groupLibraryEntriesTable.kind,
      memberCount: groupLibraryEntriesTable.memberCount,
      isPublished: groupLibraryEntriesTable.isPublished,
      trialVisible: groupLibraryEntriesTable.trialVisible,
      firstCapturedAt: groupLibraryEntriesTable.firstCapturedAt,
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

export async function updateAdminGroupLibraryEntry(input: {
  telegramId: string;
  trialVisible: boolean;
  trialTitle: string | null;
}): Promise<{ updated: true; trialVisible: boolean; trialTitle: string | null } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('telecampaign_group_library_trial'))`);
    const [entry] = await tx.select({
      id: groupLibraryEntriesTable.id,
      trialVisible: groupLibraryEntriesTable.trialVisible,
      trialTitle: groupLibraryEntriesTable.trialTitle,
    }).from(groupLibraryEntriesTable)
      .where(eq(groupLibraryEntriesTable.telegramId, input.telegramId))
      .limit(1);
    if (!entry) return null;

    if (input.trialVisible) {
      const [{ count: trialCount }] = await tx.select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(groupLibraryEntriesTable)
        .where(and(
          eq(groupLibraryEntriesTable.trialVisible, true),
          ne(groupLibraryEntriesTable.telegramId, input.telegramId),
        ));
      if (trialCount >= GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT) {
        throw new Error("TRIAL_GROUP_LIMIT_REACHED");
      }
    }

    const trialTitle = input.trialTitle?.trim() || null;
    const [updated] = await tx.update(groupLibraryEntriesTable)
      .set({ trialVisible: input.trialVisible, trialTitle, updatedAt: new Date() })
      .where(eq(groupLibraryEntriesTable.id, entry.id))
      .returning({
        trialVisible: groupLibraryEntriesTable.trialVisible,
        trialTitle: groupLibraryEntriesTable.trialTitle,
      });
    return updated ? { updated: true, ...updated } : null;
  });
}