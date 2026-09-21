import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminSupportConversationQueryKey,
  getListAdminSupportConversationsQueryKey,
  type SupportChatConversation,
  useGetAdminSupportConversation,
  useListAdminSupportConversations,
  useMarkAdminSupportRead,
  useSendAdminSupportMessage,
  useUpdateAdminSupportConversation,
} from "@workspace/api-client-react";
import { CheckCheck, LifeBuoy, LoaderCircle, MessageSquare, Send, X } from "lucide-react";
import { AppLayout, Panel, PrimaryButton } from "@/components/layout/AppLayout";

function timeLabel(value: string | null) {
  if (!value) return "Chưa có tin nhắn";
  return new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminSupportChatPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const conversationsQuery = useListAdminSupportConversations({ query: { queryKey: getListAdminSupportConversationsQueryKey(), refetchInterval: 2_000 } });
  const selectedQuery = useGetAdminSupportConversation(selectedId ?? "", { query: { queryKey: getGetAdminSupportConversationQueryKey(selectedId ?? ""), enabled: Boolean(selectedId), refetchInterval: 2_000 } });
  const markRead = useMarkAdminSupportRead();
  const send = useSendAdminSupportMessage();
  const updateStatus = useUpdateAdminSupportConversation();
  const selected = selectedQuery.data?.conversation;
  const conversations = conversationsQuery.data?.conversations ?? [];

  useEffect(() => {
    if (!selectedId) return;
    const conversation = conversations.find((item) => item.id === selectedId);
    if (conversation?.unreadForAdmin) {
      markRead.mutate({ conversationId: selectedId }, {
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListAdminSupportConversationsQueryKey() }),
      });
    }
  }, [conversations, markRead, queryClient, selectedId]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !draft.trim() || send.isPending) return;
    send.mutate({ conversationId: selectedId, data: { body: draft.trim() } }, {
      onSuccess: () => {
        setDraft("");
        void queryClient.invalidateQueries({ queryKey: getGetAdminSupportConversationQueryKey(selectedId) });
        void queryClient.invalidateQueries({ queryKey: getListAdminSupportConversationsQueryKey() });
      },
    });
  }

  return (
    <AppLayout activePage="admin-support-chat" title="Hỗ trợ khách hàng" subtitle="Theo dõi và trả lời hội thoại từ website. Tin nhắn Telegram cũng được đồng bộ tại đây.">
      <div className="grid min-h-[min(720px,calc(100dvh-190px))] gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#eef2f6] px-5 py-4">
            <div><p className="text-[13px] font-extrabold text-[#0f172a]">Hội thoại</p><p className="mt-1 text-[11px] font-semibold text-[#94a3b8]">{conversations.length} cuộc trò chuyện</p></div>
            <LifeBuoy className="h-5 w-5 text-[#075e68]" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {conversationsQuery.isLoading && <div className="grid place-items-center p-8"><LoaderCircle className="h-5 w-5 animate-spin text-[#075e68]" /></div>}
            {conversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={`mb-1 w-full rounded-2xl p-3 text-left transition ${selectedId === conversation.id ? "bg-[#e8f4f3]" : "hover:bg-[#f7fafb]"}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#dff1ef] text-[12px] font-extrabold uppercase text-[#075e68]">{conversation.username.slice(0, 2)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-[12px] font-extrabold text-[#243b53]">@{conversation.username}</span>{conversation.unreadForAdmin > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#f4b942] px-1 text-[10px] font-extrabold text-[#553b04]">{conversation.unreadForAdmin}</span>}</span>
                    <span className="mt-1 block text-[10px] font-semibold text-[#94a3b8]">{timeLabel(conversation.lastMessageAt)}</span>
                  </span>
                </div>
              </button>
            ))}
            {!conversationsQuery.isLoading && conversations.length === 0 && <p className="p-6 text-center text-[12px] font-semibold text-[#94a3b8]">Chưa có hội thoại.</p>}
          </div>
        </Panel>

        <Panel className="flex min-h-0 flex-col overflow-hidden">
          {!selected ? (
            <div className="grid flex-1 place-items-center p-8 text-center"><div><MessageSquare className="mx-auto h-9 w-9 text-[#a4c4c2]" /><p className="mt-3 text-[14px] font-extrabold text-[#475569]">Chọn một hội thoại</p><p className="mt-1 text-[12px] font-semibold text-[#94a3b8]">Tin nhắn mới sẽ xuất hiện tự động.</p></div></div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-[#eef2f6] px-5 py-4">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e8f4f3] text-[13px] font-extrabold uppercase text-[#075e68]">{selected.username.slice(0, 2)}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-extrabold text-[#0f172a]">@{selected.username}</p><p className="mt-1 text-[11px] font-semibold text-[#94a3b8]">Trạng thái: {selected.status === "open" ? "Đang mở" : "Đã đóng"}</p></div>
                {selected.status === "open" ? (
                  <button type="button" onClick={() => updateStatus.mutate({ conversationId: selected.id, data: { status: "closed" } }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetAdminSupportConversationQueryKey(selected.id) }) })} className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] px-3 py-2 text-[11px] font-extrabold text-[#64748b] hover:bg-[#f8fafc]"><X className="h-3.5 w-3.5" />Đóng</button>
                ) : (
                  <PrimaryButton onClick={() => updateStatus.mutate({ conversationId: selected.id, data: { status: "open" } }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetAdminSupportConversationQueryKey(selected.id) }) })}><CheckCheck className="h-3.5 w-3.5" />Mở lại</PrimaryButton>
                )}
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto bg-[#f8fbfb] px-5 py-5">
                {selected.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.senderType === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-[12px] font-semibold leading-5 ${message.senderType === "admin" ? "rounded-br-md bg-[#075e68] text-white" : message.senderType === "system" ? "border border-dashed border-[#d3e3e2] bg-white text-[#78908f]" : "rounded-bl-md bg-white text-[#34504f] shadow-sm"}`}>
                      {message.mediaUrl && <img src={message.mediaUrl} alt="Ảnh đính kèm" className="mb-2 max-h-72 max-w-full rounded-xl object-contain" />}
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      <time className={`mt-1 block text-[9px] font-bold ${message.senderType === "admin" ? "text-white/65" : "text-[#9aacab]"}`}>{timeLabel(message.createdAt)}</time>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={submit} className="border-t border-[#eef2f6] bg-white p-4">
                <div className="flex items-end gap-2 rounded-2xl border border-[#dbe5e5] bg-[#fbfdfd] p-2 focus-within:border-[#75a9a7]">
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={2000} placeholder="Nhập câu trả lời cho khách…" className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] font-semibold leading-5 outline-none placeholder:text-[#a0b2b1]" />
                  <button type="submit" disabled={!draft.trim() || send.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#075e68] text-white hover:bg-[#064d55] disabled:opacity-40" aria-label="Gửi trả lời"><Send className="h-4 w-4" /></button>
                </div>
              </form>
            </>
          )}
        </Panel>
      </div>
    </AppLayout>
  );
}