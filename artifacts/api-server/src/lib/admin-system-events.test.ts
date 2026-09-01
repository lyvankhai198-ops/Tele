import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminSystemEventReadsTable,
  adminSystemEventsTable,
  db,
} from "@workspace/db";
import {
  licenseActivationEventValues,
  listAdminSystemEvents,
  markAdminSystemEventRead,
  markAllAdminSystemEventsRead,
} from "./admin-system-events";

const adminUserId = `system-events-test-${crypto.randomUUID()}`;
const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
const activationValues = licenseActivationEventValues({
  ownerUserId: "user-test",
  username: "test-operator",
  licenseKeyId: "key-test",
  plan: "pro",
  durationDays: 30,
  expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
});

const [todayEvent, oldEvent] = await db.insert(adminSystemEventsTable).values([
  { ...activationValues, createdAt: now },
  {
    ...activationValues,
    eventType: "license_revoked",
    level: "warning",
    title: "Thu hồi license key",
    titleEn: "License key revoked",
    body: "License test đã bị thu hồi.",
    bodyEn: "The test license was revoked.",
    createdAt: yesterday,
  },
]).returning({ id: adminSystemEventsTable.id });

try {
  assert.equal(activationValues.metadata.username, "test-operator");
  assert.equal("key" in activationValues.metadata, false);

  const todayResult = await listAdminSystemEvents({
    adminUserId,
    range: "today",
    limit: 100,
  });
  assert.equal(todayResult.events.some((event) => event.id === todayEvent.id), true);
  assert.equal(todayResult.events.some((event) => event.id === oldEvent.id), false);
  assert.equal(todayResult.events.find((event) => event.id === todayEvent.id)?.isRead, false);
  assert.equal(todayResult.today.licenseActivations >= 1, true);

  assert.equal(await markAdminSystemEventRead({ adminUserId, eventId: todayEvent.id }), true);
  const afterOneRead = await listAdminSystemEvents({ adminUserId, range: "all", limit: 100 });
  assert.equal(afterOneRead.events.find((event) => event.id === todayEvent.id)?.isRead, true);

  const markedCount = await markAllAdminSystemEventsRead(adminUserId);
  assert.equal(markedCount >= 1, true);
  const afterAllRead = await listAdminSystemEvents({ adminUserId, range: "all", limit: 100 });
  assert.equal(afterAllRead.events.find((event) => event.id === oldEvent.id)?.isRead, true);
} finally {
  await db.delete(adminSystemEventReadsTable).where(and(
    eq(adminSystemEventReadsTable.adminUserId, adminUserId),
    inArray(adminSystemEventReadsTable.eventId, [todayEvent.id, oldEvent.id]),
  ));
  await db.delete(adminSystemEventsTable).where(inArray(adminSystemEventsTable.id, [todayEvent.id, oldEvent.id]));
  await db.$client.end();
}

console.log("Admin system event activation, filter, unread, and read checks passed.");