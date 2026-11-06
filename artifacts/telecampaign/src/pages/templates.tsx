import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  FileText,
  Forward,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { MessageTemplate, MessageTemplateInput } from "@workspace/api-client-react";
import {
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useGetTelegramSavedMessage,
  useListMessageTemplates,
  useListTelegramAccounts,
  useListTelegramSavedMessages,
  useUpdateMessageTemplate,
} from "@workspace/api-client-react";
import { AppLayout, Modal, Toast } from "@/components/layout/AppLayout";
import { TemplatesLibraryView, type TemplateFilter } from "@/components/templates/TemplatesLibraryView";
import "@/components/templates/templates-library.css";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

type TemplateMode = "text" | "forward";
type FormState = {
  name: string;
  mode: TemplateMode;
  content: string;
  sourceAccountId: string;
  sourceMessageId: string;
};

const emptyForm = (): FormState => ({ name: "", mode: "forward", content: "", sourceAccountId: "", sourceMessageId: "" });

export default function Templates() {
  const { language, t } = useLanguage();
  const vi = language === "vi";

  const copy = vi ? {
    title: "Mẫu tin nhắn",
    eyebrow: "Nội dung",
    subtitle: "Lưu nội dung hoặc chuyển tiếp từ Tin nhắn đã lưu.",
    add: "Thêm mẫu",
    searchPlaceholder: "Tìm theo tên...",
    colName: "Tên",
    colParseMode: "Parse mode",
    colActions: "Thao tác",
    forwardLabel: "Forward từ Tin nhắn đã lưu",
    ariaView: (name: string) => `Xem ${name}`,
    ariaEdit: (name: string) => `Sửa ${name}`,
    ariaDelete: (name: string) => `Xóa ${name}`,
    emptySearchTitle: "Không tìm thấy mẫu phù hợp",
    emptySearchDetail: "Hãy thử một từ khóa khác.",
    emptyTitle: "Chưa có mẫu tin nhắn",
    emptyDetail: "Tạo mẫu đầu tiên để dùng lại nội dung đã chuẩn bị.",
    modalAdd: "Thêm mẫu",
    modalEdit: "Sửa mẫu",
    fieldName: "Tên",
    fieldMode: "Kiểu mẫu",
    modeForward: `Forward từ "Tin nhắn đã lưu"`,
    modeText: "Nhập text",
    fieldContent: "Nội dung",
    contentPlaceholder: "Nhập nội dung tin nhắn...",
    forwardNote: `Lưu ý: khuyến khích dùng Forward từ "Tin nhắn đã lưu" để gửi tin có icon, emoji và nội dung gốc.`,
    fieldAccount: "Tài khoản Telegram",
    selectAccount: "Chọn tài khoản",
    fieldSavedMsg: `Chọn tin trong "Tin nhắn đã lưu"`,
    syncBtn: "Đồng bộ",
    savedMsgLoading: "Đang tải...",
    savedMsgPlaceholder: "Chọn tin nhắn đã lưu",
    mediaMessage: "Tin nhắn đa phương tiện",
    save: "Lưu",
    previewForward: "Forward từ Tin nhắn đã lưu",
    previewForwardCurrent: "Nội dung hiện tại từ Tin nhắn đã lưu",
    previewForwardLoading: "Đang tải nội dung Tin nhắn đã lưu hiện tại...",
    previewForwardUnavailable: "Không thể tải Tin nhắn đã lưu hiện tại. Hãy kiểm tra tài khoản Telegram và tin nhắn, sau đó thử lại.",
    previewText: "Nội dung văn bản",
    previewForwardContent: "Mẫu này sẽ chuyển tiếp đúng tin nhắn gốc đã chọn.",
    toastAdded: "Đã thêm mẫu tin nhắn.",
    toastUpdated: "Đã cập nhật mẫu tin nhắn.",
    toastDeleted: "Đã xóa mẫu tin nhắn.",
    confirmDelete: (name: string) => `Xóa mẫu "${name}"?`,
    errorFallback: "Không thể hoàn tất thao tác. Vui lòng thử lại.",
  } : {
    title: "Message templates",
    eyebrow: "Content",
    subtitle: "Save content or forward from Saved Messages.",
    add: "Add template",
    searchPlaceholder: "Search by name...",
    colName: "Name",
    colParseMode: "Parse mode",
    colActions: "Actions",
    forwardLabel: "Forward from Saved Messages",
    ariaView: (name: string) => `Preview ${name}`,
    ariaEdit: (name: string) => `Edit ${name}`,
    ariaDelete: (name: string) => `Delete ${name}`,
    emptySearchTitle: "No templates match this search",
    emptySearchDetail: "Try a different keyword.",
    emptyTitle: "No message templates yet",
    emptyDetail: "Create your first template to reuse pre-prepared content.",
    modalAdd: "Add template",
    modalEdit: "Edit template",
    fieldName: "Name",
    fieldMode: "Template type",
    modeForward: `Forward from "Saved Messages"`,
    modeText: "Enter text",
    fieldContent: "Content",
    contentPlaceholder: "Enter message content...",
    forwardNote: `Tip: using Forward from "Saved Messages" is recommended to preserve icons, emoji, and original formatting.`,
    fieldAccount: "Telegram account",
    selectAccount: "Select account",
    fieldSavedMsg: `Select message from "Saved Messages"`,
    syncBtn: "Sync",
    savedMsgLoading: "Loading...",
    savedMsgPlaceholder: "Select a saved message",
    mediaMessage: "Media message",
    save: "Save",
    previewForward: "Forward from Saved Messages",
    previewForwardCurrent: "Current content from Saved Messages",
    previewForwardLoading: "Loading the current Saved Message…",
    previewForwardUnavailable: "The current Saved Message could not be loaded. Check the Telegram account and message, then try again.",
    previewText: "Plain text content",
    previewForwardContent: "This template will forward the exact original message selected.",
    toastAdded: "Template added.",
    toastUpdated: "Template updated.",
    toastDeleted: "Template deleted.",
    confirmDelete: (name: string) => `Delete template "${name}"?`,
    errorFallback: "Could not complete the operation. Please try again.",
  };

  const errorText = (error: unknown) => localizedErrorMessage(error, language, copy.errorFallback);

  const templates = useListMessageTemplates();
  const accounts = useListTelegramAccounts();
  const createTemplate = useCreateMessageTemplate();
  const updateTemplate = useUpdateMessageTemplate();
  const deleteTemplate = useDeleteMessageTemplate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TemplateFilter>("all");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [preview, setPreview] = useState<MessageTemplate | null>(null);
  const [previewSource, setPreviewSource] = useState<{ accountId: string; messageId: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saveLocked = useRef(false);
  const deleteLocked = useRef(false);
  const savedMessages = useListTelegramSavedMessages(form.sourceAccountId || "", {
    query: { enabled: showForm && form.mode === "forward" && Boolean(form.sourceAccountId) } as any,
  });
  const liveForwardPreview = useGetTelegramSavedMessage(
    previewSource?.accountId ?? "",
    previewSource?.messageId ?? "",
    {
      query: {
        enabled: Boolean(previewSource?.accountId && previewSource?.messageId),
        refetchOnMount: "always",
        staleTime: 0,
      } as any,
    },
  );

  const connectedAccounts = (accounts.data ?? []).filter((account) => account.status === "connected");
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (templates.data ?? []).filter((template) =>
      (typeFilter === "all" || template.mode === typeFilter)
        && (!query || template.name.toLowerCase().includes(query) || template.content.toLowerCase().includes(query)),
    );
  }, [templates.data, search, typeFilter]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(template: MessageTemplate) {
    setEditing(template);
    setForm({
      name: template.name,
      mode: template.mode,
      content: template.content,
      sourceAccountId: template.sourceAccountId ?? "",
      sourceMessageId: template.sourceMessageId ?? "",
    });
    setFormError(null);
    setShowForm(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saveLocked.current) return;
    saveLocked.current = true;
    setSubmitting(true);
    setFormError(null);
    const data: MessageTemplateInput = {
      name: form.name,
      mode: form.mode,
      content: form.content,
      sourceAccountId: form.mode === "forward" ? form.sourceAccountId || null : null,
      sourceMessageId: form.mode === "forward" ? form.sourceMessageId || null : null,
    };
    try {
      if (editing) await updateTemplate.mutateAsync({ templateId: editing.id, data });
      else await createTemplate.mutateAsync({ data });
      await templates.refetch();
      setSearch("");
      setTypeFilter("all");
      setShowForm(false);
      setToast(editing ? copy.toastUpdated : copy.toastAdded);
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      saveLocked.current = false;
      setSubmitting(false);
    }
  }

  async function remove(template: MessageTemplate) {
    if (deleteLocked.current) return;
    deleteLocked.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTemplate.mutateAsync({ templateId: template.id });
      await templates.refetch();
      setDeleteTarget(null);
      setToast(copy.toastDeleted);
    } catch (error) {
      setDeleteError(errorText(error));
    } finally {
      deleteLocked.current = false;
      setDeleting(false);
    }
  }

  const isSaving = submitting || createTemplate.isPending || updateTemplate.isPending;

  return (
    <AppLayout
      activePage="templates"
      title={copy.title}
      hideUpgrade
      headerAction={
        <button onClick={openNew} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#075e68] px-4 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#064b53]" data-testid="templates-add">
          <Plus className="h-4 w-4" />{copy.add}
        </button>
      }
    >
      <div className="tc-professional tc-templates-live">
      <TemplatesLibraryView allTemplates={templates.data ?? []} rows={rows}
        query={search} onQuery={setSearch} filter={typeFilter} onFilter={setTypeFilter}
        loading={templates.isLoading} error={templates.isError} deleting={deleting || deleteTemplate.isPending}
        onRetry={() => { void templates.refetch(); }} onEdit={openEdit} onCreate={openNew}
        onDelete={template => { setDeleteError(null); setDeleteTarget(template); }}
        onPreview={template => {
          setPreview(template);
          setPreviewSource(template.mode === "forward" && template.sourceAccountId && template.sourceMessageId
            ? { accountId: template.sourceAccountId, messageId: template.sourceMessageId } : null);
        }} labels={copy} />

      {showForm && (
        <Modal title={editing ? copy.modalEdit : copy.modalAdd} onClose={() => { if (!saveLocked.current) setShowForm(false); }}>
          <form onSubmit={(event) => void submit(event)} className="space-y-5 tcp-live-form">
            <fieldset disabled={isSaving} className="min-w-0 space-y-5">
            <label className="block">
              <span className="mb-2 block text-[13px] font-bold text-[#334155]">{copy.fieldName}</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="template-name" />
            </label>
            <fieldset className="tcp-mode-field" data-testid="template-mode">
              <legend>{copy.fieldMode}</legend>
              <button type="button" className={`tcp-mode-choice ${form.mode === "text" ? "selected" : ""}`}
                aria-pressed={form.mode === "text"} onClick={() => setForm({ ...form, mode: "text", sourceMessageId: "" })}>
                <FileText size={18} /><span><b>{t("Text")}</b></span>
              </button>
              <button type="button" className={`tcp-mode-choice ${form.mode === "forward" ? "selected" : ""}`}
                aria-pressed={form.mode === "forward"} onClick={() => setForm({ ...form, mode: "forward", sourceMessageId: "" })}>
                <Forward size={18} /><span><b>{t("Saved Messages")}</b></span>
              </button>
            </fieldset>
            {form.mode === "text" ? (
              <label className="block">
                <span className="mb-2 block text-[13px] font-bold text-[#334155]">{copy.fieldContent}</span>
                <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} rows={5} className="w-full resize-y rounded-xl border border-[#dbe2ea] px-3.5 py-3 text-[14px] font-medium outline-none focus:border-[#1a2b88]" placeholder={copy.contentPlaceholder} data-testid="template-content" />
              </label>
            ) : (
              <>
                <p className="-mt-2 text-[12px] font-medium leading-relaxed text-[#64748b]">{copy.forwardNote}</p>
                <label className="block">
                  <span className="mb-2 block text-[13px] font-bold text-[#334155]">{copy.fieldAccount}</span>
                  <select value={form.sourceAccountId} onChange={(event) => setForm({ ...form, sourceAccountId: event.target.value, sourceMessageId: "" })} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="template-account">
                    <option value="">{copy.selectAccount}</option>
                    {connectedAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}{account.phone ? ` · ${account.phone}` : ""}</option>)}
                  </select>
                </label>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#334155]">{copy.fieldSavedMsg}</span>
                    <button type="button" onClick={() => void savedMessages.refetch()} disabled={!form.sourceAccountId || savedMessages.isFetching} className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-[#1a2b88] disabled:opacity-50">
                      <RefreshCw className={`h-3.5 w-3.5 ${savedMessages.isFetching ? "animate-spin" : ""}`} />{copy.syncBtn}
                    </button>
                  </div>
                  <select
                    value={form.sourceMessageId}
                    onChange={(event) => {
                      const message = (savedMessages.data ?? []).find((item) => item.id === event.target.value);
                      setForm({ ...form, sourceMessageId: event.target.value, content: message?.text ?? form.content });
                    }}
                    disabled={!form.sourceAccountId || savedMessages.isLoading}
                    className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88] disabled:bg-[#f8fafc]"
                    data-testid="template-saved-message"
                  >
                    <option value="">{savedMessages.isLoading ? copy.savedMsgLoading : copy.savedMsgPlaceholder}</option>
                    {(savedMessages.data ?? []).map((message) => <option key={message.id} value={message.id}>{message.text.slice(0, 90) || copy.mediaMessage}</option>)}
                  </select>
                  {savedMessages.isError && <p className="mt-2 text-[12px] font-semibold text-[#dc2626]">{errorText(savedMessages.error)}</p>}
                </div>
              </>
            )}
            {formError && <p className="rounded-xl bg-[#fff1f2] px-3.5 py-3 text-[13px] font-semibold text-[#be123c]">{formError}</p>}
            <div className="tcp-form-actions">
              <button type="button" className="tcp-cancel" disabled={isSaving} onClick={() => setShowForm(false)}>{t("Cancel")}</button>
              <button type="submit" className="tcp-save" disabled={isSaving}>{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}{copy.save}</button>
            </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {preview && (
        <Modal
          title={preview.name}
          description={preview.mode === "forward" ? copy.previewForwardCurrent : copy.previewText}
          onClose={() => {
            setPreview(null);
            setPreviewSource(null);
          }}
        >
          <p className="tcp-live-preview whitespace-pre-wrap rounded-2xl p-4 text-[14px] font-medium leading-relaxed">
            {preview.mode !== "forward"
              ? preview.content || copy.previewText
              : !previewSource
                ? copy.previewForwardContent
                : liveForwardPreview.isLoading || liveForwardPreview.isFetching
                  ? copy.previewForwardLoading
                  : liveForwardPreview.data?.text || copy.previewForwardUnavailable}
          </p>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title={t("Confirm deletion")} onClose={() => { if (!deleteLocked.current) setDeleteTarget(null); }}>
          <div className="tcp-live-delete">
            <span className="tcp-delete-mark"><Trash2 size={20} /></span>
            <p className="my-4 break-words text-[14px] leading-relaxed">{copy.confirmDelete(deleteTarget.name)}</p>
            {deleteError && <p role="alert" className="tcp-form-error">{deleteError}</p>}
            <div className="tcp-form-actions">
              <button type="button" className="tcp-cancel" disabled={deleting} onClick={() => setDeleteTarget(null)}>{t("Cancel")}</button>
              <button type="button" className="tcp-delete-confirm" disabled={deleting}
                onClick={() => void remove(deleteTarget)}>{deleting && <LoaderCircle className="h-4 w-4 animate-spin" />}{t("Delete")}</button>
            </div>
          </div>
        </Modal>
      )}
      </div>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}
