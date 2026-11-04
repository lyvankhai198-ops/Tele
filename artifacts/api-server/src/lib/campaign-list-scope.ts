import { and, eq, inArray, sql } from "drizzle-orm";
import { campaignsTable } from "@workspace/db";

export type CampaignListScope = {telegramAccountId?:string;search?:string;status?:string};
/** Ownership is mandatory; search is a literal substring, not a SQL wildcard. */
export function campaignListScope(ownerUserId:string,filter:CampaignListScope){
  const search=filter.search?.trim().toLowerCase();
  return and(
    eq(campaignsTable.ownerUserId,ownerUserId),
    ...(filter.telegramAccountId?[eq(campaignsTable.telegramAccountId,filter.telegramAccountId)]:[]),
    ...(search?[sql`position(${search} in lower(${campaignsTable.name})) > 0`]:[]),
    ...(filter.status&&filter.status!=="all"
      ?[filter.status==="completed"
        ?inArray(campaignsTable.status,["completed","completed_with_errors"])
        :eq(campaignsTable.status,filter.status)]:[]),
  );
}
