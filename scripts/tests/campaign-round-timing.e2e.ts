import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { db, pool, campaignsTable, campaignTargetsTable } from "@workspace/db";
import { campaignTimingReady, shiftPendingRoundSchedule } from "../../artifacts/api-server/src/lib/campaigns";

export async function testCampaignRoundTiming(input: {
  ownerId: string; ownerCookie: string;
  request: (path: string, cookie?: string, body?: unknown, method?: string) => Promise<Response>;
}) {
  console.log("E2E_PHASE_ROUND_TIMING");
  const {ownerId,ownerCookie,request}=input;
  const check=(condition:unknown,code:string)=>assert.ok(condition,code);
  const account=randomUUID(), template=randomUUID(), destinations=Array.from({length:6},()=>randomUUID());
  await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted) VALUES($1,$2,'round-fixture','connected','fixture-not-a-real-session')",[account,ownerId]);
  await pool.query("INSERT INTO message_templates(id,owner_user_id,name,mode,content) VALUES($1,$2,'round-fixture','text','isolated fixture')",[template,ownerId]);
  for(let i=0;i<destinations.length;i++)await pool.query(
    "INSERT INTO destinations(id,account_id,telegram_id,title,can_post) VALUES($1,$2,$3,'round-fixture',true)",
    [destinations[i],account,String(99000+i)],
  );
  const scheduledAt=new Date(Date.now()+7200000).toISOString();
  async function create(count:number,gap:number,mode:"round"|"legacy"="round") {
    const response=await request("/campaigns",ownerCookie,{
      name:"round-fixture",content:"isolated fixture",telegramAccountId:account,templateId:template,destinationIds:destinations.slice(0,count),
      scheduledAt,repeatCount:2,roundDelayMinSeconds:3600,roundDelayMaxSeconds:3600,
      ...(mode==="round"?{timingMode:"round",groupIntervalSeconds:gap}:{}),
    });
    check(response.ok,"E2E_ROUND_CREATE");
    return await response.json() as any;
  }
  async function rows(id:string) {
    return (await pool.query("SELECT * FROM campaign_targets WHERE campaign_id=$1 ORDER BY delivery_order NULLS LAST,next_attempt_at",[id])).rows;
  }
  const seconds=(items:any[])=>items.map(row=>(new Date(row.next_attempt_at).getTime()-new Date(scheduledAt).getTime())/1000);
  const single=await create(1,600);
  check(single.timingMode==="round"&&single.groupIntervalSeconds===0,"E2E_ROUND_SINGLE_NORMALIZE");
  assert.deepEqual(seconds(await rows(single.id)),[0,3600],"E2E_ROUND_SINGLE_SCHEDULE");
  const together=await create(3,0);
  assert.deepEqual(seconds(await rows(together.id)),[0,0,0,3600,3600,3600],"E2E_ROUND_SAME_BATCH");
  const spaced=await create(3,300);
  assert.deepEqual(seconds(await rows(spaced.id)),[0,300,600,4200,4500,4800],"E2E_ROUND_FIVE_MINUTES");
  const many=await create(6,600);
  check((await rows(many.id)).length===12&&many.destinationIds.length===6,"E2E_ROUND_MANY_GROUPS_ALLOWED");
  const legacy=await create(3,0,"legacy");
  const legacyRows=await rows(legacy.id);
  check(legacy.timingMode==="legacy"&&legacyRows.every(row=>row.delivery_order===null),"E2E_ROUND_LEGACY_METADATA");
  assert.deepEqual(seconds(legacyRows),[0,3600,7200,10800,14400,18000],"E2E_ROUND_LEGACY_UNCHANGED");

  // Exercise the exact SQL predicate used by the worker, without contacting Telegram.
  async function ready(id:string,at:Date) {
    return db.select({id:campaignTargetsTable.id,order:campaignTargetsTable.deliveryOrder})
      .from(campaignTargetsTable).innerJoin(campaignsTable,eq(campaignTargetsTable.campaignId,campaignsTable.id))
      .where(and(eq(campaignsTable.id,id),eq(campaignTargetsTable.status,"pending"),
        lte(campaignTargetsTable.nextAttemptAt,at),campaignTimingReady(at)))
      .orderBy(asc(campaignTargetsTable.deliveryOrder));
  }
  const start=new Date(scheduledAt), plus=(seconds:number)=>new Date(start.getTime()+seconds*1000);
  let ordered=await rows(spaced.id);
  check((await ready(spaced.id,start))[0]?.order===0,"E2E_ROUND_FIRST_ONLY");
  await pool.query("UPDATE campaign_targets SET status='pending',next_attempt_at=$2 WHERE id=$1",[ordered[0].id,plus(3600)]);
  check((await ready(spaced.id,plus(1800))).length===0,"E2E_ROUND_RETRY_NO_OVERTAKE");
  await pool.query("UPDATE campaign_targets SET status='sent',sent_at=$2,updated_at=$2 WHERE id=$1",[ordered[0].id,plus(3600)]);
  check((await ready(spaced.id,plus(3899))).length===0,"E2E_ROUND_ACTUAL_SEND_WAIT");
  check((await ready(spaced.id,plus(3900)))[0]?.order===1,"E2E_ROUND_READY_AFTER_GROUP_WAIT");
  const shifted=await shiftPendingRoundSchedule({
    campaignId:spaced.id,nextOrder:1,plannedNext:new Date(ordered[1].next_attempt_at),
    completedAt:plus(3600),waitBeforeSeconds:300,
  });
  check(shifted===5,"E2E_ROUND_SHIFT_FUTURE_ONLY");
  ordered=await rows(spaced.id);
  assert.deepEqual(seconds(ordered),[3600,3900,4200,7800,8100,8400],"E2E_ROUND_SHIFT_PRESERVES_GAPS");
  await pool.query("UPDATE campaign_targets SET status='failed',sent_at=NULL,updated_at=$2 WHERE id=$1",[ordered[1].id,plus(4000)]);
  check((await ready(spaced.id,plus(4299))).length===0,"E2E_ROUND_FAILURE_WAIT");
  check((await ready(spaced.id,plus(4300)))[0]?.order===2,"E2E_ROUND_FAILURE_ADVANCES");
  await pool.query("UPDATE campaign_targets SET status='sent',sent_at=$2,updated_at=$2 WHERE id=$1",[ordered[2].id,plus(4300)]);
  check((await ready(spaced.id,plus(7899))).length===0,"E2E_ROUND_BOUNDARY_WAIT");
  check((await ready(spaced.id,plus(7900)))[0]?.order===3,"E2E_ROUND_BOUNDARY_READY");
  check((await ready(legacy.id,plus(18000))).length===6,"E2E_ROUND_LEGACY_WORKER_UNCHANGED");

  const pause=await request(`/campaigns/${legacy.id}`,ownerCookie,{status:"paused"},"PATCH");
  check(pause.ok,"E2E_ROUND_PAUSE_BEFORE_EDIT");
  const edit=await request(`/campaigns/${legacy.id}`,ownerCookie,{name:"round-edit",timingMode:"round",groupIntervalSeconds:600},"PATCH");
  check(edit.ok,"E2E_ROUND_EXPLICIT_EDIT");
  const edited=await edit.json() as any;
  check(edited.timingMode==="round"&&edited.groupIntervalSeconds===600,"E2E_ROUND_EDIT_RELOAD_VALUES");
  assert.deepEqual(seconds(await rows(legacy.id)),[0,600,1200,4800,5400,6000],"E2E_ROUND_EDIT_REBUILDS");
  const invalid=await request("/campaigns",ownerCookie,{
    name:"invalid",content:"isolated fixture",telegramAccountId:account,templateId:template,destinationIds:destinations.slice(0,2),
    repeatCount:2,roundDelayMinSeconds:3600,roundDelayMaxSeconds:3600,timingMode:"round",groupIntervalSeconds:61,
  });
  check(invalid.status===400,"E2E_ROUND_MINUTE_CONTRACT");
  console.log("E2E_ROUND_TIMING_PASSED");
}
