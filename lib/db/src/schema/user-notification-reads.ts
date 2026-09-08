import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const userNotificationReadsTable = pgTable("user_notification_reads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  notificationKey: text("notification_key").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_notification_reads_user_key_idx").on(table.userId, table.notificationKey),
  index("user_notification_reads_user_read_idx").on(table.userId, table.readAt),
]);

export const insertUserNotificationReadSchema = createInsertSchema(userNotificationReadsTable);

export type UserNotificationRead = typeof userNotificationReadsTable.$inferSelect;