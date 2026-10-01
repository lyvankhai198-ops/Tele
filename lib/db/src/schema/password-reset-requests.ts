import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const passwordResetRequestsTable = pgTable(
  "password_reset_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    status: text("status").notNull().default("awaiting_telegram"),
    startTokenHash: text("start_token_hash"),
    resetTokenHash: text("reset_token_hash"),
    telegramUserId: text("telegram_user_id"),
    telegramChatId: text("telegram_chat_id"),
    adminMessageId: integer("admin_message_id"),
    adminNotificationAttemptedAt: timestamp("admin_notification_attempted_at", { withTimezone: true }),
    adminNotificationSentAt: timestamp("admin_notification_sent_at", { withTimezone: true }),
    reviewedByTelegramId: text("reviewed_by_telegram_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("password_reset_requests_start_token_hash_unique").on(table.startTokenHash),
    uniqueIndex("password_reset_requests_reset_token_hash_unique").on(table.resetTokenHash),
    index("password_reset_requests_user_status_idx").on(table.userId, table.status),
    index("password_reset_requests_admin_queue_idx").on(
      table.status,
      table.adminNotificationSentAt,
      table.adminNotificationAttemptedAt,
    ),
  ],
);

export const insertPasswordResetRequestSchema = createInsertSchema(passwordResetRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPasswordResetRequest = typeof passwordResetRequestsTable.$inferInsert;
export type PasswordResetRequest = typeof passwordResetRequestsTable.$inferSelect;