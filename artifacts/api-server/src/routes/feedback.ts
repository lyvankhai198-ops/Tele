import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";
import { getSystemSettings } from "../lib/system-settings";
import { createFeedback, getFeedback, listFeedback, updateFeedbackStatus, feedbackImage, normalizeGroupLink } from "../lib/feedback";
import { readOperationalState, writeOperationalState } from "../lib/operational-state";
import { notifyFeedback } from "../lib/support-telegram";
import { recordAdminAudit } from "../lib/admin-audit";

const router: IRouter = Router();
router.use(async (req, res, next) => {
  if (!req.path.startsWith("/feedback") && !req.path.startsWith("/admin/feedback")) { next(); return; }
  res.setHeader("Cache-Control", "no-store");
  if (req.supportSession) { res.status(403).json({ error: "Không dùng chức năng góp ý trong phiên hỗ trợ." }); return; }
  const origin = req.get("origin");
  if (!["GET", "HEAD"].includes(req.method) && origin) {
    try {
      const settings = await getSystemSettings();
      const allowed = [new URL(`${req.protocol}://${req.get("host")}`).origin];
      if (settings.publicAppUrl) allowed.push(new URL(settings.publicAppUrl).origin);
      if (!allowed.includes(new URL(origin).origin)) throw Error();
    } catch { res.status(403).json({ error: "Origin không hợp lệ" }); return; }
  }
  next();
});
router.use("/feedback", requireAuth);
router.use("/admin/feedback", requireAdmin);
router.get("/feedback/config", async (_req, res) => {
  res.json(await readOperationalState("feedback:config", { groupUrl: "" }));
});
router.put("/admin/feedback/config", async (req, res) => {
  try {
    const groupUrl = normalizeGroupLink(req.body?.groupUrl);
    const previous = await readOperationalState("feedback:config", { groupUrl: "" });
    await writeOperationalState("feedback:config", { groupUrl });
    await recordAdminAudit(req.userId!, "feedback.group_link", "feedback", { configured: Boolean(previous.groupUrl) }, { configured: Boolean(groupUrl) });
    res.json({ groupUrl });
  } catch { res.status(400).json({ error: "Nhập link HTTPS hợp lệ hoặc để trống để tắt link nhóm." }); }
});
router.get("/feedback", async (req, res) => { res.json(await listFeedback(req.userId!)); });
router.get("/admin/feedback", async (_req, res) => { res.json(await listFeedback()); });
router.post("/feedback", async (req, res) => {
  try {
    const record = await createFeedback(req.userId!, req.authUser!.username, req.body);
    void notifyFeedback(record);
    res.status(201).json(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FEEDBACK_RATE_LIMIT") { res.status(429).json({ error: "Tối đa 5 góp ý trong 24 giờ, cách nhau ít nhất 1 phút." }); return; }
    if (message.startsWith("INVALID_FEEDBACK")) { res.status(400).json({ error: "Chọn loại, nhập 10–4000 ký tự và ảnh hợp lệ." }); return; }
    res.status(500).json({ error: "Chưa lưu được góp ý. Vui lòng thử lại." });
  }
});
router.get("/feedback/:id", async (req, res) => {
  const record = await getFeedback(req.params.id);
  if (!record || (record.ownerId !== req.userId && req.authUser?.role !== "admin")) { res.sendStatus(404); return; }
  res.json(record);
});
router.get("/feedback/:id/image", async (req, res) => {
  const record = await getFeedback(req.params.id);
  if (!record?.hasImage || (record.ownerId !== req.userId && req.authUser?.role !== "admin")) { res.sendStatus(404); return; }
  try {
    res.set({ "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" });
    res.send(await feedbackImage(record.id));
  } catch { res.sendStatus(404); }
});
router.patch("/admin/feedback/:id/status", async (req, res) => {
  try {
    const record = await updateFeedbackStatus(req.params.id, req.body?.status, req.userId!);
    if (!record) { res.sendStatus(404); return; }
    res.json(record);
  } catch { res.status(400).json({ error: "Trạng thái không hợp lệ hoặc chưa lưu được." }); }
});
export default router;
