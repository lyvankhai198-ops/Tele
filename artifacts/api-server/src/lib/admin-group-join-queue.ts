import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type AdminGroupJoinClaim = {
  id: string;
  groupId: string;
  groupTitle: string;
  groupTelegramId: string;
  username: string | null;
  telegramLink: string | null;
  leaseToken: string;
};

const LEASE_MS = 10 * 60_000;

/** A short DB lock serializes claiming, not Telegram requests or open browser sessions. */
export async function claimAdminGroupJoinBatch(accountId: string, ownerUserId: string, now = new Date()) {
  return db.transaction(async (tx): Promise<AdminGroupJoinClaim[]> => {
    const lock = await tx.execute<{ locked: boolean }>(sql`
      SELECT pg_try_advisory_xact_lock(174645, hashtext(${accountId})) AS locked
    `);
    if (!lock.rows[0]?.locked) return [];
    const eligible = await tx.execute(sql`
      SELECT 1 FROM telegram_accounts a JOIN app_users u ON a.owner_user_id = u.id::text
      WHERE a.id = ${accountId}::uuid AND a.owner_user_id = ${ownerUserId}
        AND u.role = 'admin' AND a.deleted_at IS NULL AND a.status = 'connected'
        AND a.session_encrypted IS NOT NULL AND a.telegram_user_id IS NOT NULL
    `);
    if (!eligible.rows.length) return [];

    // Waiting is account-scoped. Keep the longest persisted wait across restarts,
    // including the existing FloodWait rows created by older versions.
    const pause = await tx.execute<{ milliseconds: string | null }>(sql`
      SELECT (extract(epoch FROM max(next_attempt_at)) * 1000)::text AS milliseconds
      FROM admin_group_join_jobs
      WHERE telegram_account_id = ${accountId}::uuid AND status = 'waiting'
        AND next_attempt_at > ${now}
    `);
    const resumeAt = new Date(Math.max(now.getTime(), Number(pause.rows[0]?.milliseconds ?? 0)));
    await tx.execute(sql`
      UPDATE admin_group_join_jobs
      SET status = CASE WHEN auto_campaign_id IS NULL THEN 'pending' ELSE 'joined' END,
          next_attempt_at = GREATEST(next_attempt_at, ${resumeAt}),
          lease_token = NULL, lease_until = NULL, updated_at = ${now}
      WHERE telegram_account_id = ${accountId}::uuid AND status = 'joining'
        AND (lease_until IS NULL OR lease_until <= ${now})
    `);
    if (resumeAt.getTime() > now.getTime()) return [];
    const active = await tx.execute(sql`
      SELECT 1 FROM admin_group_join_jobs
      WHERE telegram_account_id = ${accountId}::uuid AND status = 'joining'
        AND lease_until > ${now} LIMIT 1
    `);
    if (active.rows.length) return [];

    const leaseToken = randomUUID();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const claimed = await tx.execute<AdminGroupJoinClaim>(sql`
      WITH chosen AS (
        SELECT j.id FROM admin_group_join_jobs j
        JOIN group_library_entries g ON g.id = j.group_library_entry_id
        WHERE j.telegram_account_id = ${accountId}::uuid
          AND j.status IN ('pending', 'waiting') AND j.auto_campaign_id IS NULL
          AND j.next_attempt_at <= ${now}
          AND (j.lease_until IS NULL OR j.lease_until <= ${now})
        ORDER BY j.next_attempt_at, j.id LIMIT 5 FOR UPDATE OF j SKIP LOCKED
      )
      UPDATE admin_group_join_jobs j
      SET status = 'joining', attempt_count = j.attempt_count + 1,
          last_attempt_at = ${now}, lease_token = ${leaseToken},
          lease_until = ${leaseUntil}, updated_at = ${now}
      FROM chosen, group_library_entries g
      WHERE j.id = chosen.id AND g.id = j.group_library_entry_id
      RETURNING j.id, g.id AS "groupId", g.title AS "groupTitle",
        g.telegram_id AS "groupTelegramId", g.username,
        NULL::text AS "telegramLink", j.lease_token AS "leaseToken"
    `);
    return claimed.rows;
  });
}

/** Fence the update by this batch's tokens; never release another worker's claim. */
export async function deferAdminGroupJoinAccount(
  accountId: string, claims: AdminGroupJoinClaim[], until: Date, reason: string,
) {
  if (!claims.length) return;
  const tokens = sql.join([...new Set(claims.map((claim) => claim.leaseToken))].map((token) => sql`${token}`), sql`, `);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(174645, hashtext(${accountId}))`);
    const owned = await tx.execute(sql`
      SELECT 1 FROM admin_group_join_jobs WHERE telegram_account_id = ${accountId}::uuid
        AND status = 'joining' AND lease_token IN (${tokens}) LIMIT 1
    `);
    if (!owned.rows.length) return;
    await tx.execute(sql`
      UPDATE admin_group_join_jobs
      SET status = 'waiting', next_attempt_at = GREATEST(next_attempt_at, ${until}),
          last_error = ${reason}, lease_token = NULL, lease_until = NULL, updated_at = now()
      WHERE telegram_account_id = ${accountId}::uuid AND auto_campaign_id IS NULL
        AND (status IN ('pending', 'waiting') OR (status = 'joining' AND lease_token IN (${tokens})))
    `);
  });
}

export async function releaseAdminGroupJoinBatch(accountId: string, claims: AdminGroupJoinClaim[]) {
  if (!claims.length) return;
  const tokens = sql.join([...new Set(claims.map((claim) => claim.leaseToken))].map((token) => sql`${token}`), sql`, `);
  await db.execute(sql`
    UPDATE admin_group_join_jobs
    SET status = CASE WHEN auto_campaign_id IS NULL THEN 'pending' ELSE 'joined' END,
        lease_token = NULL, lease_until = NULL, updated_at = now()
    WHERE telegram_account_id = ${accountId}::uuid AND status = 'joining'
      AND lease_token IN (${tokens})
  `);
}
