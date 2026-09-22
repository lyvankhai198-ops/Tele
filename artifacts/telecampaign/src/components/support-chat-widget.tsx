import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCloseSupportChat,
  getGetSupportChatQueryKey,
  useGetSupportChat,
  useMarkSupportChatRead,
  useSendSupportChatMessage,
} from "@workspace/api-client-react";
import { Headset, ImagePlus, Minus, Send, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { playNotificationSound, unlockNotificationSound } from "@/lib/notification-sound";

export function SupportChatWidget() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => window.localStorage.getItem("telecampaign-support-chat-hidden") === "true");
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [, bumpReadMarker] = useState(0);
  const wasOpen = useRef(false);
  const messagesViewport = useRef<HTMLDivElement>(null);
  const chatEnabled = Boolean(user && user.role !== "admin" && !user.support);
  const chat = useGetSupportChat({
    query: {
      queryKey: getGetSupportChatQueryKey(),
      enabled: chatEnabled,
      refetchOnWindowFocus: true,
    },
  });
  const send = useSendSupportChatMessage();
  const markRead = useMarkSupportChatRead();
  const closeChat = useCloseSupportChat();
  const conversation = chat.data?.conversation;
  const messages = useMemo(() => conversation?.messages ?? [], [conversation?.messages]);
  const adminMessages = useMemo(
    () => messages.filter((message) => message.senderType === "admin"),
    [messages],
  );
  const readMarkerKey = user?.id ? `telecampaign-support-last-read:${user.id}` : null;
  const storedReadMessageId = readMarkerKey ? window.localStorage.getItem(readMarkerKey) : null;
  const storedReadIndex = storedReadMessageId
    ? adminMessages.findIndex((message) => message.id === storedReadMessageId)
    : -1;
  const localUnread = storedReadMessageId && storedReadIndex >= 0
    ? adminMessages.length - storedReadIndex - 1
    : adminMessages.length;
  const serverUnread = conversation?.unreadForUser ?? 0;
  const unread = Math.max(serverUnread, localUnread);
  const previousAdminMessageId = useRef<string | null>(null);
  const hasCheckedInitialAdminMessages = useRef(false);

  useEffect(() => {
    const unlock = () => unlockNotificationSound();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!chat.isSuccess) return;
    const latestAdminMessage = adminMessages.at(-1);
    const latestAdminMessageId = latestAdminMessage?.id ?? null;
    if (!hasCheckedInitialAdminMessages.current) {
      hasCheckedInitialAdminMessages.current = true;
      previousAdminMessageId.current = latestAdminMessageId;
      return;
    }
    if (latestAdminMessageId && latestAdminMessageId !== previousAdminMessageId.current) {
      playNotificationSound();
    }
    previousAdminMessageId.current = latestAdminMessageId;
  }, [adminMessages, chat.isSuccess]);

  useEffect(() => {
    if (!chatEnabled) return;
    const refresh = () => void chat.refetch();
    const timer = window.setInterval(refresh, 2_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [chat.refetch, chatEnabled]);

  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (justOpened && unread > 0) {
      markRead.mutate(undefined, {
        onSuccess: () => {
          const latestAdminMessage = adminMessages.at(-1);
          if (readMarkerKey && latestAdminMessage) {
            window.localStorage.setItem(readMarkerKey, latestAdminMessage.id);
            bumpReadMarker((value) => value + 1);
          }
          void queryClient.invalidateQueries({ queryKey: getGetSupportChatQueryKey() });
        },
      });
    }
  }, [adminMessages, markRead, open, queryClient, readMarkerKey, unread]);

  useEffect(() => {
    if (!open || !messagesViewport.current) return;
    const viewport = messagesViewport.current;
    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length, open]);

  if (!user || user.role === "admin" || user.support || chat.data?.enabled === false || hidden) {
    if (hidden && user && user.role !== "admin" && !user.support && chat.data?.enabled !== false) {
      return (
        <button
          type="button"
          onClick={() => {
            window.localStorage.removeItem("telecampaign-support-chat-hidden");
            setHidden(false);
          }}
          className="fixed bottom-5 right-5 z-40 grid h-12 w-12 place-items-center rounded-full bg-[#075e68] text-white shadow-[0_12px_32px_rgba(7,94,104,.26)] transition hover:-translate-y-0.5"
          aria-label={language === "vi" ? "Mở hỗ trợ" : "Open support"}
        >
          <Headset className="h-5 w-5" />
           {unread > 0 && (
             <span className="absolute -right-1 -top-2 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-[#d92d4f] px-1 text-[10px] font-black text-white shadow-[0_3px_10px_rgba(217,45,79,.35)]" aria-label={`${unread} unread message${unread === 1 ? "" : "s"}`}>
               {unread > 9 ? "9+" : unread}
             </span>
           )}
        </button>
      );
    }
    return null;
  }

  const title = language === "vi" ? "Hỗ trợ TeleCampaign" : "TeleCampaign support";
  const placeholder = language === "vi" ? "Nhập câu hỏi của bạn…" : "Type your question…";
  const welcomeMessage = language === "en"
    ? "Hello! Feel free to send us a message. Our support team will get back to you as soon as possible."
    : chat.data?.welcomeMessage;

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setImageError(language === "vi" ? "Vui lòng chọn ảnh JPEG, PNG, WebP hoặc GIF tối đa 10 MB." : "Choose a JPEG, PNG, WebP, or GIF image up to 10 MB.");
      return;
    }
    setImageError(null);
    setSelectedImage(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !selectedImage) || send.isPending || uploadingImage) return;
    setImageError(null);
    setUploadingImage(Boolean(selectedImage));
    try {
      let mediaUploadId: string | undefined;
      if (selectedImage) {
        const uploadUrlResponse = await fetch("/api/support-chat/images/upload-url", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: selectedImage.name,
            size: selectedImage.size,
            contentType: selectedImage.type,
          }),
        });
        const upload = await uploadUrlResponse.json().catch(() => null);
        if (!uploadUrlResponse.ok || !upload?.uploadId || !upload?.uploadURL) {
          throw new Error(upload?.error ?? (language === "vi" ? "Không thể chuẩn bị tải ảnh." : "Could not prepare the image upload."));
        }
        const uploadResponse = await fetch(upload.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": selectedImage.type },
          body: selectedImage,
        });
        if (!uploadResponse.ok) {
          const uploadError = await uploadResponse.json().catch(() => null);
          throw new Error(uploadError?.error ?? (language === "vi" ? "Không thể tải ảnh." : "Could not upload the image."));
        }
        mediaUploadId = upload.uploadId;
      }
      await send.mutateAsync({
        data: {
          ...(body ? { body } : {}),
          ...(mediaUploadId ? { mediaUploadId } : {}),
        },
      });
      setDraft("");
      setSelectedImage(null);
      void queryClient.invalidateQueries({ queryKey: getGetSupportChatQueryKey() });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : (language === "vi" ? "Không thể gửi tin nhắn." : "Could not send the message."));
    } finally {
      setUploadingImage(false);
    }
  }

  function hideWidget() {
    setCloseConfirmOpen(true);
  }

  function confirmCloseWidget() {
    if (closeChat.isPending) return;
    closeChat.mutate(undefined, {
      onSuccess: () => {
        window.localStorage.setItem("telecampaign-support-chat-hidden", "true");
        if (readMarkerKey) window.localStorage.removeItem(readMarkerKey);
        setCloseConfirmOpen(false);
        setOpen(false);
        setHidden(true);
        void queryClient.invalidateQueries({ queryKey: getGetSupportChatQueryKey() });
      },
    });
  }

  function minimizeWidget() {
    setOpen(false);
    void queryClient.refetchQueries({ queryKey: getGetSupportChatQueryKey() });
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6" data-testid="support-chat-widget">
      {open ? (
        <section className="relative flex h-[min(620px,calc(100dvh-32px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] border border-[#d7e5e5] bg-white shadow-[0_24px_70px_rgba(15,45,55,.2)] sm:h-[620px]">
          <header className="flex items-center gap-3 bg-[#075e68] px-4 py-4 text-white">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15"><Headset className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-extrabold">{title}</p>
            </div>
            <button type="button" onClick={minimizeWidget} className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Minimize"><Minus className="h-4 w-4" /></button>
             <button type="button" onClick={hideWidget} className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Close support chat"><X className="h-4 w-4" /></button>
          </header>
          <div ref={messagesViewport} className="flex-1 space-y-3 overflow-y-auto bg-[#f6faf9] px-4 py-4">
            {chat.isLoading && <p className="py-8 text-center text-xs font-semibold text-[#78908f]">Loading…</p>}
            {!chat.isLoading && messages.length === 0 && (
              <div className="rounded-2xl border border-[#dcebea] bg-white p-4 text-[12px] font-semibold leading-5 text-[#587170]">
                {welcomeMessage}
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.senderType === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-[12px] font-semibold leading-5 ${
                  message.senderType === "user"
                    ? "rounded-br-md bg-[#075e68] text-white"
                    : message.senderType === "admin"
                      ? "rounded-bl-md border-2 border-[#73aaa5] bg-[#e8f5f3] text-[#244b49] shadow-[0_4px_12px_rgba(7,94,104,.1)]"
                      : "rounded-bl-md border border-[#dcebea] bg-white text-[#34504f]"
                }`}>
                  {message.senderType === "admin" && (
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#075e68]">
                      {language === "vi" ? "Admin" : "Support"}
                    </p>
                  )}
                  {message.mediaUrl && (
                    <img src={message.mediaUrl} alt={language === "vi" ? "Ảnh đính kèm" : "Attached image"} className="mb-2 max-h-64 max-w-full rounded-xl object-contain" />
                  )}
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <time className={`mt-1 block text-[9px] font-bold ${message.senderType === "user" ? "text-white/65" : "text-[#91a8a7]"}`}>
                    {new Date(message.createdAt).toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="border-t border-[#e3eeee] bg-white p-3">
            {selectedImage && (
              <div className="mb-2 flex items-center justify-between rounded-xl bg-[#eef7f6] px-3 py-2 text-[11px] font-bold text-[#35605e]">
                <span className="min-w-0 truncate">{selectedImage.name}</span>
                <button type="button" onClick={() => setSelectedImage(null)} className="ml-2 shrink-0 text-[#075e68]" aria-label={language === "vi" ? "Bỏ ảnh" : "Remove image"}>×</button>
              </div>
            )}
            {imageError && <p className="mb-2 px-2 text-[10px] font-bold text-[#c2415b]">{imageError}</p>}
            <div className="flex items-end gap-2 rounded-2xl border border-[#d7e5e5] bg-[#f9fcfc] p-2 focus-within:border-[#6da9a6]">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder={placeholder} className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] font-semibold leading-5 text-[#203f3e] outline-none placeholder:text-[#99afae]" />
              <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-[#cfe1df] text-[#075e68] transition hover:bg-[#e8f5f3] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40" aria-label={language === "vi" ? "Đính kèm ảnh" : "Attach image"}>
                <ImagePlus className="h-4 w-4" />
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={send.isPending || uploadingImage} onChange={chooseImage} />
              </label>
              <button type="submit" disabled={(!draft.trim() && !selectedImage) || send.isPending || uploadingImage} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#075e68] text-white transition hover:bg-[#064d55] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 px-2 text-[9px] font-semibold text-[#9aacab]">{draft.length}/2000</p>
          </form>
          {closeConfirmOpen && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-[#123f43]/35 p-4" role="dialog" aria-modal="true" aria-labelledby="support-close-title">
              <div className="w-full max-w-[330px] rounded-2xl bg-white p-5 shadow-[0_20px_55px_rgba(15,45,55,.24)]">
                <h2 id="support-close-title" className="text-[15px] font-black text-[#203f3e]">
                  {language === "vi" ? "Bạn muốn đóng chat?" : "Close this chat?"}
                </h2>
                <p className="mt-2 text-[12px] font-semibold leading-5 text-[#587170]">
                  {language === "vi"
                    ? "Nếu đóng chat, phiên hỗ trợ hiện tại sẽ kết thúc và dữ liệu tin nhắn sẽ được xoá. Bạn vẫn có thể mở lại và gửi tin nhắn mới bất cứ lúc nào."
                    : "Closing the chat deletes the chat data. The current support session and its messages will end and be deleted. You can reopen the chat and send a new message anytime."}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setCloseConfirmOpen(false)} disabled={closeChat.isPending} className="rounded-xl border border-[#d7e5e5] px-3.5 py-2 text-[11px] font-extrabold text-[#587170] hover:bg-[#f6faf9] disabled:opacity-50">
                    {language === "vi" ? "Hủy" : "Cancel"}
                  </button>
                  <button type="button" onClick={confirmCloseWidget} disabled={closeChat.isPending} className="rounded-xl bg-[#075e68] px-3.5 py-2 text-[11px] font-extrabold text-white hover:bg-[#064d55] disabled:opacity-50">
                    {closeChat.isPending
                      ? (language === "vi" ? "Đang đóng…" : "Closing…")
                      : (language === "vi" ? "Đóng chat" : "Close chat")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : (
        <button type="button" onPointerDown={() => setOpen(true)} onClick={() => setOpen(true)} className="group relative flex touch-manipulation items-center gap-2.5 rounded-full bg-[#075e68] px-4 py-3 text-white shadow-[0_12px_32px_rgba(7,94,104,.26)] transition hover:-translate-y-0.5 hover:bg-[#064d55]" aria-label={title}>
          <Headset className="h-5 w-5" />
          <span className="hidden text-[12px] font-extrabold sm:inline">{language === "vi" ? "Cần hỗ trợ?" : "Need help?"}</span>
          {unread > 0 && (
            <span className="absolute -right-1 -top-2 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-[#d92d4f] px-1 text-[10px] font-black text-white shadow-[0_3px_10px_rgba(217,45,79,.35)]" aria-label={`${unread} unread message${unread === 1 ? "" : "s"}`}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}