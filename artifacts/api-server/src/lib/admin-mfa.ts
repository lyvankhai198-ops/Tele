import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { appUsersTable, authSessionsTable, db, systemSettingsTable } from "@workspace/db";
import { encryptSecret, decryptSecret } from "./crypto";
import { base32Encode, recoveryHash, validTotpCounter } from "./admin-tools-core";
import { hashSessionToken, verifyPassword } from "./auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Mfa = { enabled: boolean; secret?: string; pending?: string; pendingUntil?: number; lastCounter?: number; recoveryHashes?: string[] };
const key = (id: string) => `admin_mfa:${id}`;

async function getState(tx: Tx, id: string): Promise<Mfa> {
  const result = await tx.execute(sql`SELECT value FROM system_settings WHERE key=${key(id)} FOR UPDATE`);
  return result.rows.length ? JSON.parse(String(result.rows[0].value)) as Mfa : { enabled: false };
}
async function setState(tx: Tx, id: string, state: Mfa): Promise<void> {
  await tx.insert(systemSettingsTable).values({ key: key(id), value: JSON.stringify(state), updatedBy: id })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: JSON.stringify(state), updatedAt: new Date(), updatedBy: id } });
}
function consumeCode(state: Mfa, id: string, code: string): boolean {
  if (!state.secret || typeof code !== "string" || code.length > 80) return false;
  const counter = validTotpCounter(decryptSecret(state.secret), code.trim(), Date.now(), state.lastCounter ?? -1);
  if (counter !== null) { state.lastCounter = counter; return true; }
  const hash = recoveryHash(id, code);
  const index = state.recoveryHashes?.findIndex(value =>
    value.length === hash.length && timingSafeEqual(Buffer.from(value), Buffer.from(hash))) ?? -1;
  if (index < 0) return false;
  state.recoveryHashes!.splice(index, 1);
  return true;
}

// Caller already locks the user row: setup/confirm/disable use the same order.
export async function verifyAdminMfa(tx: Tx, id: string, code: string): Promise<boolean> {
  const state = await getState(tx, id);
  if (!state.enabled) return true;
  if (!consumeCode(state, id, code)) return false;
  await setState(tx, id, state);
  return true;
}

export async function adminMfaStatus(id: string) {
  const [row] = await db.select({ value: systemSettingsTable.value }).from(systemSettingsTable).where(eq(systemSettingsTable.key, key(id))).limit(1);
  const state: Mfa = row ? JSON.parse(row.value) : { enabled: false };
  return { enabled: state.enabled, remainingRecoveryCodes: state.recoveryHashes?.length ?? 0 };
}

export async function changeAdminMfa(input: { id: string; password: string; action: "begin" | "confirm" | "disable"; code: string; sessionToken: string }) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM app_users WHERE id=${input.id} FOR UPDATE`);
    const [user] = await tx.select().from(appUsersTable).where(eq(appUsersTable.id, input.id)).limit(1);
    if (!user || user.role !== "admin" || !(await verifyPassword(input.password, user.passwordHash))) throw new Error("MFA_VALIDATION_FAILED");
    const state = await getState(tx, input.id);
    if (input.action === "begin") {
      if (state.enabled) throw new Error("MFA_ALREADY_ENABLED");
      const secret = base32Encode(randomBytes(20));
      await setState(tx, input.id, { enabled: false, pending: encryptSecret(secret), pendingUntil: Date.now() + 10 * 60_000 });
      return { secret, uri: `otpauth://totp/${encodeURIComponent(`TeleCamp:${user.username}`)}?secret=${secret}&issuer=TeleCamp&digits=6&period=30` };
    }
    if (input.action === "disable") {
      if (!state.enabled || !consumeCode(state, input.id, input.code)) throw new Error("MFA_VALIDATION_FAILED");
      await setState(tx, input.id, { enabled: false });
    } else {
      if (state.enabled || !state.pending || (state.pendingUntil ?? 0) <= Date.now()) throw new Error("MFA_SETUP_EXPIRED");
      const secret = decryptSecret(state.pending);
      const counter = validTotpCounter(secret, input.code.trim(), Date.now());
      if (counter === null) throw new Error("MFA_VALIDATION_FAILED");
      const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(10).toString("hex").toUpperCase());
      await setState(tx, input.id, { enabled: true, secret: state.pending, lastCounter: counter, recoveryHashes: recoveryCodes.map(code => recoveryHash(input.id, code)) });
      // Existing sessions cannot silently bypass newly enabled MFA.
      await tx.execute(sql`UPDATE auth_sessions SET invalidated_at=now() WHERE user_id=${input.id}
        AND token_hash<>${hashSessionToken(input.sessionToken)} AND invalidated_at IS NULL`);
      return { recoveryCodes };
    }
    await tx.update(authSessionsTable).set({ invalidatedAt: new Date() }).where(eq(authSessionsTable.userId, input.id));
    return { enabled: false, signedOut: true };
  });
}
