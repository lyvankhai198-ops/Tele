import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { telegramPostingPermissionSnapshot } from "../../artifacts/api-server/src/lib/telegram-posting-permissions.ts";
import {
  destinationIdsToMarkUnavailableAfterSync, isLeftTelegramEntity,
  UNAVAILABLE_TELEGRAM_DESTINATION_REASON as missing,
} from "../../artifacts/api-server/src/lib/telegram-destination-state.ts";

// Exercise the actual sync function with deterministic Telegram/DB adapters,
// without importing a client capable of contacting Telegram or customer data.
const source=fs.readFileSync(new URL("../../artifacts/api-server/src/lib/telegram.ts",import.meta.url),"utf8");
const start=source.indexOf("export async function syncAccountDestinations(");
const end=source.indexOf("\nfunction toTelegramSavedMessage(",start);
assert.ok(start>=0 && end>start);
const actual=stripTypeScriptTypes(source.slice(start,end).replace(/^export /,""),{mode:"transform"});
const columns=Object.fromEntries(["id","accountId","telegramId","topicId","permissionCheckedAt"].map(key=>[key,key]));
const accountTable={id:"id"};
const eq=(key,value)=>row=>row[key]===value;
const and=(...predicates)=>row=>predicates.every(p=>p(row));
const or=(...predicates)=>row=>predicates.some(p=>p(row));
function row(id,telegramId,topicId=null,accountId="one") {
  return {id,telegramId,topicId,accountId,canPost:true,permissionReason:"Posting permission available",
    permissionCheckedAt:new Date("2026-01-01Z")};
}
function fixture(rows,dialogs,options={}) {
  const state={rows,disconnected:false,events:[],accounts:[{id:"one"},{id:"two"}]};
  const db={
    select:()=>({from:table=>({where:predicate=>(table===columns?state.rows:state.accounts).filter(predicate)})}),
    update:table=>({set:values=>({where:async predicate=>{
      for(const stored of table===columns?state.rows:state.accounts) if(predicate(stored)) Object.assign(stored,values);
    }})}),
    insert:()=>({values:async values=>state.rows.push({id:"insert-"+state.rows.length,...values})}),
    delete:()=>assert.fail("Sync must not delete groups or history"),
  };
  const client={
    async *iterDialogs() {
      for(const entity of dialogs) {
        yield {entity,inputEntity:entity};
        if(options.failAfterFirst) throw Error("fixture incomplete dialogs");
      }
      options.afterDialogs?.(state);
    },
    async disconnect(){state.disconnected=true;},
  };
  const fn=vm.runInNewContext(actual+";\nsyncAccountDestinations;",{
    db,destinationsTable:columns,telegramAccountsTable:accountTable,
    eq,and,or,isNull:key=>row=>row[key]===null||row[key]===undefined,
    inArray:(key,values)=>row=>values.includes(row[key]),
    lte:(key,value)=>row=>row[key]<=value,
    destinationIdsToMarkUnavailableAfterSync,isLeftTelegramEntity,UNAVAILABLE_TELEGRAM_DESTINATION_REASON:missing,
    getAccountClient:async()=>({client,account:{id:"one",ownerUserId:"owner-one"}}),
    telegramId:entity=>String(entity.id),displayTitle:entity=>entity.title??"Fixture",
    telegramPostingPermissionSnapshot,canPostToEntity:entity=>entity.canPost!==false,postingRestrictionUntil:()=>null,
    listForumTopics:async()=>{if(options.topicError)throw Error("fixture topic failure");return options.topics??[];},
    recordActivity:async event=>state.events.push(event),
    isTelegramSessionRevoked:()=>false,invalidateTelegramSession:()=>assert.fail("Not a revoked session"),
    logger:{warn(){}},
  });
  return {state,sync:()=>fn("one")};
}
test("completed sync hides absent groups, including topics, only for that account",async()=>{
  const f=fixture([row("gone","1"),row("gone-topic","1",10),row("here","2"),row("other","1",null,"two")],
    [{id:2,megagroup:true}]);
  assert.equal(await f.sync(),1);
  assert.equal(f.state.rows[0].permissionReason,missing);
  assert.equal(f.state.rows[1].permissionReason,missing);
  assert.notEqual(f.state.rows[2].permissionReason,missing);
  assert.notEqual(f.state.rows[3].permissionReason,missing);
  assert.equal(f.state.rows.length,4);
  assert.ok(f.state.disconnected);
});
test("explicit left/kicked/forbidden dialogs cannot be re-added as current memberships",async()=>{
  for(const entity of [{left:true},{kicked:true},{className:"ChatForbidden"},{className:"ChannelForbidden"}]) {
    const f=fixture([row("gone","1")],[{id:1,megagroup:true,...entity}]);
    assert.equal(await f.sync(),0);
    assert.equal(f.state.rows[0].permissionReason,missing);
  }
});
test("posting restrictions alone do not remove a group",async()=>{
  const f=fixture([row("restricted","1")],[{id:1,megagroup:true,bannedRights:{sendPlain:true,untilDate:0}}]);
  await f.sync();
  assert.equal(f.state.rows[0].canPost,false);
  assert.notEqual(f.state.rows[0].permissionReason,missing);
});
test("partial or failed Telegram traversal never prunes the unseen groups",async()=>{
  const f=fixture([row("here","1"),row("unknown","2")],[{id:1,megagroup:true}],{failAfterFirst:true});
  await assert.rejects(f.sync(),/incomplete dialogs/);
  assert.notEqual(f.state.rows[1].permissionReason,missing);
  assert.equal(f.state.events.length,0);
  assert.ok(f.state.disconnected);
});
test("failed forum-topic sync retains old topics; verified missing topics are hidden",async()=>{
  for(const topicError of [true,false]) {
    const f=fixture([row("parent","1"),row("topic","1",10)],[{id:1,megagroup:true,forum:true}],{topicError});
    await f.sync();
    assert.equal(f.state.rows[1].permissionReason===missing,!topicError);
    assert.notEqual(f.state.rows[0].permissionReason,missing);
  }
});
test("rejoining restores the same destination ID, preserving history references",async()=>{
  const old={...row("original-id","1"),canPost:false,permissionReason:missing};
  const f=fixture([old],[{id:1,megagroup:true}]);
  await f.sync();
  assert.equal(f.state.rows.length,1);
  assert.equal(f.state.rows[0].id,"original-id");
  assert.equal(f.state.rows[0].canPost,true);
  assert.notEqual(f.state.rows[0].permissionReason,missing);
});
test("an older sync cannot hide membership verified by a newer sync",async()=>{
  const f=fixture([row("fresh","1")],[],{afterDialogs:state=>{
    state.rows[0].permissionCheckedAt=new Date(Date.now()+60000);
    state.rows[0].permissionReason="Posting permission available";
  }});
  await f.sync();
  assert.notEqual(f.state.rows[0].permissionReason,missing);
});
test("a fully successful empty dialog list removes all old memberships from view",async()=>{
  const f=fixture([row("gone","1")],[]);
  await f.sync();
  assert.equal(f.state.rows[0].permissionReason,missing);
});

const groupsSource=fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/groups.tsx",import.meta.url),"utf8");
const syncStart=groupsSource.indexOf("const syncAll = () => {");
const syncEnd=groupsSource.indexOf("\n  };",syncStart)+5;
assert.ok(syncStart>=0 && syncEnd>syncStart);
const actualSyncAll=stripTypeScriptTypes(groupsSource.slice(syncStart,syncEnd),{mode:"transform"});
for(const failures of [0,1,2]) {
  test(`group sync refreshes shared destinations/account caches even with ${failures} failed accounts`,async()=>{
    const state={invalidations:[],toast:null,selected:{id:"gone"}};
    const run=vm.runInNewContext(actualSyncAll+";\nsyncAll;",{
      accounts:{data:[{id:"first",status:"connected"},{id:"second",status:"connected"}]},
      sync:{mutateAsync:async({accountId})=>{
        if(failures===2 || failures===1&&accountId==="second")throw Error("fixture failure");
        return {count:1};
      }},
      queryClient:{
        invalidateQueries:async({queryKey})=>state.invalidations.push(queryKey[0]),
        getQueryData:()=>[{id:"live"}],
      },
      getListDestinationsQueryKey:()=>["destinations"],getListTelegramAccountsQueryKey:()=>["accounts"],
      setSelected:fn=>{state.selected=fn(state.selected);},
      setToast:value=>{state.toast=value;},
      copy:{syncDone:"done",syncError:"failed",noAccountToast:"none"},vi:true,
    });
    run();
    await new Promise(setImmediate);
    assert.deepEqual(state.invalidations,["destinations","accounts"]);
    assert.equal(state.selected,null);
    if(failures===1)assert.match(state.toast,/Một số tài khoản/);
    else assert.equal(state.toast,failures===0?"done":"failed");
  });
}
