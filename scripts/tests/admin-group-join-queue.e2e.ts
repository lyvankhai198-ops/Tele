// Imported only by the guarded disposable-PostgreSQL suite. No real Telegram calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, db } from "@workspace/db";
import { claimAdminGroupJoinBatch, deferAdminGroupJoinAccount, releaseAdminGroupJoinBatch } from "../../artifacts/api-server/src/lib/admin-group-join-queue";
import { processAccount } from "../../artifacts/api-server/src/lib/admin-group-join-worker";

export async function testAdminGroupJoinQueue() {
  const dsn = new URL(process.env.DATABASE_URL!);
  if (dsn.hostname !== "127.0.0.1" || dsn.pathname !== "/telecamp_test" || process.env.TELECAMPAIGN_E2E_ONLY !== "1")
    throw Error("E2E_UNSAFE_DATABASE_REFUSED");
  const owner = randomUUID(), account = randomUUID(), otherAccount = randomUUID();
  const groups = Array.from({length: 12}, () => randomUUID());
  const username = `queue_fixture_${owner}`;
  const oldSettings = (await pool.query("SELECT value FROM system_settings WHERE key='admin_system_settings'")).rows[0]?.value;
  const rows = async () => (await pool.query("SELECT * FROM admin_group_join_jobs WHERE telegram_account_id=$1 ORDER BY id", [account])).rows;
  const reset = async () => pool.query("UPDATE admin_group_join_jobs SET status='pending',next_attempt_at=now()-interval '1 minute',lease_token=NULL,lease_until=NULL,last_error=NULL,auto_campaign_id=NULL WHERE telegram_account_id=$1", [account]);
  try {
    await pool.query("INSERT INTO app_users(id,username,username_normalized,password_hash,role) VALUES($1,$2,$2,'fixture-no-login','admin')", [owner, username]);
    for (const id of [account, otherAccount])
      await pool.query("INSERT INTO telegram_accounts(id,owner_user_id,name,status,session_encrypted,telegram_user_id) VALUES($1::uuid,$2,'queue fixture','connected','fixture-not-a-session',$1::text)", [id, owner]);
    for (const id of groups) {
      await pool.query("INSERT INTO group_library_entries(id,telegram_id,title,username) VALUES($1::uuid,$1::text,'queue fixture',$2)", [id, `fixture_${id}`]);
      await pool.query("INSERT INTO admin_group_join_jobs(telegram_account_id,group_library_entry_id) VALUES($1,$2),($3,$2)", [account, id, otherAccount]);
    }
    let joins = 0, clients = 0;
    const flood: Parameters<typeof processAccount>[2] = {
      getAccountClient: async () => { clients++; return {client: {}} as never; },
      joinTelegramGroupWithClient: async () => { joins++; throw {seconds: 120, errorMessage: "FLOOD_WAIT_120"}; },
      disconnectQuietly: async () => {},
      syncAccountDestinations: async () => 0,
    };
    await processAccount(account, owner, flood);
    assert.equal(joins, 1, "E2E_JOIN_ONE_REQUEST_BEFORE_FLOOD");
    assert.ok((await rows()).every(j => j.status === "waiting" && !j.lease_token && new Date(j.next_attempt_at).getTime() > Date.now()),
      "E2E_JOIN_FLOOD_RELEASES_ENTIRE_BATCH_AND_ACCOUNT");
    await processAccount(account, owner, flood);
    assert.equal(clients, 1, "E2E_JOIN_ACCOUNT_WAIT_PERSISTS_WITHOUT_CLIENT");
    assert.ok((await pool.query("SELECT status FROM admin_group_join_jobs WHERE telegram_account_id=$1", [otherAccount])).rows.every(j => j.status === "pending"),
      "E2E_JOIN_WAIT_IS_ACCOUNT_SCOPED");
    // A new group added during a persisted wait must not bypass the account pause.
    await pool.query("UPDATE admin_group_join_jobs SET status='pending',next_attempt_at=now() WHERE id=(SELECT id FROM admin_group_join_jobs WHERE telegram_account_id=$1 LIMIT 1)", [account]);
    assert.equal((await claimAdminGroupJoinBatch(account, owner)).length, 0, "E2E_JOIN_NEW_JOB_CANNOT_BYPASS_WAIT");

    await reset();
    await pool.query("UPDATE admin_group_join_jobs SET status='joining',lease_token='crashed',lease_until=now()-interval '1 minute' WHERE telegram_account_id=$1", [account]);
    const recovered = await claimAdminGroupJoinBatch(account, owner);
    assert.equal(recovered.length, 5, "E2E_JOIN_RECOVERS_EXPIRED_LEASES");
    assert.equal((await rows()).filter(j => j.status === "joining").length, 5, "E2E_JOIN_OLD_ORPHANS_RETURN_TO_QUEUE");
    assert.equal((await claimAdminGroupJoinBatch(account, owner)).length, 0, "E2E_JOIN_LIVE_LEASE_CANNOT_BE_STOLEN");
    await releaseAdminGroupJoinBatch(account, recovered);
    assert.ok((await rows()).every(j => j.status === "pending" && !j.lease_token), "E2E_JOIN_REMAINDER_RELEASED_ON_EXCEPTION");

    const concurrent = await Promise.all([claimAdminGroupJoinBatch(account, owner), claimAdminGroupJoinBatch(account, owner)]);
    assert.equal(concurrent.flat().length, 5, "E2E_JOIN_CONCURRENT_WORKERS_SINGLE_BATCH");
    const owned = concurrent.flat();
    await pool.query("UPDATE admin_group_join_jobs SET lease_token='replacement' WHERE telegram_account_id=$1 AND status='joining'", [account]);
    await releaseAdminGroupJoinBatch(account, owned);
    await deferAdminGroupJoinAccount(account, owned, new Date(Date.now() + 60000), "fixture stale");
    assert.ok((await rows()).filter(j => j.status === "joining").every(j => j.lease_token === "replacement"),
      "E2E_JOIN_STALE_WORKER_CANNOT_RELEASE_NEW_CLAIM");
    assert.ok((await rows()).every(j => j.status !== "waiting"), "E2E_JOIN_STALE_WORKER_CANNOT_SET_ACCOUNT_PAUSE");
    await reset();
    const pauseClaim = await claimAdminGroupJoinBatch(account, owner);
    const longPause = new Date(Date.now() + 900000);
    await pool.query("UPDATE admin_group_join_jobs SET status='waiting',next_attempt_at=$2 WHERE telegram_account_id=$1 AND status='pending'", [account, longPause]);
    await deferAdminGroupJoinAccount(account, pauseClaim, new Date(Date.now() + 60000), "fixture pause");
    assert.ok((await rows()).some(j => new Date(j.next_attempt_at).getTime() >= longPause.getTime()), "E2E_JOIN_NEVER_SHORTENS_EXISTING_WAIT");

    await reset();
    assert.equal((await claimAdminGroupJoinBatch(account, randomUUID())).length, 0, "E2E_JOIN_OWNER_SCOPE");
    await pool.query("UPDATE app_users SET role='user' WHERE id=$1", [owner]);
    assert.equal((await claimAdminGroupJoinBatch(account, owner)).length, 0, "E2E_JOIN_CUSTOMER_NOT_AUTOMATED");
    await pool.query("UPDATE app_users SET role='admin' WHERE id=$1", [owner]);
    await pool.query("UPDATE telegram_accounts SET deleted_at=now() WHERE id=$1", [account]);
    assert.equal((await claimAdminGroupJoinBatch(account, owner)).length, 0, "E2E_JOIN_DELETED_ACCOUNT_NOT_AUTOMATED");
    await pool.query("UPDATE telegram_accounts SET deleted_at=NULL,status='disconnected' WHERE id=$1", [account]);
    assert.equal((await claimAdminGroupJoinBatch(account, owner)).length, 0, "E2E_JOIN_DISCONNECTED_ACCOUNT_NOT_AUTOMATED");
    await pool.query("UPDATE telegram_accounts SET status='connected' WHERE id=$1", [account]);

    // Real post-join code runs against a blocked destination, without Telegram.
    const firstGroup = groups[0], destination = randomUUID();
    await pool.query("INSERT INTO destinations(id,account_id,telegram_id,title,kind,can_post) VALUES($1,$2,$3,'queue fixture','group',true)", [destination, account, firstGroup]);
    await pool.query("INSERT INTO system_settings(key,value) VALUES('admin_system_settings',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [JSON.stringify({postJoinCampaign:{enabled:true,content:"fixture only",repeatCount:1,campaignStartDelaySeconds:0,roundDelayMinSeconds:1,roundDelayMaxSeconds:1,mode:"send"}})]);
    // Without changing production block semantics, exercise the existing writer.
    const { blockCampaignDestinations } = await import("../../artifacts/api-server/src/lib/campaign-destination-blocks");
    await db.transaction(async tx => blockCampaignDestinations(tx, {
      owner, account: {id:account,telegramUserId:account},
      groups:[{id:destination,telegramId:firstGroup,title:"queue fixture"}], previewId:randomUUID(),
    }));
    await pool.query("UPDATE admin_group_join_jobs SET status='failed' WHERE telegram_account_id=$1 AND group_library_entry_id<>$2", [account, firstGroup]);
    const success: Parameters<typeof processAccount>[2] = {
      ...flood, joinTelegramGroupWithClient: async () => { joins++; return {status:"joined",reason:null} as never; },
    };
    await processAccount(account, owner, success);
    const campaignCount = await pool.query("SELECT count(*)::int AS count FROM campaigns WHERE owner_user_id=$1", [owner]);
    assert.equal(campaignCount.rows[0].count, 0, "E2E_JOIN_BLOCKED_GROUP_NEVER_GETS_CAMPAIGN");
    const joined = (await rows()).find(j => j.group_library_entry_id === firstGroup);
    assert.equal(joined.status, "joined", "E2E_JOIN_COMPLETES_WITHOUT_WEB");
    await pool.query("DELETE FROM system_settings WHERE key LIKE $1", [`campaign_destination_block:${owner}:%`]);
    await pool.query("UPDATE admin_group_join_jobs SET status='pending' WHERE id=$1", [joined.id]);
    await processAccount(account, owner, success);
    const created = await pool.query("SELECT id FROM campaigns WHERE owner_user_id=$1", [owner]);
    assert.equal(created.rows.length, 1, "E2E_JOIN_RECOVERED_GROUP_CREATES_ONE_CAMPAIGN");
    await pool.query("UPDATE admin_group_join_jobs SET status='joining',lease_token='crashed-after-create',lease_until=now()-interval '1 minute' WHERE id=$1", [joined.id]);
    const beforeReplay = joins;
    await processAccount(account, owner, success);
    assert.equal(joins, beforeReplay, "E2E_JOIN_LINKED_CAMPAIGN_IS_NOT_REJOINED");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM campaigns WHERE owner_user_id=$1", [owner])).rows[0].count, 1,
      "E2E_JOIN_RECOVERY_NEVER_DUPLICATES_EXISTING_CAMPAIGN");
    console.log("E2E_JOIN_QUEUE_PASSED");
  } finally {
    if (oldSettings === undefined) await pool.query("DELETE FROM system_settings WHERE key='admin_system_settings'");
    else await pool.query("UPDATE system_settings SET value=$1 WHERE key='admin_system_settings'", [oldSettings]);
    await pool.query("DELETE FROM campaigns WHERE owner_user_id=$1", [owner]);
    await pool.query("DELETE FROM system_settings WHERE key LIKE $1", [`campaign_destination_block:${owner}:%`]);
    await pool.query("DELETE FROM telegram_accounts WHERE owner_user_id=$1", [owner]);
    await pool.query("DELETE FROM group_library_entries WHERE id=ANY($1::uuid[])", [groups]);
    await pool.query("DELETE FROM app_users WHERE id=$1", [owner]);
  }
}
