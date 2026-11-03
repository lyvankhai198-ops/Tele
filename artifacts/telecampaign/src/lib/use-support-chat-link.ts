import { useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { consumeSupportChatOpenIntent, hasSupportChatOpenIntent, requestSupportChatOpen, SUPPORT_CHAT_OPEN_EVENT } from "./support-chat-link";

export function useSupportChatLink({ user, ready, enabled, onOpen }: {
  user: { id: string } | null | undefined;
  ready: boolean; enabled: boolean; onOpen: () => void;
}) {
  const search = useSearch();
  // Capture a direct link before a workspace/subscription redirect removes its
  // query string, and wait for authentication and existing chat settings.
  const pending = useRef(hasSupportChatOpenIntent(window.location.search));
  const previousUser = useRef(user?.id);
  useEffect(() => {
    if (hasSupportChatOpenIntent(search)) pending.current = true;
    if (previousUser.current && previousUser.current !== user?.id) {
      pending.current = false;
      consumeSupportChatOpenIntent();
    }
    previousUser.current = user?.id;
    const handleOpen = () => {
      pending.current = true;
      if (!user || !ready) return;
      pending.current = false;
      consumeSupportChatOpenIntent();
      if (enabled) onOpen();
    };
    window.addEventListener(SUPPORT_CHAT_OPEN_EVENT, handleOpen);
    if (pending.current) requestSupportChatOpen();
    return () => window.removeEventListener(SUPPORT_CHAT_OPEN_EVENT, handleOpen);
  }, [search, user?.id, ready, enabled, onOpen]);
}
