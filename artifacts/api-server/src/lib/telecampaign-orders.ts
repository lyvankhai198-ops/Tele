import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { appUsersTable, db, licenseKeysTable, purchaseOrdersTable, subscriptionsTable, systemSettingsTable } from "@workspace/db";
import { logger } from "./logger";
import { PLAN_ORDER } from "./subscriptions";
import { randomUUID } from "node:crypto";
import { isValidTronAddress } from "./verify-usdt";

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
export type PurchaseOrderType = "license" | "renewal";
export type LicensePool = "normal" | "external";
export function verifiedOrderNotification(order: {
  orderType?: string;
  reference: string;
  plan: string;
  durationDays: number;
}): string {
  const action = order.orderType === "renewal" ? "Gói đã được gia hạn" : "Key đã được kích hoạt";
  return `✅ ${action}\nĐơn ${order.reference} · Gói ${order.plan.toUpperCase()} · ${order.durationDays} ngày`;
}
const KEY = "telecampaign_order_settings";
export const ORDER_LIFETIME_MS = 10 * 60_000;
const defaults: OrderSettings = { pricesVnd: { PLUS: 0, PRO: 0, UNLIMITED: 0 }, pricesUsdt: { PLUS: 0, PRO: 0, UNLIMITED: 0 }, durationsDays: { PLUS: 30, PRO: 30, UNLIMITED: 30 }, vnBankName: "", vnBankCode: "", vnBankAccount: "", vnAccountName: "", vietQrTemplate: "", usdtBep20Address: "", usdtTrc20Address: "" };

export async function getOrderSettings(): Promise<OrderSettings> {
  const [row] = await db.select({ value: systemSettingsTable.value }).from(systemSettingsTable).where(eq(systemSettingsTable.key, KEY)).limit(1);
  if (!row) return defaults;
  try { return { ...defaults, ...JSON.parse(row.value) } as OrderSettings; } catch { return defaults; }
}
export async function saveOrderSettings(value: OrderSettings, adminUserId: string): Promise<OrderSettings> {
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.insert(systemSettingsTable).values({ key: KEY, value: JSON.stringify(value), updatedBy: adminUserId, updatedAt: now }).onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: JSON.stringify(value), updatedBy: adminUserId, updatedAt: now },
    });

    for (const plan of ["PLUS", "PRO", "UNLIMITED"] as const) {
      await tx.update(licenseKeysTable).set({
        salePriceVnd: value.pricesVnd[plan],
      }).where(and(
        eq(licenseKeysTable.pool, "normal"),
        eq(licenseKeysTable.plan, plan.toLowerCase()),
        eq(licenseKeysTable.durationDays, value.durationsDays[plan]),
        isNull(licenseKeysTable.claimedAt),
        isNull(licenseKeysTable.revokedAt),
        isNull(licenseKeysTable.reservedOrderId),
      ));
    }
  });
  return value;
}
export async function listOrders(userId?: string) {
  return db.select().from(purchaseOrdersTable).where(userId ? eq(purchaseOrdersTable.ownerUserId, userId) : undefined).orderBy(desc(purchaseOrdersTable.createdAt));
}
export async function createOrder(input: { ownerUserId: string; plan: string; currency: string; network?: string; orderType?: PurchaseOrderType }) {
  const orderType = input.orderType ?? "license";
  if (orderType !== "license" && orderType !== "renewal") throw new Error("INVALID_ORDER_TYPE");
  if (input.currency === "VND" && !process.env.SEPAY_WEBHOOK_SECRET && !process.env.SEPAY_WEBHOOK_API_KEY) throw new Error("PAYMENT_AUTOMATION_NOT_CONFIGURED");
  const settings = await getOrderSettings();
  const plan = input.plan.toUpperCase() as keyof OrderSettings["pricesVnd"];
  const [current] = await db.select({ plan: subscriptionsTable.plan, expiresAt: subscriptionsTable.expiresAt }).from(subscriptionsTable).where(eq(subscriptionsTable.ownerUserId, input.ownerUserId)).limit(1);
  if (current?.expiresAt && current.expiresAt > new Date() && PLAN_ORDER.indexOf(plan.toLowerCase() as typeof PLAN_ORDER[number]) < PLAN_ORDER.indexOf(current.plan as typeof PLAN_ORDER[number])) throw new Error("PLAN_DOWNGRADE_NOT_ALLOWED");
  const amount = input.currency === "VND" ? settings.pricesVnd[plan] : settings.pricesUsdt[plan];
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("PLAN_PRICE_NOT_CONFIGURED");
  if (!["VND", "USDT"].includes(input.currency) || (input.currency === "USDT" && !["BEP20", "TRC20"].includes(input.network ?? ""))) throw new Error("INVALID_PAYMENT_METHOD");
  if (input.currency === "VND" ? !Number.isSafeInteger(amount) : Number(amount.toFixed(input.network === "TRC20" ? 6 : 8)) !== amount) {
    throw new Error("INVALID_PAYMENT_AMOUNT");
  }
  const destination = input.currency === "VND"
    ? `${settings.vnBankCode}|${settings.vnBankName}|${settings.vnBankAccount}|${settings.vnAccountName}|${settings.vietQrTemplate}`
    : (input.network === "BEP20" ? settings.usdtBep20Address : settings.usdtTrc20Address);
  if (input.currency === "VND"
    ? !/^[A-Z0-9]{2,20}$/.test(settings.vnBankCode)
      || !settings.vnBankName.trim()
      || !/^[0-9]{4,30}$/.test(settings.vnBankAccount.replace(/\s/g, ""))
      || !settings.vnAccountName.trim()
    : (input.network === "BEP20" ? !/^0x[0-9a-fA-F]{40}$/.test(destination) : !isValidTronAddress(destination))) {
    throw new Error("PAYMENT_DESTINATION_NOT_CONFIGURED");
  }
  const durationDays = settings.durationsDays[plan];
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3660) throw new Error("INVALID_PLAN_DURATION");
  // Keep bank transfer content short; existing orders retain their original reference.
  const reference = `TC${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  return db.transaction(async (tx) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - ORDER_LIFETIME_MS);
    const [activeOrder] = await tx.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable).where(and(
      eq(purchaseOrdersTable.ownerUserId, input.ownerUserId),
      eq(purchaseOrdersTable.status, "pending"),
      gte(purchaseOrdersTable.createdAt, cutoff),
    )).limit(1);
    if (activeOrder) throw new Error("ACTIVE_PAYMENT_EXISTS");
    const expiredOrders = await tx.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable).where(and(
      eq(purchaseOrdersTable.ownerUserId, input.ownerUserId),
      eq(purchaseOrdersTable.status, "pending"),
      lt(purchaseOrdersTable.createdAt, cutoff),
    ));
    if (expiredOrders.length) {
      const expiredIds = expiredOrders.map((order) => order.id);
      await tx.update(purchaseOrdersTable).set({ status: "expired", updatedAt: now })
        .where(inArray(purchaseOrdersTable.id, expiredIds));
      await tx.update(licenseKeysTable).set({ reservedOrderId: null, reservedUntil: null })
        .where(inArray(licenseKeysTable.reservedOrderId, expiredIds));
    }
    let key: { id: string } | undefined;
    if (orderType === "license") {
      [key] = await tx.select({ id: licenseKeysTable.id }).from(licenseKeysTable).where(and(
        eq(licenseKeysTable.pool, "normal"),
        eq(licenseKeysTable.plan, plan.toLowerCase()),
        eq(licenseKeysTable.durationDays, durationDays),
        isNull(licenseKeysTable.claimedAt),
        isNull(licenseKeysTable.revokedAt),
        or(isNull(licenseKeysTable.reservedUntil), lte(licenseKeysTable.reservedUntil, now)),
      )).limit(1).for("update", { skipLocked: true });
      if (!key) throw new Error("LICENSE_STOCK_EMPTY");
    }
    const [order] = await tx.insert(purchaseOrdersTable).values({ ownerUserId: input.ownerUserId, plan, durationDays, currency: input.currency, network: input.network ?? null, amount: amount.toFixed(8), paymentDestination: destination, reference, automated: true, orderType }).returning();
    if (key) {
      await tx.update(licenseKeysTable).set({ reservedOrderId: order.id, reservedUntil: new Date(now.getTime() + 60 * 60_000) })
        .where(eq(licenseKeysTable.id, key.id));
    }
    return order;
  });
}

export async function cancelOrder(id: string, ownerUserId: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(purchaseOrdersTable).where(and(
      eq(purchaseOrdersTable.id, id),
      eq(purchaseOrdersTable.ownerUserId, ownerUserId),
    )).for("update");
    if (!order) return null;
    if (order.status !== "pending") throw new Error("ORDER_CANNOT_BE_CANCELLED");
    const [cancelled] = await tx.update(purchaseOrdersTable).set({
      status: "cancelled",
      updatedAt: new Date(),
    }).where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.status, "pending"))).returning();
    if (!cancelled) throw new Error("ORDER_CANNOT_BE_CANCELLED");
    await tx.update(licenseKeysTable).set({ reservedOrderId: null, reservedUntil: null })
      .where(eq(licenseKeysTable.reservedOrderId, id));
    return cancelled;
  });
}
export async function updateOrderProof(id: string, ownerUserId: string, txHash?: string, proofInfo?: string) {
  const [existing] = await db.select().from(purchaseOrdersTable).where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.ownerUserId, ownerUserId))).limit(1);
  if (existing && existing.currency === "VND" && !txHash) {
    if (existing.status !== "pending" || existing.proofInfo) return null;
    const [order] = await db.update(purchaseOrdersTable).set({ proofInfo: "Customer reported a bank transfer", updatedAt: new Date() })
      .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.ownerUserId, ownerUserId), eq(purchaseOrdersTable.status, "pending"))).returning();
    return order;
  }
  if (!existing || existing.currency !== "USDT" || !existing.network || !txHash || !/^(?:0x)?[a-fA-F0-9]{64}$/.test(txHash)
    || (existing.automated && existing.createdAt.getTime() + ORDER_LIFETIME_MS < Date.now())) return null;
  txHash = existing.network === "BEP20" ? (txHash.startsWith("0x") ? txHash : `0x${txHash}`).toLowerCase() : txHash.replace(/^0x/i, "").toLowerCase();
  if (txHash) {
    const [duplicate] = await db.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable).where(eq(purchaseOrdersTable.txHash, txHash)).limit(1);
    if (duplicate && duplicate.id !== id) throw new Error("TX_HASH_ALREADY_SUBMITTED");
  }
  const [order] = await db.update(purchaseOrdersTable).set({ txHash, proofInfo: null, rejectionReason: null, updatedAt: new Date() }).where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.ownerUserId, ownerUserId), eq(purchaseOrdersTable.status, "pending"))).returning();
  return order;
}

/** Only a verified gateway receipt or confirmed on-chain transfer may call this. */
export async function settleVerifiedOrder(id: string, paymentEventId: string, reviewedBy = "automatic") {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update");
    if (!order || (order.status !== "pending" && order.status !== "received" && order.status !== "expired")
      || (order.paymentEventId && order.paymentEventId !== paymentEventId)) return order ?? null;
    const [other] = await tx.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.paymentEventId, paymentEventId)).limit(1);
    if (other && other.id !== id) return null;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${order.ownerUserId}))`);
    const [owner] = await tx.select({ id: appUsersTable.id }).from(appUsersTable)
      .where(eq(appUsersTable.id, order.ownerUserId)).limit(1);
    if (!owner) throw new Error("ORDER_USER_NOT_FOUND");
    const now = new Date();
    const [current] = await tx.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.ownerUserId, order.ownerUserId)).for("update");

    if (order.orderType === "renewal") {
      if (current && current.expiresAt && current.expiresAt > now &&
        PLAN_ORDER.indexOf(order.plan.toLowerCase() as typeof PLAN_ORDER[number]) < PLAN_ORDER.indexOf(current.plan as typeof PLAN_ORDER[number])) {
        const [received] = await tx.update(purchaseOrdersTable).set({ status: "received", paymentEventId, rejectionReason: "PLAN_DOWNGRADE_NOT_ALLOWED", updatedAt: now })
          .where(eq(purchaseOrdersTable.id, id)).returning();
        return received;
      }
      const isUpgrade = current && PLAN_ORDER.indexOf(order.plan.toLowerCase() as typeof PLAN_ORDER[number]) > PLAN_ORDER.indexOf(current.plan as typeof PLAN_ORDER[number]);
      const base = !isUpgrade && current?.expiresAt && current.expiresAt > now ? current.expiresAt.getTime() : now.getTime();
      const values = {
        plan: order.plan.toLowerCase(),
        startedAt: current?.startedAt ?? now,
        expiresAt: new Date(base + order.durationDays * 86_400_000),
        updatedAt: now,
      };
      if (current) await tx.update(subscriptionsTable).set(values).where(eq(subscriptionsTable.id, current.id));
      else await tx.insert(subscriptionsTable).values({ ownerUserId: order.ownerUserId, ...values });
      const [paid] = await tx.update(purchaseOrdersTable).set({
        status: "paid", paymentEventId, activatedLicenseKeyId: null, rejectionReason: null,
        reviewedBy, reviewedAt: now, updatedAt: now,
      }).where(eq(purchaseOrdersTable.id, id)).returning();
      logger.info({ orderId: id, paymentType: order.currency }, "verified payment renewed subscription");
      return paid;
    }

    let [key] = await tx.select({ id: licenseKeysTable.id }).from(licenseKeysTable).where(and(
      eq(licenseKeysTable.pool, "normal"),
      eq(licenseKeysTable.plan, order.plan.toLowerCase()),
      eq(licenseKeysTable.durationDays, order.durationDays),
      isNull(licenseKeysTable.claimedAt),
      isNull(licenseKeysTable.revokedAt),
      order.automated
        ? eq(licenseKeysTable.reservedOrderId, order.id)
        : or(isNull(licenseKeysTable.reservedUntil), lte(licenseKeysTable.reservedUntil, new Date())),
    )).limit(1).for("update", { skipLocked: true });
    if (!key && order.automated && order.status === "received" && order.rejectionReason === "NO_MATCHING_KEY") {
      [key] = await tx.select({ id: licenseKeysTable.id }).from(licenseKeysTable).where(and(
        eq(licenseKeysTable.pool, "normal"),
        eq(licenseKeysTable.plan, order.plan.toLowerCase()),
        eq(licenseKeysTable.durationDays, order.durationDays),
        isNull(licenseKeysTable.claimedAt),
        isNull(licenseKeysTable.revokedAt),
        or(isNull(licenseKeysTable.reservedUntil), lte(licenseKeysTable.reservedUntil, now)),
      )).limit(1).for("update", { skipLocked: true });
    }
    if (!key) {
      const [received] = await tx.update(purchaseOrdersTable).set({ status: "received", paymentEventId, rejectionReason: "NO_MATCHING_KEY", updatedAt: now })
        .where(eq(purchaseOrdersTable.id, id)).returning();
      return received;
    }
    if (current && current.expiresAt && current.expiresAt > now &&
      PLAN_ORDER.indexOf(order.plan.toLowerCase() as typeof PLAN_ORDER[number]) < PLAN_ORDER.indexOf(current.plan as typeof PLAN_ORDER[number])) {
      const [received] = await tx.update(purchaseOrdersTable).set({ status: "received", paymentEventId, rejectionReason: "PLAN_DOWNGRADE_NOT_ALLOWED", updatedAt: now })
        .where(eq(purchaseOrdersTable.id, id)).returning();
      return received;
    }
    const claimValues = {
      claimedAt: now,
      claimedBy: order.ownerUserId,
      reservedOrderId: null,
      reservedUntil: null,
      ...(order.currency === "VND" ? { salePriceVnd: Number(order.amount) } : {}),
    };
    const [claimed] = await tx.update(licenseKeysTable).set(claimValues)
      .where(and(eq(licenseKeysTable.id, key.id), isNull(licenseKeysTable.claimedAt), isNull(licenseKeysTable.revokedAt))).returning();
    if (!claimed) throw new Error("LICENSE_CLAIM_FAILED");
    const [priorPaidOrder] = await tx.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.ownerUserId, order.ownerUserId), eq(purchaseOrdersTable.status, "paid"))).limit(1);
    const [priorClaim] = await tx.select({ id: licenseKeysTable.id }).from(licenseKeysTable)
      .where(and(eq(licenseKeysTable.claimedBy, order.ownerUserId), isNotNull(licenseKeysTable.claimedAt), sql`${licenseKeysTable.id} <> ${key.id}`)).limit(1);
    const resetsTrial = (current?.plan ?? "plus") === "plus" && !priorClaim && !priorPaidOrder;
    const base = !resetsTrial && current?.expiresAt && current.expiresAt > now ? current.expiresAt : now;
    const values = { plan: order.plan.toLowerCase(), startedAt: resetsTrial ? now : current?.startedAt ?? now,
      expiresAt: new Date(base.getTime() + order.durationDays * 86_400_000), updatedAt: now };
    if (current) await tx.update(subscriptionsTable).set(values).where(eq(subscriptionsTable.id, current.id));
    else await tx.insert(subscriptionsTable).values({ ownerUserId: order.ownerUserId, ...values });
    const [paid] = await tx.update(purchaseOrdersTable).set({
      status: "paid", paymentEventId, activatedLicenseKeyId: key.id, rejectionReason: null,
      reviewedBy, reviewedAt: now, updatedAt: now,
    }).where(eq(purchaseOrdersTable.id, id)).returning();
    logger.info({ orderId: id, paymentType: order.currency }, "verified payment activated license");
    return paid;
  });
}

export async function expireUnpaidOrders() {
  const now = new Date();
  const expired = await db.update(purchaseOrdersTable).set({ status: "expired", updatedAt: now }).where(and(
    eq(purchaseOrdersTable.status, "pending"),
    eq(purchaseOrdersTable.automated, true),
    lt(purchaseOrdersTable.createdAt, new Date(now.getTime() - ORDER_LIFETIME_MS)),
  )).returning({ id: purchaseOrdersTable.id });
  if (expired.length) {
    await db.update(licenseKeysTable).set({ reservedOrderId: null, reservedUntil: null })
      .where(inArray(licenseKeysTable.reservedOrderId, expired.map((order) => order.id)));
  }
}
export async function reviewOrder(id: string, adminUserId: string, decision: "paid" | "rejected", reason?: string) {
  if (decision === "paid") {
    const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).limit(1);
    if (!order) return null;
    if (order.status !== "pending" && order.status !== "received") return order;
    if (order.automated && order.status === "pending") throw new Error("AUTOMATIC_PAYMENT_NOT_VERIFIED");
    return settleVerifiedOrder(id, order.paymentEventId ?? `manual:${id}`, adminUserId);
  }
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update");
    if (!order) return null;
    if (order.status !== "pending") return order;
    if (order.automated) throw new Error("AUTOMATIC_PAYMENT_NOT_VERIFIED");
    const now = new Date();
    const [updated] = await tx.update(purchaseOrdersTable).set({ status: "rejected", reviewedBy: adminUserId, reviewedAt: now, rejectionReason: reason ?? null, updatedAt: now }).where(eq(purchaseOrdersTable.id, id)).returning();
    return updated;
  });
}