import { CalendarClock, Eye, Languages, X } from "lucide-react";
import type { AdminNotification } from "@workspace/api-client-react";
import { Modal } from "@/components/layout/AppLayout";
import { useLanguage, type Language } from "@/lib/i18n";

function localizedCopy(notification: AdminNotification, language: Language) {
  const useEnglish = language === "en" && Boolean(notification.titleEn?.trim() || notification.bodyEn?.trim());
  return {
    title: useEnglish && notification.titleEn?.trim() ? notification.titleEn : notification.title,
    body: useEnglish && notification.bodyEn?.trim() ? notification.bodyEn : notification.body,
  };
}

function formatDate(value: string | null, language: Language): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function NotificationDetailModal({
  notification,
  onClose,
  showTranslations = false,
}: {
  notification: AdminNotification;
  onClose: () => void;
  showTranslations?: boolean;
}) {
  const { language, t } = useLanguage();
  const current = localizedCopy(notification, language);
  const status = t(notification.status === "published" ? "Published" : notification.status === "scheduled" ? "Scheduled" : notification.status === "expired" ? "Expired" : "Draft");

  return (
    <Modal title={t("Notification details")} description={t("Read the full announcement and its display settings.")} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#1d4ed8]">
            <Eye className="h-3.5 w-3.5" />{t("Preview")}
          </span>
          <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#475569]">{status}</span>
          {notification.pinned && <span className="rounded-full border border-[#c7d2fe] bg-[#eef2ff] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#4338ca]">{t("Pinned")}</span>}
        </div>

        {notification.mediaUrl && (
          <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-[#f8fafc]">
            {notification.mediaType === "image"
              ? <img src={notification.mediaUrl} alt={current.title} className="max-h-80 w-full object-contain" />
              : <video src={notification.mediaUrl} className="max-h-80 w-full bg-slate-950" controls preload="metadata" />}
          </div>
        )}

        <div className="rounded-2xl border border-[#dbeafe] bg-[#f8fbff] p-5">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#64748b]">{language === "en" ? "English" : "Tiếng Việt"}</p>
          <h3 className="text-xl font-extrabold leading-tight text-[#0f172a]">{current.title}</h3>
          {current.body && <p className="mt-3 whitespace-pre-line text-[15px] font-medium leading-7 text-[#334155]">{current.body}</p>}
        </div>

        {showTranslations && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#64748b]"><Languages className="h-4 w-4 text-[#1d4ed8]" />Tiếng Việt</div>
              <p className="font-extrabold text-[#0f172a]">{notification.title}</p>
              {notification.body && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#475569]">{notification.body}</p>}
            </div>
            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#64748b]"><Languages className="h-4 w-4 text-[#1d4ed8]" />English</div>
              {notification.titleEn || notification.bodyEn
                ? <>
                    {notification.titleEn && <p className="font-extrabold text-[#0f172a]">{notification.titleEn}</p>}
                    {notification.bodyEn && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#475569]">{notification.bodyEn}</p>}
                  </>
                : <p className="text-sm font-medium text-[#94a3b8]">{t("No English translation added yet.")}</p>}
            </div>
          </div>
        )}

        <div className="grid gap-3 border-t border-[#eef2f6] pt-4 text-sm font-semibold text-[#64748b] sm:grid-cols-2">
          <span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" />{t("Published")}: {formatDate(notification.publishedAt ?? notification.scheduledAt ?? notification.createdAt, language)}</span>
          {notification.expiresAt && <span>{t("Expires")}: {formatDate(notification.expiresAt, language)}</span>}
        </div>
        <button type="button" onClick={onClose} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-[#cbd5e1] px-4 py-2.5 text-sm font-extrabold text-[#475569] transition hover:bg-[#f8fafc]"><X className="h-4 w-4" />{t("Close")}</button>
      </div>
    </Modal>
  );
}