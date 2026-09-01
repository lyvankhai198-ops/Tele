import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
  adminSystemEventReadsTable,
  adminSystemEventsTable,
  appUsersTable,
  db,
} from "@workspace/db";
import { getSystemSettings } from "./system-settings";
import { localQuotaDate } from "./user-daily-quota";

export type AdminSystemEventType =
  | "license_activated"
  | "user_registered"
  | "license_revoked";

type EventRange = "all" | "today";

export function licenseActivationEventValues(input: {
  ownerUserId: string;
  username: string;
  licenseKeyId: string;
  plan: string;
  durationDays: number;
  expiresAt: Date | null;
}) {
  const plan = input.plan.toUpperCase();
  const expiry = input.expiresAt?.toISOString() ?? null;
  return {
    eventType: "license_activated" as const,
    level: "success" as const,
    title: "Kích hoạt license key",
    titleEn: "License key activated",
    body: `Tài khoản ${input.username} đã kích hoạt gói ${plan} trong ${input.durationDays} ngày.`,
    bodyEn: `Account ${input.username} activated the ${plan} plan for ${input.durationDays} days.`,
    metadata: {
      userId: input.ownerUserId,
      username: input.username,
      licenseKeyId: input.licenseKeyId,
      plan: input.plan,
      durationDays: input.durationDays,
      expiresAt: expiry,
    },
  };
}

function todayCondition(timezone: string, today: string) {
  return sql`(${adminSystemEventsTable.createdAt} AT TIME ZONE ${timezone})::date = ${today}::date`;
}

async function currentDay(now = new Date()): Promise<{ timezone: string; date: string }> {
  const settings = await getSystemSettings();
  return {
    timezone: settings.defaultTimezone,
    date: localQuotaDate(settings.defaultTimezone, now),
  };
}

export async function createLicenseActivationEvent(input: {
  ownerUserId: string;
  licenseKeyId: string;
  plan: string;
  durationDays: number;
  expiresAt: Date | null;
}): Promise<void> {
  const [user] = await db
    .select({ username: appUsersTable.username })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, input.ownerUserId))
    .limit(1);
  const username = user?.username ?? input.ownerUserId;
  await db.insert(adminSystemEventsTable).values(licenseActivationEventValues({ ...input, username }));
}

export async function listAdminSystemEvents(input: {
  adminUserId: string;
  range: EventRange;
  eventType?: AdminSystemEventType;
  limit: number;
}) {
  const { timezone, date } = await currentDay();
  const filters = [];
  if (input.range === "today") filters.push(todayCondition(timezone, date));
  if (input.eventType) filters.push(eq(adminSystemEventsTable.eventType, input.eventType));

  const rows = await db
    .select({
      event: adminSystemEventsTable,
      readAt: adminSystemEventReadsTable.readAt,
    })
    .from(adminSystemEventsTable)
    .leftJoin(
      adminSystemEventReadsTable,
      and(
        eq(adminSystemEventReadsTable.eventId, adminSystemEventsTable.id),
        eq(adminSystemEventReadsTable.adminUserId, input.adminUserId),
      ),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(adminSystemEventsTable.createdAt))
    .limit(input.limit);

  const [unreadRow, activationRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(adminSystemEventsTable)
      .leftJoin(
        adminSystemEventReadsTable,
        and(
          eq(adminSystemEventReadsTable.eventId, adminSystemEventsTable.id),
          eq(adminSystemEventReadsTable.adminUserId, input.adminUserId),
        ),
      )
      .where(isNull(adminSystemEventReadsTable.id)),
    db
      .select({ value: count() })
      .from(adminSystemEventsTable)
      .where(and(
        eq(adminSystemEventsTable.eventType, "license_activated"),
        todayCondition(timezone, date),
      )),
  ]);

  return {
    events: rows.map(({ event, readAt }) => ({
      id: event.id,
      eventType: event.eventType as AdminSystemEventType,
      level: event.level as "info" | "success" | "warning" | "error",
      title: event.title,
      titleEn: event.titleEn,
      body: event.body,
      bodyEn: event.bodyEn,
      metadata: event.metadata as Record<string, unknown> | null,
      isRead: readAt !== null,
      createdAt: event.createdAt,
    })),
    unreadCount: Number(unreadRow[0]?.value ?? 0),
    today: {
      licenseActivations: Number(activationRow[0]?.value ?? 0),
    },
  };
}

export async function markAdminSystemEventRead(input: {
  adminUserId: string;
  eventId: string;
}): Promise<boolean> {
  const [event] = await db
    .select({ id: adminSystemEventsTable.id })
    .from(adminSystemEventsTable)
    .where(eq(adminSystemEventsTable.id, input.eventId))
    .limit(1);
  if (!event) return false;

  await db
    .insert(adminSystemEventReadsTable)
    .values({ eventId: input.eventId, adminUserId: input.adminUserId })
    .onConflictDoNothing();
  return true;
}

export async function markAllAdminSystemEventsRead(adminUserId: string): Promise<number> {
  const unreadEvents = await db
    .select({ id: adminSystemEventsTable.id })
    .from(adminSystemEventsTable)
    .leftJoin(
      adminSystemEventReadsTable,
      and(
        eq(adminSystemEventReadsTable.eventId, adminSystemEventsTable.id),
        eq(adminSystemEventReadsTable.adminUserId, adminUserId),
      ),
    )
    .where(isNull(adminSystemEventReadsTable.id));

  if (unreadEvents.length === 0) return 0;
  await db
    .insert(adminSystemEventReadsTable)
    .values(unreadEvents.map(({ id }) => ({ eventId: id, adminUserId })))
    .onConflictDoNothing();
  return unreadEvents.length;
}