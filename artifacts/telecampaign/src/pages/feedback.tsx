import { useCallback, useEffect, useState } from "react";
import { AppLayout, Panel } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { adminToolRequest } from "@/lib/admin-tools-client";

type Kind = "bug" | "feature" | "interface";
type Status = "received" | "reviewing" | "completed";
type Item = { id: string; username: string; kind: Kind; content: string; source: string; status: Status; createdAt: string; updatedAt: string; hasImage: boolean };
const kinds: Record<Kind, string> = { bug: "Báo lỗi", feature: "Đề xuất tính năng", interface: "Góp ý giao diện" };
const statuses: Record<Status, string> = { received: "Đã nhận", reviewing: "Đang xem xét", completed: "Đã hoàn thành" };
const inputStyle = "w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500";
async function compactImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) throw Error("Chọn ảnh PNG/JPG/WebP tối đa 4 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    for (const edge of [1000, 750, 500]) {
      const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Không xử lý được ảnh trên thiết bị này.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.5, 0.2]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (blob && blob.size <= 48_000) {
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = () => reject(Error("Không đọc được ảnh."));
            reader.readAsDataURL(blob);
          });
        }
      }
    }
    throw Error("Ảnh quá nhiều chi tiết. Hãy cắt vùng cần góp ý rồi chọn lại.");
  } finally { bitmap.close(); }
}
export default function FeedbackPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [kind, setKind] = useState<Kind | null>(null), [content, setContent] = useState("");
  const [image, setImage] = useState(""), [imageName, setImageName] = useState("");
  const [items, setItems] = useState<Item[]>([]), [groupUrl, setGroupUrl] = useState(""), [groupDraft, setGroupDraft] = useState("");
  const [busy, setBusy] = useState(false), [savingGroup, setSavingGroup] = useState(false), [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    const [config, records] = await Promise.all([
      adminToolRequest<{ groupUrl: string }>("/feedback/config"),
      adminToolRequest<Item[]>(admin ? "/admin/feedback" : "/feedback"),
    ]);
    const focused = window.location.hash.slice(1);
    if (/^[a-f0-9-]{36}$/i.test(focused) && !records.some(row => row.id === focused)) {
      const record = await adminToolRequest<Item>(`/feedback/${focused}`).catch(() => null);
      if (record) records.unshift(record);
    }
    setGroupUrl(config.groupUrl); setItems(records);
  }, [admin]);
  useEffect(() => {
    void load().catch(() => setError("Chưa tải được góp ý. Vui lòng thử lại."));
    const timer = setInterval(() => void load().catch(() => {}), 30_000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => { setGroupDraft(groupUrl); }, [groupUrl]);
  async function submit() {
    if (!kind || busy || imageBusy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      let source = "/dashboard/feedback";
      try {
        const captured = JSON.parse(sessionStorage.getItem("telecamp-feedback-source") || "null");
        if (captured && Date.now() - captured.at < 1_800_000 && typeof captured.path === "string") source = captured.path;
      } catch { /* Optional navigation metadata only. */ }
      await adminToolRequest("/feedback", { kind, content, source, ...(image ? { image } : {}) });
      setContent(""); setImage(""); setImageName(""); setKind(null);
      setNotice("Đã nhận góp ý. Bạn có thể theo dõi trạng thái bên dưới. Cảm ơn bạn!");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Chưa gửi được góp ý."); }
    finally { setBusy(false); }
  }
  async function changeStatus(id: string, status: Status) {
    setError("");
    try {
      await adminToolRequest(`/admin/feedback/${id}/status`, { status }, "PATCH");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Chưa lưu được."); }
  }
  return <AppLayout activePage="feedback" title="Góp ý & thảo luận" subtitle="Cùng hoàn thiện TeleCamp. Chat hỗ trợ vẫn hoạt động riêng." hideUpgrade>
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(kinds) as Kind[]).map((value, index) => <button key={value} type="button" onClick={() => setKind(value)}
        className={`rounded-2xl border p-5 text-left shadow-sm ${kind === value ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"}`}>
        <span className="text-2xl">{["🐞", "💡", "🎨"][index]}</span>
        <h2 className="mt-2 font-extrabold text-slate-900">{kinds[value]}</h2>
        <p className="mt-1 text-sm text-slate-500">{["Mô tả lỗi và các bước để gặp lại lỗi.", "Bạn muốn TeleCamp bổ sung điều gì?", "Điểm nào khó dùng hoặc cần trình bày rõ hơn?"][index]}</p>
      </button>)}
      {groupUrl ? <a href={groupUrl} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <span className="text-2xl">💬</span><h2 className="mt-2 font-extrabold text-slate-900">Tham gia nhóm thảo luận ↗</h2><p className="mt-1 text-sm text-slate-500">Trao đổi kinh nghiệm và ý tưởng cùng cộng đồng.</p>
      </a> : <div aria-disabled="true" className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
        <span className="text-2xl">💬</span><h2 className="mt-2 font-extrabold text-slate-600">Tham gia nhóm thảo luận</h2><p className="mt-1 text-sm text-slate-500">Chưa có link nhóm.</p>
      </div>}
    </div>
    {kind && <div className="mt-5"><Panel className="p-5">
      <h2 className="mb-4 text-lg font-extrabold">{kinds[kind]}</h2>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Username được gắn tự động. Không gửi mật khẩu, mã OTP hay khóa bí mật.</p>
        <textarea className={inputStyle} rows={6} maxLength={4000} value={content} onChange={e => setContent(e.target.value)} placeholder="Mô tả cụ thể, tối thiểu 10 ký tự…" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{content.trim().length}/4000 ký tự</span><span>Tối đa 5 góp ý/24 giờ, cách nhau 1 phút</span></div>
        <label className="block text-sm font-semibold">Ảnh đính kèm (không bắt buộc)
          <input className="mt-2 block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" disabled={imageBusy || busy}
            onChange={async e => {
              const file = e.target.files?.[0]; e.target.value = "";
              if (!file) return;
              setImageBusy(true); setError(""); setImage(""); setImageName("");
              try { setImage(await compactImage(file)); setImageName(file.name); }
              catch (err) { setError(err instanceof Error ? err.message : "Không xử lý được ảnh."); }
              finally { setImageBusy(false); }
            }} />
        </label>
        <p className="text-xs text-slate-500">PNG/JPG/WebP tối đa 4 MB; ảnh được nén tự động. Chỉ bạn và quản trị viên xem được.</p>
        {imageBusy && <p className="text-sm">Đang nén ảnh…</p>}
        {image && <div className="space-y-2"><img alt="Ảnh sẽ gửi" src={`data:image/webp;base64,${image}`} className="max-h-64 max-w-full rounded-xl border" />
          <button type="button" className="text-sm text-red-600" onClick={() => { setImage(""); setImageName(""); }}>Bỏ ảnh {imageName}</button></div>}
        <button type="button" disabled={busy || imageBusy || content.trim().length < 10} onClick={() => void submit()} className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Đang gửi…" : "Gửi góp ý"}
        </button>
      </div>
    </Panel></div>}
    {admin && <div className="mt-5"><Panel className="p-5">
      <h2 className="mb-4 text-lg font-extrabold">Cài đặt quản trị · Link nhóm thảo luận</h2>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Dán link HTTPS của nhóm. Để trống nếu chưa muốn mở nhóm.</p>
        <input className={inputStyle} type="url" maxLength={500} placeholder="https://t.me/…" value={groupDraft} onChange={e => setGroupDraft(e.target.value)} />
        <button type="button" disabled={savingGroup} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={async () => {
          setSavingGroup(true); setError("");
          try {
            const result = await adminToolRequest<{ groupUrl: string }>("/admin/feedback/config", { groupUrl: groupDraft.trim() }, "PUT");
            setGroupUrl(result.groupUrl); setGroupDraft(result.groupUrl); setNotice("Đã lưu link nhóm.");
          } catch (e) { setError(e instanceof Error ? e.message : "Chưa lưu được link."); }
          finally { setSavingGroup(false); }
        }}>{savingGroup ? "Đang lưu…" : "Lưu link nhóm"}</button>
      </div>
    </Panel></div>}
    <div className="mt-5"><Panel className="p-5">
      <h2 className="mb-4 text-lg font-extrabold">{admin ? "Quản lý góp ý · 100 mục gần nhất" : "Góp ý của bạn · 100 mục gần nhất"}</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Lọc trạng thái góp ý" className="rounded-xl border p-2 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>{(Object.keys(statuses) as Status[]).map(status => <option key={status} value={status}>{statuses[status]}</option>)}
        </select>
        <button type="button" onClick={() => void load().catch(() => setError("Chưa tải được."))} className="rounded-xl border px-3 py-2 text-sm">Làm mới</button>
      </div>
      <div className="space-y-4">
        {!items.filter(row => filter === "all" || row.status === filter).length && <p className="text-sm text-slate-500">Chưa có góp ý ở mục này.</p>}
        {items.filter(row => filter === "all" || row.status === filter).map(row => <article id={row.id} key={row.id} className="rounded-xl border border-slate-200 p-4 target:border-indigo-500">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{kinds[row.kind]}</strong><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{statuses[row.status]}</span></div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{row.content}</p>
          <p className="mt-3 break-all text-xs text-slate-500">{admin ? `${row.username} · ` : ""}{new Date(row.createdAt).toLocaleString("vi-VN")} · {row.source}</p>
          {row.hasImage && <a href={`/api/feedback/${row.id}/image`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
            <img loading="lazy" alt="Ảnh đính kèm góp ý" src={`/api/feedback/${row.id}/image`} className="max-h-64 max-w-full rounded-lg border" />
          </a>}
          {admin && <label className="mt-3 block text-sm">Cập nhật trạng thái
            <select value={row.status} onChange={e => void changeStatus(row.id, e.target.value as Status)} className="ml-2 rounded-lg border p-2">
              {(Object.keys(statuses) as Status[]).map(status => <option key={status} value={status}>{statuses[status]}</option>)}
            </select>
          </label>}
        </article>)}
      </div>
    </Panel></div>
  </AppLayout>;
}
