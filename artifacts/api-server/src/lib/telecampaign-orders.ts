import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { appUsersTable, db, licenseKeysTable, purchaseOrdersTable, subscriptionsTable, systemSettingsTable } from "@workspace/db";
import { logger } from "./logger";
import { PLAN_ORDER } from "./subscriptions";
import { randomUUID } from "node:crypto";

export type OrderSettings = {
  pricesVnd: Record<"PLUS" | "PRO" | "UNLIMITED", number>;
  pricesUsdt: Record<"PLUS" | "PRO" | "UNLIMITED", number>;
  durationsDays: Record<"PLUS" | "PRO" | "UNLIMITED", number>;
  vnBankName: string;
  vnBankCode: string;
  vnBankAccount: string;
  vnAccountName: string;
  vietQrTemplate: string;
  usdtBep20Address: string;
  usdtTrc20Address: string;
};
const KEY = "telecampaign_order_settings";
const defaults: OrderSettings = { pricesVnd: { PLUS: 0, PRO: 0, UNLIMITED: 0 }, pricesUsdt: { PLUS: 0, PRO: 0, UNLIMITED: 0 }, durationsDays: { PLUS: 30, PRO: 30, UNLIMITED: 30 }, vnBankName: "", vnBankCode: "", vnBankAccount: "", vnAccountName: "", vietQrTemplate: "", usdtBep20Address: "", usdtTrc20Address: "" };

export async function getOrderSettings(): Promise<OrderSettings> {
  const [row] = await db.select({ value: systemSettingsTable.value }).from(systemSettingsTable).where(eq(systemSettingsTable.key, KEY)).limit(1);
  if (!row) return defaults;
  try { return { ...defaults, ...JSON.parse(row.value) } as OrderSettings; } catch { return defaults; }
}
export async function saveOrderSettings(value: OrderSettings, adminUserId: string): Promise<OrderSettings> {
  await db.insert(systemSettingsTable).values({ key: KEY, value: JSON.stringify(value), updatedBy: adminUserId, updatedAt: new Date() }).onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: JSON.stringify(value), updatedBy: adminUserId, updatedAt: new Date() } });
  return value;
}
export async function listOrders(userId?: string) {
  return db.select().from(purchaseOrdersTable).where(userId ? eq(purchaseOrdersTable.ownerUserId, userId) : undefined).orderBy(desc(purchaseOrdersTable.createdAt));
}
export async function createOrder(input: { ownerUserId: string; plan: string; currency: string; network?: string }) {
  const settings = await getOrderSettings();
  const plan = input.plan.toUpperCase() as keyof OrderSettings["pricesVnd"];
  const [current] = await db.select({ plan: subscriptionsTable.plan, expiresAt: subscriptionsTable.expiresAt }).from(subscriptionsTable).where(eq(subscriptionsTable.ownerUserId, input.ownerUserId)).limit(1);
  if (current?.expiresAt && current.expiresAt > new Date() && PLAN_ORDER.indexOf(plan.toLowerCase() as typeof PLAN_ORDER[number]) < PLAN_ORDER.indexOf(current.plan as typeof PLAN_ORDER[number])) throw new Error("PLAN_DOWNGRADE_NOT_ALLOWED");
  const amount = input.currency === "VND" ? settings.pricesVnd[plan] : settings.pricesUsdt[plan];
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("PLAN_PRICE_NOT_CONFIGURED");
  if (!["VND", "USDT"].includes(input.currency) || (input.currency === "USDT" && !["BEP20", "TRC20"].includes(input.network ?? ""))) throw new Error("INVALID_PAYMENT_METHOD");
  const destination = input.currency === "VND"
    ? `${settings.vnBankCode}|${settings.vnBankName}|${settings.vnBankAccount}|${settings.vnAccountName}|${settings.vietQrTemplate}`
    : (input.network === "BEP20" ? settings.usdtBep20Address : settings.usdtTrc20Address);
  if (input.currency === "VND"
    ? !/^[A-Z0-9]{2,20}$/.test(settings.vnBankCode)
      || !settings.vnBankName.trim()
      || !/^[0-9]{4,30}$/.test(settings.vnBankAccount.replace(/\s/g, ""))
      || !settings.vnAccountName.trim()
    : !(input.network === "BEP20" ? /^0x[0-9a-fA-F]{40}$/ : /^T[1-9A-HJ-NP-Za-km-z]{33}$/).test(destination)) {
    throw new Error("PAYMENT_DESTINATION_NOT_CONFIGURED");
  }
  const durationDays = settings.durationsDays[plan];
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3660) throw new Error("INVALID_PLAN_DURATION");
  const reference = `TC-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
  const [order] = await db.insert(purchaseOrdersTable).values({ ownerUserId: input.ownerUserId, plan, durationDays, currency: input.currency, network: input.network ?? null, amount: amount.toFixed(8), paymentDestination: destination, reference }).returning();
  return order;
}
export async function updateOrderProof(id: string, ownerUserId: string, txHash?: string, proofInfo?: string) {
  if (txHash) {
    const [duplicate] = await db.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable).where(eq(purchaseOrdersTable.txHash, txHash)).limit(1);
    if (duplicate && duplicate.id !== id) throw new Error("TX_HASH_ALREADY_SUBMITTED");
  }
  const [order] = await db.update(purchaseOrdersTable).set({ txHash, proofInfo, updatedAt: new Date() }).where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.ownerUserId, ownerUserId), eq(purchaseOrdersTable.status, "pending"))).returning();
  return order;
}
export async function reviewOrder(id: string, adminUserId: string, decision: "paid" | "rejected", reason?: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update");
    if (!order) return null;
    if (order.status !== "pending") return order;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${order.ownerUserId}))`);
    const [user] = await tx.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.id, order.ownerUserId)).limit(1);
    if (!user) throw new Error("ORDER_USER_NOT_FOUND");
    const now = new Date();
    if (decision === "rejected") {
      const [updated] = await tx.update(purchaseOrdersTable).set({ status: "rejected", reviewedBy: adminUserId, reviewedAt: now, rejectionReason: reason ?? null, updatedAt: now }).where(eq(purchaseOrdersTable.id, id)).returning();
      return updated;
    }
    const [current] = await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.ownerUserId, order.ownerUserId)).for("update");
    if (current && current.expiresAt && current.expiresAt > now && PLAN_ORDER.indexOf(order.plan.toLowerCase() as typeof PLAN_ORDER[number]) < PLAN_ORDER.indexOf(current.plan as typeof PLAN_ORDER[number])) {
      throw new Error("PLAN_DOWNGRADE_NOT_ALLOWED");
    }
    const [claimedLicense] = await tx.select({ id: licenseKeysTable.id }).from(licenseKeysTable).where(and(eq(licenseKeysTable.claimedBy, order.ownerUserId), isNotNull(licenseKeysTable.claimedAt))).limit(1);
    const [priorPaidOrder] = await tx.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable).where(and(eq(purchaseOrdersTable.ownerUserId, order.ownerUserId), eq(purchaseOrdersTable.status, "paid"))).limit(1);
    const resetsTrialDuration = (current?.plan ?? "plus") === "plus" && !claimedLicense && !priorPaidOrder;
    const base = !resetsTrialDuration && current?.expiresAt && current.expiresAt > now ? current.expiresAt : now;
    const values = { plan: order.plan.toLowerCase(), startedAt: resetsTrialDuration ? now : current?.startedAt ?? now, expiresAt: new Date(base.getTime() + order.durationDays * 86400000), updatedAt: now };
    if (current) await tx.update(subscriptionsTable).set(values).where(eq(subscriptionsTable.id, current.id));
    else await tx.insert(subscriptionsTable).values({ ownerUserId: order.ownerUserId, ...values });
    const [updated] = await tx.update(purchaseOrdersTable).set({ status: "paid", reviewedBy: adminUserId, reviewedAt: now, updatedAt: now }).where(eq(purchaseOrdersTable.id, id)).returning();
    logger.info({ orderId: id, adminUserId }, "purchase order approved and subscription activated");
    return updated;
  });
}