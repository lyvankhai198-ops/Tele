import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ArrowUpRight, Gift, Sparkles, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { adminToolRequest } from "@/lib/admin-tools-client";
import { popupCopy, type Popup } from "@/lib/popup-client";

function buttonInk(color: string) {
  const c = color.match(/[a-f0-9]{2}/gi)?.map(v => parseInt(v, 16)) ?? [0,0,0];
  return c[0] * .299 + c[1] * .587 + c[2] * .114 > 165 ? "#0f172a" : "#ffffff";
}
export function PopupDialog({ popup, close, preview = false, mobile = false, previewLanguage, previewControls }: {
  popup: Popup; close: () => void; preview?: boolean; mobile?: boolean; previewLanguage?: "vi" | "en"; previewControls?: ReactNode;
}) {
  const context = useLanguage(), language = previewLanguage ?? context.language, text = popupCopy[language];
  const [, navigate] = useLocation();
  const english = language === "en";
  const title = english ? popup.titleEn || popup.title : popup.title;
  const body = english ? popup.bodyEn || popup.body : popup.body;
  const button = english ? popup.buttonEn || popup.button : popup.button;
  const Icon = popup.template === "offer" ? Gift : popup.template === "community" ? Users : Sparkles;
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
      <Dialog.Content style={{ width: "calc(100vw - 28px)", maxWidth: mobile ? 360 : 560 }}
        className="fixed left-1/2 top-1/2 z-[101] flex max-h-[88dvh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-extrabold tracking-[.18em] text-slate-600"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: popup.accent }} />TELECAMP</div>
          <Dialog.Close aria-label={text.close} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"><X size={18} /></Dialog.Close>
        </header>
        {preview && previewControls && <div className="flex shrink-0 justify-center gap-4 border-b bg-slate-50 px-4 py-2 text-sm">{previewControls}</div>}
        <div className="min-h-0 overflow-y-auto">
          {popup.imageUrl ? <img src={popup.imageUrl} alt="" className="max-h-64 w-full object-cover" /> :
            <div className="relative flex h-36 items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${popup.accent}18, ${popup.accent}38)` }}>
              <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-white/35" />
              <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-white/90 shadow-lg" style={{ color: popup.accent }}><Icon size={38} strokeWidth={1.5} /></div>
            </div>}
          <div className="space-y-4 px-6 py-6 sm:px-8">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: `${popup.accent}18`, color: "#334155" }}><Icon size={13} />{text[popup.template]}</span>
            <Dialog.Title className="break-words text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-3xl">{title}</Dialog.Title>
            <Dialog.Description className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 sm:text-base">{body}</Dialog.Description>
            {popup.expiresAt && <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-500">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{text.ends}: {new Date(popup.expiresAt).toLocaleString(language === "vi" ? "vi-VN" : "en-GB")}
            </p>}
            {preview && <p className="text-xs text-slate-400">{text.previewHint}</p>}
          </div>
        </div>
        <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row-reverse sm:px-8">
          {popup.linkUrl && button && <a href={popup.linkUrl} target={popup.linkUrl.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer"
            style={{ backgroundColor: popup.accent, color: buttonInk(popup.accent) }} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-extrabold shadow-sm transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={e => { if (preview) { e.preventDefault(); return; } close(); if (popup.linkUrl.startsWith("/")) { e.preventDefault(); navigate(popup.linkUrl); } }}>
            {button}<ArrowUpRight size={17} />
          </a>}
          <Dialog.Close className="min-h-12 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">{text.close}</Dialog.Close>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
export function AnnouncementPopup() {
  const { user } = useAuth();
  const [popup, setPopup] = useState<Popup | null>(null);
  const visit = useRef<{ userId: string; id: string; requested: boolean } | null>(null);
  const eligible = Boolean(user && user.role !== "admin" && !user.support && !user.mustChangePassword);
  useEffect(() => {
    setPopup(null);
    if (!eligible || !user) { visit.current = null; return; }
    if (visit.current?.userId !== user.id) visit.current = { userId: user.id, id: crypto.randomUUID(), requested: false };
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (cancelled) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) { timer = setTimeout(attempt, 1000); return; }
      const current = visit.current;
      if (!current || current.requested) return;
      current.requested = true;
      void adminToolRequest<{ popup: Popup | null }>("/popups/claim", { visitId: current.id })
        .then(result => {
          const show = () => {
            if (cancelled || !result.popup || (result.popup.expiresAt && Date.parse(result.popup.expiresAt) <= Date.now())) return;
            if (document.querySelector('[role="dialog"],[role="alertdialog"]')) { timer = setTimeout(show, 1000); return; }
            setPopup(result.popup);
          };
          show();
        }).catch(() => {});
    };
    timer = setTimeout(attempt, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [eligible, user?.id]);
  useEffect(() => {
    if (!popup) return;
    let cancelled = false;
    const check = () => {
      if (popup.expiresAt && Date.now() >= Date.parse(popup.expiresAt)) { setPopup(null); return; }
      void adminToolRequest<Popup>(`/popups/${popup.id}`).then(value => { if (!cancelled) setPopup(value); })
        .catch(() => { if (!cancelled) setPopup(null); });
    };
    const interval = setInterval(check, 30_000);
    const expiry = popup.expiresAt ? setTimeout(() => {
      if (Date.now() >= Date.parse(popup.expiresAt!)) setPopup(null);
    }, Math.min(2_147_000_000, Math.max(0, Date.parse(popup.expiresAt) - Date.now()))) : undefined;
    return () => { cancelled = true; clearInterval(interval); if (expiry) clearTimeout(expiry); };
  }, [popup?.id, popup?.expiresAt]);
  return popup ? <PopupDialog popup={popup} close={() => setPopup(null)} /> : null;
}
