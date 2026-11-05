import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { UsersRound, Megaphone, MessageSquare, AlertCircle, LoaderCircle, RefreshCw, CircleHelp, ChevronRight, type LucideIcon } from "lucide-react";
import { AppLayout, QuietButton } from "@/components/layout/AppLayout";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TierEmblem } from "@/components/account/TierEmblem";
import { getGetAccountSummaryQueryKey, useGetAccountSummary, type AccountUsage } from "@workspace/api-client-react";
import { useLanguage, interfaceCopy, interfaceText, type Language } from "@/lib/i18n";
import "@/components/account/membership.css";

const copy = {
  en: {
    title: "Account",
    kicker: "Profile & Subscription",
    heading: "Account",
    detail: "Identity information and resource limits for this workspace.",
    loading: "Loading…",
    loadError: "Could not load account information",
    loadErrorDetail: "There was a problem connecting to the server.",
    retry: "Try again",
    joinedAt: "Joined:",
    planLabel: "Subscription",
    active: "Active",
    expired: "Expired",
    plan: "Plan",
    expiresAt: "Expires:",
    duration: "Duration:",
    unlimited: "Unlimited",
    renewalWarning: "Your plan expires in",
    renewalWarningEnd: ". Buy a new key before it runs out to avoid interruption.",
    buyKey: "Buy a new key",
    started: "Started",
    remaining: "Remaining",
    daysLabel: (n: number) => `${n} day${n === 1 ? "" : "s"}`,
    noExpiry: "No expiry",
    telegramSlots: "Telegram",
    accountSlots: (n: number | null) => n === null ? "Unlimited" : `${n} account${n === 1 ? "" : "s"}`,
    usageTitle: "Resource usage",
    usageDetail: "Current progress and limits for this workspace.",
    upgrade: "Upgrade plan",
    usedOf: (used: string) => `Used ${used}`,
    remainingOf: (rem: string) => `Remaining ${rem}`,
    noSystemLimit: "No system limit",
    telegramAccountsCard: "Telegram Accounts",
    campaignsCard: "Campaigns",
    messagesTodayCard: "Daily message budget used",
  },
  vi: {
    title: "Tài khoản",
    kicker: "Hồ sơ & Gói dịch vụ",
    heading: "Tài khoản",
    detail: "Thông tin định danh và giới hạn tài nguyên của không gian làm việc này.",
    loading: "Đang tải…",
    loadError: "Không thể tải thông tin",
    loadErrorDetail: "Đã xảy ra lỗi khi kết nối với máy chủ.",
    retry: "Thử lại",
    joinedAt: "Ngày tham gia:",
    planLabel: "Gói dịch vụ",
    active: "Đang hoạt động",
    expired: "Đã hết hạn",
    plan: "Gói",
    expiresAt: "Hết hạn:",
    duration: "Thời hạn:",
    unlimited: "Không giới hạn",
    renewalWarning: "Gói của bạn sẽ hết hạn sau",
    renewalWarningEnd: ". Hãy mua key mới trước khi hết hạn để không bị gián đoạn quyền sử dụng.",
    buyKey: "Mua key mới",
    started: "Bắt đầu",
    remaining: "Còn lại",
    daysLabel: (n: number) => `${n} ngày`,
    noExpiry: "Không thời hạn",
    telegramSlots: "Telegram",
    accountSlots: (n: number | null) => n === null ? "Không giới hạn" : `${n} tài khoản`,
    usageTitle: "Tài nguyên sử dụng",
    usageDetail: "Tiến độ và giới hạn hiện tại của không gian làm việc.",
    upgrade: "Nâng cấp gói",
    usedOf: (used: string) => `Đã dùng ${used}`,
    remainingOf: (rem: string) => `Còn lại ${rem}`,
    noSystemLimit: "Không giới hạn hệ thống",
    telegramAccountsCard: "Tài khoản Telegram",
    campaignsCard: "Chiến dịch",
    messagesTodayCard: "Ngân sách gửi đã dùng hôm nay",
  },
} as const;

function formatDate(dateStr: string | null, language: Language): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === "vi" ? "vi-VN" : "en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function formatCountdown(remainingMs: number, language: Language): string {
  const safeRemaining = Math.max(0, remainingMs);
  const days = Math.floor(safeRemaining / DAY_MS);
  const hours = Math.floor((safeRemaining % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((safeRemaining % HOUR_MS) / MINUTE_MS);
  if (language === "vi") {
    if (days > 0) return `${days} ngày ${hours} giờ`;
    if (hours > 0) return `${hours} giờ ${minutes} phút`;
    return `${minutes} phút`;
  }
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function UsageCard({
  title,
  icon: Icon,
  usage,
  testIdPrefix,
  text,
}: {
  title: string;
  icon: LucideIcon;
  usage: AccountUsage['telegramAccounts'];
  testIdPrefix: string;
  text: typeof copy["en"] | typeof copy["vi"];
}) {
  const isUnlimited = usage.limit === null;
  const isCritical = usage.percentage >= 90 && !isUnlimited;
  const isWarning = usage.percentage >= 75 && !isCritical && !isUnlimited;

  const urgency = isCritical ? " is-critical" : isWarning ? " is-warning" : "";
  const percentage = Math.max(0, Math.min(100, usage.percentage));

  return (
    <div className="usage-row" data-testid={`usage-${testIdPrefix}`}>
      <div className="usage-name"><Icon size={17} aria-hidden="true" /><span>{title}</span></div>
      <div className="usage-amount">
        <span data-testid={`usage-${testIdPrefix}-used`}>{usage.used.toLocaleString()}</span>
        {" / "}
        <span data-testid={`usage-${testIdPrefix}-limit`}>{isUnlimited ? text.unlimited : usage.limit?.toLocaleString()}</span>
      </div>
      <div className="usage-track" role={isUnlimited ? undefined : "progressbar"} aria-label={title}
        aria-valuemin={isUnlimited ? undefined : 0} aria-valuemax={isUnlimited ? undefined : 100}
        aria-valuenow={isUnlimited ? undefined : percentage}>
        <div className={`usage-fill${urgency}`} style={{ width: isUnlimited ? "100%" : `${percentage}%` }} />
      </div>
      <div className={`usage-caption${urgency}`}>
        <span>{isUnlimited ? text.noSystemLimit : `${Math.round(percentage)}%`}</span>
        {!isUnlimited && <span data-testid={`usage-${testIdPrefix}-remaining`}>{text.remainingOf(usage.remaining?.toLocaleString() ?? "0")}</span>}
      </div>
    </div>
  );
}

export default function Account() {
  const [, setLocation] = useLocation();
  const [now, setNow] = useState(() => Date.now());
  const [showDetails, setShowDetails] = useState(false);
  const { language } = useLanguage();
  const text = interfaceCopy(copy, language);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const { data: summary, isLoading, isError, refetch } = useGetAccountSummary({
    query: {
      queryKey: getGetAccountSummaryQueryKey(),
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    }
  });

  const liveExpiryMs = summary?.subscription.expiresAt
    ? new Date(summary.subscription.expiresAt).getTime() - now
    : null;
  const hasLiveExpired = liveExpiryMs !== null && liveExpiryMs <= 0;

  useEffect(() => {
    if (hasLiveExpired) void refetch();
  }, [hasLiveExpired, refetch]);

  if (isLoading) {
    return (
      <AppLayout activePage="account" title={text.title}>
        <div className="flex h-[50vh] items-center justify-center">
          <LoaderCircle className="h-8 w-8 animate-spin text-[#1a2b88]" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !summary) {
    return (
      <AppLayout activePage="account" title={text.title}>
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{text.loadError}</h2>
            <p className="text-sm text-slate-500">{text.loadErrorDetail}</p>
          </div>
          <QuietButton onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> {text.retry}
          </QuietButton>
        </div>
      </AppLayout>
    );
  }

  const { profile, subscription, usage } = summary;
  const expiryMs = liveExpiryMs;
  const isNearExpiry = expiryMs !== null && expiryMs > 0 && expiryMs <= 3 * DAY_MS;
  const isExpired = subscription.status === 'expired' || hasLiveExpired;
  const displayPlan = isExpired ? 'plus' : subscription.plan;
  const displayAccountLimit = isExpired ? 1 : subscription.accountLimit;
  const remainingDays = subscription.expiresAt
    ? Math.max(0, Math.ceil((expiryMs ?? 0) / DAY_MS))
    : null;
  const countdown = expiryMs !== null ? formatCountdown(expiryMs, language) : null;

  return (
    <AppLayout activePage="account" title={text.title}>
      <section className="tc-membership member-shell" data-tier={displayPlan}>
        <div className="member-topline">
          <div>
            <div className="member-eyebrow">{text.kicker}</div>
            <h1 className="member-heading">{text.heading}</h1>
            <p className="member-intro">{text.detail}</p>
          </div>
        </div>
        <section className="membership-card" data-tier={displayPlan} data-expired={isExpired} data-testid="membership-card">
          <div className="card-main">
            <div className="member-card-head">
              <div className="member-id">
                <div className="member-label">{["VIP", text.planLabel, "·", "Telecampaign"].join(" ")}</div>
                <h2 className="member-plan" data-testid="subscription-plan">{displayPlan.toUpperCase()}</h2>
                <div className={`member-state${isExpired ? " is-expired" : ""}`} data-testid="subscription-status">
                  <span className="state-dot" aria-hidden="true" />{isExpired ? text.expired : text.active}
                </div>
              </div>
              <TierEmblem tier={displayPlan} />
            </div>
            <div className="member-card-core">
              <div>
                <div className="member-username" data-testid="account-username">{profile.username}</div>
                {profile.email && <div className="member-joined" data-testid="account-email">{profile.email}</div>}
                <div className="member-joined">{text.joinedAt} <span data-testid="account-joined-at">{formatDate(profile.joinedAt, language)}</span></div>
              </div>
              <div className="member-facts">
                <div><div className="member-fact-label">{text.started}</div><div className="member-fact-value" data-testid="subscription-started-at">{formatDate(subscription.startedAt, language) || "—"}</div></div>
                <div>
                  <div className="member-fact-label">{text.expiresAt}</div>
                  <div className="member-fact-value" data-testid="subscription-expires-at">{subscription.expiresAt ? formatDate(subscription.expiresAt, language) : text.noExpiry}</div>
                </div>
                <div><div className="member-fact-label">{text.remaining}</div><div className="member-fact-value" data-testid="subscription-remaining-days">{remainingDays === null ? text.noExpiry : text.daysLabel(remainingDays)}</div></div>
              </div>
            </div>
            {isNearExpiry && (
              <div className="member-expiry-warning" role="status" data-testid="subscription-expiry-warning">
                {text.renewalWarning} <strong data-testid="subscription-expiry-countdown">{countdown}</strong>{text.renewalWarningEnd}
              </div>
            )}
            <div className="member-actions">
              <button className="member-button" onClick={() => setShowDetails(true)} data-testid="button-plan-details">
                <CircleHelp size={15} aria-hidden="true" />{interfaceText("Details", language)}<ChevronRight size={15} aria-hidden="true" />
              </button>
              <button className="member-button primary" onClick={() => setLocation("/upgrade")} data-testid={isNearExpiry || isExpired ? "button-buy-license-key" : "button-upgrade-inline"}>
                {isNearExpiry || isExpired ? text.buyKey : displayPlan === "unlimited" ? interfaceText("Renew plan", language) : text.upgrade}<ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
        <section className="member-section" aria-labelledby="account-resource-title">
          <div className="section-heading"><div><h2 id="account-resource-title">{text.usageTitle}</h2><p>{text.usageDetail}</p></div></div>
          <div className="usage-list">
            <UsageCard title={text.telegramAccountsCard} icon={UsersRound} usage={usage.telegramAccounts} testIdPrefix="telegram-accounts" text={text} />
            <UsageCard title={text.campaignsCard} icon={Megaphone} usage={usage.campaigns} testIdPrefix="campaigns" text={text} />
            <UsageCard title={text.messagesTodayCard} icon={MessageSquare} usage={usage.messagesToday} testIdPrefix="messages" text={text} />
          </div>
        </section>
      </section>
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="tc-membership border-0 bg-transparent p-0 shadow-none sm:max-w-[420px]">
          <div className="member-modal max-h-[85dvh] overflow-y-auto">
            <DialogHeader className="pr-6 text-start">
              <DialogTitle>{text.planLabel} · {displayPlan.toUpperCase()}</DialogTitle>
              <DialogDescription>{text.usageDetail}</DialogDescription>
            </DialogHeader>
            <ul className="modal-list">
              <li><UsersRound size={17} aria-hidden="true" /><span>{text.telegramAccountsCard}: <strong data-testid="subscription-account-limit">{text.accountSlots(displayAccountLimit)}</strong></span></li>
              <li><Megaphone size={17} aria-hidden="true" /><span>{text.campaignsCard}: <strong>{usage.campaigns.limit === null ? text.unlimited : usage.campaigns.limit.toLocaleString()}</strong></span></li>
              <li><MessageSquare size={17} aria-hidden="true" /><span>{text.messagesTodayCard}: <strong>{usage.messagesToday.limit === null ? text.unlimited : usage.messagesToday.limit.toLocaleString()}</strong></span></li>
              <li><span>{text.expiresAt} <strong>{subscription.expiresAt ? formatDate(subscription.expiresAt, language) : text.noExpiry}</strong></span></li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
