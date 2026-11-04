import type { IRouter, Request, Response } from "express";
import {
  CreateCampaignCleanupPreviewBody, CreateCampaignCleanupPreviewParams,
  ConfirmCampaignCleanupBody, ConfirmCampaignCleanupParams,
} from "@workspace/api-zod";
import { createCampaignCleanupPreview, confirmCampaignCleanup } from "../lib/campaign-cleanup-preview";

function failure(res: Response, error: unknown) {
  const value = error instanceof Error ? error.message : "";
  const pgError=error as {code?:string;cause?:{code?:string}} | null;
  const pgCode=pgError?.code??pgError?.cause?.code;
  const code = ["55P03", "40P01", "57014"].includes(pgCode ?? "") ? "CLEANUP_BUSY_RETRY"
    : value === "OPERATION_SELECTION_CHANGED" ? "CLEANUP_PREVIEW_CHANGED"
    : /^CLEANUP_[A-Z_]+$/.test(value) ? value : "CLEANUP_REQUEST_FAILED";
  const status = code === "CLEANUP_NOT_FOUND" ? 404 : code === "CLEANUP_REQUEST_FAILED" ? 500
    : ["CLEANUP_EMPTY_SELECTION", "CLEANUP_INVALID_SELECTION"].includes(code) ? 400 : 409;
  res.status(status).json({ error: code });
}

/** Registered after the existing auth/support-write guards. Ownership is always
 * derived from the authenticated workspace, never accepted from request bodies. */
export function registerCampaignCleanupRoutes(router: IRouter, owner: (req: Request) => string) {
  router.post("/campaigns/bulk-control/jobs/:jobId/cleanup-preview", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const params = CreateCampaignCleanupPreviewParams.safeParse(req.params);
    const body = CreateCampaignCleanupPreviewBody.safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: "CLEANUP_INVALID_INPUT" }); return; }
    try {
      res.json(await createCampaignCleanupPreview(owner(req), params.data.jobId, body.data.telegramAccountId));
    } catch (error) { failure(res, error); }
  });
  router.post("/campaigns/bulk-control/jobs/:jobId/cleanup-confirm", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const params = ConfirmCampaignCleanupParams.safeParse(req.params);
    const body = ConfirmCampaignCleanupBody.safeParse(req.body);
    if (!params.success || !body.success || body.data.confirm !== true) {
      res.status(400).json({ error: "CLEANUP_INVALID_INPUT" }); return;
    }
    try {
      res.status(202).json(await confirmCampaignCleanup(owner(req), params.data.jobId,
        body.data.previewId, body.data.campaignIds));
    } catch (error) { failure(res, error); }
  });
}
