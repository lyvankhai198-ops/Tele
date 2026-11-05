import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, campaignsTable, campaignTargetsTable, destinationsTable,
  telegramAccountsTable, systemSettingsTable,
} from "@workspace/db";
import { assessCampaignRerun, type RerunAssessment } from "./campaign-rerun-assessment";
import { getCampaignBulkJob } from "./campaign-bulk-jobs";
import {
  blockCampaignDestinations, blockedCampaignDestinationIds, type BlockedGroup,
} from "./campaign-destination-blocks";
import { enqueueOperation, operationSummary, saveOperation, type OperationTx } from "./operations";

type Campaign = typeof campaignsTable.$inferSelect;
type Account = typeof telegramAccountsTable.$inferSelect;
type PreviewRow = {
  id: string; name: string; category: RerunAssessment["category"]; reason: string;
  selectable: boolean; groups: BlockedGroup[]; version: string;
  retainedDestinationIds: string[];
};
type Snapshot = {
  id: string; jobId: string; accountId: string; accountName: string; expiresAt: string;
  rows: PreviewRow[];
  consumed?: { selection: string; operation: ReturnType<typeof operationSummary> };
};
const key = (owner: string, id: string) => `campaign_cleanup_preview:${owner}:${id}`;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const time = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;
const publicPreview = (snapshot: Snapshot) => ({
  id: snapshot.id, jobId: snapshot.jobId, telegramAccountId: snapshot.accountId,
  accountName: snapshot.accountName, expiresAt: snapshot.expiresAt,
  campaigns: snapshot.rows.map(({ version: _private, retainedDestinationIds, ...row }) => ({
    ...row, keptGroupCount: retainedDestinationIds.length,
  })),
});

/** Batched evidence, not one target/history query per campaign. */
async function assessSelection(tx: OperationTx, owner: string, account: Account, campaigns: Campaign[]) {
  if (!campaigns.length) return [];
  const counts = await tx.select({
    campaignId: campaignTargetsTable.campaignId, id: campaignTargetsTable.destinationId,
    pending: sql<number>`count(*) filter (where status='pending')::int`,
    sending: sql<number>`count(*) filter (where status='sending')::int`,
    uncertain: sql<number>`count(*) filter (where status='requires_review')::int`,
    sent: sql<number>`count(*) filter (where status='sent')::int`,
    failed: sql<number>`count(*) filter (where status='failed')::int`,
    cancelled: sql<number>`count(*) filter (where status='cancelled')::int`,
    attempted: sql<number>`count(*) filter (where attempts>0)::int`,
    lastSentAt: sql<Date | null>`max(coalesce(sent_at,updated_at)) filter (where status='sent')`,
    lastFailedAt: sql<Date | null>`max(updated_at) filter (where status='failed')`,
  }).from(campaignTargetsTable).where(inArray(campaignTargetsTable.campaignId, campaigns.map(c => c.id)))
    .groupBy(campaignTargetsTable.campaignId, campaignTargetsTable.destinationId);
  const ids = [...new Set([...campaigns.flatMap(c => c.destinationIds ?? []), ...counts.map(c => c.id)])];
  const groups = ids.length ? await tx.select().from(destinationsTable)
    .where(and(eq(destinationsTable.accountId, account.id), inArray(destinationsTable.id, ids))) : [];
  const byId = new Map(groups.map(g => [g.id, g]));
  const blocked = new Set(await blockedCampaignDestinationIds(tx, owner, account.id, ids));
  const counterByCampaign = new Map<string, typeof counts>();
  for (const counter of counts) {
    const list = counterByCampaign.get(counter.campaignId) ?? [];
    list.push(counter); counterByCampaign.set(counter.campaignId, list);
  }
  return campaigns.map((campaign): PreviewRow => {
    const counters = counterByCampaign.get(campaign.id) ?? [];
    const destinationIds = [...new Set([...(campaign.destinationIds ?? []), ...counters.map(c => c.id)])].sort();
    const evidence = destinationIds.map(id => {
      const group = byId.get(id), count = counters.find(c => c.id === id);
      return {
        id, title: group?.title ?? id, exists: Boolean(group), canPost: group?.canPost ?? false,
        permissionReason: group?.permissionReason ?? null,
        permissionCheckedAt: group?.permissionCheckedAt ?? null, restrictedUntil: group?.restrictedUntil ?? null,
        blocked: blocked.has(id), pending: count?.pending ?? 0, sending: count?.sending ?? 0,
        uncertain: count?.uncertain ?? 0, sent: count?.sent ?? 0, failed: count?.failed ?? 0,
        cancelled: count?.cancelled ?? 0, attempted: count?.attempted ?? 0,
        lastSentAt: count?.lastSentAt ? new Date(count.lastSentAt) : null,
        lastFailedAt: count?.lastFailedAt ? new Date(count.lastFailedAt) : null,
      };
    });
    const currentIds = new Set(campaign.destinationIds?.length ? campaign.destinationIds : counters.map(c => c.id));
    const assessment = assessCampaignRerun({
      connected: account.status === "connected" && Boolean(account.sessionEncrypted),
      groups: evidence.filter(g => currentIds.has(g.id) || g.sending > 0 || g.uncertain > 0),
      terminal: ["completed", "completed_with_errors", "cancelled"].includes(campaign.status),
    });
    const removableIds = new Set(assessment.groups.filter(group => group.category === "invalid").map(group => group.id));
    const retainedDestinationIds = [...currentIds].filter(id => !removableIds.has(id)).sort();
    const identities = [...removableIds].flatMap(id => {
      const group = byId.get(id);
      return group ? [{ id: group.id, telegramId: group.telegramId, title: group.title }] : [];
    });
    const missingIdentity = identities.length !== removableIds.size;
    const selectable = removableIds.size > 0 && assessment.category !== "review" && !missingIdentity
      && !["deletion_pending", "preparing_targets"].includes(campaign.pauseReason ?? "");
    return {
      id: campaign.id, name: campaign.name, category: assessment.category,
      reason: missingIdentity ? "cleanup_missing_identity"
        : selectable && assessment.groups.some(group=>group.reason==="posting_restricted_long_term") ? "posting_restricted_long_term"
        : assessment.category === "sendable" && !removableIds.size ? "cleanup_now_ready"
        : !removableIds.size ? assessment.groups.find(group=>group.category==="temporary")?.reason ?? assessment.reason
        : !selectable ? "cleanup_state_changed" : assessment.reason,
      selectable, groups: identities, retainedDestinationIds,
      version: digest({
        campaign: [campaign.id, campaign.telegramAccountId, campaign.status, campaign.pauseReason,
          time(campaign.updatedAt), [...(campaign.destinationIds ?? [])].sort()],
        account: [account.id, account.telegramUserId, account.status, Boolean(account.sessionEncrypted)],
        evidence: evidence.map(g => ({ ...g, title: undefined })),
        peers: identities.map(g => [g.id, g.telegramId]),
      }),
    };
  });
}

export async function createCampaignCleanupPreview(owner: string, jobId: string, accountId: string) {
  const job = await getCampaignBulkJob(owner, jobId);
  if (!job) throw Error("CLEANUP_NOT_FOUND");
  if (job.status !== "completed") throw Error("CLEANUP_CLASSIFICATION_NOT_FINISHED");
  if (job.skippedCount > 0 && !job.results?.length) throw Error("CLEANUP_LEGACY_RESULT_UNAVAILABLE");
  if ("telegramAccountId" in job && job.telegramAccountId && job.telegramAccountId !== accountId) {
    throw Error("CLEANUP_NOT_FOUND");
  }
  const skipped = job.results.filter(row => row.outcome === "skipped"
    || row.assessment?.groups.some(group=>group.category==="invalid")).map(row => row.id);
  return db.transaction(async tx => {
    const [account] = await tx.select().from(telegramAccountsTable).where(and(
      eq(telegramAccountsTable.id, accountId), eq(telegramAccountsTable.ownerUserId, owner),
      sql`${telegramAccountsTable.deletedAt} IS NULL`,
    ));
    if (!account) throw Error("CLEANUP_NOT_FOUND");
    const campaigns = skipped.length ? await tx.select().from(campaignsTable).where(and(
      eq(campaignsTable.ownerUserId, owner), eq(campaignsTable.telegramAccountId, accountId),
      inArray(campaignsTable.id, [...new Set(skipped)]),
    )).orderBy(campaignsTable.id) : [];
    const snapshot: Snapshot = {
      id: randomUUID(), jobId, accountId, accountName: account.name,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      rows: await assessSelection(tx, owner, account, campaigns),
    };
    await tx.execute(sql`DELETE FROM system_settings
      WHERE key LIKE ${`campaign_cleanup_preview:${owner}:%`}
      AND (value::jsonb->>'expiresAt')::timestamptz < now()`);
    await tx.insert(systemSettingsTable).values({ key: key(owner, snapshot.id), value: JSON.stringify(snapshot) });
    return publicPreview(snapshot);
  });
}

export async function confirmCampaignCleanup(owner: string, jobId: string, previewId: string, selected: string[]) {
  const ids = [...new Set(selected)].sort(), selection = digest(ids);
  if (!ids.length) throw Error("CLEANUP_EMPTY_SELECTION");
  return db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
    const [record] = await tx.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, key(owner, previewId))).for("update");
    if (!record) throw Error("CLEANUP_NOT_FOUND");
    const snapshot = JSON.parse(record.value) as Snapshot;
    if (snapshot.jobId !== jobId) throw Error("CLEANUP_NOT_FOUND");
    if (snapshot.consumed) {
      if (snapshot.consumed.selection !== selection) throw Error("CLEANUP_SELECTION_CHANGED");
      return snapshot.consumed.operation;
    }
    if (new Date(snapshot.expiresAt).getTime() <= Date.now()) throw Error("CLEANUP_PREVIEW_EXPIRED");
    const allowed = new Map(snapshot.rows.filter(row => row.selectable).map(row => [row.id, row]));
    if (ids.some(id => !allowed.has(id))) throw Error("CLEANUP_INVALID_SELECTION");
    const [account] = await tx.select().from(telegramAccountsTable).where(and(
      eq(telegramAccountsTable.id, snapshot.accountId), eq(telegramAccountsTable.ownerUserId, owner),
      sql`${telegramAccountsTable.deletedAt} IS NULL`,
    )).for("update");
    if (!account) throw Error("CLEANUP_PREVIEW_CHANGED");
    const campaigns = await tx.select().from(campaignsTable).where(and(
      eq(campaignsTable.ownerUserId, owner), eq(campaignsTable.telegramAccountId, account.id),
      inArray(campaignsTable.id, ids),
    )).orderBy(campaignsTable.id).for("update");
    const rows = await assessSelection(tx, owner, account, campaigns);
    if (rows.length !== ids.length || rows.some(row => !row.selectable || row.version !== allowed.get(row.id)?.version)) {
      throw Error("CLEANUP_PREVIEW_CHANGED");
    }
    const groups = [...new Map(rows.flatMap(row => row.groups).map(group => [group.id, group])).values()];
    await blockCampaignDestinations(tx, { owner, account, groups, previewId });
    // Cancel only future sends to these peers on this owner's selected account.
    // Already-started Telegram requests cannot be recalled and are not marked sent.
    const peers = [...new Set(groups.map(group => group.telegramId))];
    if (peers.length) await tx.execute(sql`UPDATE campaign_targets t
      SET status='cancelled',last_error='CAMPAIGN_DESTINATION_BLOCKED',next_attempt_at=NULL,updated_at=now()
      FROM campaigns c,destinations d
      WHERE c.id=t.campaign_id AND d.id=t.destination_id
        AND c.owner_user_id=${owner}
        AND d.account_id=${account.id}::uuid AND d.telegram_id=ANY(${sql.param(peers)}::text[])
        AND t.status='pending'`);
    const partial = rows.filter(row=>row.retainedDestinationIds.length);
    if (partial.length) await tx.execute(sql`UPDATE campaigns c
      SET destination_ids=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p.retained)),
          updated_at=now()
      FROM jsonb_to_recordset(${JSON.stringify(partial.map(row=>({
        id:row.id,retained:row.retainedDestinationIds,
      })))}::jsonb) AS p(id uuid,retained jsonb)
      WHERE c.id=p.id AND c.owner_user_id=${owner} AND c.telegram_account_id=${account.id}::uuid`);
    const deleteIds = rows.filter(row=>!row.retainedDestinationIds.length).map(row=>row.id);
    if (deleteIds.length) await tx.update(campaignsTable).set({ status: "paused", pauseReason: "deletion_pending", updatedAt: new Date() })
      .where(and(eq(campaignsTable.ownerUserId, owner), inArray(campaignsTable.id, deleteIds)));
    const operation = await enqueueOperation(tx, {
      owner, kind: "delete_campaigns", accountId: account.id, requestId: previewId,
      label: account.name, payload: {
        telegramAccountId: account.id, status: "all", selectedCampaignIds: deleteIds, cleanupPreviewId: previewId,
      },
    });
    if (!deleteIds.length) {
      operation.state="completed";operation.phase="completed";
      operation.unit="groups";operation.processed=groups.length;operation.total=groups.length;
      await saveOperation(tx,operation);
    }
    snapshot.consumed = { selection, operation: operationSummary(operation) };
    await tx.update(systemSettingsTable).set({ value: JSON.stringify(snapshot), updatedAt: new Date() })
      .where(eq(systemSettingsTable.key, record.key));
    return snapshot.consumed.operation;
  });
}
