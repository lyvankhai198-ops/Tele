import { useQuery,useQueryClient } from "@tanstack/react-query";
import {useEffect} from "react";
import type {Campaign} from "@workspace/api-client-react";
import type { CampaignLoadProgress } from "./load-complete-campaigns";
import { campaignProgressKey,completeCampaignKey,completeCampaignQuery,initialCampaignLoad,refreshCompleteCampaigns } from "./campaign-load-query";
import {reconcileCampaignDeletions} from "./reconcile-campaign-deletions";
import {patchCampaignCaches} from "./campaign-cache-entities";
export function useCompleteCampaigns(scope:string,account=""){
  const client=useQueryClient();
  const progress=useQuery<CampaignLoadProgress&{run?:number}>({
    queryKey:campaignProgressKey(scope,account),enabled:false,initialData:initialCampaignLoad,staleTime:Infinity,
  });
  // Existing prefix invalidations include this owner/support-scoped full cache.
  const campaigns=useQuery<Campaign[]>(completeCampaignQuery(client,scope,account));
  useEffect(()=>{
    if(!scope||!campaigns.data)return;
    let mounted=true;
    // Only a lightweight scoped revision check. Unchanged summaries are never reloaded.
    const sync=()=>{if(document.visibilityState!=="hidden")void reconcileCampaignDeletions(client,scope,()=>mounted,undefined,account).catch(()=>{});};
    const state=client.getQueryState(completeCampaignKey(scope,account));
    if(state?.isInvalidated||Date.now()-(state?.dataUpdatedAt??0)>60_000)sync();
    const timer=setInterval(sync,60_000);
    return()=>{mounted=false;clearInterval(timer);};
  },[client,scope,account,Boolean(campaigns.data)]);
  return {...campaigns,loadProgress:campaigns.data&&!campaigns.isFetching
      ?{loaded:campaigns.data.length,total:campaigns.data.length,phase:"complete" as const}:progress.data,
    sync:()=>reconcileCampaignDeletions(client,scope,()=>true,undefined,account),
    upsert:(row:Campaign)=>patchCampaignCaches(client,scope,[row]),
    refetch:(options?:Parameters<typeof campaigns.refetch>[0])=>refreshCompleteCampaigns(client,scope,()=>campaigns.refetch(options),account),
  };
}
