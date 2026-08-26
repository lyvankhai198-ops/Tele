import { ChangeEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Eye, EyeOff, ImagePlus, Megaphone, Pencil, Pin, PinOff, Plus, Trash2, UploadCloud, Video } from "lucide-react";
import {
  getListAdminNotificationsQueryKey,
  useCreateAdminNotification,
  useDeleteAdminNotification,
  useListAdminNotifications,
  useRequestAdminNotificationUploadUrl,
  useSetAdminNotificationPinned,
  useSetAdminNotificationVisibility,
  useUpdateAdminNotification,
  type AdminNotification,
  type AdminNotificationInput,
} from "@workspace/api-client-react";
import { AppLayout, EmptyState, Modal, Panel, PrimaryButton, QuietButton, SectionHeader, Toast } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

type MediaState = {
  path: string | null;
  type: "image" | "video" | null;
  name: string | null;
  size: number | null;
  previewUrl: string | null;
  unchanged: boolean;
};

const emptyMedia: MediaState = { path: null, type: null, name: null, size: null, previewUrl: null, unchanged: false };
type NotificationCopy = typeof copy.en | typeof copy.vi;

const copy = {
  en: {
    pageTitle: "Admin Notifications",
    eyebrow: "Admin Center",
    detail: "Publish or schedule a scrolling dashboard announcement with an optional image or video.",
    create: "New notification",
    noTitle: "No admin notifications",
    noDetail: "Create your first announcement to show it on every active dashboard.",
    modalCreate: "Create notification",
    modalEdit: "Edit notification",
    title: "Title",
    body: "Scrolling message",
    titleHint: "A short headline for the announcement",
    bodyHint: "This text scrolls horizontally on the dashboard.",
    publishNow: "Publish now",
    schedule: "Schedule",
    publishAt: "Publish at",
    expiresAt: "Expiry (optional)",
    media: "Image or video (optional)",
    mediaHint: "JPG, PNG, WEBP, GIF, MP4, WEBM or MOV · up to 50 MB",
    changeMedia: "Replace media",
    removeMedia: "Remove",
    upload: "Upload media",
    save: "Publish notification",
    update: "Save changes",
    cancel: "Cancel",
    creating: "Saving…",
    statusPublished: "Published",
    statusScheduled: "Scheduled",
    statusExpired: "Expired",
    statusDraft: "Draft",
    scheduledFor: "Scheduled for",
    publishedAt: "Published",
    expires: "Expires",
    edit: "Edit",
    delete: "Delete",
    confirmDelete: "Delete this notification? Its media file will no longer be shown.",
    saved: "Notification saved.",
    deleted: "Notification deleted.",
    uploadError: "Could not upload the media.",
    formError: "Enter a title and use a future time when scheduling.",
    loadError: "Could not load notifications.",
    pin: "Pin to dashboard",
    unpin: "Unpin",
    hide: "Remove from dashboard",
    restore: "Show on dashboard",
    pinError: "Could not update dashboard placement.",
  },
  vi: {
    pageTitle: "Thông báo Admin",
    eyebrow: "Trung tâm Quản trị",
    detail: "Phát ngay hoặc hẹn giờ thông báo dashboard có chữ chạy ngang, kèm hình ảnh hoặc video.",
    create: "Tạo thông báo",
    noTitle: "Chưa có thông báo Admin",
    noDetail: "Tạo thông báo đầu tiên để hiển thị cho mọi dashboard đang hoạt động.",
    modalCreate: "Tạo thông báo",
    modalEdit: "Chỉnh sửa thông báo",
    title: "Tiêu đề",
    body: "Nội dung chữ chạy",
    titleHint: "Tiêu đề ngắn cho thông báo",
    bodyHint: "Nội dung này sẽ chạy ngang trên dashboard.",
    publishNow: "Phát ngay",
    schedule: "Hẹn giờ",
    publishAt: "Thời điểm phát",
    expiresAt: "Hết hạn (không bắt buộc)",
    media: "Hình ảnh hoặc video (không bắt buộc)",
    mediaHint: "JPG, PNG, WEBP, GIF, MP4, WEBM hoặc MOV · tối đa 50 MB",
    changeMedia: "Thay media",
    removeMedia: "Gỡ media",
    upload: "Tải media lên",
    save: "Phát thông báo",
    update: "Lưu thay đổi",
    cancel: "Hủy",
    creating: "Đang lưu…",
    statusPublished: "Đang phát",
    statusScheduled: "Đã hẹn giờ",
    statusExpired: "Đã hết hạn",
    statusDraft: "Nháp",
    scheduledFor: "Hẹn phát",
    publishedAt: "Đã phát",
    expires: "Hết hạn",
    edit: "Chỉnh sửa",
    delete: "Xóa",
    confirmDelete: "Xóa thông báo này? Media sẽ không còn hiển thị.",
    saved: "Đã lưu thông báo.",
    deleted: "Đã xóa thông báo.",
    uploadError: "Không thể tải media lên.",
    formError: "Hãy nhập tiêu đề và chọn thời gian trong tương lai khi hẹn giờ.",
    loadError: "Không thể tải thông báo.",
    pin: "Ghim lên dashboard",
    unpin: "Bỏ ghim",
    hide: "Gỡ khỏi dashboard",
    restore: "Phát lại trên dashboard",
    pinError: "Không thể cập nhật vị trí hiển thị.",
  },
} as const;

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string | null, language: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminNotificationsPage() {
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const text = copy[language];
  const { data: notifications, error, isLoading } = useListAdminNotifications();
  const createMutation = useCreateAdminNotification();
  const updateMutation = useUpdateAdminNotification();
  const deleteMutation = useDeleteAdminNotification();
  const requestUploadMutation = useRequestAdminNotificationUploadUrl();
  const pinMutation = useSetAdminNotificationPinned();
  const visibilityMutation = useSetAdminNotificationVisibility();
  const [editing, setEditing] = useState<AdminNotification | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListAdminNotificationsQueryKey() });
  };

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const onDelete = (notification: AdminNotification) => {
    if (!window.confirm(text.confirmDelete)) return;
    deleteMutation.mutate({ notificationId: notification.id }, {
      onSuccess: () => {
        invalidate();
        setToast({ text: text.deleted });
      },
      onError: (cause) => setToast({ text: localizedErrorMessage(cause, language, text.loadError), isError: true }),
    });
  };

  const onPin = (notification: AdminNotification) => {
    pinMutation.mutate({ notificationId: notification.id, data: { pinned: !notification.pinned } }, {
      onSuccess: invalidate,
      onError: (cause) => setToast({ text: localizedErrorMessage(cause, language, text.pinError), isError: true }),
    });
  };

  const onVisibility = (notification: AdminNotification) => {
    visibilityMutation.mutate({ notificationId: notification.id, data: { dashboardVisible: !notification.dashboardVisible } }, {
      onSuccess: invalidate,
      onError: (cause) => setToast({ text: localizedErrorMessage(cause, language, text.pinError), isError: true }),
    });
  };

  return (
    <AppLayout activePage="admin-notifications" title={text.pageTitle} hideUpgrade>
      <SectionHeader
        eyebrow={text.eyebrow}
        title={text.pageTitle}
        detail={text.detail}
        action={<PrimaryButton onClick={openCreate}><Plus className="h-4 w-4" />{text.create}</PrimaryButton>}
      />
      {error ? (
        <Panel className="p-8 text-center text-[#e11d48]">{text.loadError}</Panel>
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#eef2f6] border-t-[#1a2b88]" /></div>
      ) : !notifications?.length ? (
        <Panel><EmptyState icon={Megaphone} title={text.noTitle} detail={text.noDetail} action={<PrimaryButton onClick={openCreate}><Plus className="h-4 w-4" />{text.create}</PrimaryButton>} /></Panel>
      ) : (
        <div className="grid gap-5">
          {notifications.map((notification) => (
            <NotificationCard key={notification.id} notification={notification} text={text} language={language} onEdit={() => { setEditing(notification); setOpen(true); }} onDelete={() => onDelete(notification)} onPin={() => onPin(notification)} onVisibility={() => onVisibility(notification)} />
          ))}
        </div>
      )}
      {open && (
        <NotificationForm
          notification={editing}
          text={text}
          language={language}
          busy={createMutation.isPending || updateMutation.isPending}
          requestUpload={async (file) => {
            const result = await requestUploadMutation.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as any } });
            const response = await fetch(result.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
            if (!response.ok) throw new Error("Media upload failed");
            return {
              path: result.objectPath,
              type: file.type.startsWith("video/") ? "video" as const : "image" as const,
              name: file.name,
              size: file.size,
              previewUrl: URL.createObjectURL(file),
              unchanged: false,
            };
          }}
          onClose={() => setOpen(false)}
          onSubmit={(payload) => {
            const finish = () => {
              invalidate();
              setOpen(false);
              setToast({ text: text.saved });
            };
            const fail = (cause: unknown) => setToast({ text: localizedErrorMessage(cause, language, text.formError), isError: true });
            if (editing) updateMutation.mutate({ notificationId: editing.id, data: payload }, { onSuccess: finish, onError: fail });
            else createMutation.mutate({ data: payload }, { onSuccess: finish, onError: fail });
          }}
        />
      )}
      {toast && <Toast message={toast.text} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}

function NotificationCard({ notification, text, language, onEdit, onDelete, onPin, onVisibility }: {
  notification: AdminNotification;
  text: NotificationCopy;
  language: string;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onVisibility: () => void;
}) {
  const statusLabel = {
    published: text.statusPublished,
    scheduled: text.statusScheduled,
    expired: text.statusExpired,
    draft: text.statusDraft,
  }[notification.status];
  const statusColor = {
    published: "bg-emerald-50 text-emerald-700 border-emerald-200",
    scheduled: "bg-indigo-50 text-indigo-700 border-indigo-200",
    expired: "bg-slate-100 text-slate-600 border-slate-200",
    draft: "bg-amber-50 text-amber-700 border-amber-200",
  }[notification.status];
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0 flex-1">
           <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-extrabold text-[#0f172a]">{notification.title}</h2>
             {notification.pinned && <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-indigo-700"><Pin className="h-3 w-3" />{text.pin}</span>}
             {!notification.dashboardVisible && <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-600"><EyeOff className="h-3 w-3" />{text.hide}</span>}
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${statusColor}`}>{statusLabel}</span>
          </div>
          {notification.body && <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-[#475569]">{notification.body}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#64748b]">
            {notification.scheduledAt && <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{text.scheduledFor}: {formatDate(notification.scheduledAt, language)}</span>}
            {notification.publishedAt && <span>{text.publishedAt}: {formatDate(notification.publishedAt, language)}</span>}
            {notification.expiresAt && <span>{text.expires}: {formatDate(notification.expiresAt, language)}</span>}
          </div>
        </div>
         <div className="flex shrink-0 gap-2">
           <button type="button" onClick={onPin} className={`rounded-xl border p-2.5 transition ${notification.pinned ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "border-[#cbd5e1] text-[#475569] hover:bg-[#f8fafc] hover:text-[#1a2b88]"}`} aria-label={notification.pinned ? text.unpin : text.pin} title={notification.pinned ? text.unpin : text.pin}>{notification.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>
           <button type="button" onClick={onVisibility} className={`rounded-xl border p-2.5 transition ${notification.dashboardVisible ? "border-[#cbd5e1] text-[#475569] hover:bg-[#f8fafc] hover:text-[#1a2b88]" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`} aria-label={notification.dashboardVisible ? text.hide : text.restore} title={notification.dashboardVisible ? text.hide : text.restore}>{notification.dashboardVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          <button type="button" onClick={onEdit} className="rounded-xl border border-[#cbd5e1] p-2.5 text-[#475569] transition hover:bg-[#f8fafc] hover:text-[#1a2b88]" aria-label={text.edit}><Pencil className="h-4 w-4" /></button>
          <button type="button" onClick={onDelete} className="rounded-xl border border-[#fecdd3] p-2.5 text-[#e11d48] transition hover:bg-[#fff1f2]" aria-label={text.delete}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {notification.mediaUrl && (
        <div className="border-t border-[#eef2f6] bg-[#f8fafc] px-5 py-4 sm:px-6">
          {notification.mediaType === "image" ? <img src={notification.mediaUrl} alt={notification.title} className="max-h-56 rounded-xl object-cover" /> : <video src={notification.mediaUrl} className="max-h-56 rounded-xl bg-slate-950" controls preload="metadata" />}
        </div>
      )}
    </Panel>
  );
}

function NotificationForm({ notification, text, language, busy, requestUpload, onClose, onSubmit }: {
  notification: AdminNotification | null;
  text: NotificationCopy;
  language: string;
  busy: boolean;
  requestUpload: (file: File) => Promise<MediaState>;
  onClose: () => void;
  onSubmit: (data: AdminNotificationInput) => void;
}) {
  const [title, setTitle] = useState(notification?.title ?? "");
  const [body, setBody] = useState(notification?.body ?? "");
  const [mode, setMode] = useState<"now" | "schedule">(notification?.scheduledAt ? "schedule" : "now");
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(notification?.scheduledAt ?? null));
  const [expiresAt, setExpiresAt] = useState(toDateTimeLocal(notification?.expiresAt ?? null));
  const [media, setMedia] = useState<MediaState>(() => notification?.mediaUrl ? {
    path: null,
    type: notification.mediaType,
    name: notification.mediaName,
    size: notification.mediaSize,
    previewUrl: notification.mediaUrl,
    unchanged: true,
  } : emptyMedia);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const mediaInputId = useMemo(() => `notification-media-${notification?.id ?? "new"}`, [notification?.id]);

  const onMediaChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const supported = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];
    if (!supported.includes(file.type) || file.size > 52_428_800) {
      setFormError(text.uploadError);
      return;
    }
    setFormError(null);
    setUploading(true);
    try {
      setMedia(await requestUpload(file));
    } catch {
      setFormError(text.uploadError);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const submit = () => {
    if (!title.trim() || (mode === "schedule" && (!scheduledAt || new Date(scheduledAt) <= new Date()))) {
      setFormError(text.formError);
      return;
    }
    setFormError(null);
    const mediaPayload = media.unchanged ? {} : {
      mediaPath: media.path,
      mediaType: media.type,
      mediaName: media.name,
      mediaSize: media.size,
    };
    onSubmit({
      title: title.trim(),
      body,
      ...mediaPayload,
      scheduledAt: mode === "schedule" ? new Date(scheduledAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
  };

  return (
    <Modal title={notification ? text.modalEdit : text.modalCreate} description={text.detail} onClose={onClose} wide>
      <div className="space-y-5">
        <label className="block"><span className="mb-2 block text-sm font-bold text-[#475569]">{text.title}</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={text.titleHint} maxLength={200} className="w-full rounded-xl border border-[#cbd5e1] px-4 py-3 text-sm font-semibold outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10" /></label>
        <label className="block"><span className="mb-2 block text-sm font-bold text-[#475569]">{text.body}</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={text.bodyHint} maxLength={5000} rows={4} className="w-full resize-y rounded-xl border border-[#cbd5e1] px-4 py-3 text-sm font-medium leading-6 outline-none focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10" /></label>
        <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setMode("now")} className={`rounded-xl px-4 py-2 text-sm font-extrabold ${mode === "now" ? "bg-[#1a2b88] text-white" : "bg-white text-[#475569] border border-[#cbd5e1]"}`}>{text.publishNow}</button>
            <button type="button" onClick={() => setMode("schedule")} className={`rounded-xl px-4 py-2 text-sm font-extrabold ${mode === "schedule" ? "bg-[#1a2b88] text-white" : "bg-white text-[#475569] border border-[#cbd5e1]"}`}>{text.schedule}</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "schedule" && <label className="block"><span className="mb-2 block text-xs font-bold text-[#475569]">{text.publishAt}</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a2b88]" /></label>}
            <label className="block"><span className="mb-2 block text-xs font-bold text-[#475569]">{text.expiresAt}</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a2b88]" /></label>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#475569]">{text.media}</p><p className="mt-0.5 text-xs font-medium text-[#64748b]">{text.mediaHint}</p></div>{media.type === "video" ? <Video className="h-5 w-5 text-[#1a2b88]" /> : <ImagePlus className="h-5 w-5 text-[#1a2b88]" />}</div>
          {media.previewUrl && <div className="mb-3 overflow-hidden rounded-2xl border border-[#e2e8f0] bg-[#f8fafc]">{media.type === "image" ? <img src={media.previewUrl} alt="" className="max-h-52 w-full object-contain" /> : <video src={media.previewUrl} className="max-h-52 w-full bg-slate-950" controls preload="metadata" />}</div>}
          <div className="flex flex-wrap gap-2"><label htmlFor={mediaInputId} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 py-2.5 text-sm font-extrabold text-[#475569] transition hover:bg-[#f8fafc]"><UploadCloud className="h-4 w-4" />{uploading ? text.creating : media.previewUrl ? text.changeMedia : text.upload}<input id={mediaInputId} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" className="sr-only" disabled={uploading} onChange={(event) => void onMediaChange(event)} /></label>{media.previewUrl && <button type="button" onClick={() => setMedia(emptyMedia)} className="rounded-xl border border-[#fecdd3] px-4 py-2.5 text-sm font-extrabold text-[#e11d48]">{text.removeMedia}</button>}</div>
        </div>
        {formError && <p role="alert" className="rounded-xl bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]">{formError}</p>}
        <div className="flex justify-end gap-3 border-t border-[#eef2f6] pt-5"><QuietButton onClick={onClose}>{text.cancel}</QuietButton><PrimaryButton onClick={submit} disabled={busy || uploading}>{busy ? text.creating : notification ? text.update : text.save}</PrimaryButton></div>
      </div>
    </Modal>
  );
}