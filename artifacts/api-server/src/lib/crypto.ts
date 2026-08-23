import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required to encrypt Telegram sessions");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivEncoded, tagEncoded, encryptedEncoded] = payload.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error("Invalid encrypted Telegram session");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}