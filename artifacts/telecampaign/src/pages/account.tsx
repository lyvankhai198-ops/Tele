import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { UsersRound, Megaphone, MessageSquare, AlertCircle, LoaderCircle, RefreshCw, type LucideIcon } from "lucide-react";
import { AppLayout, PageIntro, QuietButton } from "@/components/layout/AppLayout";
import { getGetAccountSummaryQueryKey, useGetAccountSummary, type AccountUsage } from "@workspace/api-client-react";
import { useLanguage, type Language } from "@/lib/i18n";

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

  const progressColor = isCritical ? 'bg-[#e11d48]' : isWarning ? 'bg-[#ea580c]' : 'bg-[#10b981]';
  const progressBg = isCritical ? 'bg-[#ffe4e6]' : isWarning ? 'bg-[#ffedd5]' : 'bg-[#d1fae5]';
  const textColor = isCritical ? 'text-[#e11d48]' : isWarning ? 'text-[#ea580c]' : 'text-[#059669]';

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-[#eef2f6] bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_8px_30px_rgba(15,23,42,0.06)]" data-testid={`usage-${testIdPrefix}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f4f7fb] text-[#1a2b88] border border-[#eef2f6]">
            <Icon className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="text-[13px] font-extrabold uppercase tracking-wider text-[#475569]">{title}</span>
        </div>
        {!isUnlimited && (
          <span className={`text-[15px] font-extrabold ${textColor}`}>
            {Math.round(usage.percentage)}%
          </span>
        )}
      </div>

      <div className="mt-8">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-extrabold tracking-tight text-[#0f172a]" data-testid={`usage-${testIdPrefix}-used`}>
            {usage.used.toLocaleString()}
          </span>
          <span className="mb-1.5 text-lg font-bold text-[#94a3b8]">/</span>
          <span className="mb-1.5 text-xl font-extrabold text-[#64748b]" data-testid={`usage-${testIdPrefix}-limit`}>
            {isUnlimited ? '∞' : usage.limit?.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-7">
        <div className={`h-2.5 w-full overflow-hidden rounded-full ${isUnlimited ? 'bg-[#e2e8f0]' : progressBg}`}>
          <div
            className={`h-full rounded-full transition-all duration-1000 ${isUnlimited ? 'bg-[#94a3b8] w-full' : progressColor}`}
            style={{ width: isUnlimited ? '100%' : `${Math.min(100, usage.percentage)}%` }}
          />
        </div>
        <div className="mt-3.5 flex items-center justify-between text-[13px] font-semibold">
          {isUnlimited ? (
            <span className="text-[#64748b]">{text.noSystemLimit}</span>
          ) : (
            <>
              <span className="text-[#64748b]">
                {text.usedOf(usage.used.toLocaleString())}
              </span>
              <span className="text-[#0f172a]" data-testid={`usage-${testIdPrefix}-remaining`}>
                {text.remainingOf(usage.remaining?.toLocaleString() ?? "0")}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Account() {
  const [, setLocation] = useLocation();
  const [now, setNow] = useState(() => Date.now());
  const { language } = useLanguage();
  const text = copy[language];

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
      <PageIntro
        kicker={text.kicker}
        heading={text.heading}
        detail={text.detail}
      />

      <div className="space-y-10">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#0b1121] p-1 shadow-2xl">
          <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#1a2b88] to-[#0f172a] p-8 sm:p-10">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/5 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-[#1e40af]/20 blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-6">
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-white/10 text-3xl font-extrabold text-white shadow-inner backdrop-blur-md border border-white/20">
                  {profile.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight text-white" data-testid="account-username">
                    {profile.username}
                  </h2>
                  {profile.email && (
                    <p className="mt-1.5 text-[15px] font-medium text-[#a5b4fc]" data-testid="account-email">
                      {profile.email}
                    </p>
                  )}
                  <p className="mt-3 text-[13px] font-semibold text-[#818cf8]">
                    {text.joinedAt} <span className="text-white" data-testid="account-joined-at">{formatDate(profile.joinedAt, language)}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-start gap-4 rounded-3xl bg-black/20 p-6 backdrop-blur-md border border-white/10 lg:items-end lg:text-right min-w-full lg:min-w-[320px]">
                <div className="flex w-full items-center justify-between lg:w-auto lg:justify-end lg:gap-4">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#a5b4fc]">{text.planLabel}</div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${!isExpired ? 'bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/30' : 'bg-[#e11d48]/20 text-[#fb7185] border border-[#e11d48]/30'}`} data-testid="subscription-status">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {!isExpired ? text.active : text.expired}
                  </span>
                </div>

                <div>
                  <div className="text-[32px] font-extrabold uppercase tracking-tight text-white" data-testid="subscription-plan">
                    {text.plan} {displayPlan}
                  </div>
                  {subscription.expiresAt ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#c7d2fe]">
                      {text.expiresAt} <span className="text-white" data-testid="subscription-expires-at">{formatDate(subscription.expiresAt, language)}</span>
                      {isNearExpiry && !isExpired && (
                        <span className="rounded-lg bg-[#e11d48] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm" data-testid="subscription-expiry-countdown">{countdown}</span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[14px] font-semibold text-[#c7d2fe]" data-testid="subscription-expires-at">
                      {text.duration} <span className="text-white">{text.unlimited}</span>
                    </div>
                  )}
                </div>

                <div className="grid w-full grid-cols-2 gap-2.5 border-t border-white/10 pt-4 text-left lg:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#a5b4fc]">{text.started}</p>
                    <p className="mt-1 text-[13px] font-extrabold text-white" data-testid="subscription-started-at">{formatDate(subscription.startedAt, language)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#a5b4fc]">{text.remaining}</p>
                    <p className="mt-1 text-[13px] font-extrabold text-white" data-testid="subscription-remaining-days">
                      {remainingDays === null ? text.noExpiry : text.daysLabel(remainingDays)}
                    </p>
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#a5b4fc]">{text.telegramSlots}</p>
                    <p className="mt-1 text-[13px] font-extrabold text-white" data-testid="subscription-account-limit">
                      {text.accountSlots(displayAccountLimit)}
                    </p>
                  </div>
                </div>

                {isNearExpiry && (
                  <div className="w-full rounded-xl border border-[#fca5a5]/40 bg-[#e11d48]/15 px-4 py-3 text-left text-[13px] font-semibold text-[#ffe4e6]" data-testid="subscription-expiry-warning">
                    {text.renewalWarning} <span className="font-extrabold text-white">{countdown}</span>{text.renewalWarningEnd}
                  </div>
                )}

                {(isNearExpiry || isExpired) && (
                  <button onClick={() => setLocation('/upgrade')} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-[14px] font-extrabold text-[#1a2b88] shadow-sm transition-all hover:bg-[#f8fafc] active:scale-[0.98] lg:w-auto" data-testid="button-buy-license-key">
                    {text.buyKey}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-extrabold tracking-tight text-[#0f172a]">{text.usageTitle}</h3>
              <p className="mt-1 text-sm font-medium text-[#64748b]">{text.usageDetail}</p>
            </div>
            <button onClick={() => setLocation('/upgrade')} className="hidden sm:inline-flex items-center gap-2 text-sm font-extrabold text-[#1a2b88] hover:text-[#152473] transition-colors" data-testid="button-upgrade-inline">
              {text.upgrade} <span className="text-lg leading-none">→</span>
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <UsageCard title={text.telegramAccountsCard} icon={UsersRound} usage={usage.telegramAccounts} testIdPrefix="telegram-accounts" text={text} />
            <UsageCard title={text.campaignsCard} icon={Megaphone} usage={usage.campaigns} testIdPrefix="campaigns" text={text} />
            <UsageCard title={text.messagesTodayCard} icon={MessageSquare} usage={usage.messagesToday} testIdPrefix="messages" text={text} />
          </div>
          
          <button onClick={() => setLocation('/upgrade')} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f4f7fb] border border-[#eef2f6] px-5 py-3.5 text-[14px] font-extrabold text-[#1a2b88] transition-all hover:bg-[#eef2f6] sm:hidden" data-testid="button-upgrade-mobile">
            {text.upgrade}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
