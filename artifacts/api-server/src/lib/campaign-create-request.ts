import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { OperationTx } from "./operations";

type Store=Pick<OperationTx,"execute">;
export const campaignCreateFingerprint=(body:unknown)=>createHash("sha256").update(JSON.stringify(body)).digest("hex");
const requestKey=(owner:string,key:string)=>`campaign_create_request:${owner}:${key}`;
export async function campaignCreateReplay(store:Store,owner:string,key:string|undefined,fingerprint:string){
  if(!key)return undefined;
  const result=await store.execute<{value:string}>(sql`SELECT value FROM system_settings WHERE key=${requestKey(owner,key)}`);
  if(!result.rows.length)return undefined;
  const saved=JSON.parse(result.rows[0].value) as {fingerprint:string;campaignId:string};
  return saved.fingerprint===fingerprint?{campaignId:saved.campaignId}:{campaignId:null};
}
export async function lockCampaignCreateRequest(store:Store,owner:string,key:string|undefined){
  if(key)await store.execute(sql`SELECT pg_advisory_xact_lock(174646,hashtext(${requestKey(owner,key)}))`);
}
export async function saveCampaignCreateRequest(store:Store,owner:string,key:string|undefined,fingerprint:string,campaignId:string){
  if(key)await store.execute(sql`
    INSERT INTO system_settings(key,value) VALUES(${requestKey(owner,key)},${JSON.stringify({fingerprint,campaignId})})
  `);
}
