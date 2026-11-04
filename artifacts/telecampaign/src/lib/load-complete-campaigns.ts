import { getCampaignLoadBatch,getCampaignLoadManifest,type Campaign } from "@workspace/api-client-react";

export type CampaignLoadProgress={loaded:number;total:number|null;phase:"counting"|"loading"|"complete"|"error"};
type LoaderApi={
  manifest:typeof getCampaignLoadManifest;batch:typeof getCampaignLoadBatch;
};
// Keep staging data inside this promise. Callers receive either the complete
// selection or an error, never a successful partial array.
export async function loadCompleteCampaigns(
  report:(progress:CampaignLoadProgress)=>void,
  isCurrent:()=>boolean,
  api:LoaderApi={manifest:getCampaignLoadManifest,batch:getCampaignLoadBatch},
):Promise<Campaign[]>{
  let loaded=0,total:number|null=null;
  function check(){if(!isCurrent())throw new Error("CAMPAIGN_LOAD_SESSION_CHANGED");}
  function publish(phase:CampaignLoadProgress["phase"]){check();report({loaded,total,phase});}
  try{
    publish("counting");
    const manifest=await api.manifest();check();
    if(manifest.total!==manifest.campaignIds.length || new Set(manifest.campaignIds).size!==manifest.total){
      throw new Error("CAMPAIGN_LOAD_INVALID_MANIFEST");
    }
    total=manifest.total;publish("loading");
    const complete:Campaign[]=[];
    for(let start=0;start<manifest.campaignIds.length;start+=25){
      check();
      const ids=manifest.campaignIds.slice(start,start+25);
      const batch=await api.batch({ids:ids.join(",")});check();
      const received=new Set<string>();
      for(const campaign of batch.campaigns){
        if(!ids.includes(campaign.id)||received.has(campaign.id))throw new Error("CAMPAIGN_LOAD_INVALID_BATCH");
        received.add(campaign.id);
      }
      for(const id of batch.missingIds){
        if(!ids.includes(id)||received.has(id))throw new Error("CAMPAIGN_LOAD_INVALID_BATCH");
        received.add(id);
      }
      if(received.size!==ids.length)throw new Error("CAMPAIGN_LOAD_INCOMPLETE_BATCH");
      const byId=new Map(batch.campaigns.map(campaign=>[campaign.id,campaign]));
      complete.push(...ids.flatMap(id=>{const campaign=byId.get(id);return campaign?[campaign]:[];}));
      loaded=complete.length;total-=batch.missingIds.length;
      publish("loading");
    }
    publish("complete");
    return complete;
  }catch(error){
    if(isCurrent())report({loaded,total,phase:"error"});
    throw error;
  }
}
