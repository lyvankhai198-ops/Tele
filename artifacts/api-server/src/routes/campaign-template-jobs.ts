import { Router } from "express";
import { BulkUpdateCampaignTemplateBody } from "@workspace/api-zod";
import { createTemplateJob, getTemplateJob, latestTemplateJob, retryTemplateJob } from "../lib/campaign-template-jobs";

export const templateJobsRouter = Router();
templateJobsRouter.use((req,res,next)=>{
  if (!req.authUser) {
    res.status(401).json({error:"AUTH_REQUIRED"});return;
  }
  if (req.supportSession) {
    res.status(403).json({error:"TEMPLATE_JOB_READ_ONLY"});return;
  }
  res.setHeader("Cache-Control","no-store");
  next();
});
function failure(res: any, error: unknown) {
  const code=(error as Error).message;
  if (["TEMPLATE_JOB_ACCOUNT_NOT_FOUND","TEMPLATE_JOB_TEMPLATE_NOT_FOUND","TEMPLATE_JOB_CAMPAIGNS_NOT_FOUND"].includes(code)) {
    res.status(404).json({error:code});
  } else if (["TEMPLATE_JOB_BUSY","TEMPLATE_JOB_CONFLICT","TEMPLATE_JOB_REQUEST_CHANGED"].includes(code) ||
    ["55P03","57014","40P01","40001"].includes((error as {code?:string}).code ?? "")) {
    res.status(409).json({error:"TEMPLATE_JOB_CHECK_PROGRESS"});
  } else if (code==="TEMPLATE_JOB_INVALID_REQUEST") res.status(400).json({error:code});
  else res.status(503).json({error:"TEMPLATE_JOB_UNAVAILABLE"});
}
templateJobsRouter.post("/",async(req,res)=>{
  const body=BulkUpdateCampaignTemplateBody.safeParse(req.body);
  if (!body.success) {res.status(400).json({error:"TEMPLATE_JOB_INVALID_REQUEST"});return;}
  try {
    const job=await createTemplateJob({...body.data,owner:req.userId!});
    res.status(202).json(job);
  } catch(error) {failure(res,error);}
});
templateJobsRouter.get("/jobs/latest",async(req,res)=>{
  try {res.json(await latestTemplateJob(req.userId!));} catch(error){failure(res,error);}
});
templateJobsRouter.get(["/jobs/:id","/jobs/:id/skipped/:offset"],async(req,res)=>{
  const offset=Number(req.params.offset ?? 0);
  if (!Number.isSafeInteger(offset) || offset<0) {res.status(400).json({error:"TEMPLATE_JOB_INVALID_REQUEST"});return;}
  try {
    const job=await getTemplateJob(req.userId!,String(req.params.id),offset);
    if (!job) {res.status(404).json({error:"TEMPLATE_JOB_NOT_FOUND"});return;}
    res.json(job);
  } catch(error){failure(res,error);}
});
templateJobsRouter.post("/jobs/:id/retry",async(req,res)=>{
  try {
    const job=await retryTemplateJob(req.userId!,String(req.params.id));
    if (!job) {res.status(404).json({error:"TEMPLATE_JOB_NOT_FOUND"});return;}
    res.json(job);
  } catch(error){failure(res,error);}
});
