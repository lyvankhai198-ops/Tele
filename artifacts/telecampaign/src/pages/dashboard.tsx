import { 
  Bell, 
  FileText, 
  LayoutGrid, 
  Megaphone, 
  Send, 
  Users, 
  XCircle,
  LoaderCircle,
  AlertCircle
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";
import { useGetDashboard } from "@workspace/api-client-react";

export default function Dashboard() {
  const { t } = useLanguage();
  const { data, isLoading, error } = useGetDashboard();

  if (isLoading) {
    return (
      <AppLayout activePage="dashboard" title={t("Dashboard")}>
        <div className="flex flex-col items-center justify-center h-[60vh] text-[#64748b]">
          <LoaderCircle className="h-10 w-10 animate-spin mb-4 text-[#1a2b88]" />
          <p className="font-bold text-[15px]">{t("Loading data…")}</p>
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout activePage="dashboard" title={t("Dashboard")}>
        <div className="flex flex-col items-center justify-center h-[60vh] text-[#ef4444]">
          <AlertCircle className="h-12 w-12 mb-4" />
          <p className="font-extrabold text-xl mb-1">{t("Error loading data")}</p>
          <p className="text-[15px] font-medium text-[#64748b]">{t("Please try again later.")}</p>
        </div>
      </AppLayout>
    );
  }

  const { metrics, adminNotifications, recentCampaigns, recentActivity } = data;

  return (
    <AppLayout activePage="dashboard" title={t("Dashboard")}>
      
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-8" data-testid="dashboard-metrics">
        <DashboardMetricCard label={t("Telegram Accounts")} value={metrics.telegramAccounts} icon={Users} iconColor="text-[#2563eb]" iconBg="bg-[#eff6ff]" />
        <DashboardMetricCard label={t("Active Groups")} value={metrics.activeGroups} icon={LayoutGrid} iconColor="text-[#059669]" iconBg="bg-[#ecfdf5]" />
        <DashboardMetricCard label={t("Message Templates")} value={metrics.messageTemplates} icon={FileText} iconColor="text-[#7c3aed]" iconBg="bg-[#f5f3ff]" />
        <DashboardMetricCard label={t("Campaigns")} value={metrics.campaigns} icon={Megaphone} iconColor="text-[#ea580c]" iconBg="bg-[#fff7ed]" />
        <DashboardMetricCard label={t("Sent Today")} value={metrics.sentToday} icon={Send} iconColor="text-[#0891b2]" iconBg="bg-[#ecfeff]" />
        <DashboardMetricCard label={t("Failed Today")} value={metrics.failedToday} icon={XCircle} iconColor="text-[#e11d48]" iconBg="bg-[#fff1f2]" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
        <div className="space-y-8">
          {/* Admin Notifications */}
          <div className="bg-[#f8fafc] border border-[#cbd5e1] rounded-3xl p-6" data-testid="admin-notices">
            <div className="flex items-center gap-3.5 mb-6">
              <span className="h-12 w-12 bg-[#e0e7ff] text-[#1d4ed8] rounded-2xl flex items-center justify-center shadow-sm">
                <Bell className="h-6 w-6" />
              </span>
              <h2 className="text-[19px] font-extrabold text-[#0f172a] uppercase tracking-wide">{t("ADMIN Notifications")}</h2>
            </div>
            
            {adminNotifications.length > 0 ? (
              <div className="space-y-7">
                {adminNotifications.map((notice) => (
                  <div key={notice.id} className="text-[14px] text-[#0f172a]" data-testid={`notice-${notice.id}`}>
                    <div className="font-extrabold mb-1.5 text-[#0f172a]">{t("Update on")} {formatNoticeDate(notice.publishedAt)} :</div>
                    <div className="whitespace-pre-line leading-relaxed text-[#334155] font-medium">{notice.body}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-[#64748b] text-[15px] font-bold">
                {t("No notifications.")}
              </div>
            )}
          </div>

          {/* Recent Campaigns */}
          <div className="bg-white border border-[#eef2f6] rounded-3xl overflow-hidden shadow-sm" data-testid="recent-campaigns">
            <div className="p-6 border-b border-[#eef2f6] bg-white">
              <h2 className="text-[20px] font-extrabold text-[#0f172a] tracking-tight">{t("Recent Campaigns")}</h2>
            </div>
            
            {recentCampaigns.length > 0 ? (
              <div className="divide-y divide-[#eef2f6]">
                <div className="flex justify-between px-6 py-4 bg-[#f8fafc] text-[12px] font-extrabold text-[#64748b] uppercase tracking-wider">
                  <span>{t("Name")}</span>
                  <span>{t("Status")}</span>
                </div>
                {recentCampaigns.map((camp) => (
                  <div key={camp.id} className="flex justify-between items-center px-6 py-4 bg-white hover:bg-[#f8fafc] transition-colors" data-testid={`campaign-${camp.id}`}>
                    <span className="text-[15px] font-extrabold text-[#1a2b88] truncate pr-4">{camp.name}</span>
                    <span className={`shrink-0 px-3.5 py-1.5 text-[11px] font-extrabold uppercase rounded-full tracking-wider ${getCampaignStatusColor(camp.status)}`}>
                      {t(camp.status)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-[#64748b] text-[15px] font-bold">
                {t("No campaigns yet.")}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-[#eef2f6] rounded-3xl overflow-hidden shadow-sm self-start" data-testid="recent-activity">
          <div className="p-6 border-b border-[#eef2f6] bg-white">
            <h2 className="text-[20px] font-extrabold text-[#0f172a] tracking-tight">{t("Recent Activity")}</h2>
          </div>
          
          {recentActivity.length > 0 ? (
            <div className="divide-y divide-[#eef2f6]">
              <div className="grid grid-cols-[75px_1fr_85px] gap-3 px-6 py-4 bg-[#f8fafc] text-[12px] font-extrabold text-[#64748b] uppercase tracking-wider">
                <span>{t("Time")}</span>
                <span>{t("Campaigns")}</span>
                <span className="text-right">{t("Status")}</span>
              </div>
              {recentActivity.map((log) => {
                const isSuccess = log.level !== "error" && log.level !== "warn";
                const campName = recentCampaigns.find(c => c.id === log.campaignId)?.name ?? t("Campaign (fallback)");
                
                return (
                  <div key={log.id} className="grid grid-cols-[75px_1fr_85px] items-center gap-3 px-6 py-4 bg-white hover:bg-[#f8fafc] transition-colors" data-testid={`log-${log.id}`}>
                    <span className="text-[13px] font-mono font-bold text-[#64748b]">{formatLogTime(log.createdAt)}</span>
                    <span className="text-[14px] font-extrabold text-[#1a2b88] truncate">{log.campaignId ? campName : t("System")}</span>
                    <span className="text-right flex justify-end">
                      {isSuccess ? (
                        <span className="inline-block px-3.5 py-1.5 bg-[#1a2b88] text-white text-[11px] font-extrabold rounded-full">
                          {t("Success")}
                        </span>
                      ) : (
                        <span className="inline-block px-3.5 py-1.5 bg-[#ef4444] text-white text-[11px] font-extrabold rounded-full">
                          {t("Failed")}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
             <div className="text-center py-12 text-[#64748b] text-[15px] font-bold">
                {t("No activity yet.")}
             </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function DashboardMetricCard({ label, value, icon: Icon, iconColor, iconBg }: any) {
  return (
    <div className="bg-white border border-[#eef2f6] rounded-3xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-4 hover:border-[#cbd5e1] transition-colors cursor-default" data-testid={`metric-${label}`}>
      <span className={`h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-2xl flex items-center justify-center ${iconBg} ${iconColor}`}>
        <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-2xl sm:text-3xl font-extrabold text-[#0f172a] leading-none mb-1.5 tracking-tight">{value}</div>
        <div className="text-[12px] sm:text-[13px] font-bold text-[#64748b] leading-tight truncate">{label}</div>
      </div>
    </div>
  );
}

function formatNoticeDate(isoStr: string) {
  try {
    const date = new Date(isoStr);
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} - ${date.getHours()}h${date.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return isoStr;
  }
}

function formatLogTime(isoStr: string) {
  try {
    const date = new Date(isoStr);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  } catch {
    return isoStr;
  }
}

function getCampaignStatusColor(status: string) {
  const s = status.toLowerCase();
  if (s === 'running') return 'bg-[#f8fafc] text-[#0f172a] border border-[#cbd5e1]';
  if (s === 'paused') return 'bg-[#fff7ed] text-[#ea580c] border border-[#fed7aa]';
  if (s === 'completed' || s === 'success') return 'bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]';
  if (s === 'failed' || s === 'error') return 'bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3]';
  return 'bg-[#f8fafc] text-[#475569] border border-[#cbd5e1]';
}
