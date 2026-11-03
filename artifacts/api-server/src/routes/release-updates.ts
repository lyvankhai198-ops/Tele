import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { CreateReleaseUpdateBody, UpdateReleaseUpdateBody, DeleteReleaseUpdateBody, SendReleaseUpdateBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/authMiddleware";
import { getSystemSettings } from "../lib/system-settings";
import { ReleaseError } from "../lib/release-update-core";
import { createRelease, listReleases, releaseDestination, changeRelease, sendRelease } from "../lib/release-update-store";

const router: IRouter = Router();
router.use("/admin/release-updates", requireAdmin, async (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.get("origin")) {
    try {
      const settings = await getSystemSettings();
      const allowed = [new URL(`${req.protocol}://${req.get("host")}`).origin];
      if (settings.publicAppUrl) allowed.push(new URL(settings.publicAppUrl).origin);
      if (!allowed.includes(new URL(req.get("origin")!).origin)) { res.status(403).json({ error: "RELEASE_ORIGIN_DENIED" }); return; }
    } catch { res.status(403).json({ error: "RELEASE_ORIGIN_DENIED" }); return; }
  }
  next();
});
const respond = (res: any, error: unknown) => {
  if (error instanceof ReleaseError) res.status(error.status).json({ error: error.code });
  else res.status(503).json({ error: "RELEASE_UNAVAILABLE" });
};
router.get("/admin/release-updates", async (_req, res) => {
  try { res.json({ updates: await listReleases(pool), destination: await releaseDestination(pool) }); }
  catch (error) { respond(res, error); }
});
router.post("/admin/release-updates", async (req, res) => {
  const parsed = CreateReleaseUpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "RELEASE_BILINGUAL_REQUIRED" }); return; }
  try { res.status(201).json(await createRelease(pool, parsed.data, req.userId!)); }
  catch (error) { respond(res, error); }
});
router.patch("/admin/release-updates/:releaseId", async (req, res) => {
  const parsed = UpdateReleaseUpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "RELEASE_BILINGUAL_REQUIRED" }); return; }
  try { res.json(await changeRelease(pool, req.params.releaseId, parsed.data.version, req.userId!, parsed.data)); }
  catch (error) { respond(res, error); }
});
router.delete("/admin/release-updates/:releaseId", async (req, res) => {
  const parsed = DeleteReleaseUpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "RELEASE_INVALID_VERSION" }); return; }
  try { await changeRelease(pool, req.params.releaseId, parsed.data.version, req.userId!, null); res.status(204).send(); }
  catch (error) { respond(res, error); }
});
router.post("/admin/release-updates/:releaseId/send", async (req, res) => {
  const parsed = SendReleaseUpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "RELEASE_CONFIRMATION_REQUIRED" }); return; }
  const token = process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN ?? process.env.TELECAMPAIGN_KGPT_BOT_TOKEN;
  if (!token) { res.status(503).json({ error: "RELEASE_BOT_UNAVAILABLE" }); return; }
  try {
    const settings = await getSystemSettings();
    if (settings.supportChat.telegramBridgeEnabled === false) throw new ReleaseError("RELEASE_BOT_DISABLED", 409);
    const call = async (method: string, payload: Record<string, unknown>) => {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await response.json() as any;
      if (!response.ok || data?.ok !== true) {
        if (data?.ok === false && Number.isInteger(data.error_code) && data.error_code >= 400 && data.error_code < 500) {
          throw new ReleaseError("RELEASE_TELEGRAM_REJECTED", 503);
        }
        throw new ReleaseError("RELEASE_TELEGRAM_UNCERTAIN", 503);
      }
      return data.result;
    };
    res.json(await sendRelease(pool, call, { id: req.params.releaseId, version: parsed.data.version,
      destination: parsed.data.destination, actor: req.userId! }));
  } catch (error) { respond(res, error); }
});
export default router;
