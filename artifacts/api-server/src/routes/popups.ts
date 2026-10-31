import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";
import { getSystemSettings } from "../lib/system-settings";
import { safePopupLink, popupActive, type Popup } from "../lib/popup-core";
import { claimPopup, deletePopup, getPopup, listPopups, paidPopupUser, popupId, popupResponse, readPopupImage, savePopup } from "../lib/popups";

const router: IRouter = Router();
router.use(async (req, res, next) => {
  if (!req.path.startsWith("/popups") && !req.path.startsWith("/admin/popups")) return next();
  res.setHeader("Cache-Control", "no-store");
  if (req.supportSession) { res.sendStatus(403); return; }
  if (!["GET", "HEAD"].includes(req.method) && req.get("origin")) {
    try {
      const settings = await getSystemSettings();
      const allowed = [`${req.protocol}://${req.get("host")}`];
      if (settings.publicAppUrl) allowed.push(new URL(settings.publicAppUrl).origin);
      if (!allowed.includes(new URL(req.get("origin")!).origin)) throw Error();
    } catch { res.status(403).json({ error: "POPUP_ORIGIN" }); return; }
  }
  next();
});
router.use("/popups", requireAuth);
router.use("/admin/popups", requireAdmin);
function normalize(value: any, id: string): Popup {
  if (!value || typeof value !== "object") throw Error("INVALID_POPUP");
  const text = (key: string, max: number, required = false) => {
    const raw = value[key] ?? "";
    if (typeof raw !== "string" || raw.length > max || (required && !raw.trim())) throw Error("INVALID_POPUP");
    return raw.trim();
  };
  const date = (key: string) => {
    if (!value[key]) return null;
    if (typeof value[key] !== "string" || !Number.isFinite(new Date(value[key]).getTime())) throw Error("INVALID_POPUP");
    return new Date(value[key]).toISOString();
  };
  const p: Popup = { id, version: randomUUID(), title: text("title", 120, true), titleEn: text("titleEn", 120),
    body: text("body", 4000, true), bodyEn: text("bodyEn", 4000), button: text("button", 50), buttonEn: text("buttonEn", 50),
    linkUrl: safePopupLink(value.linkUrl), imageId: null, status: value.status, enabled: value.enabled,
    frequency: value.frequency, audience: value.audience, template: value.template, accent: value.accent,
    priority: value.priority, startsAt: date("startsAt"), expiresAt: date("expiresAt"),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (!["draft", "published"].includes(p.status) || typeof p.enabled !== "boolean" ||
    !["visit", "daily", "once"].includes(p.frequency) || !["all", "unpaid", "paid"].includes(p.audience) ||
    !["offer", "news", "community"].includes(p.template) || typeof p.accent !== "string" || !/^#[a-f0-9]{6}$/i.test(p.accent) ||
    !Number.isInteger(p.priority) || p.priority < 0 || p.priority > 100 ||
    (p.linkUrl && !p.button) || (p.startsAt && p.expiresAt && p.startsAt >= p.expiresAt)) throw Error("INVALID_POPUP");
  return p;
}
router.get("/admin/popups", async (_req, res) => { res.json((await listPopups()).map(popupResponse)); });
async function save(req: any, res: any) {
  try {
    const id = req.params.id ?? randomUUID();
    if (!popupId(id) || (req.params.id && !popupId(req.body?.version ?? ""))) throw Error("INVALID_POPUP");
    const p = normalize(req.body, id);
    res.status(req.params.id ? 200 : 201).json(popupResponse(await savePopup(p, req.body?.image, req.userId, req.params.id ? req.body.version : undefined)));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    res.status(code === "POPUP_CONFLICT" ? 409 : 400).json({ error: ["POPUP_CONFLICT", "POPUP_LIMIT"].includes(code) ? code : "INVALID_POPUP" });
  }
}
router.post("/admin/popups", save);
router.put("/admin/popups/:id", save);
router.delete("/admin/popups/:id", async (req, res) => {
  try {
    if (!popupId(req.params.id) || !popupId(req.body?.version ?? "")) throw Error();
    await deletePopup(req.params.id, req.body.version, req.userId!);
    res.json({ deleted: true });
  } catch { res.status(409).json({ error: "POPUP_CONFLICT" }); }
});
router.post("/popups/claim", async (req, res) => {
  if (!popupId(req.body?.visitId ?? "")) { res.sendStatus(400); return; }
  if (req.authUser?.role === "admin") { res.json({ popup: null }); return; }
  const popup = await claimPopup(req.userId!, req.body.visitId);
  res.json({ popup: popup ? popupResponse(popup) : null });
});
router.get("/popups/:id", async (req, res) => {
  const p = await getPopup(req.params.id);
  if (!p || (req.authUser?.role !== "admin" && !popupActive(p, await paidPopupUser(req.userId!)))) { res.sendStatus(404); return; }
  res.json(popupResponse(p));
});
router.get("/popups/:id/image", async (req, res) => {
  const p = await getPopup(req.params.id);
  if (!p?.imageId || (req.authUser?.role !== "admin" && !popupActive(p, await paidPopupUser(req.userId!)))) { res.sendStatus(404); return; }
  try {
    res.set({ "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" });
    res.send(await readPopupImage(p));
  } catch { res.sendStatus(404); }
});
export default router;
