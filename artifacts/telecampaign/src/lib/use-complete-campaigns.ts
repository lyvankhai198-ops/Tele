import { useQuery,useQueryClient } from "@tanstack/react-query";
import type { CampaignLoadProgress } from "./load-complete-campaigns";
import { campaignProgressKey,completeCampaignQuery,initialCampaignLoad } from "./campaign-load-query";
export function useCompleteCampaigns(scope:string){
  const client=useQueryClient();
  const progress=useQuery<CampaignLoadProgress&{run?:number}>({
    queryKey:campaignProgressKey(scope),enabled:false,initialData:initialCampaignLoad,staleTime:Infinity,
  });
  // Existing prefix invalidations include this owner/support-scoped full cache.
  const campaigns=useQuery(completeCampaignQuery(client,scope));
  return {...campaigns,loadProgress:progress.data};
}
