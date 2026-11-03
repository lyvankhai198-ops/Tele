import { randomUUID } from "node:crypto";
import { RELEASE_PREFIX, ReleaseError, releaseContent, releaseId, releaseText, visibleRelease } from "./release-update-core.ts";
import type { ReleaseContent, ReleaseUpdate } from "./release-update-core.ts";

export type ReleaseDb = { query: (sql: string, values?: any[]) => Promise<{ rows: any[] }> };
export type ReleasePool = ReleaseDb & { connect: () => Promise<ReleaseDb & { release: () => void }> };
export type TelegramCall = (method: string, payload: Record<string, unknown>) => Promise<any>;
export const GROUP_SETTING = "telecampaign_release_notification_settings";

async function read(db: ReleaseDb, id: string, lock = false): Promise<ReleaseUpdate> {
  const result = await db.query(`SELECT value FROM system_settings WHERE key=$1${lock ? " FOR UPDATE" : ""}`, [RELEASE_PREFIX + releaseId(id)]);
  const record = result.rows[0] ? JSON.parse(result.rows[0].value) as ReleaseUpdate : null;
  if (!record || record.deletedAt) throw new ReleaseError("RELEASE_NOT_FOUND", 404);
  return record;
}
async function write(db: ReleaseDb, record: ReleaseUpdate, actor: string): Promise<void> {
  await db.query("UPDATE system_settings SET value=$2,updated_by=$3,updated_at=now() WHERE key=$1",
    [RELEASE_PREFIX + record.id, JSON.stringify(record), actor]);
}
async function transaction<T>(pool: ReleasePool, action: (db: ReleaseDb) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='3s'");
    const result = await action(db);
    await db.query("COMMIT");
    return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
export async function releaseDestination(db: ReleaseDb): Promise<string | null> {
  const result = await db.query("SELECT value FROM system_settings WHERE key=$1", [GROUP_SETTING]);
  const value = result.rows[0] ? JSON.parse(result.rows[0].value)?.chatId : null;
  return typeof value === "string" && /^-[1-9][0-9]{1,19}$/.test(value.trim()) ? value.trim() : null;
}
export async function listReleases(db: ReleaseDb): Promise<ReleaseUpdate[]> {
  const result = await db.query("SELECT value FROM system_settings WHERE left(key,length($1))=$1 ORDER BY updated_at DESC", [RELEASE_PREFIX]);
  return result.rows.map(row => JSON.parse(row.value) as ReleaseUpdate).filter(record => !record.deletedAt)
    .map(record => visibleRelease(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function createRelease(db: ReleaseDb, input: ReleaseContent, actor: string, id = "manual-" + randomUUID()): Promise<ReleaseUpdate | null> {
  const now = new Date().toISOString();
  const record: ReleaseUpdate = { ...releaseContent(input), id: releaseId(id), version: 1, status: "draft",
    createdAt: now, updatedAt: now, deletedAt: null, sentAt: null, sendingAt: null,
    sentMessageId: null, destination: null, sentText: null };
  // A tombstone remains under the release ID: a rerun cannot resurrect it.
  const result = await db.query(`INSERT INTO system_settings(key,value,updated_by) VALUES($1,$2,$3)
    ON CONFLICT(key) DO NOTHING RETURNING key`, [RELEASE_PREFIX + id, JSON.stringify(record), actor]);
  return result.rows.length ? record : null;
}
export async function changeRelease(pool: ReleasePool, id: string, version: number, actor: string, input: ReleaseContent | null): Promise<ReleaseUpdate> {
  return transaction(pool, async db => {
    const record = await read(db, id, true);
    if (record.version !== version) throw new ReleaseError("RELEASE_CHANGED");
    if (visibleRelease(record).status === "sending") throw new ReleaseError("RELEASE_BUSY");
    const now = new Date().toISOString();
    const next = { ...record, ...(input ? releaseContent(input) : { deletedAt: now }),
      version: record.version + 1, updatedAt: now };
    // Editing keeps sent/unknown state and the immutable Telegram snapshot.
    await write(db, next, actor);
    return visibleRelease(next);
  });
}
export async function verifyReleaseDestination(call: TelegramCall, chatId: string): Promise<void> {
  const me = await call("getMe", {});
  if (!me?.is_bot || !Number.isSafeInteger(me.id)) throw new ReleaseError("RELEASE_GROUP_UNAVAILABLE", 503);
  const chat = await call("getChat", { chat_id: chatId });
  if (!["group", "supergroup"].includes(chat?.type) || String(chat.id) !== chatId) throw new ReleaseError("RELEASE_GROUP_UNAVAILABLE", 503);
  const member = await call("getChatMember", { chat_id: chatId, user_id: me.id });
  if (!["administrator", "creator"].includes(member?.status) || member.user?.id !== me.id) throw new ReleaseError("RELEASE_GROUP_UNAVAILABLE", 503);
}
export async function sendRelease(pool: ReleasePool, call: TelegramCall, input: {
  id: string; version: number; destination: string; actor: string;
}): Promise<ReleaseUpdate> {
  const configured = await releaseDestination(pool);
  if (!configured || configured !== input.destination) throw new ReleaseError("RELEASE_DESTINATION_CHANGED");
  // Read-only Telegram checks happen before reserving and outside a DB transaction.
  await verifyReleaseDestination(call, configured);
  const reserved = await transaction(pool, async db => {
    const record = await read(db, input.id, true);
    if (record.version !== input.version) throw new ReleaseError("RELEASE_CHANGED");
    if (!["draft", "failed"].includes(record.status)) throw new ReleaseError("RELEASE_ALREADY_ATTEMPTED");
    if (await releaseDestination(db) !== configured) throw new ReleaseError("RELEASE_DESTINATION_CHANGED");
    const now = new Date().toISOString();
    const next: ReleaseUpdate = { ...record, status: "sending", version: record.version + 1,
      sendingAt: now, updatedAt: now, destination: configured, sentText: releaseText(record) };
    await write(db, next, input.actor);
    return next;
  });
  let status: ReleaseUpdate["status"] = "unknown", messageId: number | null = null;
  try {
    const receipt = await call("sendMessage", { chat_id: configured, text: reserved.sentText });
    if (Number.isSafeInteger(receipt?.message_id) && receipt.message_id > 0 && String(receipt?.chat?.id) === configured) {
      status = "sent"; messageId = receipt.message_id;
    }
  } catch (error) {
    // Only Telegram's explicit rejection is retryable. A timeout/connection
    // failure may follow successful delivery, so it remains unknown forever.
    if (error instanceof ReleaseError && error.code === "RELEASE_TELEGRAM_REJECTED") status = "failed";
  }
  const next: ReleaseUpdate = { ...reserved, status, version: reserved.version + 1,
    sentMessageId: messageId, sentAt: status === "sent" ? new Date().toISOString() : null, updatedAt: new Date().toISOString() };
  // If this write fails, persisted "sending" still blocks every future attempt.
  const saved = await pool.query(`UPDATE system_settings SET value=$2,updated_by=$3,updated_at=now()
    WHERE key=$1 AND (value::jsonb->>'version')::int=$4 RETURNING key`,
    [RELEASE_PREFIX + next.id, JSON.stringify(next), input.actor, reserved.version]);
  if (!saved.rows.length) throw new ReleaseError("RELEASE_RESULT_UNCERTAIN", 503);
  return next;
}
