import type { QueryClient } from "@tanstack/react-query";
import { getListCampaignsQueryKey,getCampaignLoadManifest,getCampaignLoadBatch,type Campaign } from "@workspace/api-client-react";
import { loadCompleteCampaigns,type CampaignLoadProgress } from "./load-complete-campaigns";
import { campaignChangeSequence,mergeCampaignChanges } from "./campaign-cache-entities";

export const initialCampaignLoad:CampaignLoadProgress={loaded:0,total:null,phase:"counting"};
let sequence=0;
export const campaignProgressKey=(scope:string,account="")=>["campaign-load-progress",scope,...account?[account]:[]] as const;
export const completeCampaignKey=(scope:string,account="")=>[...getListCampaignsQueryKey(),"complete-load",scope,...account?[account]:[]] as const;
export const campaignRevisionKey=(scope:string,account="")=>["campaign-revisions",scope,account] as const;
export async function refreshCompleteCampaigns<T>(client:QueryClient,scope:string,refetch:()=>Promise<T>,account=""){
  // An explicit refresh after a mutation needs a NEW selection, even when
  // the very first load has no cached data yet. TanStack otherwise reuses
  // that pending promise and can omit the just-created campaign.
  client.setQueryData(campaignProgressKey(scope,account),{...initialCampaignLoad,run:++sequence});
  await client.cancelQueries({queryKey:completeCampaignKey(scope,account),exact:true});
  return refetch();
}
export function completeCampaignQuery(client:QueryClient,scope:string,account=""){
  const key=completeCampaignKey(scope,account);
  const progressKey=campaignProgressKey(scope,account);
  return {
    queryKey:key,enabled:(query:{state:{data:unknown}})=>Boolean(scope)&&query.state.data===undefined,
    retry:false as const,retryOnMount:false,staleTime:Infinity,gcTime:Infinity,
    // Merely returning to this tab must not restart thousands of reads once
    // staleTime expires. Real mutations still invalidate this key/prefix, and
    // an explicit refresh still creates a new manifest and progress run.
    refetchOnMount:(query:{state:{dataUpdatedAt:number;isInvalidated:boolean}})=>
      query.state.dataUpdatedAt===0,
    refetchOnWindowFocus:false as const,
    refetchOnReconnect:(query:{state:{dataUpdatedAt:number;isInvalidated:boolean}})=>
      query.state.dataUpdatedAt===0,
    initialData:()=>{
      if(!account)return undefined;
      const all=client.getQueryData<Campaign[]>(completeCampaignKey(scope));
      if(!all)return undefined;
      const rows=all.filter(row=>row.telegramAccountId===account);
      const versions=client.getQueryData<Record<string,string>>(campaignRevisionKey(scope))??{};
      client.setQueryData(campaignRevisionKey(scope,account),Object.fromEntries(rows.flatMap(row=>versions[row.id]?[[row.id,versions[row.id]]]:[])));
      return rows;
    },
    initialDataUpdatedAt:()=>{
      const source=account?client.getQueryState(completeCampaignKey(scope)):undefined;
      return source?.isInvalidated?0:source?.dataUpdatedAt;
    },
    queryFn:async()=>{
      const query=client.getQueryCache().find({queryKey:key,exact:true});
      const run=++sequence;
      client.setQueryData(progressKey,{...initialCampaignLoad,run});
      const isCurrent=()=>client.getQueryCache().find({queryKey:key,exact:true})===query
        &&client.getQueryData<{run:number}>(progressKey)?.run===run;
      // Do not consume TanStack's abort signal: menu navigation must not cancel
      // this read. Cache-clear/logout and replacement runs invalidate the token.
      const start=campaignChangeSequence(client,scope);
      let revisions:Record<string,string>={};
      const rows=await loadCompleteCampaigns(value=>client.setQueryData(progressKey,{...value,run}),isCurrent,{
        manifest:async()=>{
          const manifest=await getCampaignLoadManifest(account?{telegramAccountId:account}:undefined);
          revisions=manifest.revisions??{};return manifest;
        },
        batch:params=>getCampaignLoadBatch({...params,...account?{telegramAccountId:account}:{}}),
      });
      if(!isCurrent())throw Error("CAMPAIGN_LOAD_SESSION_CHANGED");
      client.setQueryData(campaignRevisionKey(scope,account),revisions);
      const merged=mergeCampaignChanges(client,scope,account,rows,start);
      client.setQueryData(progressKey,{loaded:merged.length,total:merged.length,phase:"complete",run});
      return merged;
    },
  };
}
