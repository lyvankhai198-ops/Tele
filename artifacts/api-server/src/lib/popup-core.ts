export type Popup = {
  id: string; version: string; title: string; body: string; titleEn: string; bodyEn: string;
  linkUrl: string; button: string; buttonEn: string; imageId: string | null;
  status: "draft" | "published"; enabled: boolean; frequency: "visit" | "daily" | "once";
  audience: "all" | "unpaid" | "paid"; template: "offer" | "news" | "community";
  accent: string; priority: number; startsAt: string | null; expiresAt: string | null;
  createdAt: string; updatedAt: string;
};
export type PopupSeen = { visits: string[]; seen: Record<string, { firstAt: string; lastAt: string }> };
export function safePopupLink(value: unknown): string {
  if (value === "" || value === undefined) return "";
  if (typeof value !== "string" || value.length > 1000 || /[\u0000-\u0020\\]/.test(value)) throw Error("INVALID_POPUP_LINK");
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw Error("INVALID_POPUP_LINK");
  return url.href;
}
export function popupDay(date: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}
export function popupActive(popup: Popup, paid: boolean, now = new Date()): boolean {
  return popup.status === "published" && popup.enabled &&
    (!popup.startsAt || new Date(popup.startsAt) <= now) && (!popup.expiresAt || new Date(popup.expiresAt) > now) &&
    (popup.audience === "all" || (paid ? popup.audience === "paid" : popup.audience === "unpaid"));
}
export function choosePopup(popups: Popup[], state: PopupSeen, visit: string, paid: boolean, timeZone: string, now = new Date()): Popup | null {
  if (state.visits.includes(visit)) return null;
  return popups.filter(popup => {
    if (!popupActive(popup, paid, now)) return false;
    const seen = state.seen[popup.id];
    return !seen || popup.frequency === "visit" ||
      (popup.frequency === "daily" && popupDay(seen.lastAt, timeZone) !== popupDay(now.toISOString(), timeZone));
  }).sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))[0] ?? null;
}
