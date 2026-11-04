import type {QueryClient} from "@tanstack/react-query";
import {getCampaignLoadBatch,getCampaignLoadManifest,type Campaign} from "@workspace/api-client-react";
import {campaignProgressKey,completeCampaignKey} from "./campaign-load-query";
import {loadCompleteCampaigns} from "./load-complete-campaigns";

type Api={manifest:typeof getCampaignLoadManifest;batch:typeof getCampaignLoadBatch};
type Flight={promise:Promise<void>;again:boolean;active:()=>boolean};
const flights=new WeakMap<QueryClient,Map<string,Flight>>();

// Reconcile server-confirmed membership, not an optimistic "delete accepted".
// Cached summaries survive unchanged. Only genuinely new IDs need summary reads.
export function reconcileCampaignDeletions(client:QueryClient,scope:string,active:()=>boolean=()=>true,
  api:Api={manifest:getCampaignLoadManifest,batch:getCampaignLoadBatch}):Promise<void>{
  let scopes=flights.get(client);
  if(!scopes){scopes=new Map();flights.set(client,scopes);}
  const existing=scopes.get(scope);
  if(existing){existing.again=true;existing.active=active;return existing.promise;}
  const flight:Flight={promise:Promise.resolve(),again:false,active};
  scopes.set(scope,flight);
  flight.promise=(async()=>{
    do{
      flight.again=false;
      const key=completeCampaignKey(scope),query=client.getQueryCache().find({queryKey:key,exact:true});
      if(!query||!flight.active())return;
      const current=()=>flight.active()&&client.getQueryCache().find({queryKey:key,exact:true})===query;
      // Do not seed an incomplete first load or let an older in-flight read
      // resurrect removed rows. Navigation alone must not start a complete load.
      if(query.state.fetchStatus==="fetching")await query.promise?.catch(()=>undefined);
      if(!current())return;
      const before=client.getQueryData<Campaign[]>(key);
      if(!before)return;
      const updatedAt=query.state.dataUpdatedAt,byId=new Map(before.map(c=>[c.id,c]));
      const next=await loadCompleteCampaigns(()=>{},current,{
        manifest:api.manifest,
        batch:async({ids:csv})=>{
          const ids=(csv??"").split(","),unknown=ids.filter(id=>!byId.has(id));
          const fresh=unknown.length?await api.batch({ids:unknown.join(",")}):{campaigns:[],missingIds:[]};
          // The real loader validates all returned/missing IDs and duplicates.
          return {campaigns:[...ids.flatMap(id=>{const row=byId.get(id);return row?[row]:[];}),...fresh.campaigns],missingIds:fresh.missingIds};
        },
      });
      if(!current())return;
      if(query.state.fetchStatus==="fetching"||client.getQueryData(key)!==before||query.state.dataUpdatedAt!==updatedAt){
        flight.again=true;continue;
      }
      client.setQueryData(key,next,{updatedAt});
      client.setQueryData(campaignProgressKey(scope),(old:Record<string,unknown>|undefined)=>({
        ...old,loaded:next.length,total:next.length,phase:"complete",
      }));
    }while(flight.again&&flight.active());
  })().finally(()=>{if(scopes!.get(scope)===flight)scopes!.delete(scope);});
  return flight.promise;
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
