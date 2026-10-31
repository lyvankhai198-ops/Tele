import { createHash } from "node:crypto";

// Shared by activation and the read-only admin lookup: never search by plaintext.
export function normalizedLicenseKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function licenseKeyHash(value: string): string {
  return createHash("sha256").update(normalizedLicenseKey(value)).digest("hex");
}
