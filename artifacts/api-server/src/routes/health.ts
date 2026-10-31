import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireAdmin } from "../middlewares/authMiddleware";
import { getWorkerHealth } from "../lib/worker-health";

const router: IRouter = Router();
router.get("/healthz/workers", requireAdmin, async (_req, res) => {
  const health = await getWorkerHealth();
  res.status(health.workers.some(w => w.status === "stale") ? 503 : 200).json(health);
});

router.get("/healthz", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (error) {
    logger.warn({ err: error }, "Health check failed");
    res.status(503).json({ status: "error" });
  }
});

export default router;
