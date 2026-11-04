import type {QueryClient} from "@tanstack/react-query";
import {getCampaignLoadBatch,getCampaignLoadManifest,type Campaign} from "@workspace/api-client-react";
import {campaignProgressKey,completeCampaignKey,campaignRevisionKey} from "./campaign-load-query";
import {campaignChangeSequence,mergeCampaignChanges} from "./campaign-cache-entities";
import {loadCompleteCampaigns} from "./load-complete-campaigns";

type Api={manifest:typeof getCampaignLoadManifest;batch:typeof getCampaignLoadBatch};
type Flight={promise:Promise<void>;again:boolean;active:()=>boolean};
const flights=new WeakMap<QueryClient,Map<string,Flight>>();

// Reconcile server-confirmed membership, not an optimistic "delete accepted".
// Cached summaries survive unchanged. Only genuinely new IDs need summary reads.
export function reconcileCampaignDeletions(client:QueryClient,scope:string,active:()=>boolean=()=>true,
  api:Api={manifest:getCampaignLoadManifest,batch:getCampaignLoadBatch},account=""):Promise<void>{
  const flightKey=JSON.stringify([scope,account]);
  let scopes=flights.get(client);
  if(!scopes){scopes=new Map();flights.set(client,scopes);}
  const existing=scopes.get(flightKey);
  if(existing){existing.again=true;existing.active=active;return existing.promise;}
  const flight:Flight={promise:Promise.resolve(),again:false,active};
  scopes.set(flightKey,flight);
  flight.promise=(async()=>{
    do{
      flight.again=false;
      const key=completeCampaignKey(scope,account),query=client.getQueryCache().find({queryKey:key,exact:true});
      if(!query||!flight.active())return;
      const current=()=>flight.active()&&client.getQueryCache().find({queryKey:key,exact:true})===query;
      // Do not seed an incomplete first load or let an older in-flight read
      // resurrect removed rows. Navigation alone must not start a complete load.
      if(query.state.fetchStatus==="fetching")await query.promise?.catch(()=>undefined);
      if(!current())return;
      const before=client.getQueryData<Campaign[]>(key);
      if(!before)return;
      const updatedAt=query.state.dataUpdatedAt,byId=new Map(before.map(c=>[c.id,c]));
      const startSequence=campaignChangeSequence(client,scope);
      const versions=client.getQueryData<Record<string,string>>(campaignRevisionKey(scope,account))??{};
      let revisions:Record<string,string>|undefined;
      const next=await loadCompleteCampaigns(()=>{},current,{
        manifest:async()=>{
          const manifest=await api.manifest(account?{telegramAccountId:account}:undefined);
          revisions=manifest.revisions;return manifest;
        },
        batch:async({ids:csv})=>{
          const ids=(csv??"").split(","),unknown=ids.filter(id=>!byId.has(id)||(revisions&&revisions[id]!==versions[id]));
          const fresh=unknown.length?await api.batch({ids:unknown.join(","),...account?{telegramAccountId:account}:{}}):{campaigns:[],missingIds:[]};
          // The real loader validates all returned/missing IDs and duplicates.
          return {campaigns:[...ids.filter(id=>!unknown.includes(id)).flatMap(id=>{const row=byId.get(id);return row?[row]:[];}),...fresh.campaigns],missingIds:fresh.missingIds};
        },
      });
      if(!current())return;
      if(query.state.fetchStatus==="fetching"||client.getQueryData(key)!==before||query.state.dataUpdatedAt!==updatedAt){
        flight.again=true;continue;
      }
      // Membership reconciliation is not a refresh of existing summaries.
      // Preserve another writer's freshness request, especially off this page.
      const invalidated=query.state.isInvalidated;
      const merged=mergeCampaignChanges(client,scope,account,next,startSequence);
      client.setQueryData(key,merged,{updatedAt:revisions?Date.now():updatedAt});
      if(revisions)client.setQueryData(campaignRevisionKey(scope,account),revisions);
      else if(invalidated)void client.invalidateQueries({queryKey:key,exact:true,refetchType:"none"});
      client.setQueryData(campaignProgressKey(scope,account),(old:Record<string,unknown>|undefined)=>({
        ...old,loaded:next.length,total:next.length,phase:"complete",
      }));
    }while(flight.again&&flight.active());
  })().finally(()=>{if(scopes!.get(flightKey)===flight)scopes!.delete(flightKey);});
  return flight.promise;
}

/** Never load a hidden account just because a background operation progressed. */
export async function reconcileObservedCampaigns(client:QueryClient,scope:string,active:()=>boolean=()=>true){
  const queries=client.getQueryCache().findAll({queryKey:completeCampaignKey(scope)});
  await Promise.all(queries.map(query=>query.getObserversCount()>0
    ?reconcileCampaignDeletions(client,scope,active,undefined,String(query.queryKey[3]??""))
    :client.invalidateQueries({queryKey:query.queryKey,exact:true,refetchType:"none"})));
}

export function deletionSyncToken(job:{state:string;phase:string;processed:number}){
  // Delivery/log removal can take a long time without changing campaign rows.
  // Recheck on phase changes, campaign-removal progress and terminal outcomes.
  return `${job.state}:${job.phase}:${job.phase==="campaigns"||job.state==="completed"||job.state==="failed"?job.processed:""}`;
}
export function invalidateDeletionDependencies(client:QueryClient){
  return client.invalidateQueries({predicate:q=>q.queryKey[0]!=="telecamp-operations"
    &&q.queryKey[0]!=="campaign-load-progress"
    &&!(q.queryKey[0]===completeCampaignKey("")[0]&&q.queryKey[1]==="complete-load")});
}
