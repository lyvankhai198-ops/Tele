import { AdminPurchaseOrders } from "@/components/admin/AdminPurchaseOrders";
import { AppLayout, SectionHeader } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";

export default function AdminPurchaseOrdersPage() {
  const { language } = useLanguage();
  const title = language === "vi" ? "Thanh toán & đơn mua gói" : "Payments & plan orders";

  return (
    <AppLayout activePage="admin" title={title}>
      <SectionHeader
        eyebrow={language === "vi" ? "Khu vực quản trị" : "Admin Center"}
        title={title}
        detail={language === "vi"
          ? "Nhập giá cho từng gói, thông tin nhận tiền và duyệt các đơn đã đối chiếu thanh toán."
          : "Set plan prices and payment destinations, then review orders after confirming receipt."}
      />
      <AdminPurchaseOrders />
    </AppLayout>
  );
}