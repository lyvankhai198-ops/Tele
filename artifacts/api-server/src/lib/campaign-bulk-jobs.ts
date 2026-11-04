import { createHash } from "node:crypto";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { activityLogsTable, campaignsTable, db, systemSettingsTable } from "@workspace/db";
import { getRerunReports, processFinishedRerunReviews } from "./campaign-rerun-review";
import { logger } from "./logger";
import { campaignListScope, type CampaignListScope } from "./campaign-list-scope";
import type { RerunAssessment } from "./campaign-rerun-assessment";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CampaignBulkJob = Omit<CampaignListScope,"status"> & {
  id: string; ownerUserId: string; scope: "draft" | "queued" | "paused" | "completed";
  intervalSeconds: number; startAt: string; fingerprint: string;
  ids: string[]; cursor: number; updatedCount: number;
  skipped: Array<{id: string; name: string; reason: string}>;
  status: "queued" | "running" | "completed" | "failed";
  error: string | null; createdAt: string;
  onlySendable?: boolean; autoDeleteInvalid?: boolean; deletedCount?: number;
  results?: Array<{id:string;name:string;outcome:"created"|"resumed"|"skipped"|"deleted";
    reason:string;runId?:string;assessment?:RerunAssessment}>;
};
type Result = {kind: "skip"; reason: string; name?:string; assessment?:RerunAssessment}
  | {kind:"deleted";campaign:{id:string;name:string};assessment:RerunAssessment} | {
  kind: "created" | "resumed"; campaign: {id: string; name: string}; sourceId?: string; assessment?:RerunAssessment;
};
let processor: ((tx: Tx, job: CampaignBulkJob, id: string) => Promise<Result>) | undefined;
let busy = false;
let timer: ReturnType<typeof setInterval> | undefined;
let reviewTick=0;
const prefix = "campaign_bulk_job:";
const keyFor = (owner: string, id: string) => `${prefix}${owner}:${id}`;
export const bulkJobSummary = (job: CampaignBulkJob) => ({
  id: job.id, status: job.status, total: job.ids.length, processed: job.cursor,
  updatedCount: job.updatedCount, skippedCount: job.skipped.length, error: job.error,
  onlySendable: job.onlySendable ?? false, autoDeleteInvalid: job.autoDeleteInvalid ?? false,
  deletedCount:job.deletedCount ?? 0,results:job.results ?? [],reviews:[],
});
export function registerCampaignBulkProcessor(fn: NonNullable<typeof processor>) { processor = fn; }

export async function createCampaignBulkJob(input: CampaignListScope & {
  ownerUserId: string; scope: CampaignBulkJob["scope"]; intervalSeconds: number;
  startAt: Date; scheduledAt: Date; requestId?: string;
  onlySendable?:boolean;autoDeleteInvalid?:boolean;
}) {
  const filters={
    ...(input.telegramAccountId?{telegramAccountId:input.telegramAccountId}:{}),
    ...(input.search?.trim()?{search:input.search.trim().toLowerCase()}:{}),
    ...(input.status&&input.status!=="all"?{status:input.status}:{}),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({
    scope: input.scope, intervalSeconds: input.intervalSeconds, scheduledAt: input.scheduledAt.toISOString(),
    onlySendable:input.onlySendable ?? true,autoDeleteInvalid:input.autoDeleteInvalid ?? false,
    ...filters,
  })).digest("hex");
  const id = input.requestId ?? fingerprint;
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new Error("CAMPAIGN_BULK_INVALID_REQUEST");
  const result = await db.transaction(async tx => {
    const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext(${"campaign-bulk-create:" + input.ownerUserId})) AS locked`);
    if (!(lock.rows[0] as {locked: boolean})?.locked) throw new Error("CAMPAIGN_BULK_BUSY");
    const [existing] = await tx.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, keyFor(input.ownerUserId, id)));
    if (existing) {
      const job = JSON.parse(existing.value) as CampaignBulkJob;
      if (job.fingerprint !== fingerprint) throw new Error("CAMPAIGN_BULK_REQUEST_CHANGED");
      return job;
    }
    // Only one active job per owner: an accidental new submission joins it,
    // rather than creating another set of runs from the same completed sources.
    const rows = await tx.select({value: systemSettingsTable.value}).from(systemSettingsTable)
      .where(like(systemSettingsTable.key, `${prefix}${input.ownerUserId}:%`));
    const active = rows.map(row => JSON.parse(row.value) as CampaignBulkJob)
      .find(job => job.status !== "completed");
    if (active) return active;
    const statuses = input.scope === "completed" ? ["completed", "completed_with_errors"] : [input.scope];
    const candidates = await tx.select({id: campaignsTable.id}).from(campaignsTable).where(and(
      campaignListScope(input.ownerUserId,filters), inArray(campaignsTable.status, statuses),
    )).orderBy(asc(campaignsTable.createdAt), asc(campaignsTable.id));
    const job: CampaignBulkJob = {
      id, ownerUserId: input.ownerUserId, scope: input.scope, intervalSeconds: input.intervalSeconds,
      telegramAccountId:filters.telegramAccountId,search:filters.search,
      startAt: input.startAt.toISOString(), fingerprint, ids: candidates.map(c => c.id),
      cursor: 0, updatedCount: 0, skipped: [], status: candidates.length ? "queued" : "completed",
      error: null, createdAt: new Date().toISOString(),
      onlySendable:input.onlySendable ?? true,autoDeleteInvalid:false,
      deletedCount:0,results:[],
    };
    await tx.insert(systemSettingsTable).values({key: keyFor(input.ownerUserId, id), value: JSON.stringify(job)});
    return job;
  });
  return bulkJobSummary(result);
}

export async function getCampaignBulkJob(owner: string, id: string) {
  const [row] = await db.select({value: systemSettingsTable.value}).from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, keyFor(owner, id)));
  if (!row) return null;
  return {...bulkJobSummary(JSON.parse(row.value) as CampaignBulkJob),reviews:await getRerunReports(owner,id)};
}

export async function getActiveCampaignBulkJob(owner: string) {
  const rows = await db.select({value: systemSettingsTable.value}).from(systemSettingsTable)
    .where(like(systemSettingsTable.key, `${prefix}${owner}:%`));
  const job = rows.map(row => JSON.parse(row.value) as CampaignBulkJob)
    .find(job => job.status !== "completed");
  return job ? {...bulkJobSummary(job),reviews:await getRerunReports(owner,job.id)} : null;
}

export async function retryCampaignBulkJob(owner: string, id: string) {
  return db.transaction(async tx => {
    const result = await tx.execute(sql`SELECT value FROM ${systemSettingsTable}
      WHERE key=${keyFor(owner, id)} FOR UPDATE`);
    const row = result.rows[0] as {value: string} | undefined;
    if (!row) return null;
    const job = JSON.parse(row.value) as CampaignBulkJob;
    if (job.status === "failed") {
      job.status = "queued";
      job.error = null;
      await tx.update(systemSettingsTable).set({value: JSON.stringify(job), updatedAt: new Date()})
        .where(eq(systemSettingsTable.key, keyFor(owner, id)));
    }
    return bulkJobSummary(job);
  });
}

export async function processCampaignBulkJobs(maxSteps = 10) {
  if (busy || !processor) return;
  busy = true;
  try {
    for (let step = 0; step < maxSteps; step++) {
      let failedKey: string | undefined;
      let failedCursor: number | undefined;
      try {
        const processed = await db.transaction(async tx => {
          await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
          await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
          const result = await tx.execute(sql`SELECT key,value FROM ${systemSettingsTable}
            WHERE key LIKE ${prefix + "%"} AND (value::jsonb->>'status') IN ('queued','running')
            ORDER BY updated_at,key LIMIT 1 FOR UPDATE SKIP LOCKED`);
          const row = result.rows[0] as {key: string; value: string} | undefined;
          if (!row) return false;
          failedKey = row.key;
          const job = JSON.parse(row.value) as CampaignBulkJob;
          failedCursor = job.cursor;
          const sourceId = job.ids[job.cursor];
          const handled = await processor!(tx, job, sourceId);
          job.results ??= [];
          if (handled.kind === "skip") {
            job.skipped.push({id: sourceId, name: handled.name ?? "", reason: handled.reason});
            job.results.push({id:sourceId,name:handled.name ?? "",outcome:"skipped",reason:handled.reason,assessment:handled.assessment});
          } else if (handled.kind === "deleted") {
            job.deletedCount=(job.deletedCount ?? 0)+1;
            job.results.push({id:sourceId,name:handled.campaign.name,outcome:"deleted",
              reason:"membership_unavailable",assessment:handled.assessment});
            await tx.insert(activityLogsTable).values({ownerUserId:job.ownerUserId,event:"campaign.rerun_invalid_deleted",
              level:"info",message:`Removed invalid campaign "${handled.campaign.name}" after confirmed membership loss`,
              metadata:{jobId:job.id,sourceCampaignId:sourceId}});
          } else {
            job.updatedCount++;
            job.results.push({id:sourceId,name:handled.campaign.name,outcome:handled.kind,runId:handled.campaign.id,
              reason:handled.assessment?.reason ?? "ready_destinations",assessment:handled.assessment});
            await tx.insert(activityLogsTable).values({
              ownerUserId: job.ownerUserId, campaignId: handled.campaign.id, level: "success",
              event: handled.kind === "created" ? "campaign.bulk_rerun_created" : "campaign.resumed",
              message: handled.kind === "created" ? `Created a new run "${handled.campaign.name}" from bulk control`
                : `Resumed campaign "${handled.campaign.name}" from bulk control`,
              metadata: {bulk: true, scope: job.scope, intervalSeconds: job.intervalSeconds, jobId: job.id,
                ...(handled.sourceId ? {sourceCampaignId: handled.sourceId} : {})},
            });
          }
          job.cursor++;
          job.status = job.cursor === job.ids.length ? "completed" : "running";
          job.error = null;
          // The new run, its targets, audit event and durable cursor commit together.
          // A process restart therefore cannot replay an already-created run.
          await tx.update(systemSettingsTable).set({value: JSON.stringify(job), updatedAt: new Date()})
            .where(eq(systemSettingsTable.key, row.key));
          return true;
        });
        if (!processed) break;
      } catch (error) {
        const code = (error as {code?: string; cause?: {code?: string}})?.code
          ?? (error as {cause?: {code?: string}})?.cause?.code;
        // Contention is retried on the next tick, without skipping the cursor.
        if (["55P03", "40P01", "40001"].includes(code ?? "")) break;
        if (failedKey) await db.transaction(async tx => {
          const locked = await tx.execute(sql`SELECT value FROM ${systemSettingsTable}
            WHERE key=${failedKey} FOR UPDATE`);
          const row = locked.rows[0] as {value: string} | undefined;
          if (!row) return;
          const job = JSON.parse(row.value) as CampaignBulkJob;
          // Another process may have completed the step after this transaction failed.
          if (job.status === "completed" || job.cursor !== failedCursor) return;
          job.status = "failed";
          job.error = "CAMPAIGN_BULK_FAILED";
          await tx.update(systemSettingsTable).set({value: JSON.stringify(job), updatedAt: new Date()})
            .where(eq(systemSettingsTable.key, failedKey!));
        });
        break;
      }
    }
  } finally { busy = false; }
}

export function startCampaignBulkJobWorker() {
  if (timer) return;
  timer = setInterval(() => {
    void processCampaignBulkJobs().catch(() => {});
    if (++reviewTick % 30 === 0) void processFinishedRerunReviews()
      .catch(()=>logger.warn("Pending campaign rerun reviews will be retried"));
  }, 1000);
  timer.unref();
  void processCampaignBulkJobs().catch(() => {});
}
