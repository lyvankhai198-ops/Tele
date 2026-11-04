import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock3, FileText, LoaderCircle, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  getListReleaseUpdatesQueryKey,
  useCreateReleaseUpdate,
  useDeleteReleaseUpdate,
  useListReleaseUpdates,
  useSendReleaseUpdate,
  useUpdateReleaseUpdate,
  type ReleaseUpdate,
} from "@workspace/api-client-react";
import { AppLayout, EmptyState, Modal, Panel, PrimaryButton, QuietButton, SectionHeader, Toast } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";

type ReleaseCopy = typeof copy.en | typeof copy.vi;
type SendSelection = { id: string; version: number; destination: string; title: string; text: string };
type DraftValues = { title: string; vi: string; en: string };

const copy = {
  en: {
    title: "Release updates", eyebrow: "Private release control",
    detail: "Prepare bilingual software release notes, review the exact Telegram message, then approve each release individually.",
    create: "New release draft", emptyTitle: "No release drafts yet",
    emptyDetail: "Create a private software update. Saving a draft never sends a Telegram message.",
    createTitle: "Create release draft", editTitle: "Edit release content",
    formHint: "These notes are for the private release channel—not customer notifications.",
    releaseTitle: "Release title", vietnamese: "Vietnamese release notes", english: "English release notes",
    titlePlaceholder: "For example: Desktop client 2.8.1", viPlaceholder: "What changed in this release?", enPlaceholder: "What changed in this release?",
    createAction: "Create draft", save: "Save draft", saving: "Saving…", cancel: "Cancel", preview: "Telegram message preview",
    previewNote: "Preview uses the exact message format that will be sent.",
    status: { draft: "Draft", sending: "Sending", sent: "Sent", failed: "Failed", unknown: "Delivery unknown" },
    send: "Review & send", retry: "Review retry", delete: "Delete draft", version: "Version",
    created: "Created", updated: "Updated", destination: "Current destination", noDestination: "No Telegram destination is configured. Sending is unavailable.",
    sendTitle: "Confirm release send", confirmIntro: "You are approving this exact release for the private Telegram destination below.",
    selectedTitle: "Selected title", fixedNotice: "The title, message, version and destination are fixed for this confirmation. Changes made elsewhere will not be substituted.",
    confirmSend: "Confirm and send", sendingNow: "Sending…", sent: "Release update sent.", saved: "Draft saved.", createdToast: "Release draft created.", deletedToast: "Release draft deleted.",
    deleteTitle: "Delete this release draft?", deleteExplanation: "This permanently deletes the web record. It never removes or edits a message already sent to Telegram.",
    confirmDelete: "Delete web record", deleting: "Deleting…", loadError: "Release updates could not be loaded. Try again.", retryLoad: "Try again",
    unknownWarning: "Telegram delivery could not be confirmed. Check the private group first. Do not retry this release from this screen.",
    sendingWarning: "Telegram is processing this release. Status refreshes automatically about every four seconds. Do not submit it again.",
    snapshot: "Original Telegram message", snapshotHint: "This is the immutable message snapshot from the send attempt. Editing the fields above does not change it.",
    editedHint: "Saved edits change the web record only; they do not change a message already sent to Telegram.",
    failedHint: "The previous send failed. A retry is possible only after reviewing and explicitly confirming the exact message.",
    savedOnly: "Saved to release records only. Nothing was sent.", editBeforeSend: "Save your changes before reviewing a send.",
    untitled: "Untitled release", dialogClose: "Close dialog", draftSaved: "Release draft saved.",
  },
  vi: {
    title: "Cập nhật phiên bản", eyebrow: "Điều khiển phát hành riêng tư",
    detail: "Soạn ghi chú phiên bản song ngữ, xem lại chính xác nội dung Telegram rồi duyệt gửi từng bản phát hành.",
    create: "Tạo bản nháp", emptyTitle: "Chưa có bản cập nhật",
    emptyDetail: "Tạo ghi chú cập nhật phần mềm riêng tư. Lưu bản nháp không gửi tin nhắn Telegram.",
    createTitle: "Tạo bản nháp phát hành", editTitle: "Chỉnh sửa nội dung phát hành",
    formHint: "Ghi chú dành cho kênh phát hành phần mềm riêng tư, không phải thông báo khách hàng.",
    releaseTitle: "Tiêu đề phiên bản", vietnamese: "Ghi chú phát hành tiếng Việt", english: "Ghi chú phát hành tiếng Anh",
    titlePlaceholder: "Ví dụ: Ứng dụng máy tính 2.8.1", viPlaceholder: "Những thay đổi trong phiên bản này?", enPlaceholder: "Những thay đổi trong phiên bản này?",
    createAction: "Tạo bản nháp", save: "Lưu bản nháp", saving: "Đang lưu…", cancel: "Hủy", preview: "Xem trước tin nhắn Telegram",
    previewNote: "Bản xem trước dùng đúng định dạng nội dung sẽ gửi.",
    status: { draft: "Bản nháp", sending: "Đang gửi", sent: "Đã gửi", failed: "Gửi thất bại", unknown: "Chưa rõ kết quả" },
    send: "Kiểm tra & gửi", retry: "Kiểm tra gửi lại", delete: "Xóa bản nháp", version: "Phiên bản",
    created: "Tạo lúc", updated: "Cập nhật", destination: "Đích hiện tại", noDestination: "Chưa cấu hình đích Telegram. Không thể gửi.",
    sendTitle: "Xác nhận gửi bản cập nhật", confirmIntro: "Bạn đang duyệt gửi chính xác bản cập nhật này tới đích Telegram riêng tư bên dưới.",
    selectedTitle: "Tiêu đề được chọn", fixedNotice: "Tiêu đề, nội dung, phiên bản và đích gửi được cố định cho lần xác nhận này. Thay đổi khác sẽ không được tự áp dụng.",
    confirmSend: "Xác nhận và gửi", sendingNow: "Đang gửi…", sent: "Đã gửi bản cập nhật.", saved: "Đã lưu bản nháp.", createdToast: "Đã tạo bản nháp.", deletedToast: "Đã xóa bản nháp.",
    deleteTitle: "Xóa bản cập nhật này?", deleteExplanation: "Thao tác xóa vĩnh viễn bản ghi trên web. Tin nhắn đã gửi tới Telegram sẽ không bị xóa hoặc chỉnh sửa.",
    confirmDelete: "Xóa bản ghi web", deleting: "Đang xóa…", loadError: "Không thể tải bản cập nhật. Hãy thử lại.", retryLoad: "Thử lại",
    unknownWarning: "Không thể xác nhận trạng thái Telegram. Hãy kiểm tra nhóm riêng tư trước. Không gửi lại bản này từ màn hình này.",
    sendingWarning: "Telegram đang xử lý bản cập nhật. Trạng thái tự làm mới khoảng mỗi bốn giây. Không gửi lại.",
    snapshot: "Bản tin Telegram gốc", snapshotHint: "Đây là nội dung bất biến từ lần gửi. Chỉnh sửa các trường phía trên không thay đổi tin nhắn này.",
    editedHint: "Lưu chỉnh sửa chỉ cập nhật bản ghi web, không thay đổi tin nhắn đã gửi tới Telegram.",
    failedHint: "Lần gửi trước thất bại. Chỉ có thể thử lại sau khi xem xét và xác nhận rõ ràng nội dung chính xác.",
    savedOnly: "Chỉ lưu vào danh sách phát hành. Không có tin nhắn nào được gửi.", editBeforeSend: "Hãy lưu thay đổi trước khi xem xét gửi.",
    untitled: "Bản phát hành chưa có tiêu đề", dialogClose: "Đóng hộp thoại", draftSaved: "Đã lưu bản nháp.",
  },
} as const;

function makeMessage(title: string, vi: string, en: string) {
  return `TELECAMP — CẬP NHẬT / UPDATE\n${title}\n\nTIẾNG VIỆT\n${vi}\n\nENGLISH\n${en}`;
}

function dateLabel(value: string, language: string) {
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function friendlyError(language: string, cause: unknown) {
  const vi = language === "vi";
  const candidate = cause as { code?: unknown; message?: unknown; response?: { data?: { code?: unknown } } } | null;
  const code = String(candidate?.code ?? candidate?.response?.data?.code ?? candidate?.message ?? "").toUpperCase();
  const messages: Record<string, [string, string]> = {
    RELEASE_VERSION_CONFLICT: ["Bản nháp đã thay đổi ở nơi khác. Danh sách đã được làm mới; hãy kiểm tra lại trước khi tiếp tục.", "This draft changed elsewhere. The list was refreshed; review it again before continuing."],
    RELEASE_DESTINATION_REQUIRED: ["Chưa có đích Telegram khả dụng. Hãy kiểm tra cấu hình nhóm riêng tư.", "No Telegram destination is available. Check the private group configuration."],
    RELEASE_SEND_NOT_ALLOWED: ["Trạng thái hiện tại không cho phép gửi bản cập nhật này.", "This release is not in a sendable state."],
    RELEASE_UPDATE_NOT_FOUND: ["Không tìm thấy bản cập nhật này. Danh sách đã được làm mới.", "This release could not be found. The list was refreshed."],
    RELEASE_SEND_FAILED: ["Telegram không thể gửi bản cập nhật. Hãy kiểm tra trạng thái trước khi thử lại.", "Telegram could not send this release. Check its status before retrying."],
    RELEASE_SEND_UNKNOWN: ["Chưa thể xác nhận kết quả gửi. Hãy kiểm tra nhóm Telegram trước khi làm gì thêm.", "Delivery could not be confirmed. Check the Telegram group before taking further action."],
    RELEASE_TELEGRAM_REJECTED: ["Telegram đã từ chối tin nhắn. Hãy kiểm tra cấu hình nhóm trước khi thử lại.", "Telegram rejected the message. Check the group configuration before retrying."],
    RELEASE_TELEGRAM_UNCERTAIN: ["Chưa xác định được Telegram đã nhận tin nhắn hay chưa. Hãy kiểm tra nhóm trước, không gửi lại ngay.", "It is unclear whether Telegram received the message. Check the group first; do not retry yet."],
    RELEASE_RESULT_UNCERTAIN: ["Kết quả gửi chưa xác định. Hãy kiểm tra nhóm Telegram trước khi thực hiện thao tác khác.", "The delivery result is uncertain. Check the Telegram group before taking further action."],
    RELEASE_BILINGUAL_REQUIRED: ["Cần có tiêu đề và nội dung bằng cả tiếng Việt lẫn tiếng Anh.", "A title and both Vietnamese and English release notes are required."],
    RELEASE_NOT_FOUND: ["Không tìm thấy bản phát hành này. Danh sách đã được làm mới.", "This release could not be found. The list was refreshed."],
    RELEASE_DESTINATION_CHANGED: ["Đích Telegram đã thay đổi. Hãy kiểm tra đích mới và mở lại xác nhận gửi.", "The Telegram destination changed. Review the new destination and open a fresh send confirmation."],
    RELEASE_ALREADY_ATTEMPTED: ["Bản phát hành này đã có lần gửi được ghi nhận và không thể gửi lại từ đây.", "A send has already been recorded for this release; it cannot be sent again from here."],
    RELEASE_CHANGED: ["Bản phát hành đã thay đổi. Danh sách được làm mới; hãy kiểm tra nội dung và thử lại.", "This release changed. The list was refreshed; review its content before trying again."],
    RELEASE_BUSY: ["Bản phát hành đang được xử lý. Hãy đợi trạng thái cập nhật trước khi tiếp tục.", "This release is being processed. Wait for its status to update before continuing."],
    RELEASE_BOT_DISABLED: ["Bot phát hành đang bị tắt. Hãy kiểm tra cài đặt bot.", "The release bot is disabled. Check the bot settings."],
    RELEASE_BOT_UNAVAILABLE: ["Bot phát hành hiện không khả dụng. Hãy thử lại sau khi kiểm tra dịch vụ bot.", "The release bot is currently unavailable. Check the bot service and try again later."],
    RELEASE_GROUP_UNAVAILABLE: ["Nhóm Telegram đích hiện không khả dụng. Hãy kiểm tra nhóm và quyền đăng bài.", "The Telegram destination group is unavailable. Check the group and posting permissions."],
    RELEASE_UNAVAILABLE: ["Tính năng cập nhật phát hành hiện không khả dụng. Hãy thử lại sau.", "Release updates are currently unavailable. Please try again later."],
  };
  const match = Object.entries(messages).find(([key]) => code.includes(key));
  return match ? match[1][vi ? 0 : 1] : vi ? "Không thể hoàn tất thao tác. Danh sách đã được làm mới; hãy kiểm tra trạng thái rồi thử lại nếu phù hợp." : "The action could not be completed. The list was refreshed; check the status before trying again.";
}

function statusStyle(status: ReleaseUpdate["status"]) {
  return {
    draft: "border-[#dbe5eb] bg-[#f4f8fa] text-[#536a77]",
    sending: "border-[#f3d6a5] bg-[#fff8e9] text-[#93631b]",
    sent: "border-[#bfdfd5] bg-[#edf7f2] text-[#286b59]",
    failed: "border-[#f1c9c5] bg-[#fff2ef] text-[#a7493e]",
    unknown: "border-[#efc9a7] bg-[#fff5e9] text-[#875320]",
  }[status];
}

function ReleaseFields({ values, setValues, text, disabled = false }: {
  values: DraftValues; setValues: (next: DraftValues) => void; text: ReleaseCopy; disabled?: boolean;
}) {
  const set = (key: keyof DraftValues, value: string) => setValues({ ...values, [key]: value });
  const control = "w-full rounded-xl border border-[#ccd9df] bg-white px-3.5 py-3 text-sm font-medium text-[#243c49] outline-none transition focus:border-[#197a91] focus:ring-4 focus:ring-[#197a91]/10 disabled:bg-[#f5f8f9] disabled:text-[#768992]";
  return <div className="space-y-4">
    <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-[#586e79]">{text.releaseTitle}</span><input aria-label={text.releaseTitle} data-testid="input-release-title" value={values.title} maxLength={200} disabled={disabled} onChange={(event) => set("title", event.target.value)} placeholder={text.titlePlaceholder} className={control} /></label>
    <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-[#586e79]">{text.vietnamese}</span><textarea aria-label={text.vietnamese} data-testid="input-release-vi" value={values.vi} maxLength={1750} rows={4} disabled={disabled} onChange={(event) => set("vi", event.target.value)} placeholder={text.viPlaceholder} className={`${control} resize-y leading-6`} /></label>
    <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-[#586e79]">{text.english}</span><textarea aria-label={text.english} data-testid="input-release-en" value={values.en} maxLength={1750} rows={4} disabled={disabled} onChange={(event) => set("en", event.target.value)} placeholder={text.enPlaceholder} className={`${control} resize-y leading-6`} /></label>
  </div>;
}

export default function AdminReleaseUpdatesPage() {
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const text = copy[language === "vi" ? "vi" : "en"];
  const list = useListReleaseUpdates({
    query: {
      queryKey: getListReleaseUpdatesQueryKey(),
      refetchInterval: (query) => (query.state.data as { updates?: ReleaseUpdate[] } | undefined)?.updates?.some((item) => item.status === "sending") ? 4000 : false,
    },
  });
  const create = useCreateReleaseUpdate();
  const update = useUpdateReleaseUpdate();
  const remove = useDeleteReleaseUpdate();
  const send = useSendReleaseUpdate();
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<DraftValues>({ title: "", vi: "", en: "" });
  const [selection, setSelection] = useState<SendSelection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReleaseUpdate | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const confirming = useRef(false);
  const busy = create.isPending || update.isPending || remove.isPending || send.isPending;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListReleaseUpdatesQueryKey() });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selection) setSelection(null);
      else if (deleteTarget) setDeleteTarget(null);
      else if (createOpen && !create.isPending) setCreateOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, deleteTarget, createOpen, create.isPending]);

  const reportError = (cause: unknown) => {
    void invalidate();
    setToast({ text: friendlyError(language, cause), error: true });
  };

  const openCreate = () => {
    setCreateValues({ title: "", vi: "", en: "" });
    setCreateOpen(true);
  };

  const submitCreate = () => {
    if (!createValues.title.trim() || !createValues.vi.trim() || !createValues.en.trim() || busy) return;
    create.mutate({ data: { title: createValues.title.trim(), vi: createValues.vi, en: createValues.en } }, {
      onSuccess: () => { void invalidate(); setCreateOpen(false); setToast({ text: text.createdToast }); },
      onError: reportError,
    });
  };

  const openSend = (release: ReleaseUpdate, current: DraftValues, destination: string | null) => {
    if (!destination || !["draft", "failed"].includes(release.status)) return;
    if (current.title !== release.title || current.vi !== release.vi || current.en !== release.en) {
      setToast({ text: text.editBeforeSend, error: true });
      return;
    }
    confirming.current = false;
    setSelection({ id: release.id, version: release.version, destination, title: release.title, text: makeMessage(release.title, release.vi, release.en) });
  };

  const confirmSend = () => {
    if (!selection || confirming.current || busy) return;
    confirming.current = true;
    send.mutate({ releaseId: selection.id, data: { version: selection.version, destination: selection.destination, confirmed: true } }, {
      onSuccess: () => { void invalidate(); setSelection(null); confirming.current = false; setToast({ text: text.sent }); },
      onError: (cause) => { void invalidate(); setSelection(null); confirming.current = false; setToast({ text: friendlyError(language, cause), error: true }); },
    });
  };

  return <AppLayout activePage="admin-release-updates" title={text.title} hideUpgrade>
    <SectionHeader eyebrow={text.eyebrow} title={text.title} detail={text.detail}
      action={<PrimaryButton onClick={openCreate} disabled={busy}><Plus className="h-4 w-4" />{text.create}</PrimaryButton>} />
    {list.isError ? <Panel className="p-7 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-[#fff2ef] text-[#a7493e]"><AlertTriangle className="h-5 w-5" /></div>
      <p role="alert" className="text-sm font-bold text-[#8c3b34]">{text.loadError}</p>
      <button type="button" onClick={() => void list.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#cbd9df] px-4 py-2 text-sm font-extrabold text-[#385764] hover:bg-[#f4f8f9]"><RefreshCw className="h-4 w-4" />{text.retryLoad}</button>
    </Panel> : list.isLoading ? <div className="grid gap-4" aria-label={text.title} aria-busy="true">
      {[0, 1].map((item) => <Panel key={item} className="h-52 animate-pulse bg-[#f7fafb]"><div className="m-5 h-4 w-1/3 rounded bg-[#e6eef1]" /><div className="mx-5 h-24 rounded bg-[#edf3f5]" /></Panel>)}
    </div> : !list.data?.updates.length ? <Panel><EmptyState icon={FileText} title={text.emptyTitle} detail={text.emptyDetail} action={<PrimaryButton onClick={openCreate}><Plus className="h-4 w-4" />{text.create}</PrimaryButton>} /></Panel> : <div className="space-y-4">
      <Panel className="flex flex-col gap-2 border-[#d4e3e7] bg-[#f5faf9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#54717b]">{text.destination}</span>
        <span className={`break-all text-sm font-bold ${list.data.destination ? "text-[#255462]" : "text-[#a7493e]"}`}>{list.data.destination ?? text.noDestination}</span>
      </Panel>
      {list.data.updates.map((release) => <ReleaseCard key={release.id} release={release} destination={list.data?.destination ?? null} text={text} language={language} busy={busy}
        onSave={(values) => update.mutate({ releaseId: release.id, data: { ...values, version: release.version } }, {
          onSuccess: () => { void invalidate(); setToast({ text: text.saved }); }, onError: reportError,
        })}
        onSend={(values) => openSend(release, values, list.data?.destination ?? null)}
        onDelete={() => setDeleteTarget(release)} />)}
    </div>}

    {createOpen && <ReleaseModal title={text.createTitle} description={text.formHint} onClose={() => !create.isPending && setCreateOpen(false)} wide>
      <div className="space-y-5">
        <ReleaseFields values={createValues} setValues={setCreateValues} text={text} disabled={create.isPending} />
        <MessagePreview title={createValues.title || text.untitled} message={makeMessage(createValues.title || text.untitled, createValues.vi, createValues.en)} text={text} />
        <div className="flex flex-col-reverse gap-2 border-t border-[#e9eff1] pt-4 sm:flex-row sm:justify-end">
          <QuietButton onClick={() => setCreateOpen(false)}>{text.cancel}</QuietButton>
          <PrimaryButton disabled={create.isPending || !createValues.title.trim() || !createValues.vi.trim() || !createValues.en.trim()} onClick={submitCreate}>{create.isPending ? text.saving : text.createAction}</PrimaryButton>
        </div>
      </div>
    </ReleaseModal>}
    {selection && <ReleaseModal title={text.sendTitle} description={text.confirmIntro} onClose={() => !send.isPending && setSelection(null)} wide>
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#d8e5e8] bg-[#f5f9f9] p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#637b84]">{text.selectedTitle} · {text.version} {selection.version}</p>
          <p className="mt-1.5 break-words text-base font-extrabold text-[#203b47]">{selection.title}</p>
          <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#637b84]">{text.destination}</p>
          <p className="mt-1 break-all font-mono text-xs font-bold text-[#315866]">{selection.destination}</p>
        </div>
        <MessagePreview title={selection.title} message={selection.text} text={text} />
        <p className="rounded-xl border border-[#f0d8ae] bg-[#fff8e9] px-4 py-3 text-xs font-semibold leading-5 text-[#775a2e]">{text.fixedNotice}</p>
        <div className="flex flex-col-reverse gap-2 border-t border-[#e9eff1] pt-4 sm:flex-row sm:justify-end">
          <QuietButton onClick={() => setSelection(null)}>{text.cancel}</QuietButton>
          <button type="button" onClick={confirmSend} disabled={send.isPending || confirming.current} data-testid="button-confirm-release-send" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#226c61] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#18574e] disabled:cursor-not-allowed disabled:opacity-50">
            {send.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{send.isPending ? text.sendingNow : text.confirmSend}
          </button>
        </div>
      </div>
    </ReleaseModal>}
    {deleteTarget && <ReleaseModal title={text.deleteTitle} description={text.deleteExplanation} onClose={() => !remove.isPending && setDeleteTarget(null)}>
      <div className="space-y-5">
        <div className="rounded-xl border border-[#f0d4cf] bg-[#fff5f2] p-4">
          <p className="break-words text-sm font-extrabold text-[#88463d]">{deleteTarget.title}</p>
          <p className="mt-2 text-xs leading-5 text-[#8d625c]">{text.deleteExplanation}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <QuietButton onClick={() => setDeleteTarget(null)}>{text.cancel}</QuietButton>
          <button type="button" disabled={remove.isPending} onClick={() => remove.mutate({ releaseId: deleteTarget.id, data: { version: deleteTarget.version } }, {
            onSuccess: () => { void invalidate(); setDeleteTarget(null); setToast({ text: text.deletedToast }); },
            onError: (cause) => { setDeleteTarget(null); reportError(cause); },
          })} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#a84e43] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#873c34] disabled:opacity-50"><Trash2 className="h-4 w-4" />{remove.isPending ? text.deleting : text.confirmDelete}</button>
        </div>
      </div>
    </ReleaseModal>}
    {toast && <Toast message={toast.text} onDismiss={() => setToast(null)} />}
  </AppLayout>;
}

function ReleaseModal({ title, description, children, onClose, wide = false }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);
  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
  }}>
    <Modal title={title} description={description} onClose={onClose} wide>{children}</Modal>
  </div>;
}

function MessagePreview({ title, message, text }: { title: string; message: string; text: ReleaseCopy }) {
  return <section className="overflow-hidden rounded-2xl border border-[#dce7e9] bg-[#f4f8f8]" aria-label={text.preview}>
    <div className="flex items-center justify-between gap-2 border-b border-[#dce7e9] px-4 py-3">
      <div className="flex min-w-0 items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#dcebe7] text-[#2c6c60]"><FileText className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-extrabold text-[#31515c]">{text.preview}</p><p className="truncate text-[10px] text-[#748992]">{title}</p></div></div>
      <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#738891]">Telegram</span>
    </div>
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-xs leading-5 text-[#334f59]">{message}</pre>
    <p className="border-t border-[#dce7e9] px-4 py-2.5 text-[10px] font-medium text-[#71858d]">{text.previewNote}</p>
  </section>;
}

function ReleaseCard({ release, destination, text, language, busy, onSave, onSend, onDelete }: {
  release: ReleaseUpdate; destination: string | null; text: ReleaseCopy; language: string; busy: boolean;
  onSave: (values: DraftValues) => void; onSend: (values: DraftValues) => void; onDelete: () => void;
}) {
  const [values, setValues] = useState<DraftValues>({ title: release.title, vi: release.vi, en: release.en });
  const dirty = values.title !== release.title || values.vi !== release.vi || values.en !== release.en;
  const sendable = release.status === "draft" || release.status === "failed";
  const canSend = sendable && Boolean(destination) && !busy;
  const saveDisabled = busy || !dirty || !values.title.trim() || !values.vi.trim() || !values.en.trim();
  return <Panel className="overflow-hidden border-[#e0e9ec]">
    <div className="flex flex-col gap-4 border-b border-[#e9eff1] bg-[#fbfcfc] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${statusStyle(release.status)}`}>
            {release.status === "sending" ? <LoaderCircle className="h-3 w-3 animate-spin" /> : release.status === "sent" ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            {text.status[release.status]}
          </span>
          <span className="font-mono text-[10px] font-bold text-[#788c94]">{text.version} {release.version}</span>
          {dirty && <span className="rounded-full bg-[#fff5e4] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#96651c]">{language === "vi" ? "Chưa lưu" : "Unsaved"}</span>}
        </div>
        <p className="mt-2 truncate text-lg font-extrabold tracking-tight text-[#213b46]">{values.title || text.untitled}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-medium text-[#748891]">
          <span>{text.created}: {dateLabel(release.createdAt, language)}</span>
          <span>{text.updated}: {dateLabel(release.updatedAt, language)}</span>
          {release.sentAt && <span>{text.status.sent}: {dateLabel(release.sentAt, language)}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {sendable && <button type="button" disabled={!canSend} onClick={() => onSend(values)} title={!destination ? text.noDestination : dirty ? text.editBeforeSend : undefined} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#226c61] px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-[#18574e] disabled:cursor-not-allowed disabled:opacity-45">
          <Send className="h-3.5 w-3.5" />{release.status === "failed" ? text.retry : text.send}
        </button>}
        <button type="button" disabled={busy} onClick={onDelete} aria-label={`${text.delete}: ${release.title}`} className="grid h-10 w-10 place-items-center rounded-xl border border-[#edd5d1] text-[#a44b40] transition hover:bg-[#fff3f0] disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
    <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(270px,.82fr)]">
      <div className="min-w-0">
        <ReleaseFields values={values} setValues={setValues} text={text} disabled={busy} />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-medium leading-5 text-[#7a8e96]">{release.status === "sent" || release.status === "unknown" ? text.editedHint : text.savedOnly}</p>
          <PrimaryButton onClick={() => onSave(values)} disabled={saveDisabled}>{busy ? text.saving : text.save}</PrimaryButton>
        </div>
      </div>
      <div className="space-y-3">
        <MessagePreview title={values.title || text.untitled} message={makeMessage(values.title || text.untitled, values.vi, values.en)} text={text} />
        {release.status === "failed" && <p role="status" className="rounded-xl border border-[#f0d8ae] bg-[#fff8e9] px-3.5 py-3 text-xs font-semibold leading-5 text-[#775a2e]">{text.failedHint}</p>}
        {release.status === "sending" && <p role="status" className="flex gap-2 rounded-xl border border-[#f0d8ae] bg-[#fff8e9] px-3.5 py-3 text-xs font-semibold leading-5 text-[#775a2e]"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />{text.sendingWarning}</p>}
        {release.status === "unknown" && <p role="alert" className="flex gap-2 rounded-xl border border-[#efc9a7] bg-[#fff5e9] px-3.5 py-3 text-xs font-semibold leading-5 text-[#875320]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{text.unknownWarning}</p>}
        {(release.status === "sent" || release.status === "unknown") && release.sentText && <section className="overflow-hidden rounded-2xl border border-[#dce7e9] bg-[#f7f9f9]">
          <div className="border-b border-[#dce7e9] px-4 py-3"><p className="text-xs font-extrabold text-[#31515c]">{text.snapshot}</p><p className="mt-1 text-[10px] leading-4 text-[#71858d]">{text.snapshotHint}</p></div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-xs leading-5 text-[#536970]">{release.sentText}</pre>
        </section>}
      </div>
    </div>
  </Panel>;
}
