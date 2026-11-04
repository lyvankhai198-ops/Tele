import { sql } from "drizzle-orm";
import { systemSettingsTable } from "@workspace/db";
import type { OperationTx } from "./operations";

type BlockStore = Pick<OperationTx, "execute" | "insert">;
const prefix = (owner: string) => `campaign_destination_block:${owner}:`;
export type BlockedGroup = { id: string; telegramId: string; title: string };

/** Both keys survive a group re-sync; the Telegram key also survives re-adding
 * the same Telegram account. No block can cross a TeleCamp owner's boundary. */
export function destinationBlockKeys(owner: string, account: {
  id: string; telegramUserId: string | null;
}, group: Pick<BlockedGroup, "id" | "telegramId">): string[] {
  const scopes = [`account:${account.id}`];
  if (account.telegramUserId) scopes.push(`telegram:${account.telegramUserId}`);
  return scopes.flatMap(scope => [
    `${prefix(owner)}${scope}:peer:${group.telegramId}`,
    `${prefix(owner)}${scope}:destination:${group.id}`,
  ]);
}

/** One indexed query, including ownership, for the worker's final send guard. */
export async function blockedCampaignDestinationIds(
  store: Pick<OperationTx, "execute">, owner: string, accountId: string, ids: string[],
): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await store.execute(sql`
    SELECT d.id FROM destinations d
    JOIN telegram_accounts a ON a.id=d.account_id
    WHERE a.owner_user_id=${owner} AND a.id=${accountId}::uuid
      AND d.id=ANY(${sql.param([...new Set(ids)])}::uuid[])
      AND EXISTS (
        SELECT 1 FROM system_settings b WHERE b.key=ANY(ARRAY[
          ${prefix(owner)}||'account:'||a.id::text||':peer:'||d.telegram_id,
          ${prefix(owner)}||'account:'||a.id::text||':destination:'||d.id::text,
          ${prefix(owner)}||'telegram:'||a.telegram_user_id||':peer:'||d.telegram_id,
          ${prefix(owner)}||'telegram:'||a.telegram_user_id||':destination:'||d.id::text
        ])
      )
  `);
  return rows.rows.map(row => String(row.id));
}

export async function assertCampaignDestinationsAllowed(
  store: Pick<OperationTx, "execute">, owner: string, accountId: string, ids: string[],
): Promise<void> {
  if ((await blockedCampaignDestinationIds(store, owner, accountId, ids)).length) {
    throw new Error("CAMPAIGN_DESTINATION_BLOCKED");
  }
}

/** Called only inside the confirmed-selection transaction, before enqueuing
 * deletion. Persisting the fence first prevents a periodic scan recreating it. */
export async function blockCampaignDestinations(store: BlockStore, input: {
  owner: string; account: { id: string; telegramUserId: string | null };
  groups: BlockedGroup[]; previewId: string;
}): Promise<void> {
  const records = new Map<string, string>();
  for (const group of input.groups) {
    const value = JSON.stringify({
      accountId: input.account.id, telegramUserId: input.account.telegramUserId,
      destinationId: group.id, telegramId: group.telegramId, title: group.title,
      previewId: input.previewId, blockedAt: new Date().toISOString(),
    });
    for (const key of destinationBlockKeys(input.owner, input.account, group)) records.set(key, value);
  }
  const values = [...records].map(([key, value]) => ({ key, value }));
  for (let start = 0; start < values.length; start += 200) {
    await store.insert(systemSettingsTable).values(values.slice(start, start + 200)).onConflictDoNothing();
  }
}
