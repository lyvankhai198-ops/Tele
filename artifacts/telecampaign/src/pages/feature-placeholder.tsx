import { Construction, Network, FileText } from "lucide-react";
import { AppLayout, PrimaryButton } from "@/components/layout/AppLayout";
import { useLocation } from "wouter";
import { useLanguage } from "@/lib/i18n";

type PlaceholderKind = "templates" | "proxy";

export default function FeaturePlaceholder({ kind }: { kind: PlaceholderKind }) {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();

  const content: Record<PlaceholderKind, {
    titleKey: string;
    headingKey: string;
    detailKey: string;
    icon: typeof FileText;
  }> = {
    templates: {
      titleKey: "Message templates",
      headingKey: "Message templates heading",
      detailKey: "Message templates detail",
      icon: FileText,
    },
    proxy: {
      titleKey: "Proxy",
      headingKey: "Proxy",
      detailKey: "Proxy detail",
      icon: Network,
    },
  };

  const feature = content[kind];
  const Icon = feature.icon;

  return (
    <AppLayout activePage={kind} title={t(feature.titleKey)}>
      <section className="mx-auto grid min-h-[58vh] max-w-2xl place-items-center" data-testid={`${kind}-placeholder`}>
        <div className="w-full rounded-3xl border border-[#eef2f6] bg-white p-8 text-center shadow-sm sm:p-12">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#eff6ff] text-[#1a2b88]">
            <Icon className="h-8 w-8" />
          </span>
          <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#f8fafc] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#64748b]">
            <Construction className="h-3.5 w-3.5" />
            {t("Coming soon")}
          </div>
          <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-[#0f172a]">{t(feature.headingKey)}</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] font-medium leading-7 text-[#64748b]">{t(feature.detailKey)}</p>
          <PrimaryButton onClick={() => setLocation("/dashboard")}><span>{t("Back to dashboard")}</span></PrimaryButton>
        </div>
      </section>
    </AppLayout>
  );
}
