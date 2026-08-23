import type { NextFunction, Request, Response } from "express";
import { getSystemSettings } from "../lib/system-settings";
import {
  assertOwnershipMigrationReady,
  getAuthenticatedUser,
  OwnershipMigrationPendingError,
  SESSION_COOKIE_NAME,
  type SafeAuthUser,
} from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      authUser?: SafeAuthUser;
      userId?: string;
      isAuthenticated: () => boolean;
    }
  }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.isAuthenticated = () => Boolean(req.authUser);
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token !== "string" || !token) {
    next();
    return;
  }

  try {
    const user = await getAuthenticatedUser(token);
    if (user) {
      req.authUser = user;
      req.userId = user.id;
    }
  } catch (error) {
    req.log.error({ err: error }, "Unable to resolve authentication session");
  }
  next();
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser || !req.userId) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser || !req.userId) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }
  if (req.authUser.role !== "admin") {
    res.status(403).json({ error: "Bạn không có quyền quản trị." });
    return;
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.authUser || !req.userId) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }
  const systemSettings = await getSystemSettings();
  if (systemSettings.maintenanceMode && req.authUser.role !== "admin") {
    res.status(503).json({ error: "Hệ thống đang bảo trì. Vui lòng thử lại sau." });
    return;
  }
  try {
    await assertOwnershipMigrationReady();
  } catch (error) {
    if (error instanceof OwnershipMigrationPendingError) {
      res.status(503).json({ error: "Dữ liệu workspace cũ cần được quản trị viên map an toàn trước khi truy cập" });
      return;
    }
    req.log.error({ err: error }, "Unable to verify ownership migration state");
    res.status(503).json({ error: "Không thể kiểm tra trạng thái migration dữ liệu" });
    return;
  }
  next();
}