import type { QueryClient } from "@tanstack/react-query";
import { getListCampaignsQueryKey } from "@workspace/api-client-react";
import { loadCompleteCampaigns,type CampaignLoadProgress } from "./load-complete-campaigns";

export const initialCampaignLoad:CampaignLoadProgress={loaded:0,total:null,phase:"counting"};
let sequence=0;
export const campaignProgressKey=(scope:string)=>["campaign-load-progress",scope] as const;
export function completeCampaignQuery(client:QueryClient,scope:string){
  const key=[...getListCampaignsQueryKey(),"complete-load",scope] as const;
  const progressKey=campaignProgressKey(scope);
  return {
    queryKey:key,enabled:Boolean(scope),retry:false as const,staleTime:30_000,gcTime:15*60_000,
    queryFn:async()=>{
      const query=client.getQueryCache().find({queryKey:key,exact:true});
      const run=++sequence;
      client.setQueryData(progressKey,{...initialCampaignLoad,run});
      const isCurrent=()=>client.getQueryCache().find({queryKey:key,exact:true})===query
        &&client.getQueryData<{run:number}>(progressKey)?.run===run;
      // Do not consume TanStack's abort signal: menu navigation must not cancel
      // this read. Cache-clear/logout and replacement runs invalidate the token.
      return loadCompleteCampaigns(value=>client.setQueryData(progressKey,{...value,run}),isCurrent);
    },
  };
}
