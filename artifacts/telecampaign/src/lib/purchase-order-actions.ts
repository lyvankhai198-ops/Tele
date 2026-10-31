type OrderActionInput = { status: string; currency: string };

export function getPurchaseOrderActions(order: OrderActionInput) {
  const awaitingPayment = order.status === "pending" || order.status === "expired";
  return {
    canVerifyManually: awaitingPayment && ["VND", "USDT"].includes(order.currency),
    canReject: awaitingPayment,
    canRetryFulfillment: order.status === "received",
    canRevoke: order.status === "paid",
  };
}
