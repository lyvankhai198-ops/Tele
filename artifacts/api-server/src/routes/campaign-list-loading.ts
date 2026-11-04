import { Router } from "express";
import { db,campaignsTable } from "@workspace/db";
import { and,desc,inArray } from "drizzle-orm";
import { GetCampaignLoadBatchQueryParams, GetCampaignLoadBatchResponse, GetCampaignLoadManifestQueryParams, GetCampaignLoadManifestResponse } from "@workspace/api-zod";
import { campaignListScope } from "../lib/campaign-list-scope";
import { readOnlyCampaignSummary } from "../lib/campaigns";

// Mounted after the existing authentication/support read-only middleware.
export const campaignListLoadingRouter=Router();
campaignListLoadingRouter.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
campaignListLoadingRouter.get("/load-manifest",async(req,res)=>{
  const parsed=GetCampaignLoadManifestQueryParams.safeParse(req.query);
  if(!parsed.success){res.status(400).json({error:"INVALID_CAMPAIGN_LOAD_BATCH"});return;}
  const owner=req.workspaceUserId ?? req.userId!;
  const rows=await db.select({id:campaignsTable.id,updatedAt:campaignsTable.updatedAt}).from(campaignsTable)
    .where(campaignListScope(owner,parsed.data))
    .orderBy(desc(campaignsTable.createdAt),desc(campaignsTable.id));
  res.json(GetCampaignLoadManifestResponse.parse({campaignIds:rows.map(row=>row.id),total:rows.length,
    revisions:Object.fromEntries(rows.map(row=>[row.id,row.updatedAt.toISOString()]))}));
});
campaignListLoadingRouter.get("/load-batch",async(req,res)=>{
  const parsed=GetCampaignLoadBatchQueryParams.safeParse(req.query);
  if(!parsed.success){res.status(400).json({error:"INVALID_CAMPAIGN_LOAD_BATCH"});return;}
  const ids=parsed.data.ids.split(",");
  if(ids.length>25 || new Set(ids).size!==ids.length ||
    ids.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))){
    res.status(400).json({error:"INVALID_CAMPAIGN_LOAD_BATCH"});return;
  }
  const owner=req.workspaceUserId ?? req.userId!;
  const rows=await db.select().from(campaignsTable).where(and(
    campaignListScope(owner,parsed.data),inArray(campaignsTable.id,ids),
  ));
  const byId=new Map(rows.map(row=>[row.id,row]));
  const ordered=ids.flatMap(id=>{const row=byId.get(id);return row?[row]:[];});
  const summaries:Awaited<ReturnType<typeof readOnlyCampaignSummary>>[]=[];
  // Bound DB fan-out as well as HTTP payload size; never fan out thousands
  // of campaignSummary calls into the shared database pool.
  for(let start=0;start<ordered.length;start+=5){
    summaries.push(...await Promise.all(ordered.slice(start,start+5).map(readOnlyCampaignSummary)));
  }
  res.json(GetCampaignLoadBatchResponse.parse({
    campaigns:summaries,missingIds:ids.filter(id=>!byId.has(id)),
  }));
});
