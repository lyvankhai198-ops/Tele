import type {Router,Request} from "express";
import {and,eq} from "drizzle-orm";
import {db,telegramAccountsTable} from "@workspace/db";
import {CreateOperationBody} from "@workspace/api-zod";
import {enqueueOperation,listOperations,retryOperation,operationSummary} from "../lib/operations";
import "../lib/operation-deletion";
import "../lib/operation-preparation";

export function registerOperationRoutes(router:Router,ownerOf:(req:Request)=>string){
  router.get("/operations",async(req,res)=>{res.set("Cache-Control","no-store");res.json(await listOperations(ownerOf(req)));});
  router.post("/operations",async(req,res)=>{
    const parsed=CreateOperationBody.safeParse(req.body);
    if(!parsed.success)return void res.status(400).json({error:"OPERATION_INVALID_REQUEST"});
    const input=parsed.data,owner=ownerOf(req);
    if(input.kind!=="sync_groups"&&input.confirm!==true)return void res.status(400).json({error:"OPERATION_CONFIRM_REQUIRED"});
    if(input.kind!=="delete_campaigns"&&!input.accountId)return void res.status(400).json({error:"OPERATION_INVALID_REQUEST"});
    const [account]=input.accountId?await db.select().from(telegramAccountsTable).where(and(eq(telegramAccountsTable.id,input.accountId),eq(telegramAccountsTable.ownerUserId,owner))):[];
    try{
      const job=await db.transaction(tx=>enqueueOperation(tx,{owner,kind:input.kind,accountId:input.accountId,campaignId:input.campaignId,
        label:account?.name??(input.kind==="delete_campaigns"?"Campaigns":"Telegram"),
        unit:input.kind==="sync_groups"?"groups":"records",requestId:req.get("Idempotency-Key"),
        payload:input.kind==="delete_campaigns"?{status:input.status??"all",search:input.search?.trim()??"",...(input.telegramAccountId?{telegramAccountId:input.telegramAccountId}:{})}:{}}));
      res.status(202).json(operationSummary(job));
    }catch(error){
      const code=error instanceof Error?error.message:"";
      res.status(code==="OPERATION_NOT_FOUND"?404:409).json({error:/^OPERATION_[A-Z_]+$/.test(code)?code:"OPERATION_RETRY_REQUIRED"});
    }
  });
  router.post("/operations/:operationId/retry",async(req,res)=>{
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(String(req.params.operationId)))return void res.status(400).json({error:"OPERATION_INVALID_REQUEST"});
    const job=await retryOperation(ownerOf(req),String(req.params.operationId));
    if(!job)return void res.status(404).json({error:"OPERATION_NOT_FOUND"});
    res.status(202).json(job);
  });
}
