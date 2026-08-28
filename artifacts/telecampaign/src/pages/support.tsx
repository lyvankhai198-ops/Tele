import { AlertCircle, ExternalLink, LifeBuoy, LoaderCircle, MessageCircle, Send } from "lucide-react";
import { AppLayout, EmptyState, Panel } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";
import { useGetSupportSettings } from "@workspace/api-client-react";

export default function SupportPage() {
  const { t } = useLanguage();
  const { data, isLoading, error } = useGetSupportSettings();

  if (isLoading) {
    return (
      <AppLayout activePage="support" title={t("Support")}>
        <div className="flex min-h-[45vh] flex-col items-center justify-center text-[#64748b]">
          <LoaderCircle className="mb-4 h-9 w-9 animate-spin text-[#1a2b88]" />
          <p className="text-[15px] font-bold">{t("Loading data…")}</p>
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout activePage="support" title={t("Support")}>
        <div className="flex min-h-[45vh] flex-col items-center justify-center text-[#ef4444]">
          <AlertCircle className="mb-4 h-11 w-11" />
          <p className="max-w-md text-center text-[15px] font-extrabold">{t("Could not load support settings. Please try again later.")}</p>
        </div>
      </AppLayout>
    );
  }

  const channels = [
    {
      key: "telegram",
      url: data.supportLinks.telegramUrl,
      title: t("Telegram support"),
      action: t("Open Telegram"),
      icon: Send,
      iconClass: "bg-[#e0f2fe] text-[#0284c7]",
    },
    {
      key: "zalo",
      url: data.supportLinks.zaloUrl,
      title: t("Zalo support"),
      action: t("Open Zalo"),
      icon: MessageCircle,
      iconClass: "bg-[#dbeafe] text-[#2563eb]",
    },
  ].filter((channel): channel is typeof channel & { url: string } => Boolean(channel.url));

  return (
    <AppLayout activePage="support" title={t("Support")}>
      <div className="space-y-7">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2.5 text-[12px] font-extrabold uppercase tracking-wider text-[#1a2b88]">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
            {t("Contact support")}
          </div>
          <h1 className="text-[36px] font-extrabold tracking-tight text-[#0f172a] sm:text-[44px]">{t("Support")}</h1>
          <p className="mt-3.5 text-[16px] font-medium leading-relaxed text-[#475569]">{t("Reach the TeleCampaign team through an available support channel.")}</p>
        </div>

        {channels.length === 0 ? (
          <Panel>
            <EmptyState icon={LifeBuoy} title={t("Support")} detail={t("No support channels are configured yet.")} />
          </Panel>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {channels.map(({ key, url, title, action, icon: Icon, iconClass }) => (
              <Panel key={key} className="p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[18px] font-extrabold tracking-tight text-[#0f172a]">{title}</h2>
                    <p className="mt-2 break-all text-[13px] font-medium text-[#64748b]">{url}</p>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#1a2b88] px-4 py-3 text-[13px] font-extrabold text-white transition hover:bg-[#152473]"
                      data-testid={`support-open-${key}`}
                    >
                      {action}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}