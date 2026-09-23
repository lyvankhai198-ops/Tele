import { and, asc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db, purchaseOrdersTable } from "@workspace/db";
import { expireUnpaidOrders, settleVerifiedOrder } from "./telecampaign-orders";
import { verifyUsdtTransfer } from "./verify-usdt";
import { logger } from "./logger";
import { notifyPurchaseOrder } from "./support-telegram";

let running = false;

async function checkPayments() {
  if (running) return;
  running = true;
  try {
    await expireUnpaidOrders();
    const outstanding = await db.select().from(purchaseOrdersTable)
      .where(and(eq(purchaseOrdersTable.status, "received"), eq(purchaseOrdersTable.automated, true)))
      .orderBy(asc(purchaseOrdersTable.updatedAt)).limit(10);
    for (const order of outstanding) {
      if (!order.paymentEventId) continue;
      try {
        await settleVerifiedOrder(order.id, order.paymentEventId);
      } catch (error) {
        logger.error({ err: error, orderId: order.id }, "could not fulfill previously verified payment");
        await db.update(purchaseOrdersTable).set({ updatedAt: new Date() })
          .where(and(eq(purchaseOrdersTable.id, order.id), eq(purchaseOrdersTable.status, "received")));
      }
    }
    const unverified = await db.select().from(purchaseOrdersTable).where(and(
      eq(purchaseOrdersTable.currency, "USDT"),
      eq(purchaseOrdersTable.automated, true),
      inArray(purchaseOrdersTable.status, ["pending", "expired"]),
      isNotNull(purchaseOrdersTable.txHash),
      gte(purchaseOrdersTable.createdAt, new Date(Date.now() - 24 * 60 * 60_000)),
    )).orderBy(asc(purchaseOrdersTable.updatedAt)).limit(10);
    for (const order of unverified) {
      if (!order.txHash || !["BEP20", "TRC20"].includes(order.network ?? "")) continue;
      try {
        // A transaction after the checkout window is never accepted, even if
        // confirmations arrive later. The chain verifier checks block time.
        const result = await verifyUsdtTransfer({
          network: order.network as "BEP20" | "TRC20",
          txHash: order.txHash,
          destination: order.paymentDestination,
          amount: order.amount,
          createdAt: order.createdAt,
        });
        if (result.confirmed) {
          const settled = await settleVerifiedOrder(order.id, `${order.network}:${order.txHash}`);
          if (settled?.status === "received") {
            void notifyPurchaseOrder(`USDT đã xác minh trên chuỗi cho đơn ${order.reference}, nhưng chưa kích hoạt được (${settled.rejectionReason ?? "cần xử lý"}). Kiểm tra kho key/gói hoặc hoàn tiền.`)
              .catch((error) => logger.warn({ err: error, orderId: order.id }, "could not notify admin about unfulfilled USDT payment"));
          }
        } else {
          await db.update(purchaseOrdersTable).set({ updatedAt: new Date() })
            .where(and(eq(purchaseOrdersTable.id, order.id), eq(purchaseOrdersTable.txHash, order.txHash)));
        }
      } catch (error) {
        logger.error({ err: error, orderId: order.id }, "USDT payment verification failed; order not activated");
        await db.update(purchaseOrdersTable).set({ updatedAt: new Date() })
          .where(and(eq(purchaseOrdersTable.id, order.id), eq(purchaseOrdersTable.txHash, order.txHash)));
      }
    }
  } catch (error) {
    logger.error({ err: error }, "payment verification worker failed; orders remain unactivated");
  } finally {
    running = false;
  }
}

export function startPaymentWorker() {
  if (process.env.TELECAMPAIGN_DISABLE_PAYMENT_WORKER === "true") return;
  void checkPayments();
  setInterval(() => { void checkPayments(); }, 30_000).unref();
}