type ReviewNotificationOrder = {
  id: string; ownerUserId: string; reference: string; orderType: string;
  plan: string; durationDays: number; amount: string; currency: string;
  network?: string | null; txHash?: string | null;
};
/** Plain text for the configured private admin, never contains a license secret. */
export function purchaseReviewNotification(order: ReviewNotificationOrder, username?: string | null, reported = false): string {
  const bounded = (value: string) => value.replace(/[\r\n]/g, " ").slice(0, 140);
  return [
    reported ? "💳 KHÁCH BÁO ĐÃ THANH TOÁN — CHƯA XÁC MINH" : "🧾 ĐƠN CHỜ XÁC MINH THANH TOÁN",
    `Đơn: ${bounded(order.reference)}`,
    `Khách: ${bounded(username || order.ownerUserId)}`,
    `Loại: ${order.orderType === "renewal" ? "Gia hạn" : "Mua key"}`,
    `Gói: ${bounded(order.plan.toUpperCase())} · ${order.durationDays} ngày`,
    `Số tiền: ${bounded(order.amount)} ${bounded(order.currency)}`,
    order.network ? `Mạng: ${bounded(order.network)}` : "",
    order.txHash ? `TX hash: ${bounded(order.txHash)}` : "",
    `ID đơn: ${order.id}`,
    "",
    "Chỉ bấm Xác minh thanh toán sau khi tự đối chiếu đã nhận đủ tiền, đúng người nhận/mạng và đúng đơn.",
    "Bấm xác minh sẽ kích hoạt key hoặc gia hạn ngay, không chờ xác nhận tự động.",
  ].filter(Boolean).join("\n");
}
