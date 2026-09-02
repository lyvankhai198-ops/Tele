import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
export * from "./user-daily-message-quotas";
export * from "./admin-system-events";

export const proxiesTable = pgTable("proxies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("http"),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  usernameEncrypted: text("username_encrypted"),
  passwordEncrypted: text("password_encrypted"),
  status: text("status").notNull().default("active"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const telegramAccountsTable = pgTable("telegram_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull(),
  name: text("name").notNull(),
  username: text("username"),
  phoneMasked: text("phone_masked"),
  phoneEncrypted: text("phone_encrypted"),
  apiId: integer("api_id"),
  apiHashEncrypted: text("api_hash_encrypted"),
  dailyLimit: integer("daily_limit").notNull().default(200),
  telegramUserId: text("telegram_user_id").unique(),
  sessionEncrypted: text("session_encrypted"),
  status: text("status").notNull().default("pending"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  deliveryLeaseUntil: timestamp("delivery_lease_until", { withTimezone: true }),
  deliveryLeaseToken: text("delivery_lease_token"),
  proxyId: uuid("proxy_id").references(() => proxiesTable.id, { onDelete: "set null" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appUsersTable = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  usernameNormalized: text("username_normalized").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull().unique(),
  plan: text("plan").notNull().default("plus"),
  dailyQuotaExempt: boolean("daily_quota_exempt").notNull().default(false),
  dailyQuotaExemptDate: date("daily_quota_exempt_date", { mode: "string" }),
  dailyQuotaExemptFrom: date("daily_quota_exempt_from", { mode: "string" }),
  dailyQuotaExemptUntil: date("daily_quota_exempt_until", { mode: "string" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const licenseKeysTable = pgTable("license_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyHash: text("key_hash").notNull().unique(),
  keyEncrypted: text("key_encrypted"),
  plan: text("plan").notNull(),
  durationDays: integer("duration_days").notNull(),
  label: text("label"),
  createdBy: text("created_by"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedBy: text("claimed_by"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessionsTable = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => appUsersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const destinationsTable = pgTable("destinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => telegramAccountsTable.id, { onDelete: "cascade" }),
  telegramId: text("telegram_id").notNull(),
  topicId: integer("topic_id"),
  parentTitle: text("parent_title"),
  title: text("title").notNull(),
  username: text("username"),
  kind: text("kind").notNull().default("group"),
  memberCount: integer("member_count"),
  canPost: boolean("can_post").notNull().default(false),
  permissionReason: text("permission_reason"),
  permissionCheckedAt: timestamp("permission_checked_at", { withTimezone: true }),
  restrictedUntil: timestamp("restricted_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignsTable = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  telegramAccountId: uuid("telegram_account_id").references(() => telegramAccountsTable.id, { onDelete: "set null" }),
  templateId: uuid("template_id").references(() => messageTemplatesTable.id, { onDelete: "set null" }),
  templateMode: text("template_mode").notNull().default("text"),
  templateSourceAccountId: uuid("template_source_account_id").references(() => telegramAccountsTable.id, { onDelete: "set null" }),
  templateSourceMessageId: text("template_source_message_id"),
  clonedFromCampaignId: uuid("cloned_from_campaign_id"),
  clonedFromUserId: text("cloned_from_user_id"),
  destinationIds: uuid("destination_ids").array(),
  mediaUrl: text("media_url"),
  status: text("status").notNull().default("draft"),
  pauseReason: text("pause_reason"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  scheduleAnchorAt: timestamp("schedule_anchor_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  maxRetries: integer("max_retries").notNull().default(3),
  repeatCount: integer("repeat_count").notNull().default(1),
  delayMinSeconds: integer("delay_min_seconds").notNull().default(5),
  delayMaxSeconds: integer("delay_max_seconds").notNull().default(8),
  roundDelayMinSeconds: integer("round_delay_min_seconds").notNull().default(1),
  roundDelayMaxSeconds: integer("round_delay_max_seconds").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignTargetsTable = pgTable(
  "campaign_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
    destinationId: uuid("destination_id").notNull().references(() => destinationsTable.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    quotaReservedAt: timestamp("quota_reserved_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    sentMessageId: text("sent_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("campaign_targets_campaign_updated_idx").on(table.campaignId, table.updatedAt),
  ],
);

export const groupLibraryEntriesTable = pgTable("group_library_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: text("telegram_id").notNull().unique(),
  title: text("title").notNull(),
  trialTitle: text("trial_title"),
  username: text("username"),
  kind: text("kind").notNull().default("group"),
  memberCount: integer("member_count"),
  sourceDestinationId: uuid("source_destination_id").references(() => destinationsTable.id, { onDelete: "set null" }),
  isPublished: boolean("is_published").notNull().default(true),
  trialVisible: boolean("trial_visible").notNull().default(false),
  firstCapturedAt: timestamp("first_captured_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLogsTable = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull(),
  level: text("level").notNull().default("info"),
  event: text("event").notNull(),
  message: text("message").notNull(),
  accountId: uuid("account_id").references(() => telegramAccountsTable.id, { onDelete: "set null" }),
  campaignId: uuid("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  targetId: uuid("target_id").references(() => campaignTargetsTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageTemplatesTable = pgTable("message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull(),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("text"),
  content: text("content").notNull().default(""),
  sourceAccountId: uuid("source_account_id").references(() => telegramAccountsTable.id, { onDelete: "set null" }),
  sourceMessageId: text("source_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminNotificationsTable = pgTable("admin_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  titleEn: text("title_en"),
  bodyEn: text("body_en"),
  mediaPath: text("media_path"),
  mediaType: text("media_type"),
  mediaName: text("media_name"),
  mediaSize: integer("media_size"),
  status: text("status").notNull().default("published"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  pinned: boolean("pinned").notNull().default(false),
  dashboardVisible: boolean("dashboard_visible").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemSettingsTable = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authChallengesTable = pgTable("auth_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => telegramAccountsTable.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull(),
  status: text("status").notNull().default("waiting_code"),
  loginLink: text("login_link"),
  phoneCodeHashEncrypted: text("phone_code_hash_encrypted"),
  sessionEncrypted: text("session_encrypted"),
  attempts: integer("attempts").notNull().default(0),
  requiresTwoFactor: boolean("requires_two_factor").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const insertTelegramAccountSchema = createInsertSchema(telegramAccountsTable);
export const insertAppUserSchema = createInsertSchema(appUsersTable);
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable);
export const insertLicenseKeySchema = createInsertSchema(licenseKeysTable);
export const insertAuthSessionSchema = createInsertSchema(authSessionsTable);
export const insertDestinationSchema = createInsertSchema(destinationsTable);
export const insertCampaignSchema = createInsertSchema(campaignsTable);
export const insertCampaignTargetSchema = createInsertSchema(campaignTargetsTable);
export const insertGroupLibraryEntrySchema = createInsertSchema(groupLibraryEntriesTable);
export const insertActivityLogSchema = createInsertSchema(activityLogsTable);
export const insertMessageTemplateSchema = createInsertSchema(messageTemplatesTable);
export const insertAdminNotificationSchema = createInsertSchema(adminNotificationsTable);
export const insertSystemSettingSchema = createInsertSchema(systemSettingsTable);
export const insertAuthChallengeSchema = createInsertSchema(authChallengesTable);

export type TelegramAccount = typeof telegramAccountsTable.$inferSelect;
export type AppUser = typeof appUsersTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type LicenseKey = typeof licenseKeysTable.$inferSelect;
export type AuthSession = typeof authSessionsTable.$inferSelect;
export type Destination = typeof destinationsTable.$inferSelect;
export type Campaign = typeof campaignsTable.$inferSelect;
export type CampaignTarget = typeof campaignTargetsTable.$inferSelect;
export type GroupLibraryEntry = typeof groupLibraryEntriesTable.$inferSelect;
export type ActivityLog = typeof activityLogsTable.$inferSelect;
export type MessageTemplate = typeof messageTemplatesTable.$inferSelect;
export type AdminNotification = typeof adminNotificationsTable.$inferSelect;
export type SystemSetting = typeof systemSettingsTable.$inferSelect;
export type AuthChallenge = typeof authChallengesTable.$inferSelect;
// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export {}