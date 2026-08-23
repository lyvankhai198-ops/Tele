import { useMemo, useState, type FormEvent } from "react";
import {
  Eye,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type { MessageTemplate, MessageTemplateInput } from "@workspace/api-client-react";
import {
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useListMessageTemplates,
  useListTelegramAccounts,
  useListTelegramSavedMessages,
  useUpdateMessageTemplate,
} from "@workspace/api-client-react";
import { AppLayout, EmptyState, Modal, Panel, PrimaryButton, Toast } from "@/components/layout/AppLayout";
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
  const { language } = useLanguage();
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
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [preview, setPreview] = useState<MessageTemplate | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const savedMessages = useListTelegramSavedMessages(form.sourceAccountId || "", {
    query: { enabled: showForm && form.mode === "forward" && Boolean(form.sourceAccountId) } as any,
  });

  const connectedAccounts = (accounts.data ?? []).filter((account) => account.status === "connected");
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (templates.data ?? []).filter((template) =>
      !query || template.name.toLowerCase().includes(query) || template.content.toLowerCase().includes(query),
    );
  }, [templates.data, search]);

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
      setShowForm(false);
      setToast(editing ? copy.toastUpdated : copy.toastAdded);
    } catch (error) {
      setFormError(errorText(error));
    }
  }

  async function remove(template: MessageTemplate) {
    if (!window.confirm(copy.confirmDelete(template.name))) return;
    try {
      await deleteTemplate.mutateAsync({ templateId: template.id });
      await templates.refetch();
      setToast(copy.toastDeleted);
    } catch (error) {
      setToast(errorText(error));
    }
  }

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <AppLayout
      activePage="templates"
      title={copy.title}
      hideUpgrade
      headerAction={
        <button onClick={openNew} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1a2b88] px-4 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#152473]" data-testid="templates-add">
          <Plus className="h-4 w-4" />{copy.add}
        </button>
      }
    >
      <div className="mx-auto max-w-[900px]">
        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7">
          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#64748b]">{copy.eyebrow}</p>
            <h2 className="text-[25px] font-extrabold tracking-tight text-[#0f172a]">{copy.title}</h2>
            <p className="mt-1.5 text-[14px] font-medium text-[#64748b]">{copy.subtitle}</p>
          </div>
        </div>

        <Panel className="overflow-hidden">
          <div className="border-b border-[#eef2f6] p-4 sm:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#94a3b8]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white pl-10 pr-4 text-[14px] font-semibold outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10" data-testid="templates-search" />
            </div>
          </div>

          {templates.isLoading ? (
            <div className="grid min-h-64 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-[#64748b]" /></div>
          ) : rows.length ? (
            <div className="divide-y divide-[#eef2f6]">
              <div className="grid grid-cols-[minmax(0,1fr)_88px_132px] gap-3 bg-[#fbfcfe] px-4 py-3 text-[12px] font-bold text-[#64748b] sm:px-5">
                <span>{copy.colName}</span><span>{copy.colParseMode}</span><span className="text-right">{copy.colActions}</span>
              </div>
              {rows.map((template) => (
                <div key={template.id} className="grid grid-cols-[minmax(0,1fr)_88px_132px] items-center gap-3 px-4 py-4 sm:px-5" data-testid={`template-row-${template.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-extrabold text-[#0f172a]">{template.name}</p>
                    <p className="mt-1 truncate text-[11px] font-medium text-[#94a3b8] sm:hidden">{template.mode === "forward" ? copy.forwardLabel : template.content}</p>
                  </div>
                  <span className="inline-flex w-fit rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[10px] font-extrabold text-[#334155]">{template.mode === "forward" ? "FORWARD" : "PLAIN"}</span>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setPreview(template)} className="grid h-10 w-10 place-items-center rounded-xl border border-[#e2e8f0] text-[#0f172a] hover:bg-[#f8fafc]" aria-label={copy.ariaView(template.name)}><Eye className="h-[18px] w-[18px]" /></button>
                    <button onClick={() => openEdit(template)} className="grid h-10 w-10 place-items-center rounded-xl border border-[#e2e8f0] text-[#0f172a] hover:bg-[#f8fafc]" aria-label={copy.ariaEdit(template.name)}><Pencil className="h-[17px] w-[17px]" /></button>
                    <button onClick={() => void remove(template)} disabled={deleteTemplate.isPending} className="grid h-10 w-10 place-items-center rounded-xl bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-50" aria-label={copy.ariaDelete(template.name)}><Trash2 className="h-[17px] w-[17px]" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title={search ? copy.emptySearchTitle : copy.emptyTitle}
              detail={search ? copy.emptySearchDetail : copy.emptyDetail}
              action={!search ? <PrimaryButton onClick={openNew}><Plus className="h-4 w-4" />{copy.add}</PrimaryButton> : undefined}
            />
          )}
        </Panel>
      </div>

      {showForm && (
        <Modal title={editing ? copy.modalEdit : copy.modalAdd} onClose={() => setShowForm(false)}>
          <form onSubmit={(event) => void submit(event)} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-[13px] font-bold text-[#334155]">{copy.fieldName}</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="template-name" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-bold text-[#334155]">{copy.fieldMode}</span>
              <select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as TemplateMode, sourceMessageId: "" })} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1a2b88]" data-testid="template-mode">
                <option value="forward">{copy.modeForward}</option>
                <option value="text">{copy.modeText}</option>
              </select>
            </label>
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
            <PrimaryButton type="submit" disabled={isSaving} onClick={() => undefined}>{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}{copy.save}</PrimaryButton>
          </form>
        </Modal>
      )}

      {preview && (
        <Modal
          title={preview.name}
          description={preview.mode === "forward" ? copy.previewForward : copy.previewText}
          onClose={() => setPreview(null)}
        >
          <p className="whitespace-pre-wrap rounded-2xl bg-[#f8fafc] p-4 text-[14px] font-medium leading-relaxed text-[#334155]">{preview.content || copy.previewForwardContent}</p>
        </Modal>
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}
