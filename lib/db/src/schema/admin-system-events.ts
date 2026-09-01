import { createInsertSchema } from "drizzle-zod";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const adminSystemEventsTable = pgTable("admin_system_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  level: text("level").notNull().default("info"),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull(),
  body: text("body").notNull().default(""),
  bodyEn: text("body_en").notNull().default(""),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("admin_system_events_created_at_idx").on(table.createdAt),
  index("admin_system_events_type_created_at_idx").on(table.eventType, table.createdAt),
]);

export const adminSystemEventReadsTable = pgTable("admin_system_event_reads", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => adminSystemEventsTable.id, { onDelete: "cascade" }),
  adminUserId: text("admin_user_id").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("admin_system_event_reads_event_admin_idx").on(table.eventId, table.adminUserId),
  index("admin_system_event_reads_admin_read_idx").on(table.adminUserId, table.readAt),
]);

export const insertAdminSystemEventSchema = createInsertSchema(adminSystemEventsTable);
export const insertAdminSystemEventReadSchema = createInsertSchema(adminSystemEventReadsTable);

export type AdminSystemEvent = typeof adminSystemEventsTable.$inferSelect;
export type AdminSystemEventRead = typeof adminSystemEventReadsTable.$inferSelect;