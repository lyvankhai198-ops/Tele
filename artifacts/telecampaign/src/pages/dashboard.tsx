import { 
  Activity,
  ArrowRight,
  Bell, 
  CalendarClock,
  Check,
  FileText, 
  Gauge,
  LayoutGrid, 
  Megaphone, 
  Send, 
  ShieldCheck,
  Users, 
  LoaderCircle,
  AlertCircle
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";
import { useGetDashboard, useGetUpgradeSummary } from "@workspace/api-client-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { language, t } = useLanguage();
  const { data, isLoading, error } = useGetDashboard();
  const { data: upgradeSummary } = useGetUpgradeSummary();
  const [, setLocation] = useLocation();

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
  const expiresAt = upgradeSummary?.subscription.expiresAt ? new Date(upgradeSummary.subscription.expiresAt) : null;
  const remainingHours = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000))) : null;
  const showExpiryNotice = upgradeSummary?.subscription.status === "active" && remainingHours !== null && remainingHours <= 24;
  const expiryNotice = language === "vi"
    ? `Thời gian sử dụng còn ${remainingHours} giờ. Hãy mua license key để không bị gián đoạn.`
    : `${remainingHours} hour${remainingHours === 1 ? "" : "s"} remaining. Buy a license key to avoid interruption.`;
  const nextCampaign = recentCampaigns.find((campaign) => campaign.scheduledAt && ["queued", "running"].includes(campaign.status)) ?? recentCampaigns[0];
  const deliveryTotal = metrics.sentToday + metrics.failedToday;
  const deliveryRate = deliveryTotal > 0 ? Math.round((metrics.sentToday / deliveryTotal) * 100) : 100;

  return (
    <AppLayout activePage="dashboard" title={t("Dashboard")}>
      {showExpiryNotice && (
        <section className="mb-8 flex flex-col gap-4 rounded-2xl border border-[#e8dfbd] bg-[#fffaf0] p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="subscription-expiry-notice">
          <div>
            <p className="font-extrabold text-[#8e6b1c]">{language === "vi" ? "Sắp hết thời gian dùng thử" : "Your trial is nearly over"}</p>
            <p className="mt-1 text-sm font-medium text-[#9b8754]">{expiryNotice}</p>
          </div>
          <button
            type="button"
            onClick={() => setLocation("/upgrade")}
            className="shrink-0 rounded-xl bg-[#d15c40] px-5 py-2.5 text-sm font-extrabold text-[#fff8f1] transition hover:bg-[#b84c35]"
          >
            {language === "vi" ? "Mua key" : "Buy key"}
          </button>
        </section>
      )}

      <section className="mb-10 flex flex-col justify-between gap-7 border-b border-[#d9d1c4] pb-9 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.19em] text-[#d36e59]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ee876c]" />{t("Operator workspace")}
          </div>
          <h1 className="max-w-3xl text-[42px] leading-[0.98] tracking-[-0.055em] text-[#17343b] sm:text-[58px]">
            {t("Make the next send")}<br /><em className="font-serif font-normal text-[#d36e59]">{t("worth opening.")}</em>
          </h1>
          <p className="mt-5 max-w-[520px] text-[14px] font-medium leading-6 text-[#71817d]">{t("A clear view of what is ready, what needs your eye, and what will move when you press send.")}</p>
        </div>
        <button onClick={() => setLocation("/dashboard/campaigns")} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#e97961] px-5 text-[13px] font-extrabold text-[#17343b] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#ee876c]">
          <Send className="h-4 w-4" />{t("Build a campaign")}<ArrowRight className="ml-1 h-4 w-4" />
        </button>
      </section>

      <section className="mb-10 grid gap-5 lg:grid-cols-[1.35fr_.65fr]" data-testid="dashboard-metrics">
        <div className="rounded-2xl bg-[#17343b] p-6 text-[#f5f1e9] sm:p-7" data-testid="delivery-pulse">
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#8facaa]">{t("Delivery pulse")}</div>
              <div className="flex items-baseline gap-3">
                <strong className="font-serif text-[50px] font-normal leading-none">{metrics.sentToday.toLocaleString(language === "vi" ? "vi-VN" : "en-US")}</strong>
                <span className="text-[12px] font-bold text-[#86c89b]">{t("Messages delivered")}</span>
              </div>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#2c5056] text-[#eea18c]"><Gauge className="h-[19px] w-[19px]" /></span>
          </div>
          <div className="mt-7 flex items-center justify-between text-[10px] font-bold text-[#8facaa]">
            <span>{t("Sent Today")}</span><span>{metrics.failedToday} {t("Failed Today").toLowerCase()}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#31545a]"><div className="h-full rounded-full bg-[#ee876c]" style={{ width: `${deliveryRate}%` }} /></div>
          <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-[#b4cac0]"><ShieldCheck className="h-4 w-4 text-[#86c89b]" />{t("Within safe sending limits")}<span className="ml-auto font-mono text-[#8facaa]">{deliveryRate}%</span></div>
        </div>
        <div className="rounded-2xl border border-[#ded8cc] bg-[#fbf8f2] p-6 sm:p-7">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#71817d]">{t("Next on the desk")}</div>
          {nextCampaign ? (
            <>
              <div className="mt-5 flex items-start gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#f4ded4] text-[#d36e59]"><CalendarClock className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#71817d]">{formatCampaignSchedule(nextCampaign.scheduledAt, language)}</div>
                  <div className="mt-1 truncate text-[15px] font-extrabold text-[#17343b]">{nextCampaign.name}</div>
                  <div className="mt-2 text-[11px] font-medium text-[#71817d]">{nextCampaign.targetCount} {t("approved destinations")}</div>
                </div>
              </div>
              <button onClick={() => setLocation("/dashboard/campaigns")} className="mt-6 flex items-center gap-2 text-[11px] font-extrabold text-[#d36e59] transition hover:gap-3">{t("Review before sending")}<ArrowRight className="h-3.5 w-3.5" /></button>
            </>
          ) : <p className="mt-6 text-[13px] font-medium leading-5 text-[#71817d]">{t("No scheduled campaign")}</p>}
        </div>
      </section>

      <section className="grid gap-9 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.65fr)]">
        <div>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#71817d]">{t("The working queue")}</div><h2 className="font-serif text-[30px] font-normal tracking-[-0.03em] text-[#17343b]">{t("Campaigns in motion")}</h2></div>
            <button onClick={() => setLocation("/dashboard/campaigns")} className="hidden items-center gap-1 text-[11px] font-extrabold text-[#d36e59] sm:flex">{t("View all")}<ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#ded8cc] bg-[#fbf8f2]" data-testid="recent-campaigns">
            {recentCampaigns.length > 0 ? recentCampaigns.map((camp) => {
              const progress = camp.targetCount ? Math.min(100, Math.round((camp.sentCount / camp.targetCount) * 100)) : 0;
              return (
                <div key={camp.id} className="grid gap-4 border-b border-[#e6dfd4] p-5 last:border-0 transition hover:bg-[#f5f1e9] sm:grid-cols-[1.45fr_.75fr_100px] sm:items-center" data-testid={`campaign-${camp.id}`}>
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${camp.status === "completed" ? "bg-[#86c89b]" : camp.status === "failed" ? "bg-[#d15c40]" : "bg-[#d7a35d]"}`} /><span className="truncate text-[13px] font-extrabold text-[#17343b]">{camp.name}</span></div><div className="mt-2 text-[10px] font-medium text-[#8b9891]">{camp.sentCount} / {camp.targetCount} {t("destinations")}</div></div>
                  <div><div className="mb-1.5 flex justify-between text-[9px] font-bold text-[#8b9891]"><span>{t(camp.status)}</span><span>{progress}%</span></div><div className="h-1.5 rounded-full bg-[#e4ded3]"><div className="h-full rounded-full bg-[#86c89b]" style={{ width: `${progress}%` }} /></div></div>
                  <div className="font-mono text-[10px] font-bold text-[#71817d] sm:text-right">{camp.scheduledAt ? formatCampaignSchedule(camp.scheduledAt, language) : t("Not scheduled")}</div>
                </div>
              );
            }) : <div className="px-6 py-12 text-center text-[13px] font-bold text-[#71817d]">{t("No campaigns yet.")}</div>}
          </div>
        </div>

        <aside className="space-y-7">
          <div>
            <div className="mb-5 flex items-end justify-between"><div><div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#71817d]">{t("Quiet confidence")}</div><h2 className="font-serif text-[30px] font-normal tracking-[-0.03em] text-[#17343b]">{t("Signal check")}</h2></div><Activity className="mb-1 h-5 w-5 text-[#d36e59]" /></div>
            <div className="space-y-2.5">
              <SignalRow icon={Users} label={t("Telegram Accounts")} value={`${metrics.telegramAccounts} ${t("managed")}`} />
              <SignalRow icon={LayoutGrid} label={t("Active Groups")} value={`${metrics.activeGroups} ${t("approved destinations")}`} />
              <SignalRow icon={FileText} label={t("Message Templates")} value={`${metrics.messageTemplates} ${t("approved")}`} />
              <SignalRow icon={Megaphone} label={t("Campaigns")} value={`${metrics.campaigns} ${t("in workspace")}`} />
            </div>
          </div>

          <div className="rounded-2xl bg-[#e9dfd2] p-5" data-testid="admin-notices">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a15e4e]"><Bell className="h-3.5 w-3.5" />{t("ADMIN Notifications")}</div>
            {adminNotifications.length > 0 ? <div className="space-y-4">{adminNotifications.slice(0, 2).map((notice) => <div key={notice.id} data-testid={`notice-${notice.id}`}><div className="mb-1 text-[10px] font-extrabold text-[#a15e4e]">{t("Update on")} {formatNoticeDate(notice.publishedAt)}</div><p className="line-clamp-3 whitespace-pre-line text-[12px] font-semibold leading-5 text-[#4d625e]">{notice.body}</p></div>)}</div> : <p className="text-[12px] font-semibold text-[#4d625e]">{t("No notifications.")}</p>}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#ded8cc] bg-[#fbf8f2]" data-testid="recent-activity">
            <div className="flex items-center justify-between border-b border-[#e6dfd4] p-5"><h2 className="text-[13px] font-extrabold text-[#17343b]">{t("Recent Activity")}</h2><Check className="h-4 w-4 text-[#86c89b]" /></div>
            {recentActivity.length > 0 ? recentActivity.slice(0, 4).map((log) => { const isSuccess = log.level !== "error" && log.level !== "warn"; const campName = recentCampaigns.find((c) => c.id === log.campaignId)?.name ?? t("System"); return <div key={log.id} className="grid grid-cols-[45px_1fr_auto] items-center gap-3 border-b border-[#e6dfd4] px-5 py-3.5 last:border-0" data-testid={`log-${log.id}`}><span className="font-mono text-[10px] font-bold text-[#8b9891]">{formatLogTime(log.createdAt)}</span><span className="truncate text-[11px] font-extrabold text-[#4d625e]">{campName}</span><span className={`text-[10px] font-extrabold ${isSuccess ? "text-[#5b9b72]" : "text-[#d15c40]"}`}>{isSuccess ? t("Success") : t("Failed")}</span></div>; }) : <div className="px-5 py-8 text-center text-[12px] font-bold text-[#71817d]">{t("No activity yet.")}</div>}
          </div>
        </aside>
      </section>
    </AppLayout>
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

function formatCampaignSchedule(value: string | null, language: "vi" | "en") {
  if (!value) return language === "vi" ? "Chưa lên lịch" : "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SignalRow({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#ded8cc] bg-[#fbf8f2] px-4 py-3">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e2f0e5] text-[#5b9b72]"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] font-extrabold text-[#4d625e]">{label}</span><span className="mt-0.5 block text-[10px] font-medium text-[#8b9891]">{value}</span></span>
      <span className="h-2 w-2 rounded-full bg-[#86c89b]" />
    </div>
  );
}
