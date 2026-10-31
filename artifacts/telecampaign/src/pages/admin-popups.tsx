import { useEffect, useState } from "react";
import { Plus, Eye, Pencil, Trash2, Megaphone } from "lucide-react";
import { AppLayout, Panel } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";
import { adminToolRequest } from "@/lib/admin-tools-client";
import { compactImage } from "@/lib/compact-image";
import { popupCopy, type Popup } from "@/lib/popup-client";
import { PopupDialog } from "@/components/AnnouncementPopup";

const field = "w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500";
function fresh(): Popup {
  return { id: "", version: "", title: "", titleEn: "", body: "", bodyEn: "", button: "", buttonEn: "", linkUrl: "",
    imageUrl: null, status: "draft", enabled: true, frequency: "daily", audience: "all", template: "offer", accent: "#4f46e5",
    priority: 50, startsAt: null, expiresAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export default function AdminPopupsPage() {
  const { language } = useLanguage(), text = popupCopy[language];
  const [rows, setRows] = useState<Popup[]>([]), [draft, setDraft] = useState<Popup | null>(null);
  const [image, setImage] = useState<string | undefined>(), [busy, setBusy] = useState(false), [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState<"loadError" | "error" | "imageError" | "conflict" | "limit" | null>(null);
  const [notice, setNotice] = useState<"saved" | "deleted" | null>(null);
  const [preview, setPreview] = useState<Popup | null>(null), [mobile, setMobile] = useState(false), [previewLanguage, setPreviewLanguage] = useState<"vi" | "en">(language);
  const load = async () => setRows(await adminToolRequest<Popup[]>("/admin/popups"));
  useEffect(() => { void load().catch(() => setError("loadError")); }, []);
  function edit(p: Popup) { setDraft({ ...p }); setImage(undefined); setError(null); setNotice(null); }
  function change<K extends keyof Popup>(key: K, value: Popup[K]) { setDraft(old => old ? { ...old, [key]: value } : null); }
  function failure(e: unknown) {
    const code = e instanceof Error ? e.message : "";
    setError(code === "POPUP_CONFLICT" ? "conflict" : code === "POPUP_LIMIT" ? "limit" : "error");
  }
  function lifecycle(p: Popup) {
    const now = Date.now();
    return p.status === "draft" ? text.draft : !p.enabled ? text.inactive : p.expiresAt && Date.parse(p.expiresAt) <= now ? text.expired :
      p.startsAt && Date.parse(p.startsAt) > now ? text.scheduled : text.active;
  }
  async function save() {
    if (!draft || busy || imageBusy) return;
    setBusy(true); setError(null);
    try {
      await adminToolRequest(`/admin/popups${draft.id ? `/${draft.id}` : ""}`, { ...draft, imageUrl: undefined, ...(image !== undefined ? { image } : {}) }, draft.id ? "PUT" : "POST");
      setDraft(null); setImage(undefined); setNotice("saved"); await load();
    } catch (e) { failure(e); } finally { setBusy(false); }
  }
  return <AppLayout activePage="admin-popups" title={text.page} subtitle={text.intro} hideUpgrade>
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{text[error]}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{text[notice]}</div>}
    {!draft && <button onClick={() => edit(fresh())} className="mb-5 flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white"><Plus size={18} />{text.create}</button>}
    {draft && <Panel className="mb-6 p-5 sm:p-6">
      <h2 className="mb-5 text-lg font-extrabold">{draft.id ? text.edit : text.create}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold">{text.title}<input className={field} maxLength={120} value={draft.title} onChange={e => change("title", e.target.value)} /></label>
        <label className="space-y-2 text-sm font-semibold">{text.titleEn}<input className={field} maxLength={120} value={draft.titleEn} onChange={e => change("titleEn", e.target.value)} /></label>
        <label className="space-y-2 text-sm font-semibold">{text.body}<textarea className={field} rows={5} maxLength={4000} value={draft.body} onChange={e => change("body", e.target.value)} /></label>
        <label className="space-y-2 text-sm font-semibold">{text.bodyEn}<textarea className={field} rows={5} maxLength={4000} value={draft.bodyEn} onChange={e => change("bodyEn", e.target.value)} /></label>
        <p className="text-xs text-slate-500 md:col-span-2">{text.english}</p>
        <label className="space-y-2 text-sm font-semibold">{text.link}<input className={field} maxLength={1000} placeholder={text.linkHint} value={draft.linkUrl} onChange={e => change("linkUrl", e.target.value)} /></label>
        <label className="space-y-2 text-sm font-semibold">{text.button}<input className={field} maxLength={50} value={draft.button} onChange={e => change("button", e.target.value)} /></label>
        <label className="space-y-2 text-sm font-semibold">{text.buttonEn}<input className={field} maxLength={50} value={draft.buttonEn} onChange={e => change("buttonEn", e.target.value)} /></label>
        <label className="space-y-2 text-sm font-semibold">{text.template}<select className={field} value={draft.template} onChange={e => {
          const template = e.target.value as Popup["template"];
          setDraft({ ...draft, template, accent: template === "offer" ? "#4f46e5" : template === "community" ? "#0f766e" : "#1e3a8a" });
        }}>{(["offer", "news", "community"] as const).map(key => <option key={key} value={key}>{text[key]}</option>)}</select></label>
        <label className="space-y-2 text-sm font-semibold">{text.accent}<input className="block h-12 w-24 cursor-pointer rounded-lg border p-1" type="color" value={draft.accent} onChange={e => change("accent", e.target.value)} /></label>
        <label className="space-y-2 text-sm font-semibold">{text.priority}<input className={field} type="number" min={0} max={100} value={draft.priority} onChange={e => change("priority", Number(e.target.value))} /><p className="text-xs font-normal text-slate-500">{text.priorityHint}</p></label>
        <label className="space-y-2 text-sm font-semibold">{text.frequency}<select className={field} value={draft.frequency} onChange={e => change("frequency", e.target.value as Popup["frequency"])}>
          {(["visit", "daily", "once"] as const).map(key => <option key={key} value={key}>{text[key]}</option>)}</select><p className="text-xs font-normal text-slate-500">{text.frequencyHint}</p></label>
        <label className="space-y-2 text-sm font-semibold">{text.audience}<select className={field} value={draft.audience} onChange={e => change("audience", e.target.value as Popup["audience"])}>
          {(["all", "unpaid", "paid"] as const).map(key => <option key={key} value={key}>{text[key]}</option>)}</select></label>
        <label className="space-y-2 text-sm font-semibold">{text.starts}<input className={field} type="datetime-local" value={localDate(draft.startsAt)} onChange={e => change("startsAt", e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
        <label className="space-y-2 text-sm font-semibold">{text.expires}<input className={field} type="datetime-local" value={localDate(draft.expiresAt)} onChange={e => change("expiresAt", e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
        <p className="text-xs text-slate-500 md:col-span-2">{text.timeHint}</p>
        <label className="space-y-2 text-sm font-semibold">{text.status}<select className={field} value={draft.status} onChange={e => change("status", e.target.value as Popup["status"])}>
          <option value="draft">{text.draft}</option><option value="published">{text.published}</option></select></label>
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={draft.enabled} onChange={e => change("enabled", e.target.checked)} />{text.enabled}</label>
        <div className="space-y-3 md:col-span-2">
          <label className="inline-block cursor-pointer rounded-xl border bg-slate-50 px-4 py-3 text-sm font-bold">{text.image} · {imageBusy ? text.saving : text.choose}
            <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={imageBusy || busy} onChange={async e => {
              const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
              setImageBusy(true); setError(null);
              try { const value = await compactImage(file); setImage(value); change("imageUrl", `data:image/webp;base64,${value}`); }
              catch { setError("imageError"); } finally { setImageBusy(false); }
            }} /></label>
          <p className="text-xs text-slate-500">{text.imageHint}</p>
          {draft.imageUrl && <div className="flex flex-wrap items-start gap-3"><img src={draft.imageUrl} alt={text.image} className="max-h-40 max-w-full rounded-xl border" /><button className="text-sm text-red-600" onClick={() => { setImage(""); change("imageUrl", null); }}>{text.removeImage}</button></div>}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-5">
        <button disabled={busy || imageBusy || !draft.title.trim() || !draft.body.trim()} onClick={() => void save()} className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? text.saving : text.save}</button>
        <button onClick={() => { setPreview({ ...draft, title: draft.title || text.title, body: draft.body || text.body }); setPreviewLanguage(language); }} className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"><Eye size={16} />{text.preview}</button>
        <select aria-label={text.preview} value={mobile ? "mobile" : "desktop"} onChange={e => setMobile(e.target.value === "mobile")} className="rounded-xl border p-3 text-sm"><option value="desktop">{text.desktop}</option><option value="mobile">{text.mobile}</option></select>
        <button disabled={busy} onClick={() => setDraft(null)} className="rounded-xl px-4 py-3 text-sm text-slate-500">{text.cancel}</button>
      </div>
    </Panel>}
    <div className="grid gap-4 lg:grid-cols-2">
      {!rows.length && !draft && <Panel className="p-8 text-center text-sm text-slate-500">{text.empty}</Panel>}
      {rows.map(p => <Panel key={p.id} className="overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="min-w-0 flex-1"><div className="mb-2 flex items-center gap-2 text-xs font-bold" style={{ color: p.accent }}><Megaphone size={15} />{text[p.template]} · {lifecycle(p)}</div>
            <h2 className="truncate font-extrabold text-slate-900">{language === "en" ? p.titleEn || p.title : p.title}</h2>
            <p className="mt-2 text-xs text-slate-500">{text[p.frequency]} · {text[p.audience]} · {p.priority}</p>
          </div>{p.imageUrl && <img src={p.imageUrl} alt="" className="h-16 w-20 rounded-lg object-cover" />}
        </div>
        <div className="flex flex-wrap gap-2 border-t bg-slate-50 px-5 py-3">
          <button className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold" onClick={() => { setPreview(p); setPreviewLanguage(language); }}><Eye size={14} />{text.preview}</button>
          <button className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold" onClick={() => edit(p)}><Pencil size={14} />{text.edit}</button>
          <button className="ml-auto flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-red-600" onClick={async () => {
            if (!confirm(text.confirm)) return;
            try { await adminToolRequest(`/admin/popups/${p.id}`, { version: p.version }, "DELETE"); setNotice("deleted"); await load(); } catch (e) { failure(e); }
          }}><Trash2 size={14} />{text.delete}</button>
        </div>
      </Panel>)}
    </div>
    {preview && <PopupDialog popup={preview} preview mobile={mobile} previewLanguage={previewLanguage} close={() => setPreview(null)} previewControls={<>
      <button onClick={() => setPreviewLanguage("vi")} className={previewLanguage === "vi" ? "font-bold text-indigo-700" : "text-slate-500"}>VI</button>
      <button onClick={() => setPreviewLanguage("en")} className={previewLanguage === "en" ? "font-bold text-indigo-700" : "text-slate-500"}>EN</button>
      <button onClick={() => setMobile(!mobile)} className="border-l pl-2 text-xs">{mobile ? text.mobile : text.desktop}</button>
    </>} />}
  </AppLayout>;
}
