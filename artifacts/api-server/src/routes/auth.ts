import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import {
  GetAuthUserResponse,
  MigrateLegacyAuthOwnerBody,
  MigrateLegacyAuthOwnerResponse,
  LoginAuthBody,
  LoginAuthResponse,
  RegisterAuthBody,
  RegisterAuthResponse,
  ChangeAuthPasswordBody,
  RevokeOtherAuthSessionsResponse,
} from "@workspace/api-zod";
import { appUsersTable, authSessionsTable, db, subscriptionsTable } from "@workspace/db";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  invalidateSession,
  migrateLegacyOwner,
  normalizeUsername,
  resolveAuthenticatedUser,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  sessionExpiresAt,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "../lib/auth";
import { requireSession } from "../middlewares/authMiddleware";
import { getSystemSettings } from "../lib/system-settings";
import { recordActivity } from "../lib/activity";
import { TRIAL_DURATION_DAYS } from "../lib/subscriptions";
import {
  CaptchaIssueRateLimitError,
  issueCaptcha,
  verifyAndConsumeCaptcha,
} from "../lib/captcha";

const router: IRouter = Router();
const MAX_CREDENTIAL_ATTEMPTS = 5;
const MAX_LOGIN_IP_ATTEMPTS = 20;
const MAX_REGISTRATION_IP_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED_KEYS = 10_000;
const credentialAttempts = new Map<string, { count: number; resetAt: number }>();
const loginIpAttempts = new Map<string, { count: number; resetAt: number }>();
const registrationIpAttempts = new Map<string, { count: number; resetAt: number }>();
const passwordChangeUserAttempts = new Map<string, { count: number; resetAt: number }>();
const passwordChangeIpAttempts = new Map<string, { count: number; resetAt: number }>();

function attemptKey(req: any, username: string): string {
  return `${req.ip ?? "unknown"}:${username}`;
}

function ipKey(req: any): string {
  return req.ip ?? "unknown";
}

function pruneExpired(map: Map<string, { count: number; resetAt: number }>): void {
  const now = Date.now();
  for (const [key, value] of map) {
    if (value.resetAt <= now) map.delete(key);
  }
  if (map.size <= MAX_TRACKED_KEYS) return;
  const excess = map.size - MAX_TRACKED_KEYS;
  let removed = 0;
  for (const key of map.keys()) {
    map.delete(key);
    removed += 1;
    if (removed >= excess) return;
  }
}

function isRateLimited(map: Map<string, { count: number; resetAt: number }>, key: string, maximum: number): boolean {
  const current = map.get(key);
  if (!current) return false;
  if (current.resetAt <= Date.now()) {
    map.delete(key);
    return false;
  }
  return current.count >= maximum;
}

function registerAttempt(map: Map<string, { count: number; resetAt: number }>, key: string): void {
  pruneExpired(map);
  const current = map.get(key);
  if (!current || current.resetAt <= Date.now()) {
    map.set(key, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
    return;
  }
  map.set(key, { ...current, count: current.count + 1 });
}

function reserveAttempt(map: Map<string, { count: number; resetAt: number }>, key: string, maximum: number): boolean {
  pruneExpired(map);
  const now = Date.now();
  const current = map.get(key);
  if (current && current.resetAt > now && current.count >= maximum) return false;
  if (!current || current.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  } else {
    map.set(key, { ...current, count: current.count + 1 });
  }
  return true;
}

function refundAttempt(map: Map<string, { count: number; resetAt: number }>, key: string): void {
  const current = map.get(key);
  if (!current) return;
  if (current.count <= 1) {
    map.delete(key);
    return;
  }
  map.set(key, { ...current, count: current.count - 1 });
}

function clearCredentialFailures(key: string): void {
  credentialAttempts.delete(key);
}

function captchaErrorCode(result: ReturnType<typeof verifyAndConsumeCaptcha>): string {
  switch (result) {
    case "valid":
      return "";
    case "wrong":
      return "CAPTCHA_WRONG";
    case "expired":
      return "CAPTCHA_EXPIRED";
    case "ip-mismatch":
      return "CAPTCHA_IP_MISMATCH";
    case "missing":
      return "CAPTCHA_REQUIRED";
  }
}

function requireValidCaptcha(req: Request, res: Response): boolean {
  const body = req.body as Record<string, unknown> | null | undefined;
  const challengeId = typeof body?.captchaChallengeId === "string" ? body.captchaChallengeId : "";
  const code = typeof body?.captchaCode === "string" ? body.captchaCode : "";
  if (!challengeId || !code.trim()) {
    res.status(400).json({ error: "CAPTCHA_REQUIRED" });
    return false;
  }

  const error = captchaErrorCode(verifyAndConsumeCaptcha(challengeId, code, ipKey(req)));
  if (error) {
    res.status(400).json({ error });
    return false;
  }
  return true;
}

async function recordAuthActivityBestEffort(
  req: Request,
  activity: Parameters<typeof recordActivity>[0],
): Promise<void> {
  try {
    await recordActivity(activity);
  } catch (error) {
    req.log.error({ err: error, event: activity.event }, "Unable to record authentication activity");
  }
}

function setSessionCookie(res: any, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

function clearSessionCookie(res: any): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

router.get("/auth/captcha", async (req, res): Promise<void> => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await issueCaptcha(ipKey(req)));
  } catch (error) {
    if (error instanceof CaptchaIssueRateLimitError) {
      res.status(429).json({ error: "CAPTCHA_RATE_LIMITED" });
      return;
    }
    req.log.error({ err: error }, "Unable to issue CAPTCHA challenge");
    res.status(500).json({ error: "Không thể tạo mã CAPTCHA lúc này. Vui lòng thử lại" });
  }
});

router.post("/auth/register", async (req, res): Promise<void> => {
  if (!requireValidCaptcha(req, res)) return;

  const parsed = RegisterAuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Thông tin đăng ký không hợp lệ" });
    return;
  }

  const username = normalizeUsername(parsed.data.username);
  const usernameError = validateUsername(username);
  const passwordError = validatePassword(parsed.data.password);
  if (usernameError) {
    res.status(400).json({ error: usernameError });
    return;
  }
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    res.status(400).json({ error: "Mật khẩu xác nhận không khớp" });
    return;
  }
  const systemSettings = await getSystemSettings();
  if (systemSettings.maintenanceMode) {
    res.status(503).json({ error: "Hệ thống đang bảo trì. Vui lòng thử lại sau." });
    return;
  }
  if (!systemSettings.registrationEnabled) {
    res.status(503).json({ error: "Hệ thống hiện không nhận đăng ký tài khoản mới." });
    return;
  }

  const key = attemptKey(req, username);
  const registrationIp = ipKey(req);
  if (isRateLimited(registrationIpAttempts, registrationIp, MAX_REGISTRATION_IP_ATTEMPTS)) {
    res.status(429).json({ error: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút" });
    return;
  }

  const token = createSessionToken();
  try {
    registerAttempt(registrationIpAttempts, registrationIp);
    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(appUsersTable)
        .values({ username, usernameNormalized: username, passwordHash })
        .returning({ id: appUsersTable.id, username: appUsersTable.username, role: appUsersTable.role });
      const trialStartedAt = new Date();
      await tx.insert(subscriptionsTable).values({
        ownerUserId: created.id,
        plan: "plus",
        startedAt: trialStartedAt,
        expiresAt: new Date(trialStartedAt.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000),
      });
      await tx.insert(authSessionsTable).values({
        userId: created.id,
        tokenHash: hashSessionToken(token),
        expiresAt: sessionExpiresAt(),
      });
      return [created];
    });
    const authenticatedUser = await resolveAuthenticatedUser(user);
    await recordActivity({
      ownerUserId: user.id,
      event: "auth.registered",
      message: "Registered a new user account",
      level: "success",
      metadata: { ip: req.ip ?? null },
    });
    setSessionCookie(res, token);
    res.status(201).json(RegisterAuthResponse.parse(authenticatedUser));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Tên đăng nhập đã tồn tại" });
      return;
    }
    req.log.error({ err: error }, "Unable to register user");
    res.status(500).json({ error: "Không thể tạo tài khoản lúc này. Vui lòng thử lại" });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  if (!requireValidCaptcha(req, res)) return;

  const parsed = LoginAuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Thông tin đăng nhập không hợp lệ" });
    return;
  }

  const username = normalizeUsername(parsed.data.username);
  const credentialKey = attemptKey(req, username);
  const loginIp = ipKey(req);
  if (
    isRateLimited(credentialAttempts, credentialKey, MAX_CREDENTIAL_ATTEMPTS)
    || isRateLimited(loginIpAttempts, loginIp, MAX_LOGIN_IP_ATTEMPTS)
  ) {
    res.status(429).json({ error: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút" });
    return;
  }

  const token = createSessionToken();
  const user = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(eq(appUsersTable.usernameNormalized, username))
      .limit(1);
    if (!candidate) return null;

    await tx.execute(sql`SELECT 1 FROM ${appUsersTable} WHERE ${appUsersTable.id} = ${candidate.id} FOR UPDATE`);
    const [lockedUser] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.id, candidate.id))
      .limit(1);
    if (!lockedUser || !(await verifyPassword(parsed.data.password, lockedUser.passwordHash))) return null;

    await tx.insert(authSessionsTable).values({
      userId: lockedUser.id,
      tokenHash: hashSessionToken(token),
      expiresAt: sessionExpiresAt(),
    });
    return lockedUser;
  });
  if (!user) {
    registerAttempt(credentialAttempts, credentialKey);
    registerAttempt(loginIpAttempts, loginIp);
    res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng" });
    return;
  }

  clearCredentialFailures(credentialKey);
  const authenticatedUser = await resolveAuthenticatedUser({
    id: user.id,
    username: user.username,
    role: user.role,
  });
  await recordActivity({
    ownerUserId: user.id,
    event: "auth.login",
    message: "Signed in",
    level: "success",
    metadata: { ip: req.ip ?? null },
  });
  setSessionCookie(res, token);
  res.json(LoginAuthResponse.parse(authenticatedUser));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token === "string" && token) {
    await invalidateSession(token);
  }
  clearSessionCookie(res);
  res.sendStatus(204);
});

router.post("/auth/change-password", requireSession, async (req, res): Promise<void> => {
  const parsed = ChangeAuthPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Thông tin mật khẩu không hợp lệ" });
    return;
  }

  const passwordError = validatePassword(parsed.data.newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    res.status(400).json({ error: "Mật khẩu xác nhận không khớp" });
    return;
  }

  const currentToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof currentToken !== "string" || !currentToken) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }

  const passwordUserKey = req.userId!;
  const passwordIpKey = ipKey(req);
  if (!reserveAttempt(passwordChangeUserAttempts, passwordUserKey, MAX_CREDENTIAL_ATTEMPTS)) {
    res.status(429).json({ error: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút" });
    return;
  }
  if (!reserveAttempt(passwordChangeIpAttempts, passwordIpKey, MAX_LOGIN_IP_ATTEMPTS)) {
    refundAttempt(passwordChangeUserAttempts, passwordUserKey);
    res.status(429).json({ error: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút" });
    return;
  }

  const currentTokenHash = hashSessionToken(currentToken);
  let outcome: "unauthorized" | "invalid-password" | "changed";
  try {
    outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM ${appUsersTable} WHERE ${appUsersTable.id} = ${req.userId!} FOR UPDATE`);
      const [session] = await tx.select({ id: authSessionsTable.id })
        .from(authSessionsTable)
        .where(and(
          eq(authSessionsTable.userId, req.userId!),
          eq(authSessionsTable.tokenHash, currentTokenHash),
          isNull(authSessionsTable.invalidatedAt),
          gt(authSessionsTable.expiresAt, new Date()),
        ))
        .limit(1);
      if (!session) return "unauthorized" as const;

      const [user] = await tx.select({ passwordHash: appUsersTable.passwordHash })
        .from(appUsersTable)
        .where(eq(appUsersTable.id, req.userId!))
        .limit(1);
      if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
        return "invalid-password" as const;
      }

      const passwordHash = await hashPassword(parsed.data.newPassword);
      await tx.update(appUsersTable)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(appUsersTable.id, req.userId!));
      await tx.update(authSessionsTable)
        .set({ invalidatedAt: new Date() })
        .where(and(
          eq(authSessionsTable.userId, req.userId!),
          ne(authSessionsTable.tokenHash, currentTokenHash),
          isNull(authSessionsTable.invalidatedAt),
        ));
      return "changed" as const;
    });
  } catch (error) {
    refundAttempt(passwordChangeUserAttempts, passwordUserKey);
    refundAttempt(passwordChangeIpAttempts, passwordIpKey);
    throw error;
  }

  if (outcome === "unauthorized") {
    refundAttempt(passwordChangeUserAttempts, passwordUserKey);
    refundAttempt(passwordChangeIpAttempts, passwordIpKey);
    res.status(401).json({ error: "Authentication is required" });
    return;
  }
  if (outcome === "invalid-password") {
    await recordAuthActivityBestEffort(req, {
      ownerUserId: req.userId!,
      event: "auth.password_change_failed",
      message: "Rejected a password change because the current password was invalid",
      level: "warning",
      metadata: { ip: req.ip ?? null },
    });
    res.status(401).json({ error: "Mật khẩu hiện tại không đúng" });
    return;
  }

  passwordChangeUserAttempts.delete(passwordUserKey);
  refundAttempt(passwordChangeIpAttempts, passwordIpKey);
  await recordAuthActivityBestEffort(req, {
    ownerUserId: req.userId!,
    event: "auth.password_changed",
    message: "Changed account password and signed out other sessions",
    level: "success",
  });
  res.sendStatus(204);
});

router.post("/auth/revoke-other-sessions", requireSession, async (req, res): Promise<void> => {
  const currentToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof currentToken !== "string" || !currentToken) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }

  const currentTokenHash = hashSessionToken(currentToken);
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ${appUsersTable} WHERE ${appUsersTable.id} = ${req.userId!} FOR UPDATE`);
    const [session] = await tx.select({ id: authSessionsTable.id })
      .from(authSessionsTable)
      .where(and(
        eq(authSessionsTable.userId, req.userId!),
        eq(authSessionsTable.tokenHash, currentTokenHash),
        isNull(authSessionsTable.invalidatedAt),
        gt(authSessionsTable.expiresAt, new Date()),
      ))
      .limit(1);
    if (!session) return null;

    return tx.update(authSessionsTable)
      .set({ invalidatedAt: new Date() })
      .where(and(
        eq(authSessionsTable.userId, req.userId!),
        ne(authSessionsTable.tokenHash, currentTokenHash),
        isNull(authSessionsTable.invalidatedAt),
      ))
      .returning({ id: authSessionsTable.id });
  });
  if (!outcome) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }

  if (outcome.length > 0) {
    await recordAuthActivityBestEffort(req, {
      ownerUserId: req.userId!,
      event: "auth.sessions_revoked",
      message: `Revoked ${outcome.length} other account session${outcome.length === 1 ? "" : "s"}`,
      level: "info",
      metadata: { revokedCount: outcome.length },
    });
  }
  res.json(RevokeOtherAuthSessionsResponse.parse({ revokedCount: outcome.length }));
});

router.get("/auth/me", requireSession, (req, res): void => {
  res.json(GetAuthUserResponse.parse(req.authUser));
});

router.post("/auth/legacy-owner-mappings", requireSession, async (req, res): Promise<void> => {
  const parsed = MigrateLegacyAuthOwnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Thông tin mapping owner cũ không hợp lệ" });
    return;
  }
  const configuredToken = process.env.AUTH_MIGRATION_TOKEN;
  if (!configuredToken) {
    res.status(503).json({ error: "Migration token chưa được cấu hình" });
    return;
  }
  const rawToken = req.get("X-Auth-Migration-Token");
  if (!rawToken || rawToken.length !== configuredToken.length || !timingSafeEqual(Buffer.from(rawToken), Buffer.from(configuredToken))) {
    res.status(403).json({ error: "Không được phép thực hiện migration dữ liệu" });
    return;
  }

  const result = await migrateLegacyOwner(parsed.data.legacyOwnerId, parsed.data.targetUserId);
  if (!result) {
    res.status(404).json({ error: "Không tìm thấy owner cũ hoặc user đích" });
    return;
  }
  req.log.info({ mappedRecords: result.mappedRecords, remainingUnmappedOwners: result.remainingUnmappedOwners }, "Legacy workspace ownership migrated");
  res.json(MigrateLegacyAuthOwnerResponse.parse({ ...result, restartRequired: result.remainingUnmappedOwners === 0 }));
});

export default router;