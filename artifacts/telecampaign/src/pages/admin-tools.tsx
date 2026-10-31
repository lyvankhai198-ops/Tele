import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { AppLayout, Panel } from "@/components/layout/AppLayout";
import { adminToolRequest } from "@/lib/admin-tools-client";
import { useLanguage } from "@/lib/i18n";
import {
  Activity, ArrowDownToLine, ArrowUpRight, CalendarClock, Check, CircleDollarSign,
  Clock3, FileClock, HardDrive, RefreshCw, ScrollText, ShieldCheck,
} from "lucide-react";

type Summary = {
  report: {
    day: string;
    timezone: string;
    cash: Array<{ currency: string; amount: string; orders: number }>;
    keyActivations: number;
    keyValueVnd: string;
    historicalRevokedUndated: number;
  };
  health: {
    checkedAt: string;
    workers: Array<{ name: string; status: string; lastSuccessAt?: number | null }>;
    disk: { availablePercent: number; status: string } | null;
  };
  schedule: { enabled: boolean; hour: number; minute: number };
  cursor: { offset: number; failedUpdateId?: number; failures?: number };
};

type Audit = {
  id: string;
  actor: string | null;
  created_at: string;
  metadata: { actorId: string; action: string; target: string; before: unknown; after: unknown };
};

const copy = {
  vi: {
    title: "Công cụ quản trị",
    subtitle: "Báo cáo tách biệt, thao tác vận hành và nhật ký — không gộp các chỉ số khác bản chất.",
    refreshError: "Không thể làm mới dữ liệu.",
    loadError: "Không tải được công cụ quản trị. Kiểm tra phiên đăng nhập hoặc kết nối.",
    savedSchedule: "Đã lưu lịch báo cáo.",
    saveError: "Không lưu được lịch báo cáo.",
    exportDone: "Đã tải báo cáo CSV.",
    exportError: "Không xuất được báo cáo.",
    retryDone: "Đã yêu cầu thử lại; tin lỗi vẫn nằm trong hàng chờ.",
    retryError: "Không thể yêu cầu thử lại.",
    sectionNavLabel: "Các khu vực công cụ",
    confirmedCash: "Tiền thu từ đơn đã xác nhận",
    cashDescription: "VND và USDT được báo cáo riêng theo đơn đã xác nhận. Đây không phải số dư ngân hàng.",
    asOf: "Ngày báo cáo",
    timezone: "Múi giờ",
    orderCount: "Đơn xác nhận",
    noCash: "Chưa có đơn xác nhận trong ngày này.",
    keyValue: "Giá trị key đã kích hoạt",
    keyValueDescription: "Số liệu định giá key là báo cáo riêng, không cộng vào dòng tiền đơn hàng.",
    keyActivations: "Key kích hoạt",
    keyValueTotal: "Giá trị ghi nhận",
    historicalWarning: "Key thu hồi cũ không có ngày nhận tiền. Không tự gán chúng vào doanh thu ngày hiện tại.",
    revenueLink: "Mở phân tích doanh thu",
    botOps: "Vận hành bot & worker",
    botOpsDescription: "Trạng thái hiện tại và thao tác thử lại có kiểm soát.",
    checkedAt: "Kiểm tra lúc",
    lastSuccess: "Thành công gần nhất",
    notRecorded: "Chưa ghi nhận",
    diskFree: "Dung lượng trống",
    cursor: "Mốc bot đã xử lý",
    failedUpdate: (id: number, count: number) => `Tin ${id} đang chờ thử lại (${count} lần lỗi).`,
    noBlockedUpdate: "Không có tin lỗi đang chặn.",
    retryUpdate: "Yêu cầu thử lại tin lỗi",
    retrying: "Đang gửi yêu cầu…",
    operationsLink: "Chi tiết vận hành",
    eventsLink: "Lịch sử sự kiện hệ thống",
    settingsLink: "Thiết lập 2FA admin",
    dailyReport: "Lịch báo cáo qua bot",
    scheduleDescription: "Bật hoặc tắt báo cáo hằng ngày gửi tới chat admin đã cấu hình.",
    enableSchedule: "Bật gửi báo cáo mỗi ngày",
    reportTime: "Giờ gửi báo cáo",
    saveSchedule: "Lưu lịch",
    saving: "Đang lưu…",
    timezoneHint: "Theo múi giờ hệ thống. Có thể xem báo cáo ngay bằng nút báo cáo ngày trong bot.",
    csvTitle: "Xuất CSV",
    csvDescription: "Chọn một khoảng ngày và loại báo cáo. Giới hạn tối đa 10.000 dòng mỗi lần xuất.",
    fromDate: "Từ ngày",
    toDate: "Đến ngày",
    exportOrders: "Đơn hàng đã xác nhận",
    exportKeys: "Bản ghi license key",
    exportRevenue: "Dòng tiền theo ngày",
    csvSafety: "Không xuất key gốc, mật khẩu hoặc token.",
    auditTitle: "Nhật ký quản trị",
    auditDescription: "100 thao tác gần nhất được ghi nhận.",
    auditEmpty: "Chưa có thao tác được ghi nhận từ phiên bản này.",
    auditDetails: "Xem chi tiết thay đổi",
    loading: "Đang tải báo cáo, trạng thái vận hành và nhật ký…",
    summaryFailed: "Không thể tải công cụ quản trị.",
    workerStatus: "Trạng thái",
  },
  en: {
    title: "Admin tools",
    subtitle: "Separate reports, operational actions, and audit history without blending unlike metrics.",
    refreshError: "Could not refresh the data.",
    loadError: "Could not load admin tools. Check your session or connection.",
    savedSchedule: "Daily report schedule saved.",
    saveError: "Could not save the report schedule.",
    exportDone: "CSV report downloaded.",
    exportError: "Could not export the report.",
    retryDone: "Retry requested; the failed update remains in the queue.",
    retryError: "Could not request a retry.",
    sectionNavLabel: "Tool sections",
    confirmedCash: "Confirmed order receipts",
    cashDescription: "VND and USDT are reported separately from confirmed orders. This is not a bank balance.",
    asOf: "Report date",
    timezone: "Timezone",
    orderCount: "Confirmed orders",
    noCash: "There are no confirmed orders for this day.",
    keyValue: "Activated key valuation",
    keyValueDescription: "Key valuation is a separate report and is not added to order cash receipts.",
    keyActivations: "Key activations",
    keyValueTotal: "Recorded value",
    historicalWarning: "Older revoked keys have no receipt date. They are not assigned to current-day revenue.",
    revenueLink: "Open revenue analytics",
    botOps: "Bot & worker operations",
    botOpsDescription: "Current health and a controlled retry action.",
    checkedAt: "Checked at",
    lastSuccess: "Last success",
    notRecorded: "Not recorded",
    diskFree: "Disk available",
    cursor: "Processed bot cursor",
    failedUpdate: (id: number, count: number) => `Update ${id} is waiting for retry (${count} failures).`,
    noBlockedUpdate: "No failed update is blocking the queue.",
    retryUpdate: "Request retry for failed update",
    retrying: "Requesting…",
    operationsLink: "Operations detail",
    eventsLink: "System event history",
    settingsLink: "Admin 2FA settings",
    dailyReport: "Bot report schedule",
    scheduleDescription: "Enable or disable the daily report sent to the configured admin chat.",
    enableSchedule: "Send the report daily",
    reportTime: "Report delivery time",
    saveSchedule: "Save schedule",
    saving: "Saving…",
    timezoneHint: "Uses the system timezone. You can also request today’s report from the bot.",
    csvTitle: "CSV exports",
    csvDescription: "Choose a date range and report type. Each export is limited to 10,000 rows.",
    fromDate: "From date",
    toDate: "To date",
    exportOrders: "Confirmed orders",
    exportKeys: "License key records",
    exportRevenue: "Daily cash receipts",
    csvSafety: "Exports never include plaintext keys, passwords, or tokens.",
    auditTitle: "Admin audit log",
    auditDescription: "The latest 100 recorded actions.",
    auditEmpty: "No actions have been recorded by this version yet.",
    auditDetails: "Inspect change details",
    loading: "Loading reports, operational status, and audit history…",
    summaryFailed: "Could not load admin tools.",
    workerStatus: "Status",
  },
} as const;

const fieldClass = "rounded-xl border border-[#ccd9de] bg-white p-3 text-sm text-[#203d4a] outline-none focus:border-[#147b87] focus:ring-4 focus:ring-[#147b87]/10";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#cbdbe0] bg-white px-3.5 py-2.5 text-xs font-bold text-[#315362] transition hover:border-[#a6c4ca] hover:bg-[#f4f8f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147b87] disabled:cursor-not-allowed disabled:opacity-50";

function formatTime(value: number | null | undefined, language: "vi" | "en") {
  if (!value) return language === "vi" ? "Chưa ghi nhận" : "Not recorded";
  return new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-GB");
}

export default function AdminToolsPage() {
  const { language } = useLanguage();
  const text = copy[language];
  const [data, setData] = useState<Summary | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState("21:00");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    const [summary, entries] = await Promise.all([
      adminToolRequest<Summary>("/admin/tools/summary"),
      adminToolRequest<Audit[]>("/admin/tools/audit"),
    ]);
    setData(summary);
    setAudit(entries);
    return summary;
  }, []);

  useEffect(() => {
    void refresh().then((summary) => {
      setLoadFailed(false);
      setEnabled(summary.schedule.enabled);
      setTime(`${String(summary.schedule.hour).padStart(2, "0")}:${String(summary.schedule.minute).padStart(2, "0")}`);
      setFrom(`${summary.report.day.slice(0, 8)}01`);
      setTo(summary.report.day);
    }).catch(() => {
      setLoadFailed(true);
      setMessage(text.loadError);
    });
    const interval = window.setInterval(() => {
      void refresh().then(() => setLoadFailed(false)).catch(() => setMessage(text.refreshError));
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh, text.loadError, text.refreshError]);

  async function saveSchedule() {
    setBusy(true);
    setMessage("");
    try {
      const [hour, minute] = time.split(":").map(Number);
      await adminToolRequest("/admin/tools/daily-report", { enabled, hour, minute }, "PUT");
      await refresh();
      setMessage(text.savedSchedule);
    } catch {
      setMessage(text.saveError);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv(kind: "orders" | "keys" | "revenue") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/tools/export/${kind}?${new URLSearchParams({ from, to })}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("export-failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `telecamp-${kind}-${from}-${to}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(text.exportDone);
    } catch {
      setMessage(text.exportError);
    } finally {
      setBusy(false);
    }
  }

  async function retryFailedUpdate() {
    setBusy(true);
    setMessage("");
    try {
      await adminToolRequest("/admin/tools/telegram/retry", {});
      await refresh();
      setMessage(text.retryDone);
    } catch {
      setMessage(text.retryError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout activePage="admin-tools" title={text.title} subtitle={text.subtitle} hideUpgrade>
      <div className="mb-6 flex flex-col gap-4 border-b border-[#dfe8eb] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#647f8a]">
            <ShieldCheck className="h-4 w-4 text-[#147b87]" />{language === "vi" ? "Hệ thống · Công cụ nâng cao" : "System · Advanced tools"}
          </p>
          <h2 className="text-2xl font-extrabold tracking-tight text-[#193a4b]">{text.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-[#647b87]">{text.subtitle}</p>
        </div>
        <nav aria-label={text.sectionNavLabel} className="flex flex-wrap gap-2">
          {[
            ["#cash-report", language === "vi" ? "Đối soát" : "Reconciliation"],
            ["#bot-operations", language === "vi" ? "Vận hành bot" : "Bot operations"],
            ["#report-schedule", language === "vi" ? "Lịch báo cáo" : "Schedule"],
            ["#csv-exports", "CSV"],
            ["#admin-audit", language === "vi" ? "Nhật ký" : "Audit"],
          ].map(([href, label]) => (
            <a key={href} href={href} data-testid={`anchor-admin-tools-${href.slice(1)}`} className="rounded-full border border-[#d8e4e7] bg-white px-3 py-2 text-[11px] font-bold text-[#4e6a77] hover:border-[#a9c8cc] hover:text-[#175d6e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147b87]">
              {label}
            </a>
          ))}
        </nav>
      </div>

      {message && <div role="status" className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${loadFailed ? "border-[#eed2cf] bg-[#fbf1ef] text-[#8e4f48]" : "border-[#cfe1dc] bg-[#eef6f3] text-[#3e7065]"}`}>{message}</div>}
      {!data && !loadFailed && (
        <div className="mb-5 grid gap-4 lg:grid-cols-2" aria-label={text.loading}>
          <div className="h-56 animate-pulse rounded-2xl bg-[#e8eff1]" />
          <div className="h-56 animate-pulse rounded-2xl bg-[#e8eff1]" />
        </div>
      )}
      {loadFailed && !data && (
        <Panel className="mb-5 flex flex-col items-start gap-3 p-5">
          <p className="text-sm font-semibold text-[#83534e]">{text.summaryFailed}</p>
          <button type="button" className={buttonClass} onClick={() => {
            setLoadFailed(false);
            setMessage("");
            void refresh().then((summary) => {
              setEnabled(summary.schedule.enabled);
              setTime(`${String(summary.schedule.hour).padStart(2, "0")}:${String(summary.schedule.minute).padStart(2, "0")}`);
              setFrom(`${summary.report.day.slice(0, 8)}01`);
              setTo(summary.report.day);
            }).catch(() => {
              setLoadFailed(true);
              setMessage(text.loadError);
            });
          }}>
            <RefreshCw className="h-4 w-4" />{language === "vi" ? "Thử tải lại" : "Retry loading"}
          </button>
        </Panel>
      )}

      {data && <>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel id="cash-report" className="scroll-mt-24 overflow-hidden rounded-2xl border-[#d7e3e7]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e7eef0] px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf4f5] text-[#39727c]"><CircleDollarSign className="h-5 w-5" /></span>
                <div>
                  <h3 className="text-base font-extrabold text-[#1d3d4c]">{text.confirmedCash}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#68808a]">{text.cashDescription}</p>
                </div>
              </div>
              <span className="rounded-full bg-[#f0f5f6] px-2.5 py-1 text-[10px] font-bold text-[#5e7882]">{data.report.day}</span>
            </div>
            <div className="p-5 sm:p-6">
              <div className="mb-3 flex items-center justify-between text-[11px] text-[#6b818a]">
                <span>{text.timezone}: <strong className="text-[#435f6b]">{data.report.timezone}</strong></span>
                <span>{text.asOf}: {data.report.day}</span>
              </div>
              {data.report.cash.length ? (
                <div className="divide-y divide-[#eaf0f1]">
                  {data.report.cash.map((row) => (
                    <div key={row.currency} className="flex flex-wrap items-end justify-between gap-3 py-3 first:pt-1">
                      <div>
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#71868f]">{row.currency}</p>
                        <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#214556]">{row.amount}</p>
                      </div>
                      <p className="text-xs font-semibold text-[#617983]">{row.orders} {text.orderCount.toLowerCase()}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="rounded-xl bg-[#f5f8f9] px-3 py-4 text-sm text-[#647b87]">{text.noCash}</p>}
              <p className="mt-3 border-t border-[#e7eef0] pt-3 text-[11px] leading-5 text-[#758a93]">{language === "vi" ? "Thu hồi quyền không đồng nghĩa hoàn tiền. Báo cáo theo đơn, không phải số dư ngân hàng." : "Revoking access does not imply a refund. This is an order report, not a bank balance."}</p>
            </div>
          </Panel>

          <Panel className="rounded-2xl border-[#d7e3e7]">
            <div className="flex items-start justify-between gap-3 border-b border-[#e7eef0] px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f3f1eb] text-[#8d7047]"><Activity className="h-5 w-5" /></span>
                <div>
                  <h3 className="text-base font-extrabold text-[#1d3d4c]">{text.keyValue}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#68808a]">{text.keyValueDescription}</p>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-[#f5f8f8] p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#72858c]">{text.keyActivations}</p>
                  <p className="mt-2 text-2xl font-extrabold text-[#23495b]">{data.report.keyActivations}</p>
                </div>
                <div className="rounded-xl bg-[#f5f8f8] p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#72858c]">{text.keyValueTotal}</p>
                  <p className="mt-2 text-2xl font-extrabold text-[#23495b]">{data.report.keyValueVnd} <span className="text-sm">VND</span></p>
                </div>
              </div>
              {!!data.report.historicalRevokedUndated && <p className="mt-3 rounded-xl border border-[#e9dcc1] bg-[#fbf7ed] px-3 py-2.5 text-xs leading-5 text-[#785e32]">
                {data.report.historicalRevokedUndated} {text.historicalWarning}
              </p>}
              <Link href="/admin/revenue" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#147384] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147b87]" data-testid="link-tools-revenue">
                {text.revenueLink}<ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>

          <Panel id="bot-operations" className="scroll-mt-24 rounded-2xl border-[#d7e3e7]">
            <div className="flex items-start justify-between gap-3 border-b border-[#e7eef0] px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf3f5] text-[#52717f]"><HardDrive className="h-5 w-5" /></span>
                <div>
                  <h3 className="text-base font-extrabold text-[#1d3d4c]">{text.botOps}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#68808a]">{text.botOpsDescription}</p>
                </div>
              </div>
              <span className="text-right text-[10px] text-[#7b8d94]">{text.checkedAt}<br />{new Date(data.health.checkedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-GB")}</span>
            </div>
            <div className="p-5 sm:p-6">
              <div className="grid gap-2 sm:grid-cols-2">
                {data.health.workers.map((worker) => (
                  <div key={worker.name} className="rounded-xl border border-[#e5ecee] bg-[#fcfdfd] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="break-all text-xs text-[#2c4b59]">{worker.name}</strong>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.status === "stale" ? "bg-[#fbefed] text-[#9b4e47]" : "bg-[#edf5f1] text-[#507665]"}`}>
                        {text.workerStatus}: {worker.status}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] text-[#7b8c93]">{text.lastSuccess}: {formatTime(worker.lastSuccessAt, language)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 rounded-xl bg-[#f5f8f9] p-3 text-xs text-[#526d78] sm:grid-cols-2">
                <p className="flex items-center gap-2"><HardDrive className="h-4 w-4 shrink-0 text-[#718d97]" />{text.diskFree}: <strong>{data.health.disk?.availablePercent ?? "—"}%</strong></p>
                <p className="flex items-center gap-2"><FileClock className="h-4 w-4 shrink-0 text-[#718d97]" />{text.cursor}: <strong>{data.cursor.offset}</strong></p>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#617983]">{data.cursor.failedUpdateId
                ? text.failedUpdate(data.cursor.failedUpdateId, data.cursor.failures ?? 0)
                : text.noBlockedUpdate}</p>
              {!!data.cursor.failedUpdateId && <button type="button" className={`${buttonClass} mt-3`} disabled={busy} onClick={() => void retryFailedUpdate()} data-testid="button-retry-failed-update">
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />{busy ? text.retrying : text.retryUpdate}
              </button>}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#e7eef0] pt-3">
                <Link href="/admin/operations" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#147384] hover:underline" data-testid="link-tools-operations">{text.operationsLink}<ArrowUpRight className="h-3.5 w-3.5" /></Link>
                <Link href="/admin/system-events" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#147384] hover:underline" data-testid="link-tools-events">{text.eventsLink}<ArrowUpRight className="h-3.5 w-3.5" /></Link>
                <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#147384] hover:underline" data-testid="link-tools-2fa">{text.settingsLink}<ArrowUpRight className="h-3.5 w-3.5" /></Link>
              </div>
            </div>
          </Panel>

          <Panel id="report-schedule" className="scroll-mt-24 rounded-2xl border-[#d7e3e7]">
            <div className="flex items-start gap-3 border-b border-[#e7eef0] px-5 py-4 sm:px-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf4f5] text-[#39727c]"><CalendarClock className="h-5 w-5" /></span>
              <div>
                <h3 className="text-base font-extrabold text-[#1d3d4c]">{text.dailyReport}</h3>
                <p className="mt-1 text-xs leading-5 text-[#68808a]">{text.scheduleDescription}</p>
              </div>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <label className="flex items-start gap-3 text-sm font-semibold text-[#365462]">
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#147b87]" data-testid="input-daily-report-enabled" />
                {text.enableSchedule}
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block text-xs font-bold text-[#5b747f]">{text.reportTime}
                  <span className="mt-1.5 flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#78909a]" /><input aria-label={text.reportTime} className={fieldClass} type="time" value={time} onChange={(event) => setTime(event.target.value)} /></span>
                </label>
                <button type="button" className={buttonClass} disabled={busy || !data} onClick={() => void saveSchedule()} data-testid="button-save-daily-report">
                  <Check className="h-4 w-4" />{busy ? text.saving : text.saveSchedule}
                </button>
              </div>
              <p className="text-[11px] leading-5 text-[#778b93]">{text.timezoneHint}</p>
            </div>
          </Panel>

          <Panel id="csv-exports" className="scroll-mt-24 rounded-2xl border-[#d7e3e7]">
            <div className="flex items-start gap-3 border-b border-[#e7eef0] px-5 py-4 sm:px-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f2f3ee] text-[#727849]"><ArrowDownToLine className="h-5 w-5" /></span>
              <div>
                <h3 className="text-base font-extrabold text-[#1d3d4c]">{text.csvTitle}</h3>
                <p className="mt-1 text-xs leading-5 text-[#68808a]">{text.csvDescription}</p>
              </div>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-[#5b747f]">{text.fromDate}<input aria-label={text.fromDate} className={`${fieldClass} mt-1.5 block w-full`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                <label className="block text-xs font-bold text-[#5b747f]">{text.toDate}<input aria-label={text.toDate} className={`${fieldClass} mt-1.5 block w-full`} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ["orders", text.exportOrders],
                  ["keys", text.exportKeys],
                  ["revenue", text.exportRevenue],
                ] as const).map(([kind, label]) => (
                  <button key={kind} type="button" className={`${buttonClass} justify-start`} disabled={busy || !from || !to} onClick={() => void exportCsv(kind)} data-testid={`button-export-${kind}`}>
                    <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" />{label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#778b93]">{text.csvSafety}</p>
            </div>
          </Panel>

          <Panel id="admin-audit" className="scroll-mt-24 rounded-2xl border-[#d7e3e7] xl:col-span-2">
            <details>
              <summary data-testid="toggle-admin-audit" className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-[#147b87] sm:px-6">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf3f5] text-[#52717f]"><ScrollText className="h-5 w-5" /></span>
                  <span>
                    <strong className="block text-base text-[#1d3d4c]">{text.auditTitle}</strong>
                    <span className="mt-1 block text-xs text-[#68808a]">{text.auditDescription}</span>
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold text-[#147384]">{text.auditDetails}</span>
              </summary>
              <div className="space-y-2 border-t border-[#e7eef0] p-4 sm:p-6">
                {!audit.length && <p className="rounded-xl bg-[#f5f8f9] p-4 text-sm text-[#657d87]">{text.auditEmpty}</p>}
                {audit.map((entry) => (
                  <details key={entry.id} className="break-words rounded-xl border border-[#e2eaed] bg-[#fcfdfd] p-3">
                    <summary className="cursor-pointer text-xs text-[#3d5b68] outline-none focus-visible:ring-2 focus-visible:ring-[#147b87]">
                      <strong>{entry.actor ?? entry.metadata.actorId}</strong> · {entry.metadata.action}
                      <span className="mt-1 block text-[10px] text-[#7c8d94]">{new Date(entry.created_at).toLocaleString(language === "vi" ? "vi-VN" : "en-GB")}</span>
                    </summary>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-[#f2f6f7] p-3 text-[10px] leading-5 text-[#536c77]">{JSON.stringify({ before: entry.metadata.before, after: entry.metadata.after }, null, 2)}</pre>
                  </details>
                ))}
              </div>
            </details>
          </Panel>
        </div>
      </>}
    </AppLayout>
  );
}
