import { eq } from "drizzle-orm";
import { appUsersTable, db, licenseKeysTable, subscriptionsTable } from "@workspace/db";
import { licenseKeyHash, normalizedLicenseKey } from "./license-key-identity";

export type LicenseLookupRecord = {
  id: string;
  plan: string;
  durationDays: number;
  createdAt: Date;
  claimedAt: Date | null;
  claimedBy: string | null;
  revokedAt: Date | null;
  reservedUntil: Date | null;
  userId: string | null;
  username: string | null;
  userCreatedAt: Date | null;
  subscriptionId: string | null;
  currentPlan: string | null;
  expiresAt: Date | null;
};

export function validLookupKey(value: string): boolean {
  return value.length <= 1024 && /^[A-Z0-9-]{8,128}$/.test(normalizedLicenseKey(value));
}

export async function findLicenseForTelegram(rawKey: string): Promise<LicenseLookupRecord | null> {
  if (!validLookupKey(rawKey)) return null;
  // Explicit projection: no password, encrypted key, session, phone or bot token.
  const [record] = await db.select({
    id: licenseKeysTable.id,
    plan: licenseKeysTable.plan,
    durationDays: licenseKeysTable.durationDays,
    createdAt: licenseKeysTable.createdAt,
    claimedAt: licenseKeysTable.claimedAt,
    claimedBy: licenseKeysTable.claimedBy,
    revokedAt: licenseKeysTable.revokedAt,
    reservedUntil: licenseKeysTable.reservedUntil,
    userId: appUsersTable.id,
    username: appUsersTable.username,
    userCreatedAt: appUsersTable.createdAt,
    subscriptionId: subscriptionsTable.id,
    currentPlan: subscriptionsTable.plan,
    expiresAt: subscriptionsTable.expiresAt,
  }).from(licenseKeysTable)
    .leftJoin(appUsersTable, eq(appUsersTable.id, licenseKeysTable.claimedBy))
    .leftJoin(subscriptionsTable, eq(subscriptionsTable.ownerUserId, licenseKeysTable.claimedBy))
    .where(eq(licenseKeysTable.keyHash, licenseKeyHash(rawKey)))
    .limit(1);
  return record ?? null;
}

function html(value: string | null, fallback = "—"): string {
  return Array.from(value ?? fallback).slice(0, 100).join("")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function timestamp(value: Date | null, timezone: string): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Không rõ";
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  };
  try {
    return new Intl.DateTimeFormat("vi-VN", options).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("vi-VN", { ...options, timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
  }
}

export function formatLicenseLookup(record: LicenseLookupRecord, timezone: string, now = Date.now()): string {
  const activation = record.claimedAt
    ? `✅ Đã kích hoạt · ${timestamp(record.claimedAt, timezone)}`
    : record.claimedBy
      ? "⚠️ Cần đối chiếu: có người nhận nhưng thiếu ngày kích hoạt"
      : "⬜ Chưa kích hoạt";
  const status = record.revokedAt
    ? `⛔ Đã thu hồi · ${timestamp(record.revokedAt, timezone)}`
    : record.claimedAt || record.claimedBy
      ? "Đã được sử dụng"
      : record.reservedUntil && record.reservedUntil.getTime() > now
        ? "⏳ Đang giữ cho đơn thanh toán"
        : "🟢 Có sẵn";
  const lines = [
    "🔎 <b>KẾT QUẢ TRA CỨU KEY</b>",
    `• ID key: <code>${html(record.id)}</code>`,
    `• Gói của key: <b>${html(record.plan.toUpperCase())}</b> · ${record.durationDays} ngày`,
    `• Ngày tạo: ${timestamp(record.createdAt, timezone)}`,
    `• Kích hoạt: ${activation}`,
    `• Trạng thái key: ${status}`,
  ];
  if (!record.claimedBy) {
    lines.push("", record.claimedAt
      ? "⚠️ Dữ liệu không có ID người đã kích hoạt key."
      : "Key chưa gắn với người dùng nào.");
  } else if (!record.userId) {
    lines.push("", "⚠️ Không tìm thấy tài khoản người nhận key.",
      `• User ID lưu trên key: <code>${html(record.claimedBy)}</code>`);
  } else {
    const active = record.subscriptionId && (!record.expiresAt || record.expiresAt.getTime() > now);
    lines.push("", "<b>👤 NGƯỜI DÙNG GẮN VỚI KEY</b>",
      `• Tài khoản TeleCamp: <code>${html(record.username)}</code>`,
      `• User ID: <code>${html(record.userId)}</code>`,
      `• Ngày đăng ký: ${timestamp(record.userCreatedAt, timezone)}`,
      `• Gói hiện tại: <b>${record.subscriptionId ? html(record.currentPlan?.toUpperCase() ?? null) : "Chưa có gói"}</b>`,
      `• Tình trạng gói: ${active ? "✅ Còn hiệu lực" : "⏳ Không còn hiệu lực"}`,
      `• Hạn dùng hiện tại: ${record.subscriptionId ? record.expiresAt ? timestamp(record.expiresAt, timezone) : "Không thời hạn" : "—"}`,
      "", "<i>Gói hiện tại có thể đã được gia hạn hoặc nâng cấp sau lần kích hoạt key này.</i>");
  }
  return lines.join("\n");
}
