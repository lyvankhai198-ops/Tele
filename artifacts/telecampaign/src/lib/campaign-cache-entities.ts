import type { QueryClient } from "@tanstack/react-query";
import { getListCampaignsQueryKey, type Campaign } from "@workspace/api-client-react";

type Changes={sequence:number;rows:Map<string,{sequence:number;row:Campaign}>};
const changes=new WeakMap<QueryClient,Map<string,Changes>>();
function state(client:QueryClient,scope:string){
  let scopes=changes.get(client);if(!scopes){scopes=new Map();changes.set(client,scopes);}
  let value=scopes.get(scope);if(!value){value={sequence:0,rows:new Map()};scopes.set(scope,value);}
  return value;
}
export function campaignChangeSequence(client:QueryClient,scope:string){return state(client,scope).sequence;}
export function mergeCampaignChanges(client:QueryClient,scope:string,account:string,rows:Campaign[],since:number){
  const map=new Map(rows.map(row=>[row.id,row]));
  for(const {sequence,row} of state(client,scope).rows.values()){
    if(sequence<=since)continue;
    if(!account||row.telegramAccountId===account)map.set(row.id,row);else map.delete(row.id);
  }
  return [...map.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
/** Patch only complete snapshots; mutations during first load are overlaid on completion. */
export function patchCampaignCaches(client:QueryClient,scope:string,rows:Campaign[]){
  const value=state(client,scope);
  for(const row of rows)value.rows.set(row.id,{sequence:++value.sequence,row});
  for(const query of client.getQueryCache().findAll({queryKey:[...getListCampaignsQueryKey(),"complete-load",scope]})){
    if(!Array.isArray(query.state.data))continue;
    const account=String(query.queryKey[3]??"");
    client.setQueryData<Campaign[]>(query.queryKey,old=>mergeCampaignChanges(client,scope,account,old??[],value.sequence-rows.length));
  }
}
