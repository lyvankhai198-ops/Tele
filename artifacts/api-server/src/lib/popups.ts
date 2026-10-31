import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { pool } from "@workspace/db";
import { getSubscription } from "./subscriptions";
import { getSystemSettings } from "./system-settings";
import { readOperationalState, writeOperationalState } from "./operational-state";
import { recordAdminAudit } from "./admin-audit";
import { choosePopup, type Popup, type PopupSeen } from "./popup-core";

export const popupId = (id: string) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);
function imagePath(id: string) {
  if (!popupId(id)) throw Error("INVALID_POPUP");
  return path.join(process.env.TELECAMPAIGN_MEDIA_DIR?.trim() ||
    (process.env.NODE_ENV === "production" ? "/var/lib/telecampaign/media" : path.resolve(".local/media")), "popups", `${id}.webp`);
}
export function popupResponse(p: Popup) {
  return { ...p, imageUrl: p.imageId ? `/api/popups/${p.id}/image?v=${p.version}` : null };
}
export async function getPopup(id: string): Promise<Popup | null> {
  if (!popupId(id)) return null;
  return readOperationalState<Popup | null>(`popup:item:${id}`, null);
}
export async function listPopups(): Promise<Popup[]> {
  const result = await pool.query("SELECT value FROM system_settings WHERE key LIKE 'popup:item:%' ORDER BY updated_at DESC LIMIT 100");
  return result.rows.map(row => JSON.parse(row.value));
}
export async function savePopup(p: Popup, image: unknown, actor: string, expected?: string): Promise<Popup> {
  const client = await pool.connect();
  let fresh: string | null = null, previous: Popup | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('popup-admin'))");
    previous = await readOperationalState<Popup | null>(`popup:item:${p.id}`, null, client);
    if (expected ? previous?.version !== expected : Boolean(previous)) throw Error("POPUP_CONFLICT");
    if (expected && !previous) throw Error("POPUP_CONFLICT");
    if (!previous) {
      const count = await client.query("SELECT count(*)::int AS count FROM system_settings WHERE key LIKE 'popup:item:%'");
      if (count.rows[0].count >= 100) throw Error("POPUP_LIMIT");
    }
    p.imageId = previous?.imageId ?? null;
    p.createdAt = previous?.createdAt ?? p.createdAt;
    if (image === "") p.imageId = null;
    else if (image !== undefined) {
      if (typeof image !== "string" || image.length > 65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw Error("INVALID_POPUP_IMAGE");
      const bytes = Buffer.from(image, "base64");
      if (!(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
        bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) ||
        (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"))) throw Error("INVALID_POPUP_IMAGE");
      const encoded = await sharp(bytes, { limitInputPixels: 2_000_000, animated: false })
        .rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      if (encoded.length > 200_000) throw Error("INVALID_POPUP_IMAGE");
      fresh = randomUUID();
      await mkdir(path.dirname(imagePath(fresh)), { recursive: true, mode: 0o700 });
      await writeFile(imagePath(fresh), encoded, { mode: 0o600, flag: "wx" });
      p.imageId = fresh;
    }
    await writeOperationalState(`popup:item:${p.id}`, p, client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (fresh) await unlink(imagePath(fresh)).catch(() => {});
    throw error;
  } finally { client.release(); }
  if (previous?.imageId && previous.imageId !== p.imageId) await unlink(imagePath(previous.imageId)).catch(() => {});
  await recordAdminAudit(actor, "popup.save", p.id, previous ? { enabled: previous.enabled, status: previous.status } : null,
    { enabled: p.enabled, status: p.status, audience: p.audience, frequency: p.frequency });
  return p;
}
export async function deletePopup(id: string, version: string, actor: string): Promise<boolean> {
  const client = await pool.connect();
  let previous: Popup | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('popup-admin'))");
    previous = await readOperationalState<Popup | null>(`popup:item:${id}`, null, client);
    if (!previous || previous.version !== version) throw Error("POPUP_CONFLICT");
    await client.query("DELETE FROM system_settings WHERE key=$1", [`popup:item:${id}`]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
  if (previous?.imageId) await unlink(imagePath(previous.imageId)).catch(() => {});
  await recordAdminAudit(actor, "popup.delete", id, { status: previous!.status }, null);
  return true;
}
export async function paidPopupUser(userId: string): Promise<boolean> {
  const subscription = await getSubscription(userId);
  return subscription.status === "active";
}
export async function claimPopup(userId: string, visit: string): Promise<Popup | null> {
  const paid = await paidPopupUser(userId);
  const settings = await getSystemSettings();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`popup-user:${userId}`]);
    const rows = await client.query("SELECT value FROM system_settings WHERE key LIKE 'popup:item:%' FOR SHARE");
    const popups: Popup[] = rows.rows.map(row => JSON.parse(row.value));
    const state = await readOperationalState<PopupSeen>(`popup:user:${userId}`, { visits: [], seen: {} }, client);
    const selected = choosePopup(popups, state, visit, paid, settings.defaultTimezone);
    if (!state.visits.includes(visit)) {
      state.visits = [...state.visits.slice(-19), visit];
      const ids = new Set(popups.map(p => p.id));
      state.seen = Object.fromEntries(Object.entries(state.seen).filter(([id]) => ids.has(id)));
      if (selected) {
        const now = new Date().toISOString();
        state.seen[selected.id] = { firstAt: state.seen[selected.id]?.firstAt ?? now, lastAt: now };
      }
      await writeOperationalState(`popup:user:${userId}`, state, client);
    }
    await client.query("COMMIT");
    return selected;
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
export async function readPopupImage(p: Popup) {
  if (!p.imageId) throw Error("NO_POPUP_IMAGE");
  return readFile(imagePath(p.imageId));
}
