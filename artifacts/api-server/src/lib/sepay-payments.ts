import { and, eq, inArray } from "drizzle-orm";
import { db, purchaseOrdersTable } from "@workspace/db";
import { logger } from "./logger";
import { notifyPurchaseOrder } from "./support-telegram";
import { ORDER_LIFETIME_MS, settleVerifiedOrder } from "./telecampaign-orders";
import type { SePayWebhookPayload } from "./verify-sepay";

function transferTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return NaN;
  return Date.parse(`${value.replace(" ", "T")}+07:00`);
}

/** A signed notification is only sufficient when all immutable order details match. */
export async function receiveSePayTransfer(payload: SePayWebhookPayload) {
  const paymentEventId = `sepay:${payload.id}`;
  const [previous] = await db.select().from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.paymentEventId, paymentEventId)).limit(1);
  if (previous) {
    if (previous.status === "received") await settleVerifiedOrder(previous.id, paymentEventId);
    return;
  }
  const receivedAt = transferTime(payload.transactionDate);
  if (!Number.isFinite(receivedAt) || receivedAt > Date.now() + 120_000) return;
  const content = payload.content.toUpperCase();
  const candidates = await db.select().from(purchaseOrdersTable).where(and(
    eq(purchaseOrdersTable.currency, "VND"),
    eq(purchaseOrdersTable.automated, true),
    inArray(purchaseOrdersTable.status, ["pending", "expired"]),
  ));
  for (const order of candidates) {
    const destination = order.paymentDestination.split("|");
    const account = destination[2]?.replace(/\s/g, "");
    const code = order.reference.toUpperCase();
    const containsExactReference = (typeof payload.code === "string" && payload.code.toUpperCase() === code)
      || new RegExp(`(?:^|[^A-Z0-9])${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Z0-9])`).test(content);
    if (!containsExactReference || !account || account !== payload.accountNumber.replace(/\s/g, "")
      || Number(order.amount) !== payload.transferAmount
      || receivedAt < order.createdAt.getTime() - 120_000
      || receivedAt > order.createdAt.getTime() + ORDER_LIFETIME_MS) continue;
    const paid = await settleVerifiedOrder(order.id, paymentEventId);
    if (paid?.status === "received") {
      logger.warn({ orderId: order.id }, "SePay payment received but activation needs manual attention");
      void notifyPurchaseOrder(`SePay đã xác minh tiền vào cho đơn ${order.reference}, nhưng chưa kích hoạt được (${paid.rejectionReason ?? "cần xử lý"}). Kiểm tra kho key/gói và giao dịch thực nhận.`)
        .catch((error) => logger.warn({ err: error, orderId: order.id }, "could not notify admin about unfulfilled payment"));
    }
    return;
  }
  logger.warn({ sepayEventId: payload.id }, "Unmatched SePay transfer; requires manual reconciliation");
}