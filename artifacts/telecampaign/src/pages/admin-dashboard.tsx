import { useLocation } from "wouter";
import { AppLayout, Panel } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";
import {
  Activity, ArrowUpRight, Bell, CircleDollarSign, KeyRound, LifeBuoy,
  MessageSquareText, ScrollText, Settings2, ShieldCheck, UsersRound,
} from "lucide-react";

export default function AdminDashboardPage() {
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const vi = language === "vi";
  const groups = [
    {
      id: "users-keys",
      title: vi ? "Người dùng & Key" : "Users & keys",
      summary: vi ? "Tài khoản, quyền truy cập và toàn bộ vòng đời license." : "Accounts, access, and the full license lifecycle.",
      icon: UsersRound,
      tone: "teal",
      primary: { label: vi ? "Quản lý người dùng" : "Manage users", path: "/admin/users", icon: UsersRound },
      links: [
        { label: vi ? "Danh mục key & gia hạn" : "Key inventory & renewals", path: "/admin/license-keys", icon: KeyRound },
      ],
    },
    {
      id: "orders-revenue",
      title: vi ? "Đơn hàng & Doanh thu" : "Orders & revenue",
      summary: vi ? "Đối soát thanh toán và xem riêng dòng tiền với định giá key." : "Review payments and keep cash revenue separate from key valuation.",
      icon: CircleDollarSign,
      tone: "blue",
      primary: { label: vi ? "Đơn mua & thanh toán" : "Purchase orders & payments", path: "/admin/purchase-orders", icon: CircleDollarSign },
      links: [
        { label: vi ? "Doanh thu & giá trị key" : "Revenue & key valuation", path: "/admin/revenue", icon: Activity },
      ],
    },
    {
      id: "notifications-care",
      title: vi ? "Thông báo & Chăm sóc" : "Notifications & care",
      summary: vi ? "Gửi thông tin đúng kênh và hỗ trợ từng cuộc hội thoại." : "Manage announcements and respond to customer conversations.",
      icon: LifeBuoy,
      tone: "amber",
      primary: { label: vi ? "Thông báo người dùng" : "User notifications", path: "/admin/notifications", icon: Bell },
      links: [
        { label: vi ? "Popup thông báo" : "Announcement popups", path: "/admin/popups", icon: MessageSquareText },
        { label: vi ? "Hỗ trợ chat" : "Support chat", path: "/admin/support-chat", icon: LifeBuoy },
        { label: vi ? "Góp ý & thảo luận" : "Feedback & discussion", path: "/dashboard/feedback", icon: MessageSquareText },
      ],
    },
    {
      id: "system",
      title: vi ? "Hệ thống" : "System",
      summary: vi ? "Cấu hình, vận hành và theo dõi các sự kiện quan trọng." : "Configure, operate, and review important system events.",
      icon: Settings2,
      tone: "slate",
      primary: { label: vi ? "Cài đặt hệ thống" : "System settings", path: "/admin/system-settings", icon: Settings2 },
      links: [
        { label: vi ? "Giám sát vận hành" : "Operations monitor", path: "/admin/operations", icon: Activity },
        { label: vi ? "Nhóm đang hoạt động" : "Active groups", path: "/admin/active-groups", icon: UsersRound },
        { label: vi ? "Sự kiện hệ thống" : "System events", path: "/admin/system-events", icon: ScrollText },
        { label: vi ? "Công cụ nâng cao & báo cáo" : "Advanced tools & reports", path: "/admin/tools", icon: Activity },
      ],
    },
  ] as const;
  const palette = {
    teal: { icon: "text-[#147b87]", surface: "bg-[#e9f3f3]", line: "border-[#c9dddd]", eyebrow: "text-[#4f777d]" },
    blue: { icon: "text-[#416986]", surface: "bg-[#edf3f7]", line: "border-[#d3e0e8]", eyebrow: "text-[#637e8f]" },
    amber: { icon: "text-[#98703d]", surface: "bg-[#f7f2e9]", line: "border-[#e8ddc8]", eyebrow: "text-[#8b7557]" },
    slate: { icon: "text-[#526c79]", surface: "bg-[#eff3f4]", line: "border-[#dbe4e7]", eyebrow: "text-[#647a85]" },
  };

  return (
    <AppLayout activePage="admin" title={vi ? "Trung tâm quản trị" : "Admin center"} hideUpgrade>
      <div className="mb-8 flex flex-col justify-between gap-5 border-b border-[#dfe8eb] pb-7 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#52707e]">
            <ShieldCheck className="h-4 w-4 text-[#147b87]" />
            {vi ? "Không gian quản trị" : "Administration"}
          </div>
          <h2 className="text-3xl font-extrabold tracking-[-0.035em] text-[#183748] sm:text-[38px]">
            {vi ? "Mọi việc, đúng nơi." : "Everything, in its place."}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#637b87]">
            {vi ? "Bốn khu vực vận hành rõ ràng. Đường dẫn cũ và toàn bộ quy trình hiện có vẫn được giữ nguyên." : "Four clear work areas. Existing routes and operational workflows remain unchanged."}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#dce7eb] bg-white px-3.5 py-2.5 text-xs font-bold text-[#496672]">
          <span className="h-2 w-2 rounded-full bg-[#4e9583]" />
          {vi ? "Quyền quản trị đang hoạt động" : "Admin access active"}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group, index) => {
          const style = palette[group.tone];
          const Icon = group.icon;
          const PrimaryIcon = group.primary.icon;
          return (
            <Panel key={group.id} className={`overflow-hidden rounded-2xl border ${style.line} shadow-[0_2px_10px_rgba(28,57,69,.035)]`}>
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${style.surface} ${style.icon}`}>
                  <Icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`mb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] ${style.eyebrow}`}>
                    {vi ? `Khu vực 0${index + 1}` : `AREA 0${index + 1}`}
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight text-[#1c3b4b]">{group.title}</h3>
                  <p className="mt-1 max-w-xl text-[13px] leading-5 text-[#68808b]">{group.summary}</p>
                </div>
              </div>
              <div className="mx-5 border-t border-[#e8eef0] sm:mx-6" />
              <div className="p-4 sm:px-6 sm:pb-5">
                <button type="button" onClick={() => navigate(group.primary.path)}
                  className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-[#f4f8f9] px-4 py-3 text-left transition hover:bg-[#eaf2f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147b87]"
                  data-testid={`admin-primary-${group.id}`}>
                  <span className="flex min-w-0 items-center gap-3 text-sm font-extrabold text-[#23485a]">
                    <PrimaryIcon className="h-4 w-4 shrink-0 text-[#147b87]" />
                    <span className="truncate">{group.primary.label}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-[#77909a] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
                <div className={`mt-2 grid gap-1 ${group.links.length > 2 ? "sm:grid-cols-2" : ""}`}>
                  {group.links.map((link) => {
                    const LinkIcon = link.icon;
                    return (
                      <button key={link.path} type="button" onClick={() => navigate(link.path)}
                        className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-left text-[12px] font-bold text-[#58717d] transition hover:bg-[#f5f8f9] hover:text-[#1d485b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147b87]"
                        data-testid={`admin-link-${group.id}-${link.path.split("/").pop()}`}>
                        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-[#8097a0]" />
                        <span className="min-w-0 flex-1">{link.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </AppLayout>
  );
}
