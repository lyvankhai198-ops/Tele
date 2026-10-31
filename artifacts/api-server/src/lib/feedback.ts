import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { pool } from "@workspace/db";
import { recordAdminAudit } from "./admin-audit";

export const FEEDBACK_KINDS = ["bug", "feature", "interface"] as const;
export const FEEDBACK_STATUSES = ["received", "reviewing", "completed"] as const;
export type FeedbackRecord = {
  id: string; ownerId: string; username: string; kind: typeof FEEDBACK_KINDS[number];
  content: string; source: string; status: typeof FEEDBACK_STATUSES[number];
  createdAt: string; updatedAt: string; hasImage: boolean;
};
export const validFeedbackId = (id: string) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);
function mediaFile(id: string) {
  return path.join(process.env.TELECAMPAIGN_MEDIA_DIR?.trim() ||
    (process.env.NODE_ENV === "production" ? "/var/lib/telecampaign/media" : path.resolve(".local/media")), "feedback", `${id}.webp`);
}
export function normalizeGroupLink(value: unknown): string {
  if (value === "") return "";
  if (typeof value !== "string" || value.length > 500) throw Error("INVALID_GROUP_LINK");
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") ||
      /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname)) throw Error();
    return url.href;
  } catch { throw Error("INVALID_GROUP_LINK"); }
}
export async function getFeedback(id: string): Promise<FeedbackRecord | null> {
  if (!validFeedbackId(id)) return null;
  const data = await pool.query("SELECT value FROM system_settings WHERE key=$1", [`feedback:item:${id}`]);
  return data.rows.length ? JSON.parse(data.rows[0].value) : null;
}
export async function listFeedback(ownerId?: string): Promise<FeedbackRecord[]> {
  const result = await pool.query(`SELECT value FROM system_settings WHERE key LIKE 'feedback:item:%'
    AND ($1::text IS NULL OR value::jsonb->>'ownerId'=$1)
    ORDER BY updated_at DESC LIMIT 100`, [ownerId ?? null]);
  return result.rows.map(row => JSON.parse(row.value));
}
export async function createFeedback(ownerId: string, username: string, input: unknown): Promise<FeedbackRecord> {
  const value = input as Record<string, unknown> | null;
  if (!value || !FEEDBACK_KINDS.includes(value.kind as any) || typeof value.content !== "string" ||
    value.content.trim().length < 10 || value.content.length > 4000 ||
    (value.image !== undefined && (typeof value.image !== "string" || value.image.length > 65536)) ||
    (value.source !== undefined && (typeof value.source !== "string" || value.source.length > 256))) throw Error("INVALID_FEEDBACK");
  const id = randomUUID(), now = new Date().toISOString();
  const record: FeedbackRecord = { id, ownerId, username, kind: value.kind as FeedbackRecord["kind"],
    content: value.content.trim(), source: typeof value.source === "string" && value.source.startsWith("/") && !value.source.startsWith("//")
      ? value.source.split(/[?#]/)[0] : "/dashboard/feedback",
    status: "received", createdAt: now, updatedAt: now, hasImage: false };
  const client = await pool.connect();
  let written = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`feedback:${ownerId}`]);
    const limits = await client.query(`SELECT count(*)::int AS count,
      bool_or((value::jsonb->>'createdAt')::timestamptz>now()-interval '1 minute') AS recent
      FROM system_settings WHERE key LIKE 'feedback:item:%' AND value::jsonb->>'ownerId'=$1
      AND (value::jsonb->>'createdAt')::timestamptz>now()-interval '24 hours'`, [ownerId]);
    if (limits.rows[0].count >= 5 || limits.rows[0].recent) throw Error("FEEDBACK_RATE_LIMIT");
    if (value.image) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(String(value.image))) throw Error("INVALID_FEEDBACK_IMAGE");
      const bytes = Buffer.from(String(value.image), "base64");
      const raster = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        || bytes.subarray(0, 3).equals(Buffer.from([255,216,255]))
        || (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
      if (!raster) throw Error("INVALID_FEEDBACK_IMAGE");
      try {
        const image = await sharp(bytes, { limitInputPixels: 2_000_000, animated: false })
          .rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        if (image.length > 200_000) throw Error();
        await mkdir(path.dirname(mediaFile(id)), { recursive: true, mode: 0o700 });
        await writeFile(mediaFile(id), image, { flag: "wx", mode: 0o600 });
        written = true; record.hasImage = true;
      } catch { throw Error("INVALID_FEEDBACK_IMAGE"); }
    }
    await client.query("INSERT INTO system_settings(key,value,updated_by) VALUES($1,$2,$3)",
      [`feedback:item:${id}`, JSON.stringify(record), ownerId]);
    await client.query("COMMIT");
    return record;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (written) await unlink(mediaFile(id)).catch(() => {});
    throw error;
  } finally { client.release(); }
}
export async function feedbackImage(id: string) { return readFile(mediaFile(id)); }
export async function updateFeedbackStatus(id: string, status: unknown, actor: string): Promise<FeedbackRecord | null> {
  if (!validFeedbackId(id) || !FEEDBACK_STATUSES.includes(status as any)) throw Error("INVALID_FEEDBACK_STATUS");
  const client = await pool.connect();
  let before: string | undefined, next: FeedbackRecord | null = null;
  try {
    await client.query("BEGIN");
    const row = await client.query("SELECT value FROM system_settings WHERE key=$1 FOR UPDATE", [`feedback:item:${id}`]);
    if (row.rows.length) {
      next = JSON.parse(row.rows[0].value);
      before = next!.status;
      if (before !== status) {
        next!.status = status as FeedbackRecord["status"]; next!.updatedAt = new Date().toISOString();
        await client.query("UPDATE system_settings SET value=$1,updated_by=$2,updated_at=now() WHERE key=$3",
          [JSON.stringify(next), actor, `feedback:item:${id}`]);
      }
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if (next && before !== status) await recordAdminAudit(actor, "feedback.status", id, { status: before }, { status });
  return next;
}
