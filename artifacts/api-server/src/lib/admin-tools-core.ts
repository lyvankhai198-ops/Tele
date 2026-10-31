import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export function escapeAdminHtml(value: unknown): string {
  return Array.from(String(value ?? "—")).slice(0, 160).join("")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function adminProfileLink(base: string | null | undefined, userId: string): string | null {
  try {
    const url = new URL(base ?? "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    url.pathname = `/admin/users/${encodeURIComponent(userId)}/support`;
    url.search = ""; url.hash = "";
    return url.toString();
  } catch { return null; }
}

export function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  // A quoted cell can still execute an Excel formula; neutralize it first.
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvDocument(headers: string[], rows: unknown[][]): string {
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(bytes: Uint8Array): string {
  let value = 0, bits = 0, result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += BASE32[(value >>> bits) & 31]; }
  }
  if (bits) result += BASE32[(value << (5 - bits)) & 31];
  return result;
}

function base32Decode(secret: string): Buffer {
  let value = 0, bits = 0;
  const bytes: number[] = [];
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid authenticator configuration");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  return Buffer.from(bytes);
}

export function totpCode(secret: string, counter: number): string {
  const moving = Buffer.alloc(8);
  moving.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(moving).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export function validTotpCounter(secret: string, code: string, now: number, lastCounter = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter < 0 || counter <= lastCounter) continue;
    if (timingSafeEqual(Buffer.from(code), Buffer.from(totpCode(secret, counter)))) return counter;
  }
  return null;
}

export function recoveryHash(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code.replace(/[\s-]/g, "").toUpperCase()}`).digest("hex");
}

export type UpdateBatchResult = { offset: number; failedUpdateId: number | null };
export async function processTelegramBatch<T extends { update_id: number }>(
  updates: T[], offset: number, handle: (update: T) => Promise<void>,
  persist: (nextOffset: number) => Promise<void>,
): Promise<UpdateBatchResult> {
  for (const update of [...updates].sort((a, b) => a.update_id - b.update_id)) {
    if (update.update_id < offset) continue;
    try {
      await handle(update);
      await persist(update.update_id + 1);
      offset = update.update_id + 1;
    } catch { return { offset, failedUpdateId: update.update_id }; }
  }
  return { offset, failedUpdateId: null };
}
