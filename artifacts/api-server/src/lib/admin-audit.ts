import type { RequestHandler } from "express";
import { systemSettingsTable, db, pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { getSystemSettings } from "./system-settings";
import { logger } from "./logger";

export async function recordAdminAudit(actorId: string, action: string, target: string, before: unknown, after: unknown): Promise<void> {
  try {
    await db.insert(systemSettingsTable).values({
      key: `admin_audit:${randomUUID()}`, updatedBy: actorId,
      value: JSON.stringify({ actorId, action, target, before, after }),
    });
  } catch { logger.warn("Admin audit persistence failed"); }
}
async function snapshot(path: string): Promise<unknown> {
  const user = /^\/admin\/users\/([^/]+)\/(?:subscription|quota)$/.exec(path);
  if (user) {
    const result = await pool.query(`SELECT plan,expires_at,daily_quota_exempt,daily_quota_exempt_date,
      daily_quota_exempt_from,daily_quota_exempt_until FROM subscriptions WHERE owner_user_id=$1`, [user[1]]);
    return result.rows[0] ?? null;
  }
  if (path === "/admin/system-settings") {
    const settings = await getSystemSettings();
    // Strict allowlist: never record bot tokens, passwords, addresses or keys.
    return { defaultTimezone: settings.defaultTimezone, registrationEnabled: settings.registrationEnabled };
  }
  return null;
}
export const adminAuditMiddleware: RequestHandler = async (req, res, next) => {
  const path = req.originalUrl.split("?")[0].replace(/^\/api/, "");
  if (!["POST", "PATCH", "DELETE", "PUT"].includes(req.method) ||
    /\/(?:read|read-all|support-session|messages|upload-url|uploads)(?:\/|$)/.test(path)) { next(); return; }
  const actor = req.userId;
  const action = `${req.method} ${path}`.slice(0, 200);
  let before: unknown = null;
  try { before = await snapshot(path); } catch { /* Audit failure must not change the action. */ }
  res.once("finish", () => {
    if (!actor || res.statusCode >= 400) return;
    void (async () => {
      const after = await snapshot(path);
      await recordAdminAudit(actor, action, path.slice(0, 180), before, after);
    })().catch(() => logger.warn("Admin audit persistence failed"));
  });
  next();
};
