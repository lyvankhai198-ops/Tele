import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { AppLayout, Panel } from "@/components/layout/AppLayout";
import { adminToolRequest } from "@/lib/admin-tools-client";

type Summary = {
  report: { day: string; timezone: string; cash: Array<{ currency: string; amount: string; orders: number }>;
    keyActivations: number; keyValueVnd: string; historicalRevokedUndated: number };
  health: { checkedAt: string; workers: Array<{ name: string; status: string; lastSuccessAt?: number | null }>;
    disk: { availablePercent: number; status: string } | null };
  schedule: { enabled: boolean; hour: number; minute: number };
  cursor: { offset: number; failedUpdateId?: number; failures?: number };
};
type Audit = { id: string; actor: string | null; created_at: string;
  metadata: { actorId: string; action: string; target: string; before: unknown; after: unknown } };
const field = "rounded-xl border border-slate-300 bg-white p-3 text-sm";
const button = "rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold disabled:opacity-50";

export default function AdminToolsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState("21:00");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const refresh = useCallback(async () => {
    const [summary, entries] = await Promise.all([
      adminToolRequest<Summary>("/admin/tools/summary"), adminToolRequest<Audit[]>("/admin/tools/audit"),
    ]);
    setData(summary); setAudit(entries);
    return summary;
  }, []);
  useEffect(() => {
    void refresh().then(summary => {
      setEnabled(summary.schedule.enabled);
      setTime(`${String(summary.schedule.hour).padStart(2, "0")}:${String(summary.schedule.minute).padStart(2, "0")}`);
      setFrom(summary.report.day.slice(0, 8) + "01"); setTo(summary.report.day);
    }).catch(() => setMessage("Không tải được công cụ quản trị. Kiểm tra phiên đăng nhập/kết nối."));
    const interval = window.setInterval(() => void refresh().catch(() => setMessage("Không làm mới được trạng thái.")), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);
  async function saveSchedule() {
    setBusy(true); setMessage("");
    try {
      const [hour, minute] = time.split(":").map(Number);
      await adminToolRequest("/admin/tools/daily-report", { enabled, hour, minute }, "PUT");
      await refresh(); setMessage("Đã lưu lịch báo cáo.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không lưu được."); }
    finally { setBusy(false); }
  }
  async function exportCsv(kind: "orders" | "keys" | "revenue") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/tools/export/${kind}?${new URLSearchParams({ from, to })}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error ?? "Không xuất được báo cáo."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `telecamp-${kind}-${from}-${to}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Đã tải báo cáo CSV.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không xuất được báo cáo."); }
    finally { setBusy(false); }
  }
  return <AppLayout activePage="admin-tools" title="Công cụ quản trị" subtitle="Đối soát đơn, vận hành bot, báo cáo và lịch sử quản trị.">
    <div className="space-y-5">
      {message && <div role="status" className="rounded-xl border bg-blue-50 p-4 text-sm">{message}</div>}
      <Panel className="space-y-3 p-5">
        <h2 className="text-lg font-extrabold">Đơn đã xác nhận · {data?.report.day ?? "…"}</h2>
        <p className="text-sm text-slate-600">Theo giờ {data?.report.timezone ?? "hệ thống"}. VND/USDT tách riêng; không cộng thêm giá key.</p>
        <div className="grid gap-3 sm:grid-cols-2">{data?.report.cash.map(row => <div key={row.currency} className="rounded-xl bg-slate-50 p-4">
          <p className="font-bold">{row.currency}: {row.amount}</p><p className="text-sm">{row.orders} đơn đã xác nhận</p>
        </div>)}</div>
        {data && !data.report.cash.length && <p className="text-sm">Chưa có đơn xác nhận trong ngày.</p>}
        <p className="text-sm">Key kích hoạt: {data?.report.keyActivations ?? "—"} · Giá ghi nhận: {data?.report.keyValueVnd ?? "—"} VND (thống kê riêng).</p>
        {!!data?.report.historicalRevokedUndated && <p className="text-sm text-amber-800">{data.report.historicalRevokedUndated} đơn thu hồi cũ chưa xác định được ngày nhận tiền; không tự gán vào doanh thu hôm nay.</p>}
        <p className="text-xs text-slate-500">Thu hồi quyền không đồng nghĩa hoàn tiền. Báo cáo theo đơn, không phải số dư ngân hàng.</p>
      </Panel>
      <Panel className="space-y-3 p-5">
        <h2 className="text-lg font-extrabold">Vận hành</h2>
        <div className="grid gap-3 sm:grid-cols-2">{data?.health.workers.map(worker => <div className="rounded-xl border p-3" key={worker.name}>
          <p className="font-bold">{worker.name} · <span className={worker.status === "stale" ? "text-red-700" : "text-slate-600"}>{worker.status}</span></p>
          <p className="text-xs text-slate-500">Thành công gần nhất: {worker.lastSuccessAt ? new Date(worker.lastSuccessAt).toLocaleString("vi-VN") : "Chưa ghi nhận"}</p>
        </div>)}</div>
        <p className="text-sm">Ổ đĩa trống: {data?.health.disk?.availablePercent ?? "—"}%</p>
        <p className="text-sm">Mốc bot đã xử lý: {data?.cursor.offset ?? "—"}. {data?.cursor.failedUpdateId ? `Tin ${data.cursor.failedUpdateId} đang chờ thử lại (${data.cursor.failures ?? 0} lần lỗi).` : "Không có tin lỗi đang chặn."}</p>
        {!!data?.cursor.failedUpdateId && <button className={button} disabled={busy} onClick={() => {
          setBusy(true);
          void adminToolRequest("/admin/tools/telegram/retry", {}).then(() => refresh())
            .then(() => setMessage("Đã yêu cầu thử lại; không bỏ qua tin."))
            .catch(error => setMessage(error.message)).finally(() => setBusy(false));
        }}>Yêu cầu thử lại tin lỗi</button>}
        <Link className="block text-sm font-bold text-blue-800 underline" href="/dashboard/settings">Thiết lập 2FA admin trong Cài đặt</Link>
      </Panel>
      <Panel className="space-y-3 p-5">
        <h2 className="text-lg font-extrabold">Báo cáo qua bot mỗi ngày</h2>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Bật gửi vào chat admin đã cấu hình</label>
        <div className="flex flex-wrap items-center gap-3"><input aria-label="Giờ báo cáo" className={field} type="time" value={time} onChange={e => setTime(e.target.value)} />
          <button className={button} disabled={busy || !data} onClick={() => void saveSchedule()}>Lưu lịch</button></div>
        <p className="text-xs text-slate-500">Mặc định 21:00 theo múi giờ hệ thống. Có thể xem ngay bằng nút Báo cáo ngày trong bot.</p>
      </Panel>
      <Panel className="space-y-3 p-5">
        <h2 className="text-lg font-extrabold">Xuất báo cáo CSV</h2>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">Từ ngày <input className={`${field} block max-w-full`} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="text-sm">Đến ngày <input className={`${field} block max-w-full`} type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-2">{(["orders", "keys", "revenue"] as const).map(kind =>
          <button key={kind} className={button} disabled={busy || !from || !to} onClick={() => void exportCsv(kind)}>
            {kind === "orders" ? "Đơn hàng" : kind === "keys" ? "Key: ID / trạng thái" : "Doanh thu theo ngày"}
          </button>)}</div>
        <p className="text-xs text-slate-500">Tối đa 10.000 dòng/lần; nếu vượt giới hạn cần thu hẹp ngày. Không xuất key gốc, mật khẩu hay token.</p>
      </Panel>
      <Panel className="space-y-3 p-5">
        <h2 className="text-lg font-extrabold">Nhật ký quản trị · 100 thao tác gần nhất</h2>
        {!audit.length && <p className="text-sm text-slate-500">Chưa có thao tác được ghi nhận từ phiên bản này.</p>}
        {audit.map(entry => <details key={entry.id} className="break-words rounded-xl border p-3">
          <summary className="cursor-pointer text-sm"><strong>{entry.actor ?? entry.metadata.actorId}</strong> · {entry.metadata.action}
            <span className="block text-xs text-slate-500">{new Date(entry.created_at).toLocaleString("vi-VN")}</span></summary>
          <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify({ before: entry.metadata.before, after: entry.metadata.after }, null, 2)}</pre>
        </details>)}
      </Panel>
    </div>
  </AppLayout>;
}
