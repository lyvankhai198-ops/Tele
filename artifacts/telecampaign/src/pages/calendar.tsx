import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Send } from "lucide-react";
import { useLocation } from "wouter";
import { useListCalendarItems } from "@workspace/api-client-react";
import { AppLayout, Modal, PageIntro, Panel, PrimaryButton, QuietButton, SectionHeader, StatusBadge, Toast } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";

function weekRange(offset: number) {
  const today = new Date();
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7); monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

export default function Calendar() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const range = useMemo(() => weekRange(weekOffset), [weekOffset]);
  const calendar = useListCalendarItems({ from: range.monday.toISOString(), to: range.sunday.toISOString() });
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(range.monday); date.setDate(date.getDate() + index); return date; });
  const selected = calendar.data?.find((item) => item.id === selectedId) ?? null;
  const label = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(range.monday) + " – " + new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(range.sunday);
  return <AppLayout activePage="calendar" title={t("Calendar")} subtitle={t("A shared view of scheduled, reviewed content")} headerAction={<QuietButton onClick={() => void calendar.refetch()}>{t("Refresh calendar")}</QuietButton>}>
    <PageIntro kicker={t("Publishing calendar")} heading={t("Schedule at a glance")} detail={t("Every scheduled card below comes from the persistent campaign queue and can be paused from Campaigns.")} action={<PrimaryButton onClick={() => setLocation("/dashboard/campaigns")}><Plus className="h-4 w-4" />{t("Schedule a post")}</PrimaryButton>} />
    <Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-[#24384d] p-5 sm:p-6"><div className="flex items-center gap-2"><button onClick={() => setWeekOffset((value) => value - 1)} className="rounded-lg border border-[#2b445b] p-2 text-[#7c97ad]" aria-label={t("Previous week")}><ChevronLeft className="h-4 w-4" /></button><button onClick={() => setWeekOffset(0)} className="rounded-lg border border-[#2b445b] px-3 py-2 font-mono text-[10px] text-[#9cb5c8]">{t("Today")}</button><button onClick={() => setWeekOffset((value) => value + 1)} className="rounded-lg border border-[#2b445b] p-2 text-[#7c97ad]" aria-label={t("Next week")}><ChevronRight className="h-4 w-4" /></button><span className="ml-2 text-[14px] font-semibold text-[#dceaf4]">{label}</span></div><CalendarClock className="h-4 w-4 text-[#7fbdeb]" /></div>
      <div className="overflow-x-auto"><div className="grid min-w-[840px] grid-cols-7 divide-x divide-[#22394e]"><div className="col-span-7 grid grid-cols-7 border-b border-[#22394e] bg-[#0e1b29]">{days.map((day) => <div key={day.toISOString()} className="px-3 py-3 text-center"><p className="font-mono text-[9px] uppercase text-[#68849d]">{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</p><p className="mt-1 text-[17px] font-semibold text-[#c3d6e4]">{day.getDate()}</p></div>)}</div>{days.map((day) => { const events = (calendar.data ?? []).filter((item) => new Date(item.scheduledAt).toDateString() === day.toDateString()); return <div key={day.toISOString()} className="min-h-[320px] p-2.5">{events.length ? <div className="space-y-2">{events.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className="w-full rounded-xl border border-[#2b5778] bg-[#14334d] p-3 text-left hover:border-[#4a87b3]"><div className="mb-2 flex justify-between font-mono text-[9px] text-[#82cafa]"><span>{new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduledAt))}</span><Send className="h-3 w-3" /></div><p className="line-clamp-2 text-[11px] font-semibold text-[#d7e7f1]">{item.name}</p><p className="mt-2 font-mono text-[9px] text-[#7894aa]">{item.targetCount} {t("destinations")}</p></button>)}</div> : <p className="mt-3 border-t border-dashed border-[#274158] pt-3 text-center font-mono text-[9px] text-[#48657e]">{t("Open")}</p>}</div>; })}</div></div>
      {!calendar.data?.length && <div className="border-t border-[#22394e] p-5 text-center text-[12px] text-[#7891a8]">{calendar.isLoading ? t("Loading scheduled items…") : t("No scheduled campaigns in this week.")}</div>}
    </Panel>
    {selected && <Modal title={selected.name} description={new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(selected.scheduledAt))} onClose={() => setSelectedId(null)}><div className="space-y-4"><div className="rounded-xl border border-[#2a465e] bg-[#0e1b2a] p-4"><p className="font-mono text-[9px] uppercase text-[#68839c]">{t("Scope")}</p><p className="mt-2 text-[13px] text-[#dcebf4]">{selected.targetCount} {t("approved destinations")}</p></div><StatusBadge status="scheduled" label={t(selected.status)} /><div className="flex justify-end"><QuietButton onClick={() => { setSelectedId(null); setToast(t("Manage this campaign from Campaigns.")); }}>{t("Close")}</QuietButton></div></div></Modal>}
    {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
  </AppLayout>;
}
