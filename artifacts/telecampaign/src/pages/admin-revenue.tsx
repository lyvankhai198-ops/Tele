import { AlertCircle, BarChart3, Coins, KeyRound, UsersRound } from "lucide-react";
import {
  useGetAdminRevenueInsights,
  getGetAdminRevenueInsightsQueryKey,
  type AdminLoyalCustomer,
} from "@workspace/api-client-react";
import {
  AppLayout,
  EmptyState,
  Panel,
  SectionHeader,
} from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";

const copy = {
  vi: {
    pageTitle: "Doanh thu & khách hàng ruột",
    eyebrow: "Trung tâm quản trị",
    pageDetail: "Theo dõi doanh thu từ license key và gia hạn, giá trị tồn kho và nhóm khách hàng chi tiêu nhiều nhất.",
    loadError: "Không thể tải báo cáo doanh thu",
    loadErrorDetail: "Vui lòng thử lại sau hoặc kiểm tra quyền quản trị.",
    revenue: "Doanh thu đã ghi nhận",
    inventory: "Giá trị key chưa bán",
    soldKeys: "Key đã kích hoạt",
    missingPrice: "Key chưa nhập giá",
    customers: "Khách hàng đã mua",
    planBreakdown: "Phân bổ theo gói",
    plan: "Gói",
    planRevenue: "Doanh thu",
    planInventory: "Tồn kho",
    planSold: "Đã bán",
    planAvailable: "Chưa bán",
    monthBreakdown: "Doanh thu theo tháng",
    noMonthData: "Chưa có key nào được kích hoạt có giá.",
    loyalTitle: "Khách hàng ruột",
    loyalDetail: "Xếp hạng theo tổng chi tiêu, sau đó đến số key, số ngày sử dụng và số tin đã gửi.",
    rank: "#",
    customer: "Khách hàng",
    spent: "Tổng chi",
    keys: "Số key",
    days: "Ngày sử dụng",
    messages: "Tin campaign",
    unpriced: "Key thiếu giá",
    noCustomers: "Chưa có dữ liệu khách hàng",
    noCustomersDetail: "Danh sách sẽ xuất hiện sau khi có người kích hoạt license key.",
    noPriceNote: (count: number) => `${count} key chưa có giá nên không được cộng vào doanh thu hoặc tồn kho.`,
  },
  en: {
    pageTitle: "Revenue & loyal customers",
    eyebrow: "Admin Center",
    pageDetail: "Track license-key and renewal revenue, unsold inventory value, and the customers who spend the most.",
    loadError: "Could not load the revenue report",
    loadErrorDetail: "Please try again later or check your administrator access.",
    revenue: "Recorded revenue",
    inventory: "Unsold key value",
    soldKeys: "Activated keys",
    missingPrice: "Keys missing price",
    customers: "Customers",
    planBreakdown: "Plan breakdown",
    plan: "Plan",
    planRevenue: "Revenue",
    planInventory: "Inventory",
    planSold: "Sold",
    planAvailable: "Available",
    monthBreakdown: "Revenue by month",
    noMonthData: "No priced keys have been activated yet.",
    loyalTitle: "Loyal customers",
    loyalDetail: "Ranked by spend, then purchased keys, covered days, and campaign messages sent.",
    rank: "#",
    customer: "Customer",
    spent: "Total spent",
    keys: "Keys",
    days: "Covered days",
    messages: "Campaign messages",
    unpriced: "Unpriced keys",
    noCustomers: "No customer data yet",
    noCustomersDetail: "Customers appear here after someone activates a license key.",
    noPriceNote: (count: number) => `${count} keys have no price and are excluded from revenue and inventory totals.`,
  },
} as const;

type RevenueCopy = typeof copy.vi;

function formatVnd(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
}

function formatMonth(value: string, language: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function planLabel(plan: string) {
  return plan === "unlimited" ? "UNLIMITED" : plan.toUpperCase();
}

function CustomerRow({ customer, index, text }: { customer: AdminLoyalCustomer; index: number; text: typeof copy.vi }) {
  return (
    <tr className="border-t border-[#eef2f6]">
      <td className="px-4 py-4 text-center text-[13px] font-extrabold text-[#94a3b8]">{index + 1}</td>
      <td className="px-4 py-4">
        <div className="font-extrabold text-[#0f172a]">@{customer.username}</div>
        <div className="mt-1 text-[12px] font-medium text-[#64748b]">{customer.userId.slice(0, 8)}…</div>
      </td>
      <td className="px-4 py-4 text-right font-extrabold text-[#0f766e]">{formatVnd(customer.totalSpentVnd)}</td>
      <td className="px-4 py-4 text-right font-bold text-[#334155]">{customer.keysPurchased}</td>
      <td className="px-4 py-4 text-right font-bold text-[#334155]">{customer.coveredDays}</td>
      <td className="px-4 py-4 text-right font-bold text-[#334155]">{customer.messagesSent.toLocaleString()}</td>
      <td className="px-4 py-4 text-right font-bold text-[#b45309]">{customer.missingPriceKeys || "—"}</td>
    </tr>
  );
}

export default function AdminRevenuePage() {
  const { language } = useLanguage();
  const text = copy[language] as RevenueCopy;
  const { data, isLoading, error } = useGetAdminRevenueInsights({
    query: {
      queryKey: getGetAdminRevenueInsightsQueryKey(),
      staleTime: 30_000,
    },
  });

  if (error) {
    return (
      <AppLayout activePage="admin-revenue" title={text.pageTitle}>
        <Panel className="p-8 text-center text-[#e11d48]">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <h2 className="mb-2 text-lg font-bold">{text.loadError}</h2>
          <p className="text-sm font-medium opacity-80">{text.loadErrorDetail}</p>
        </Panel>
      </AppLayout>
    );
  }

  const summary = data?.summary;
  const maxMonthRevenue = Math.max(...(data?.byMonth.map((month) => month.revenueVnd) ?? [0]), 1);

  return (
    <AppLayout activePage="admin-revenue" title={text.pageTitle}>
      <SectionHeader eyebrow={text.eyebrow} title={text.pageTitle} detail={text.pageDetail} />

      {isLoading ? (
        <Panel className="flex h-64 items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#e2e8f0] border-t-[#1a2b88]" />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: text.revenue, value: formatVnd(summary?.totalRevenueVnd ?? 0), icon: Coins, tone: "text-[#0f766e] bg-[#ecfdf5]" },
              { label: text.inventory, value: formatVnd(summary?.inventoryValueVnd ?? 0), icon: KeyRound, tone: "text-[#1d4ed8] bg-[#eff6ff]" },
              { label: text.soldKeys, value: (summary?.soldKeys ?? 0).toLocaleString(), icon: BarChart3, tone: "text-[#7c3aed] bg-[#f5f3ff]" },
              { label: text.customers, value: (summary?.customers ?? 0).toLocaleString(), icon: UsersRound, tone: "text-[#c2410c] bg-[#fff7ed]" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <Panel key={label} className="p-5">
                <div className={`mb-5 grid h-11 w-11 place-items-center rounded-2xl ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-[12px] font-extrabold uppercase tracking-wider text-[#64748b]">{label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-[#0f172a]">{value}</p>
              </Panel>
            ))}
          </div>

          {(summary?.missingPriceKeys ?? 0) > 0 && (
            <div className="mt-5 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] font-bold text-[#92400e]">
              {text.noPriceNote(summary?.missingPriceKeys ?? 0)}
            </div>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <Panel className="overflow-hidden">
              <div className="border-b border-[#eef2f6] px-5 py-5">
                <h2 className="text-[17px] font-extrabold text-[#0f172a]">{text.planBreakdown}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wider text-[#64748b]">
                    <tr>
                      <th className="px-5 py-3">{text.plan}</th>
                      <th className="px-5 py-3 text-right">{text.planRevenue}</th>
                      <th className="px-5 py-3 text-right">{text.planInventory}</th>
                      <th className="px-5 py-3 text-right">{text.planSold}</th>
                      <th className="px-5 py-3 text-right">{text.planAvailable}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byPlan ?? []).map((item) => (
                      <tr key={item.plan} className="border-t border-[#eef2f6]">
                        <td className="px-5 py-4 font-extrabold uppercase text-[#1a2b88]">{planLabel(item.plan)}</td>
                        <td className="px-5 py-4 text-right font-bold text-[#0f766e]">{formatVnd(item.revenueVnd)}</td>
                        <td className="px-5 py-4 text-right font-bold text-[#334155]">{formatVnd(item.inventoryValueVnd)}</td>
                        <td className="px-5 py-4 text-right font-bold text-[#334155]">{item.soldKeys}</td>
                        <td className="px-5 py-4 text-right font-bold text-[#334155]">{item.inventoryKeys}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel className="p-5">
              <h2 className="text-[17px] font-extrabold text-[#0f172a]">{text.monthBreakdown}</h2>
              {(data?.byMonth ?? []).length === 0 ? (
                <p className="mt-8 text-center text-[13px] font-semibold text-[#94a3b8]">{text.noMonthData}</p>
              ) : (
                <div className="mt-5 space-y-4">
                  {data?.byMonth.map((month) => (
                    <div key={month.month}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px] font-bold text-[#475569]">
                        <span>{formatMonth(month.month, language)}</span>
                        <span>{formatVnd(month.revenueVnd)} · {month.soldKeys} key</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-[#eef2f6]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#1a2b88] to-[#36a4dd]" style={{ width: `${Math.max(4, (month.revenueVnd / maxMonthRevenue) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel className="mt-6 overflow-hidden">
            <div className="border-b border-[#eef2f6] px-5 py-5">
              <h2 className="text-[17px] font-extrabold text-[#0f172a]">{text.loyalTitle}</h2>
              <p className="mt-1 text-[13px] font-medium text-[#64748b]">{text.loyalDetail}</p>
            </div>
            {(data?.customers ?? []).length === 0 ? (
              <EmptyState icon={UsersRound} title={text.noCustomers} detail={text.noCustomersDetail} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-[13px]">
                  <thead className="bg-[#f8fafc] text-[10px] font-extrabold uppercase tracking-wider text-[#64748b]">
                    <tr>
                      <th className="w-12 px-4 py-3 text-center">{text.rank}</th>
                      <th className="px-4 py-3">{text.customer}</th>
                      <th className="px-4 py-3 text-right">{text.spent}</th>
                      <th className="px-4 py-3 text-right">{text.keys}</th>
                      <th className="px-4 py-3 text-right">{text.days}</th>
                      <th className="px-4 py-3 text-right">{text.messages}</th>
                      <th className="px-4 py-3 text-right">{text.unpriced}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.customers.map((customer, index) => (
                      <CustomerRow key={customer.userId} customer={customer} index={index} text={text} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </AppLayout>
  );
}