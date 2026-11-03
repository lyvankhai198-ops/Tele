export const SUPPORT_CHAT_OPEN_EVENT = "telecampaign:open-support-chat";

export function hasSupportChatOpenIntent(search: string): boolean {
  return new URLSearchParams(search).get("chat") === "open";
}

export function isSupportChatOpenLink(href: string, origin: string): boolean {
  try {
    const url = new URL(href, origin);
    return url.origin === origin && hasSupportChatOpenIntent(url.search);
  } catch { return false; }
}

export function requestSupportChatOpen(target: Window = window): void {
  target.dispatchEvent(new Event(SUPPORT_CHAT_OPEN_EVENT));
}

export function consumeSupportChatOpenIntent(target: Window = window): void {
  const url = new URL(target.location.href);
  if (!hasSupportChatOpenIntent(url.search)) return;
  url.searchParams.delete("chat");
  target.history.replaceState(target.history.state, "", url.pathname + url.search + url.hash);
}
