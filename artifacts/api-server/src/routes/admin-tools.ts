import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/authMiddleware";
import { adminMfaStatus, changeAdminMfa } from "../lib/admin-mfa";
import { SESSION_COOKIE_NAME } from "../lib/auth";
import { getSystemSettings } from "../lib/system-settings";
import { getAdminCashReport } from "../lib/telegram-admin-tools";
import { getWorkerHealth } from "../lib/worker-health";
import { csvDocument } from "../lib/admin-tools-core";
import { readOperationalState, writeOperationalState } from "../lib/operational-state";
import { recordAdminAudit } from "../lib/admin-audit";
import { localQuotaDate } from "../lib/user-daily-quota";

const router: IRouter = Router();
router.use("/admin/tools", requireAdmin);
router.use("/auth/mfa", requireAdmin);
router.use(async (req, res, next) => {
  if (!req.path.startsWith("/admin/tools") && !req.path.startsWith("/auth/mfa")) { next(); return; }
  res.setHeader("Cache-Control", "no-store");
  const origin = req.get("origin");
  if (req.method !== "GET" && origin) {
    try {
      const settings = await getSystemSettings();
      const allowed = [new URL(`${req.protocol}://${req.get("host")}`).origin];
      if (settings.publicAppUrl) allowed.push(new URL(settings.publicAppUrl).origin);
      if (!allowed.includes(new URL(origin).origin)) { res.status(403).json({ error: "Origin không hợp lệ" }); return; }
    }
    catch { res.status(403).json({ error: "Origin không hợp lệ" }); return; }
  }
  next();
});

router.get("/auth/mfa", async (req, res) => {
  res.json(await adminMfaStatus(req.userId!));
});
const mfaAttempts = new Map<string, { at: number; count: number }>();
router.post("/auth/mfa/:action", async (req, res) => {
  const action = req.params.action;
  if (!["begin", "confirm", "disable"].includes(action)) { res.sendStatus(404); return; }
  const id = req.userId!;
  const now = Date.now();
  for (const [key, value] of mfaAttempts) if (now - value.at > 900_000) mfaAttempts.delete(key);
  const attempts = mfaAttempts.get(id) ?? { at: now, count: 0 };
  if (attempts.count >= 8) { res.status(429).json({ error: "Thử quá nhiều lần. Chờ 15 phút." }); return; }
  attempts.count++; mfaAttempts.set(id, attempts);
  if (typeof req.body?.password !== "string" || req.body.password.length > 500 ||
    (req.body.code !== undefined && (typeof req.body.code !== "string" || req.body.code.length > 80))) {
    res.status(400).json({ error: "Dữ liệu không hợp lệ" }); return;
  }
  try {
    const result = await changeAdminMfa({ id, password: req.body.password, action: action as "begin" | "confirm" | "disable",
      code: req.body.code ?? "", sessionToken: String(req.cookies?.[SESSION_COOKIE_NAME] ?? "") });
    if (action !== "begin") await recordAdminAudit(id, `mfa.${action}`, id, { enabled: action === "disable" }, { enabled: action === "confirm" });
    res.json(result);
  } catch {
    res.status(400).json({ error: "Không xác nhận được. Kiểm tra mật khẩu/mã, đồng hồ thiết bị và thời hạn thiết lập." });
  }
});

router.get("/admin/tools/summary", async (_req, res) => {
  const settings = await getSystemSettings();
  const [report, health, schedule, cursor] = await Promise.all([
    getAdminCashReport(settings.defaultTimezone), getWorkerHealth(),
    readOperationalState("admin_daily_report", { enabled: true, hour: 21, minute: 0 }),
    readOperationalState("telegram_bridge_cursor", { offset: 0 }),
  ]);
  res.json({ report, health, schedule, cursor });
});
router.put("/admin/tools/daily-report", async (req, res) => {
  const { enabled, hour, minute } = req.body ?? {};
  if (typeof enabled !== "boolean" || !Number.isInteger(hour) || hour < 0 || hour > 23 ||
    !Number.isInteger(minute) || minute < 0 || minute > 59) { res.status(400).json({ error: "Giờ báo cáo không hợp lệ" }); return; }
  const previous = await readOperationalState("admin_daily_report", { enabled: true, hour: 21, minute: 0 });
  const next = { enabled, hour, minute };
  await writeOperationalState("admin_daily_report", next);
  await recordAdminAudit(req.userId!, "daily_report.update", "bot", previous, next);
  res.json(next);
});
router.post("/admin/tools/telegram/retry", async (req, res) => {
  // Queue a retry without competing with the long-poll advisory lock.
  await writeOperationalState("telegram_bridge_retry_requested", { at: Date.now() });
  await recordAdminAudit(req.userId!, "telegram.retry", "bot", null, { requested: true });
  res.status(202).json({ ok: true, queued: true });
});
router.get("/admin/tools/audit", async (_req, res) => {
  const result = await pool.query(`SELECT s.key AS id,s.value::jsonb AS metadata,s.updated_at AS created_at,u.username AS actor
    FROM system_settings s LEFT JOIN app_users u ON u.id::text=s.updated_by
    WHERE s.key LIKE 'admin_audit:%' ORDER BY s.updated_at DESC LIMIT 100`);
  res.json(result.rows);
});

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
router.get("/admin/tools/export/:kind", async (req, res) => {
  const settings = await getSystemSettings();
  const today = localQuotaDate(settings.defaultTimezone, new Date());
  const from = typeof req.query.from === "string" ? req.query.from : today.slice(0, 8) + "01";
  const to = typeof req.query.to === "string" ? req.query.to : today;
  if (!validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) {
    res.status(400).json({ error: "Chọn khoảng ngày hợp lệ, tối đa 366 ngày." }); return;
  }
  const params = [settings.defaultTimezone, from, to];
  let headers: string[], rows: unknown[][];
  if (req.params.kind === "orders") {
    const data = await pool.query(`SELECT o.id,o.reference,u.username,o.currency,o.amount,o.status,o.order_type,o.created_at
      FROM purchase_orders o LEFT JOIN app_users u ON u.id::text=o.owner_user_id
      WHERE (o.created_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date
      ORDER BY o.created_at DESC LIMIT 10001`, params);
    headers = ["order_id","reference","username","currency","amount","status","type","created_at"];
    rows = data.rows.map(r => [r.id,r.reference,r.username,r.currency,r.amount,r.status,r.order_type,r.created_at]);
  } else if (req.params.kind === "keys") {
    const data = await pool.query(`SELECT k.id,k.plan,k.duration_days,k.sale_price_vnd,u.username,k.created_at,k.claimed_at,k.revoked_at
      FROM license_keys k LEFT JOIN app_users u ON u.id::text=k.claimed_by
      WHERE (k.created_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date
      ORDER BY k.created_at DESC LIMIT 10001`, params);
    headers = ["key_id","plan","duration_days","recorded_price_vnd","username","created_at","activated_at","revoked_at"];
    rows = data.rows.map(r => [r.id,r.plan,r.duration_days,r.sale_price_vnd,r.username,r.created_at,r.claimed_at,r.revoked_at]);
  } else if (req.params.kind === "revenue") {
    const data = await pool.query(`WITH confirmed AS (
      SELECT currency,amount,(COALESCE((r.value::jsonb->>'paidAt')::timestamptz,
        CASE WHEN o.status='paid' THEN COALESCE(o.reviewed_at,o.updated_at) END) AT TIME ZONE $1)::date AS day
      FROM purchase_orders o LEFT JOIN system_settings r ON r.key='order_receipt:'||o.id::text
      WHERE o.status IN ('paid','revoked'))
      SELECT day,currency,count(*)::int AS orders,sum(amount)::text AS amount FROM confirmed
      WHERE day BETWEEN $2::date AND $3::date GROUP BY day,currency ORDER BY day,currency`, params);
    headers = ["day","currency","confirmed_orders","confirmed_amount"];
    rows = data.rows.map(r => [r.day,r.currency,r.orders,r.amount]);
  } else { res.sendStatus(404); return; }
  if (rows.length > 10000) { res.status(413).json({ error: "Quá 10.000 dòng. Thu hẹp khoảng ngày để xuất đủ dữ liệu." }); return; }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="telecamp-${req.params.kind}-${from}-${to}.csv"`);
  res.send(csvDocument(headers, rows));
});
export default router;
