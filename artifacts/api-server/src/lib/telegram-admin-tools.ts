import { pool } from "@workspace/db";
import { escapeAdminHtml as html, adminProfileLink } from "./admin-tools-core";
import { getSystemSettings } from "./system-settings";
import { localQuotaDate } from "./user-daily-quota";

export async function getAdminCashReport(timezone: string, day = localQuotaDate(timezone, new Date())) {
  const [cash, keys, undated] = await Promise.all([
    pool.query(`SELECT o.currency, count(*)::int AS orders, sum(o.amount)::text AS amount
      FROM purchase_orders o LEFT JOIN system_settings r ON r.key='order_receipt:'||o.id::text
      WHERE o.status IN ('paid','revoked')
      AND (COALESCE((r.value::jsonb->>'paidAt')::timestamptz,
        CASE WHEN o.status='paid' THEN COALESCE(o.reviewed_at,o.updated_at) END)
        AT TIME ZONE $1)::date=$2::date GROUP BY o.currency`, [timezone, day]),
    pool.query(`SELECT count(*)::int AS activated, COALESCE(sum(sale_price_vnd),0)::text AS key_value_vnd
      FROM license_keys WHERE claimed_at IS NOT NULL AND (claimed_at AT TIME ZONE $1)::date=$2::date`, [timezone, day]),
    pool.query(`SELECT count(*)::int AS count FROM purchase_orders o
      WHERE o.status='revoked' AND NOT EXISTS(SELECT 1 FROM system_settings r WHERE r.key='order_receipt:'||o.id::text)`),
  ]);
  return { day, timezone, cash: cash.rows as Array<{ currency: string; orders: number; amount: string }>,
    keyActivations: Number(keys.rows[0]?.activated ?? 0), keyValueVnd: String(keys.rows[0]?.key_value_vnd ?? "0"),
    historicalRevokedUndated: Number(undated.rows[0]?.count ?? 0) };
}

export function formatAdminCashReport(report: Awaited<ReturnType<typeof getAdminCashReport>>): string {
  const lines = [
    `💰 <b>THANH TOÁN ĐÃ XÁC NHẬN · ${html(report.day)}</b>`,
    ...report.cash.map(row => `• ${html(row.currency)}: <b>${html(row.amount)}</b> · ${row.orders} đơn`),
  ];
  if (!report.cash.length) lines.push("• Chưa có đơn được xác nhận trong ngày.");
  lines.push("", "<b>KEY KÍCH HOẠT — THỐNG KÊ RIÊNG</b>",
    `• ${report.keyActivations} key · Giá ghi nhận: ${html(report.keyValueVnd)} VND`,
    "", "<i>Không cộng giá key vào tiền đơn để tránh tính trùng. VND và USDT không quy đổi/gộp. Thu hồi quyền không đồng nghĩa hoàn tiền.</i>");
  if (report.historicalRevokedUndated) lines.push(`⚠️ ${report.historicalRevokedUndated} đơn thu hồi cũ chưa xác định được ngày nhận tiền.`);
  lines.push("<i>Số liệu theo đơn đã xác nhận, không phải số dư/đối soát trực tiếp ngân hàng.</i>");
  return lines.join("\n");
}

export function validUserLookup(value: string): boolean {
  return /^@?[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(value.trim());
}
export async function findTelegramAdminUser(value: string) {
  if (!validUserLookup(value)) return null;
  const query = value.trim().replace(/^@/, "").toLowerCase();
  const result = await pool.query(`SELECT u.id,u.username,u.role,u.created_at,s.plan,s.expires_at,
      s.id AS subscription_id
    FROM app_users u LEFT JOIN subscriptions s ON s.owner_user_id=u.id::text
    WHERE u.username_normalized=$1 OR u.id::text=$1 LIMIT 1`, [query]);
  const user = result.rows[0];
  if (!user) return null;
  const [keys, orders] = await Promise.all([
    pool.query(`SELECT id,plan,claimed_at,revoked_at FROM license_keys WHERE claimed_by=$1
      ORDER BY claimed_at DESC NULLS LAST LIMIT 5`, [user.id]),
    pool.query(`SELECT reference,currency,amount,status FROM purchase_orders WHERE owner_user_id=$1
      ORDER BY created_at DESC LIMIT 5`, [user.id]),
  ]);
  return { user, keys: keys.rows, orders: orders.rows };
}
export function formatTelegramAdminUser(record: NonNullable<Awaited<ReturnType<typeof findTelegramAdminUser>>>): string {
  const { user, keys, orders } = record;
  const active = user.subscription_id && (!user.expires_at || new Date(user.expires_at).getTime() > Date.now());
  return [
    "👤 <b>HỒ SƠ NGƯỜI DÙNG</b>",
    `• Username: <code>${html(user.username)}</code>`,
    `• User ID: <code>${html(user.id)}</code>`,
    `• Đăng ký: ${html(new Date(user.created_at).toISOString().slice(0, 10))}`,
    `• Gói: ${html(user.plan)} · ${active ? "Còn hạn" : "Chưa có/hết hạn"}`,
    `• Hết hạn: ${user.subscription_id ? user.expires_at ? html(new Date(user.expires_at).toISOString().slice(0, 10)) : "Không thời hạn" : "—"}`,
    "", "<b>KEY GẦN NHẤT (tối đa 5)</b>",
    ...keys.map(row => `• <code>${html(row.id)}</code> · ${html(row.plan)} · ${row.revoked_at ? "Đã thu hồi" : "Đã sử dụng"}`),
    ...(keys.length ? [] : ["• Chưa có key gắn với người dùng."]),
    "", "<b>ĐƠN GẦN NHẤT (tối đa 5)</b>",
    ...orders.map(row => `• ${html(row.reference)} · ${html(row.amount)} ${html(row.currency)} · ${html(row.status)}`),
    ...(orders.length ? [] : ["• Chưa có đơn."]),
  ].join("\n");
}
export async function userProfileLinks(userId: string) {
  const settings = await getSystemSettings();
  const url = adminProfileLink(settings.publicAppUrl, userId);
  return url ? [{ text: "👤 Mở hồ sơ trên web", url }] : [];
}
