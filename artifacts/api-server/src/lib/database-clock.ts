import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Use PostgreSQL's clock for decisions that depend on persisted timestamps.
 * This keeps a worker's subscription check consistent with the database that
 * stores the subscription expiry.
 */
export async function getDatabaseNow(): Promise<Date> {
  const result = await db.execute<{ now: Date | string }>(sql`SELECT now() AS now`);
  const rawNow = result.rows[0]?.now;
  const now = rawNow instanceof Date ? rawNow : new Date(rawNow);
  if (Number.isNaN(now.getTime())) {
    throw new Error("Database did not return a valid current timestamp.");
  }
  return now;
}