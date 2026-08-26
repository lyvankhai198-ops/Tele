import {
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userDailyMessageQuotasTable = pgTable("user_daily_message_quotas", {
  ownerUserId: text("owner_user_id").notNull(),
  quotaDate: date("quota_date", { mode: "string" }).notNull(),
  reservedCount: integer("reserved_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.ownerUserId, table.quotaDate] }),
]);

export const insertUserDailyMessageQuotaSchema = createInsertSchema(userDailyMessageQuotasTable);
export type InsertUserDailyMessageQuota = z.infer<typeof insertUserDailyMessageQuotaSchema>;
export type UserDailyMessageQuota = typeof userDailyMessageQuotasTable.$inferSelect;