import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TIMESTAMP_SKEW_SECONDS = 300;

/**
 * The fields used by the SePay webhook contract.  Other fields sent by SePay
 * are deliberately retained on the returned object, but are not trusted for
 * verification.
 */
export interface SePayWebhookPayload {
  id: number;
  transferType: "in";
  accountNumber: string;
  transferAmount: number;
  content: string;
  transactionDate: string;
  code?: string | null;
  [key: string]: unknown;
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const values: string[] = [];
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    if (Array.isArray(value)) {
      if (value.length !== 1 || typeof value[0] !== "string") return undefined;
      values.push(value[0]);
    } else if (typeof value === "string") {
      values.push(value);
    } else {
      return undefined;
    }
  }
  return values.length === 1 ? values[0] : undefined;
}

/**
 * Verifies and parses a SePay webhook without exposing any details about why
 * an untrusted request was rejected.
 *
 * SePay signs the ASCII timestamp, a period, and the exact request bytes:
 * HMAC-SHA256(`${timestamp}.${rawBody}`, secret).
 */
export function verifySePayWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
): SePayWebhookPayload | null {
  if (!Buffer.isBuffer(rawBody) || rawBody.length > MAX_BODY_BYTES) return null;

  const signature = getHeader(headers, "x-sepay-signature");
  const timestamp = getHeader(headers, "x-sepay-timestamp");
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return null;

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestampSeconds)
    || Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS
  ) return null;

  const match = /^sha256=([0-9a-f]{64})$/i.exec(signature);
  if (!match) return null;

  const signedMessage = Buffer.concat([
    Buffer.from(timestamp, "ascii"),
    Buffer.from(".", "ascii"),
    rawBody,
  ]);
  const expected = createHmac("sha256", secret).update(signedMessage).digest();
  const received = Buffer.from(match[1], "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const payload = parsed as Record<string, unknown>;
  if (
    typeof payload.id !== "number"
    || !Number.isSafeInteger(payload.id)
    || typeof payload.transferType !== "string"
    || payload.transferType !== "in"
    || typeof payload.accountNumber !== "string"
    || typeof payload.transferAmount !== "number"
    || !Number.isSafeInteger(payload.transferAmount)
    || payload.transferAmount <= 0
    || typeof payload.content !== "string"
    || payload.content.length === 0
    || typeof payload.transactionDate !== "string"
    || payload.transactionDate.length === 0
    || (payload.code !== undefined && payload.code !== null && typeof payload.code !== "string")
  ) {
    return null;
  }

  return payload as SePayWebhookPayload;
}