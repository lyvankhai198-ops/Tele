import type { QueryClient } from "@tanstack/react-query";
import { getListCampaignsQueryKey } from "@workspace/api-client-react";
import { loadCompleteCampaigns,type CampaignLoadProgress } from "./load-complete-campaigns";

export const initialCampaignLoad:CampaignLoadProgress={loaded:0,total:null,phase:"counting"};
let sequence=0;
export const campaignProgressKey=(scope:string)=>["campaign-load-progress",scope] as const;
export const completeCampaignKey=(scope:string)=>[...getListCampaignsQueryKey(),"complete-load",scope] as const;
export async function refreshCompleteCampaigns<T>(client:QueryClient,scope:string,refetch:()=>Promise<T>){
  // An explicit refresh after a mutation needs a NEW selection, even when
  // the very first load has no cached data yet. TanStack otherwise reuses
  // that pending promise and can omit the just-created campaign.
  await client.cancelQueries({queryKey:completeCampaignKey(scope),exact:true});
  return refetch();
}
export function completeCampaignQuery(client:QueryClient,scope:string){
  const key=completeCampaignKey(scope);
  const progressKey=campaignProgressKey(scope);
  return {
    queryKey:key,enabled:Boolean(scope),retry:false as const,staleTime:30_000,gcTime:60*60_000,
    // Merely returning to this tab must not restart thousands of reads once
    // staleTime expires. Real mutations still invalidate this key/prefix, and
    // an explicit refresh still creates a new manifest and progress run.
    refetchOnMount:(query:{state:{data:unknown;isInvalidated:boolean}})=>
      query.state.data===undefined||query.state.isInvalidated,
    refetchOnWindowFocus:false as const,
    refetchOnReconnect:(query:{state:{data:unknown;isInvalidated:boolean}})=>
      query.state.data===undefined||query.state.isInvalidated,
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
