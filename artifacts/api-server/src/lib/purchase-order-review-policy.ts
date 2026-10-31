type ReviewableOrder = { status: string; currency: string };

/** Run inside the order's row lock, never against a stale pre-transaction read. */
export function assertManualApprovalAllowed(order: ReviewableOrder, confirmed: boolean): void {
  // Retrying fulfillment of already verified money does not re-verify payment.
  if (order.status === "received") return;
  if (order.status !== "pending" && order.status !== "expired") {
    throw new Error("ORDER_NOT_REVIEWABLE");
  }
  if (order.currency !== "VND") {
    throw new Error("CRYPTO_REQUIRES_CHAIN_VERIFICATION");
  }
  if (!confirmed) throw new Error("MANUAL_RECEIPT_CONFIRMATION_REQUIRED");
}

export function canRejectPurchaseOrder(status: string): boolean {
  return status === "pending" || status === "expired";
}
