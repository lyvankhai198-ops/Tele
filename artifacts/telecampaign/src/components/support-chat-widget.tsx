import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSupportChatQueryKey,
  useGetSupportChat,
  useMarkSupportChatRead,
  useSendSupportChatMessage,
} from "@workspace/api-client-react";
import { LifeBuoy, MessageCircle, Minus, Send, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";

export function SupportChatWidget() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => window.localStorage.getItem("telecampaign-support-chat-hidden") === "true");
  const [draft, setDraft] = useState("");
  const chat = useGetSupportChat({
    query: {
      queryKey: getGetSupportChatQueryKey(),
      enabled: Boolean(user && user.role !== "admin" && !user.support),
      refetchInterval: 4_000,
    },
  });
  const send = useSendSupportChatMessage();
  const markRead = useMarkSupportChatRead();
  const conversation = chat.data?.conversation;
  const messages = useMemo(() => conversation?.messages ?? [], [conversation?.messages]);

  useEffect(() => {
    if (open && conversation?.unreadForUser) {
      markRead.mutate(undefined, {
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetSupportChatQueryKey() }),
      });
    }
  }, [conversation?.unreadForUser, markRead, open, queryClient]);

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
          <LifeBuoy className="h-5 w-5" />
        </button>
      );
    }
    return null;
  }

  const unread = conversation?.unreadForUser ?? 0;
  const title = language === "vi" ? "Hỗ trợ TeleCampaign" : "TeleCampaign support";
  const placeholder = language === "vi" ? "Nhập câu hỏi của bạn…" : "Type your question…";

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate({ data: { body } }, {
      onSuccess: () => {
        setDraft("");
        void queryClient.invalidateQueries({ queryKey: getGetSupportChatQueryKey() });
      },
    });
  }

  function hideWidget() {
    window.localStorage.setItem("telecampaign-support-chat-hidden", "true");
    setHidden(true);
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6" data-testid="support-chat-widget">
      {open ? (
        <section className="flex h-[min(620px,calc(100dvh-32px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] border border-[#d7e5e5] bg-white shadow-[0_24px_70px_rgba(15,45,55,.2)] sm:h-[620px]">
          <header className="flex items-center gap-3 bg-[#075e68] px-4 py-4 text-white">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15"><LifeBuoy className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-extrabold">{title}</p>
              <p className="mt-0.5 text-[11px] font-medium text-[#b9e5e2]">{language === "vi" ? "Tin nhắn được lưu tự động" : "Messages are saved automatically"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Minimize"><Minus className="h-4 w-4" /></button>
            <button type="button" onClick={hideWidget} className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Hide support chat"><X className="h-4 w-4" /></button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#f6faf9] px-4 py-4">
            {chat.isLoading && <p className="py-8 text-center text-xs font-semibold text-[#78908f]">Loading…</p>}
            {!chat.isLoading && messages.length === 0 && (
              <div className="rounded-2xl border border-[#dcebea] bg-white p-4 text-[12px] font-semibold leading-5 text-[#587170]">
                {chat.data?.welcomeMessage}
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.senderType === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-[12px] font-semibold leading-5 ${
                  message.senderType === "user"
                    ? "rounded-br-md bg-[#075e68] text-white"
                    : "rounded-bl-md border border-[#dcebea] bg-white text-[#34504f]"
                }`}>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <time className={`mt-1 block text-[9px] font-bold ${message.senderType === "user" ? "text-white/65" : "text-[#91a8a7]"}`}>
                    {new Date(message.createdAt).toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="border-t border-[#e3eeee] bg-white p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-[#d7e5e5] bg-[#f9fcfc] p-2 focus-within:border-[#6da9a6]">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder={placeholder} className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] font-semibold leading-5 text-[#203f3e] outline-none placeholder:text-[#99afae]" />
              <button type="submit" disabled={!draft.trim() || send.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#075e68] text-white transition hover:bg-[#064d55] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 px-2 text-[9px] font-semibold text-[#9aacab]">{draft.length}/2000</p>
          </form>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="group relative flex items-center gap-2.5 rounded-full bg-[#075e68] px-4 py-3 text-white shadow-[0_12px_32px_rgba(7,94,104,.26)] transition hover:-translate-y-0.5 hover:bg-[#064d55]" aria-label={title}>
          <MessageCircle className="h-5 w-5" />
          <span className="hidden text-[12px] font-extrabold sm:inline">{language === "vi" ? "Cần hỗ trợ?" : "Need help?"}</span>
          {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#f4b942] px-1 text-[10px] font-extrabold text-[#553b04]">{unread > 9 ? "9+" : unread}</span>}
        </button>
      )}
    </div>
  );
}