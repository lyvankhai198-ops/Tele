import { and, count, eq, sql } from "drizzle-orm";
import {
  activityLogsTable,
  db,
  userDailyMessageQuotasTable,
} from "@workspace/db";

export type UserDailyQuotaReservation = {
  quotaDate: string;
};

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value;
}

export function localQuotaDate(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = part(parts, "year");
  const month = part(parts, "month");
  const day = part(parts, "day");
  if (!year || !month || !day) throw new Error("Unable to determine the local quota date.");
  return `${year}-${month}-${day}`;
}

/**
 * Creates one durable reservation before contacting Telegram. The first
 * reservation of a day seeds the ledger from existing sent activity, keeping
 * a deployment during the day from granting a second allowance.
 */
export async function reserveUserDailyQuota(input: {
  ownerUserId: string;
  limit: number;
  timezone: string;
  reservedAt: Date;
}): Promise<UserDailyQuotaReservation | null> {
  const quotaDate = localQuotaDate(input.timezone, input.reservedAt);
  const result = await db.execute(sql`
    INSERT INTO ${userDailyMessageQuotasTable} (
      ${userDailyMessageQuotasTable.ownerUserId},
      ${userDailyMessageQuotasTable.quotaDate},
      ${userDailyMessageQuotasTable.reservedCount},
      ${userDailyMessageQuotasTable.createdAt},
      ${userDailyMessageQuotasTable.updatedAt}
    )
    SELECT
      ${input.ownerUserId},
      ${quotaDate},
      COUNT(*)::integer + 1,
      NOW(),
      NOW()
    FROM ${activityLogsTable}
    WHERE ${activityLogsTable.ownerUserId} = ${input.ownerUserId}
      AND ${activityLogsTable.event} = 'campaign.target.sent'
      AND (${activityLogsTable.createdAt} AT TIME ZONE ${input.timezone})::date = ${quotaDate}::date
    HAVING COUNT(*) < ${input.limit}
    ON CONFLICT (${userDailyMessageQuotasTable.ownerUserId}, ${userDailyMessageQuotasTable.quotaDate})
    DO UPDATE SET
      ${userDailyMessageQuotasTable.reservedCount} = ${userDailyMessageQuotasTable.reservedCount} + 1,
      ${userDailyMessageQuotasTable.updatedAt} = NOW()
    WHERE ${userDailyMessageQuotasTable.reservedCount} < ${input.limit}
    RETURNING ${userDailyMessageQuotasTable.quotaDate}
  `);
  return result.rows.length > 0 ? { quotaDate } : null;
}

/**
 * Release only a delivery with a known pre-acceptance rejection. Unknown or
 * accepted deliveries intentionally retain their reservation.
 */
export async function releaseUserDailyQuota(input: {
  ownerUserId: string;
  quotaDate: string;
}): Promise<void> {
  await db.update(userDailyMessageQuotasTable).set({
    reservedCount: sql`GREATEST(${userDailyMessageQuotasTable.reservedCount} - 1, 0)`,
    updatedAt: new Date(),
  }).where(and(
    eq(userDailyMessageQuotasTable.ownerUserId, input.ownerUserId),
    eq(userDailyMessageQuotasTable.quotaDate, input.quotaDate),
  ));
}

export async function getUserDailyQuotaUsage(input: {
  ownerUserId: string;
  timezone: string;
}): Promise<number> {
  const quotaDate = localQuotaDate(input.timezone);
  const [stored] = await db.select({ value: userDailyMessageQuotasTable.reservedCount })
    .from(userDailyMessageQuotasTable)
    .where(and(
      eq(userDailyMessageQuotasTable.ownerUserId, input.ownerUserId),
      eq(userDailyMessageQuotasTable.quotaDate, quotaDate),
    ))
    .limit(1);
  if (stored) return stored.value;

  const [sent] = await db.select({ value: count() }).from(activityLogsTable)
    .where(and(
      eq(activityLogsTable.ownerUserId, input.ownerUserId),
      eq(activityLogsTable.event, "campaign.target.sent"),
      sql`(${activityLogsTable.createdAt} AT TIME ZONE ${input.timezone})::date = ${quotaDate}::date`,
    ));
  return sent?.value ?? 0;
}