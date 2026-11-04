import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { deleteTelegramAccountData } from "../../artifacts/api-server/src/lib/delete-telegram-account";
import { processNextCampaignTarget } from "../../artifacts/api-server/src/lib/campaigns";

export async function testTelegramAccountDeletion(input: {
  ownerId: string; ownerCookie: string;
  request: (path: string, cookie?: string, body?: unknown, method?: string) => Promise<Response>;
}) {
  console.log("E2E_PHASE_ACCOUNT_DELETE");
  const { ownerId, ownerCookie, request } = input;
  const check = (value: unknown, code: string) => assert.ok(value, code);
  const account = randomUUID(), other = randomUUID(), foreign = randomUUID();
  const group = randomUUID(), otherGroup = randomUUID(), foreignGroup = randomUUID();
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const kept = randomUUID(), foreignCampaign = randomUUID();
  const log = randomUUID();
  for (const [id, owner] of [[account, ownerId], [other, ownerId], [foreign, randomUUID()]]) {
    await pool.query(`INSERT INTO telegram_accounts
      (id,owner_user_id,name,status,api_hash_encrypted,phone_encrypted,session_encrypted)
      VALUES($1,$2,'delete-fixture','connected','fixture','fixture','fixture')`, [id, owner]);
  }
  // Same Telegram group connected through two accounts must remain separate.
  for (const [id, accountId] of [[group, account], [otherGroup, other], [foreignGroup, foreign]]) {
    await pool.query(`INSERT INTO destinations(id,account_id,telegram_id,title,can_post)
      VALUES($1,$2,'same-shared-telegram-group','delete-fixture',true)`, [id, accountId]);
  }
  for (let i = 0; i < ids.length; i++) {
    await pool.query(`INSERT INTO campaigns
      (id,owner_user_id,name,telegram_account_id,status,destination_ids)
      VALUES($1,$2,'delete-fixture',$3,$4,$5::uuid[])`,
    [ids[i], ownerId, i < 3 ? account : null,
      ["running", "paused", "completed", "draft", "completed"][i], i === 4 ? null : [group]]);
    if (i !== 3) await pool.query(`INSERT INTO campaign_targets
      (campaign_id,destination_id,status) VALUES($1,$2,$3)`,
    [ids[i], group, i === 2 || i === 4 ? "sent" : "pending"]);
  }
  await pool.query(`INSERT INTO campaigns(id,owner_user_id,name,telegram_account_id,status,destination_ids,template_source_account_id)
    VALUES($1,$2,'keep-fixture',$3,'paused',$4::uuid[],$5)`,
  [kept, ownerId, other, [otherGroup], account]);
  await pool.query(`INSERT INTO campaign_targets(campaign_id,destination_id,status)
    VALUES($1,$2,'pending')`, [kept, otherGroup]);
  await pool.query(`INSERT INTO activity_logs(id,owner_user_id,event,message,campaign_id)
    VALUES($1,$2,'fixture','fixture',$3)`, [log, ownerId, ids[0]]);

  check((await request(`/telegram/accounts/${foreign}`, ownerCookie, {}, "DELETE")).status === 404,
    "E2E_ACCOUNT_DELETE_OWNER_GUARD");
  check((await request(`/telegram/accounts/${account}`, undefined, {}, "DELETE")).status === 401,
    "E2E_ACCOUNT_DELETE_AUTH_GUARD");
  await pool.query("UPDATE telegram_accounts SET delivery_lease_until=NOW()+INTERVAL '2 minutes' WHERE id=$1", [account]);
  check((await request(`/telegram/accounts/${account}`, ownerCookie, {}, "DELETE")).status === 409,
    "E2E_ACCOUNT_DELETE_LIVE_SEND_BUSY");
  check((await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])", [ids])).rowCount === 5,
    "E2E_ACCOUNT_DELETE_BUSY_PRESERVES");
  await pool.query("UPDATE telegram_accounts SET delivery_lease_until=NULL WHERE id=$1", [account]);

  // Corrupt cross-owner references must roll back, never delete another owner's
  // campaign or leave this owner's campaigns partially removed.
  await pool.query(`INSERT INTO campaigns(id,owner_user_id,name,status)
    VALUES($1,'foreign-fixture','foreign-fixture','paused')`, [foreignCampaign]);
  await pool.query(`INSERT INTO campaign_targets(campaign_id,destination_id,status)
    VALUES($1,$2,'pending')`, [foreignCampaign, group]);
  await assert.rejects(() => deleteTelegramAccountData(account, ownerId));
  check((await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])", [ids])).rowCount === 5,
    "E2E_ACCOUNT_DELETE_ATOMIC_ROLLBACK");
  check((await pool.query("SELECT id FROM telegram_accounts WHERE id=$1 AND deleted_at IS NULL", [account])).rowCount === 1,
    "E2E_ACCOUNT_DELETE_ATOMIC_ACCOUNT");
  await pool.query("DELETE FROM campaigns WHERE id=$1", [foreignCampaign]);

  check((await request(`/telegram/accounts/${account}`, ownerCookie, {}, "DELETE")).ok,
    "E2E_ACCOUNT_DELETE_HTTP_SUCCESS");
  check((await pool.query("SELECT id FROM campaigns WHERE id=ANY($1::uuid[])", [ids])).rowCount === 0,
    "E2E_ACCOUNT_DELETE_ALL_CAMPAIGN_STATES");
  check((await pool.query("SELECT id FROM campaign_targets WHERE destination_id=$1", [group])).rowCount === 0,
    "E2E_ACCOUNT_DELETE_TARGETS");
  check((await pool.query("SELECT id FROM destinations WHERE account_id=$1", [account])).rowCount === 0,
    "E2E_ACCOUNT_DELETE_GROUPS");
  const [tombstone] = (await pool.query("SELECT * FROM telegram_accounts WHERE id=$1", [account])).rows;
  check(tombstone.deleted_at && tombstone.status === "deleted" && !tombstone.api_hash_encrypted &&
    !tombstone.phone_encrypted && !tombstone.session_encrypted, "E2E_ACCOUNT_DELETE_CREDENTIALS");
  check((await pool.query("SELECT id FROM campaigns WHERE id=$1", [kept])).rowCount === 1 &&
    (await pool.query("SELECT id FROM campaign_targets WHERE campaign_id=$1", [kept])).rowCount === 1 &&
    (await pool.query("SELECT id FROM destinations WHERE id=ANY($1::uuid[])", [[otherGroup, foreignGroup]])).rowCount === 2,
    "E2E_ACCOUNT_DELETE_OTHER_ACCOUNTS_UNCHANGED");
  check((await pool.query("SELECT id FROM activity_logs WHERE id=$1 AND campaign_id IS NULL", [log])).rowCount === 1,
    "E2E_ACCOUNT_DELETE_LOG_POLICY_RETAINED");
  check(!await processNextCampaignTarget(account), "E2E_ACCOUNT_DELETE_WORKER_NO_SEND");
  check((await request(`/telegram/accounts/${account}`, ownerCookie, {}, "DELETE")).status === 404,
    "E2E_ACCOUNT_DELETE_REPEAT_SAFE");
  console.log("E2E_ACCOUNT_DELETE_PASSED");
}
