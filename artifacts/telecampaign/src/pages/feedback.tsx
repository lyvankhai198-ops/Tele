import { useCallback, useEffect, useState } from "react";
import { AppLayout, Panel } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { adminToolRequest } from "@/lib/admin-tools-client";
import { useLanguage } from "@/lib/i18n";
import { feedbackErrorKey } from "@/lib/feedback-i18n";
import { compactImage } from "@/lib/compact-image";

type Kind = "bug" | "feature" | "interface";
type Status = "received" | "reviewing" | "completed";
type Item = { id: string; username: string; kind: Kind; content: string; source: string; status: Status; createdAt: string; updatedAt: string; hasImage: boolean };
const kinds: Record<Kind, string> = { bug: "Report a bug", feature: "Suggest a feature", interface: "Interface feedback" };
const submissionKinds: Kind[] = ["feature"];
const statuses: Record<Status, string> = { received: "Received", reviewing: "Under review", completed: "Completed" };
const inputStyle = "w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500";
export default function FeedbackPage() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
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
    void load().catch(() => setError("Could not load feedback. Please try again."));
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
      setNotice("Feedback received. You can track its status below. Thank you!");
      await load();
    } catch (e) { setError(feedbackErrorKey(e, "Could not submit feedback. Please try again.")); }
    finally { setBusy(false); }
  }
  async function changeStatus(id: string, status: Status) {
    setError("");
    try {
      await adminToolRequest(`/admin/feedback/${id}/status`, { status }, "PATCH");
      await load();
    } catch (e) { setError(feedbackErrorKey(e, "Could not save changes. Please try again.")); }
  }
  return <AppLayout activePage="feedback" title={t("Feedback & discussion")} subtitle={t("Help improve TeleCamp. Support chat remains available separately.")} hideUpgrade>
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{t(error)}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{t(notice)}</div>}
    <div className="grid gap-3 sm:grid-cols-2">
      {submissionKinds.map(value => <button key={value} type="button" onClick={() => setKind(value)}
        className={`rounded-2xl border p-5 text-left shadow-sm ${kind === value ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"}`}>
        <span className="text-2xl">💡</span>
        <h2 className="mt-2 font-extrabold text-slate-900">{t(kinds[value])}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("What would you like TeleCamp to add?")}</p>
      </button>)}
      {groupUrl ? <a href={groupUrl} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <span className="text-2xl">💬</span><h2 className="mt-2 font-extrabold text-slate-900">{t("Join the discussion group")} ↗</h2><p className="mt-1 text-sm text-slate-500">{t("Share ideas and experience with the community.")}</p>
      </a> : <div aria-disabled="true" className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
        <span className="text-2xl">💬</span><h2 className="mt-2 font-extrabold text-slate-600">{t("Join the discussion group")}</h2><p className="mt-1 text-sm text-slate-500">{t("No group link yet.")}</p>
      </div>}
    </div>
    {kind && <div className="mt-5"><Panel className="p-5">
      <h2 className="mb-4 text-lg font-extrabold">{t(kinds[kind])}</h2>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">{t("Your username is added automatically. Do not send passwords, OTPs or secret keys.")}</p>
        <p className="text-sm text-indigo-700">{t("You will receive a website notification when your suggestion is completed. Attachments are also sent to the admin's private Telegram bot.")}</p>
        <textarea className={inputStyle} rows={6} maxLength={4000} value={content} onChange={e => setContent(e.target.value)} placeholder={t("Describe your feedback in at least 10 characters...")} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{content.trim().length}/4000 {t("characters")}</span><span>{t("Up to 5 submissions per 24 hours, at least 1 minute apart")}</span></div>
        <label className="block text-sm font-semibold">{t("Screenshot (optional)")}
          <span className="mt-2 block w-fit rounded-lg border px-3 py-2 text-sm font-normal">{t("Choose image")}</span>
          <input aria-label={t("Choose image")} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={imageBusy || busy}
            onChange={async e => {
              const file = e.target.files?.[0]; e.target.value = "";
              if (!file) return;
              setImageBusy(true); setError(""); setImage(""); setImageName("");
              try { setImage(await compactImage(file)); setImageName(file.name); }
              catch (err) { setError(feedbackErrorKey(err, "Could not process the image. Try another PNG/JPG/WebP image.")); }
              finally { setImageBusy(false); }
            }} />
        </label>
        <p className="text-xs text-slate-500">{t("PNG/JPG/WebP up to 4 MB; compressed automatically. Only you and admins can view it.")}</p>
        {imageBusy && <p className="text-sm">{t("Compressing image...")}</p>}
        {image && <div className="space-y-2"><img alt={t("Image to submit")} src={`data:image/webp;base64,${image}`} className="max-h-64 max-w-full rounded-xl border" />
          <button type="button" className="text-sm text-red-600" onClick={() => { setImage(""); setImageName(""); }}>{t("Remove image")} {imageName}</button></div>}
        <button type="button" disabled={busy || imageBusy || content.trim().length < 10} onClick={() => void submit()} className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
          {t(busy ? "Submitting..." : "Submit feedback")}
        </button>
      </div>
    </Panel></div>}
    {admin && <div className="mt-5"><Panel className="p-5">
      <h2 className="mb-4 text-lg font-extrabold">{t("Admin settings - Discussion group link")}</h2>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">{t("Paste the group's HTTPS link. Leave it blank to keep the group closed.")}</p>
        <input className={inputStyle} type="url" maxLength={500} placeholder="https://t.me/…" value={groupDraft} onChange={e => setGroupDraft(e.target.value)} />
        <button type="button" disabled={savingGroup} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={async () => {
          setSavingGroup(true); setError("");
          try {
            const result = await adminToolRequest<{ groupUrl: string }>("/admin/feedback/config", { groupUrl: groupDraft.trim() }, "PUT");
            setGroupUrl(result.groupUrl); setGroupDraft(result.groupUrl); setNotice("Group link saved.");
          } catch (e) { setError(feedbackErrorKey(e, "Could not save changes. Please try again.")); }
          finally { setSavingGroup(false); }
        }}>{t(savingGroup ? "Saving..." : "Save group link")}</button>
      </div>
    </Panel></div>}
    <div className="mt-5"><Panel className="p-5">
      <h2 className="mb-4 text-lg font-extrabold">{t(admin ? "Manage feedback - Latest 100 items" : "Your feedback - Latest 100 items")}</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label={t("Filter feedback by status")} className="rounded-xl border p-2 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">{t("All statuses")}</option>{(Object.keys(statuses) as Status[]).map(status => <option key={status} value={status}>{t(statuses[status])}</option>)}
        </select>
        <button type="button" onClick={() => void load().catch(() => setError("Could not load feedback. Please try again."))} className="rounded-xl border px-3 py-2 text-sm">{t("Refresh feedback")}</button>
      </div>
      <div className="space-y-4">
        {!items.filter(row => filter === "all" || row.status === filter).length && <p className="text-sm text-slate-500">{t("No feedback in this category yet.")}</p>}
        {items.filter(row => filter === "all" || row.status === filter).map(row => <article id={row.id} key={row.id} className="rounded-xl border border-slate-200 p-4 target:border-indigo-500">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{t(kinds[row.kind])}</strong><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{t(statuses[row.status])}</span></div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{row.content}</p>
          <p className="mt-3 break-all text-xs text-slate-500">{admin ? `${row.username} · ` : ""}{new Date(row.createdAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")} · {row.source}</p>
          {row.hasImage && <a href={`/api/feedback/${row.id}/image`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
            <img loading="lazy" alt={t("Feedback attachment")} src={`/api/feedback/${row.id}/image`} className="max-h-64 max-w-full rounded-lg border" />
          </a>}
          {admin && <label className="mt-3 block text-sm">{t("Update status")}
            <select value={row.status} onChange={e => void changeStatus(row.id, e.target.value as Status)} className="ml-2 rounded-lg border p-2">
              {(Object.keys(statuses) as Status[]).map(status => <option key={status} value={status}>{t(statuses[status])}</option>)}
            </select>
          </label>}
        </article>)}
      </div>
    </Panel></div>
  </AppLayout>;
}
