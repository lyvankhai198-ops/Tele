import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  GetAuthUserResponse,
  MigrateLegacyAuthOwnerBody,
  MigrateLegacyAuthOwnerResponse,
  LoginAuthBody,
  LoginAuthResponse,
  RegisterAuthBody,
  RegisterAuthResponse,
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

const router: IRouter = Router();
const MAX_CREDENTIAL_ATTEMPTS = 5;
const MAX_LOGIN_IP_ATTEMPTS = 20;
const MAX_REGISTRATION_IP_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED_KEYS = 10_000;
const credentialAttempts = new Map<string, { count: number; resetAt: number }>();
const loginIpAttempts = new Map<string, { count: number; resetAt: number }>();
const registrationIpAttempts = new Map<string, { count: number; resetAt: number }>();

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

function clearCredentialFailures(key: string): void {
  credentialAttempts.delete(key);
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

router.post("/auth/register", async (req, res): Promise<void> => {
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

  const [user] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.usernameNormalized, username))
    .limit(1);
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!valid || !user) {
    registerAttempt(credentialAttempts, credentialKey);
    registerAttempt(loginIpAttempts, loginIp);
    res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng" });
    return;
  }

  const token = createSessionToken();
  await db.insert(authSessionsTable).values({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: sessionExpiresAt(),
  });
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