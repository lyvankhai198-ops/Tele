import { randomUUID } from "node:crypto";
import { pool, db } from "@workspace/db";
import { blockedCampaignDestinationIds, assertCampaignDestinationsAllowed } from "../../artifacts/api-server/src/lib/campaign-destination-blocks";
import { sendTelegramMessage, forwardTelegramSavedMessage } from "../../artifacts/api-server/src/lib/telegram";
import { deletionStep } from "../../artifacts/api-server/src/lib/operation-deletion";
import { saveOperation, type OperationJob } from "../../artifacts/api-server/src/lib/operations";
import { INDEFINITE_POSTING_RESTRICTION, DATED_POSTING_RESTRICTION } from "../../artifacts/api-server/src/lib/telegram-posting-permissions";

export async function testCampaignSkippedCleanup(input: {
  ownerId: string; ownerCookie: string; otherOwnerId: string; otherCookie: string;
  request: (path: string, cookie?: string, body?: unknown, method?: string, headers?: Record<string, string>) => Promise<Response>;
}) {
  console.log("E2E_PHASE_SKIPPED_CLEANUP");
  const { ownerId, ownerCookie, otherOwnerId, otherCookie, request } = input;
  const check = (value: unknown, code: string) => { if (!value) throw Error(code); };
  const account = randomUUID(), siblingAccount = randomUUID(), foreignAccount = randomUUID();
  const telegramUserId = `cleanup-${randomUUID()}`, badPeer = `cleanup-bad-${randomUUID()}`;
  for (const [id, owner] of [[account, ownerId], [siblingAccount, ownerId], [foreignAccount, otherOwnerId]]) {
    await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted) VALUES($1,$2,'skipped-cleanup-fixture','connected','fixture-only')", [id, owner]);
  }
  await pool.query("UPDATE telegram_accounts SET telegram_user_id=$1 WHERE id=$2", [telegramUserId, account]);
  const bad = randomUUID(), uncertain = randomUUID(), ready = randomUUID(), siblingGroup = randomUUID(), foreignGroup = randomUUID();
  for (const [id, aid, peer, canPost] of [
    [bad, account, badPeer, false], [uncertain, account, `cleanup-review-${randomUUID()}`, true],
    [ready, account, `cleanup-ready-${randomUUID()}`, true], [siblingGroup, siblingAccount, badPeer, true],
    [foreignGroup, foreignAccount, badPeer, true],
  ]) await pool.query("INSERT INTO destinations(id,account_id,telegram_id,title,can_post) VALUES($1,$2,$3,'skipped-cleanup-fixture',$4)", [id, aid, peer, canPost]);
  const campaigns: string[] = [];
  async function seed(name: string, groups: string[], aid = account, owner = ownerId, status = "completed") {
    const id = randomUUID(); campaigns.push(id);
    await pool.query(`INSERT INTO campaigns(id,owner_user_id,name,content,telegram_account_id,destination_ids,status,repeat_count)
      VALUES($1,$2,$3,'fixture',$4,$5::uuid[],$6,1)`, [id, owner, `skipped-cleanup-fixture-${name}`, aid, groups, status]);
    return id;
  }
  const temporary = await seed("temporary", [bad]);
  await pool.query("UPDATE destinations SET permission_reason=$1,permission_checked_at=now() WHERE id=$2",
    [INDEFINITE_POSTING_RESTRICTION,bad]);
  const review = await seed("review", [uncertain]);
  await pool.query("INSERT INTO campaign_targets(campaign_id,destination_id,status,attempts) VALUES($1,$2,'requires_review',1)", [review, uncertain]);
  const nowReady = await seed("now-ready", [ready]);
  const missing = await seed("missing", [randomUUID()]);
  const mixed = await seed("mixed-retain-good", [bad,ready]);
  const shortGroup=randomUUID(),longGroup=randomUUID();
  for (const [id,days] of [[shortGroup,29],[longGroup,31]] as const) {
    await pool.query(`INSERT INTO destinations(id,account_id,telegram_id,title,can_post,permission_reason,permission_checked_at,restricted_until)
      VALUES($1,$2,$3,'dated-permission-fixture',false,$4,now(),now()+($5::int*interval '1 day'))`,
    [id,account,`dated-${id}`,DATED_POSTING_RESTRICTION,days]);
  }
  const short=await seed("short-keep",[shortGroup]),long=await seed("long-remove",[longGroup]);
  const sibling = await seed("sibling", [bad, ready], account, ownerId, "running");
  const legacy = await seed("legacy-account-binding", [bad], account, ownerId, "running");
  await pool.query("UPDATE campaigns SET telegram_account_id=NULL WHERE id=$1",[legacy]);
  const otherAccountCampaign = await seed("other-account", [siblingGroup], siblingAccount, ownerId, "running");
  const foreignCampaign = await seed("foreign", [foreignGroup], foreignAccount, otherOwnerId);
  for (const [id, group] of [[sibling, bad], [sibling, ready], [legacy,bad], [otherAccountCampaign, siblingGroup]]) {
    await pool.query("INSERT INTO campaign_targets(campaign_id,destination_id,status) VALUES($1,$2,'pending')", [id, group]);
  }
  const jobId = randomUUID(), sourceIds = [temporary, review, nowReady, missing,mixed,short,long];
  const jobKey = `campaign_bulk_job:${ownerId}:${jobId}`;
  await pool.query("INSERT INTO system_settings(key,value) VALUES($1,$2)", [jobKey, JSON.stringify({
    id: jobId, ownerUserId: ownerId, ids: sourceIds, cursor: sourceIds.length, status: "completed",
    updatedCount: 0, skipped: sourceIds.map(id => ({ id, name: "fixture", reason: "temporary_failure" })),
    onlySendable: true, autoDeleteInvalid: false, results: sourceIds.map(id => ({ id, name: "fixture", outcome: "skipped" })),
  })]);
  const path = `/campaigns/bulk-control/jobs/${jobId}`, snapshots: string[] = [];
  async function preview() {
    const response = await request(path + "/cleanup-preview", ownerCookie, { telegramAccountId: account });
    check(response.status === 200, "E2E_CLEANUP_PREVIEW_STATUS");
    const value = await response.json() as any; snapshots.push(value.id); return value;
  }
  const confirm = (id: string, ids: string[], cookie = ownerCookie, explicit = true) =>
    request(path + "/cleanup-confirm", cookie, { previewId: id, campaignIds: ids, confirm: explicit });
  check((await request(path + "/cleanup-preview", otherCookie, { telegramAccountId: account })).status === 404, "E2E_CLEANUP_OTHER_OWNER_PREVIEW");
  check((await request(path + "/cleanup-preview", ownerCookie, { telegramAccountId: foreignAccount })).status === 404, "E2E_CLEANUP_FOREIGN_ACCOUNT");
  const first = await preview();
  check(first.campaigns.length === 7 && first.campaigns.find((row: any) => row.id === temporary).selectable, "E2E_CLEANUP_CURRENT_CLASSIFICATION");
  check(!first.campaigns.find((row:any)=>row.id===short).selectable,"E2E_CLEANUP_SHORT_RESTRICTION_RETAINED");
  check(!first.campaigns.find((row:any)=>row.id===review).selectable,"E2E_CLEANUP_UNCERTAIN_RETAINED");
  check(first.campaigns.find((row:any)=>row.id===long).selectable,"E2E_CLEANUP_LONG_RESTRICTION_ELIGIBLE");
  check(first.campaigns.find((row:any)=>row.id===mixed).keptGroupCount===1
    && first.campaigns.find((row:any)=>row.id===mixed).groups.length===1,"E2E_CLEANUP_MIXED_ONLY_BAD_GROUP");
  check(!first.campaigns.find((row: any) => row.id === nowReady).selectable, "E2E_CLEANUP_NOW_READY_RETAINED");
  check(!first.campaigns.find((row: any) => row.id === missing).selectable, "E2E_CLEANUP_UNKNOWN_IDENTITY_NOT_GUESSED");
  check(first.campaigns.every((row: any) => !("version" in row)), "E2E_CLEANUP_PRIVATE_VERSION");
  check((await blockedCampaignDestinationIds(db, ownerId, account, [bad, uncertain])).length === 0, "E2E_CLEANUP_PREVIEW_NO_BLOCK");
  check((await confirm(first.id, [temporary], ownerCookie, false)).status === 400, "E2E_CLEANUP_EXPLICIT_CONFIRM_REQUIRED");
  check((await confirm(first.id, [temporary], otherCookie)).status === 404, "E2E_CLEANUP_OTHER_OWNER_CONFIRM");
  for (const ids of [[], [foreignCampaign], [sibling], [nowReady], [missing],[short],[review]]) {
    check((await confirm(first.id, ids)).status === 400, "E2E_CLEANUP_SELECTION_FENCE");
  }
  await pool.query("UPDATE campaigns SET updated_at=now()+interval '1 second' WHERE id=$1", [temporary]);
  check((await confirm(first.id, [temporary])).status === 409, "E2E_CLEANUP_VERSION_RECHECK");
  const expired = await preview();
  await pool.query(`UPDATE system_settings SET value=jsonb_set(value::jsonb,'{expiresAt}',to_jsonb((now()-interval '1 minute')::text))::text WHERE key=$1`,
    [`campaign_cleanup_preview:${ownerId}:${expired.id}`]);
  check((await confirm(expired.id, [temporary])).status === 409, "E2E_CLEANUP_EXPIRED");
  const final = await preview();
  const accepted = await confirm(final.id, [temporary, long,mixed]);
  check(accepted.status === 202, "E2E_CLEANUP_ACCEPTED");
  const operation = await accepted.json() as any;
  check(operation.kind === "delete_campaigns" && operation.id === final.id, "E2E_CLEANUP_DURABLE_ID");
  check(!("payload" in operation) && !("owner" in operation), "E2E_CLEANUP_PRIVATE_OPERATION");
  const repeated = await confirm(final.id, [mixed,long,temporary,temporary]);
  check(repeated.status === 202 && (await repeated.json() as any).id === operation.id, "E2E_CLEANUP_IDEMPOTENT");
  check((await confirm(final.id, [temporary])).status === 409, "E2E_CLEANUP_CONSUMED_SELECTION_IMMUTABLE");
  check((await blockedCampaignDestinationIds(db, ownerId, account, [bad,longGroup])).length === 2, "E2E_CLEANUP_BLOCK_SELECTED_GROUPS");
  check((await blockedCampaignDestinationIds(db, ownerId, account, [shortGroup,uncertain])).length===0,"E2E_CLEANUP_NO_SHORT_OR_UNCERTAIN_BLOCK");
  check((await pool.query("SELECT destination_ids FROM campaigns WHERE id=$1",[mixed])).rows[0].destination_ids.join()===ready,
    "E2E_CLEANUP_MIXED_VALID_GROUP_RETAINED");
  check((await blockedCampaignDestinationIds(db, ownerId, account, [ready])).length === 0, "E2E_CLEANUP_KEEP_UNSELECTED_GROUP");
  check((await blockedCampaignDestinationIds(db, ownerId, siblingAccount, [siblingGroup])).length === 0, "E2E_CLEANUP_SAME_PEER_OTHER_ACCOUNT");
  check((await blockedCampaignDestinationIds(db, otherOwnerId, foreignAccount, [foreignGroup])).length === 0, "E2E_CLEANUP_SAME_PEER_OTHER_OWNER");
  const pending = (await pool.query("SELECT campaign_id,destination_id,status FROM campaign_targets WHERE campaign_id=ANY($1::uuid[])", [[sibling, legacy, otherAccountCampaign]])).rows;
  check(pending.find(row => row.destination_id === bad).status === "cancelled"
    && pending.find(row => row.destination_id === ready).status === "pending"
    && pending.find(row => row.destination_id === siblingGroup).status === "pending", "E2E_CLEANUP_PENDING_SEND_SCOPE");
  check(pending.find(row=>row.campaign_id===legacy).status==="cancelled","E2E_CLEANUP_LEGACY_DESTINATION_ACCOUNT_SCOPE");
  const operationKey = `telecamp_operation:${ownerId}:${operation.id}`;
  // Read the real owner-bound operation rather than building a test-only payload.
  const stored = (await pool.query("SELECT key,value FROM system_settings WHERE key=$1", [operationKey])).rows[0];
  check(Boolean(stored), "E2E_CLEANUP_STORED_OPERATION");
  const deletion = JSON.parse(stored.value) as OperationJob;
  check(deletion.payload.snapshotIds.slice().sort().join() === [temporary,long].sort().join(), "E2E_CLEANUP_EXACT_SNAPSHOT");
  for (let pass = 0; pass < 30; pass++) {
    const done = await db.transaction(async tx => {
      const finished = await deletionStep(tx, deletion);
      deletion.state = finished ? "completed" : "running";
      await saveOperation(tx, deletion);
      return finished;
    });
    if (done) break;
  }
  check(deletion.state === "completed", "E2E_CLEANUP_DELETE_COMPLETED");
  check((await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])", [[temporary,long]])).rowCount === 0, "E2E_CLEANUP_SELECTED_DELETED");
  check((await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])",[[review,short,mixed]])).rowCount===3,"E2E_CLEANUP_RETAIN_VALID_SHORT_UNCERTAIN");
  check((await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])", [[nowReady, missing, sibling, legacy, otherAccountCampaign, foreignCampaign]])).rowCount === 6, "E2E_CLEANUP_UNSELECTED_RETAINED");
  const resynced = randomUUID();
  await pool.query("INSERT INTO destinations(id,account_id,telegram_id,title,can_post,topic_id) VALUES($1,$2,$3,'resynced-fixture',true,42)", [resynced, account, badPeer]);
  check((await blockedCampaignDestinationIds(db, ownerId, account, [resynced])).length === 1, "E2E_CLEANUP_RESYNC_PEER_FENCE");
  for (const send of [
    () => sendTelegramMessage(account, resynced, "fixture", ownerId),
    () => forwardTelegramSavedMessage(account, resynced, "1", ownerId),
  ]) {
    let blocked = false; try { await send(); } catch (error) { blocked = error instanceof Error && error.message === "CAMPAIGN_DESTINATION_BLOCKED"; }
    check(blocked, "E2E_CLEANUP_NO_TELEGRAM_IO_AFTER_BLOCK");
  }
  await assertCampaignDestinationsAllowed(db, ownerId, siblingAccount, [siblingGroup]);
  await pool.query("UPDATE telegram_accounts SET telegram_user_id=NULL WHERE id=$1", [account]);
  const readded = randomUUID(), readdedGroup = randomUUID();
  await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status,telegram_user_id) VALUES($1,$2,'readded-fixture','connected',$3)", [readded, ownerId, telegramUserId]);
  await pool.query("INSERT INTO destinations(id,account_id,telegram_id,title,can_post) VALUES($1,$2,$3,'readded-fixture',true)", [readdedGroup, readded, badPeer]);
  check((await blockedCampaignDestinationIds(db, ownerId, readded, [readdedGroup])).length === 1, "E2E_CLEANUP_RECONNECT_ACCOUNT_FENCE");
  const partialOnly=await seed("partial-only-retain",[bad,ready]);
  const persisted=(await pool.query("SELECT value FROM system_settings WHERE key=$1",[jobKey])).rows[0];
  const sourceJob=JSON.parse(persisted.value);
  sourceJob.ids.push(partialOnly);sourceJob.skipped.push({...sourceJob.skipped[0],id:partialOnly});
  sourceJob.results.push({...sourceJob.results[0],sourceId:partialOnly});
  await pool.query("UPDATE system_settings SET value=$2 WHERE key=$1",[jobKey,JSON.stringify(sourceJob)]);
  const partialPreview=await preview();
  const partialResponse=await confirm(partialPreview.id,[partialOnly]);
  const partialOperation=(await partialResponse.json() as any).operation;
  check(partialResponse.status===202 && partialOperation.state==="completed" && partialOperation.unit==="groups",
    "E2E_CLEANUP_PARTIAL_ONLY_ALREADY_COMPLETED");
  check((await pool.query("SELECT destination_ids FROM campaigns WHERE id=$1",[partialOnly])).rows[0].destination_ids.join()===ready,
    "E2E_CLEANUP_PARTIAL_ONLY_PRESERVES_CAMPAIGN");
  const emptyDelete=(await pool.query("SELECT value FROM system_settings WHERE key=$1",
    [`telecamp_operation:${ownerId}:${partialOperation.id}`])).rows[0];
  check(JSON.parse(emptyDelete.value).payload.snapshotIds.length===0,"E2E_CLEANUP_EMPTY_DELETE_SCOPE_NEVER_BROADENS");
  await pool.query("DELETE FROM system_settings WHERE key=$1",[`telecamp_operation:${ownerId}:${partialOperation.id}`]);
  await pool.query("DELETE FROM campaigns WHERE id=ANY($1::uuid[])", [campaigns]);
  await pool.query("DELETE FROM telegram_accounts WHERE id=ANY($1::uuid[])", [[account, siblingAccount, foreignAccount, readded]]);
  await pool.query("DELETE FROM system_settings WHERE key=ANY($1::text[]) OR (key LIKE $2 AND value::jsonb->>'previewId'=$3)",
    [[jobKey, stored.key, operationKey, ...snapshots.map(id => `campaign_cleanup_preview:${ownerId}:${id}`)],
      `campaign_destination_block:${ownerId}:%`, final.id]);
}
