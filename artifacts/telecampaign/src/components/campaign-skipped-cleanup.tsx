import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createCampaignCleanupPreview, confirmCampaignCleanup, type BackgroundOperation,
} from "@workspace/api-client-react";
import { useOperations } from "@/lib/operations";
import { useAuth } from "@/lib/auth";
import { rerunReason } from "./campaign-rerun-options";

type Preview = Awaited<ReturnType<typeof createCampaignCleanupPreview>>;
const errorMessages: Record<string, [string, string]> = {
  CLEANUP_PREVIEW_CHANGED: ["Dữ liệu đã thay đổi. Hãy xem trước và chọn lại trước khi xoá.", "Data changed. Refresh the preview and review your selection before deleting."],
  CLEANUP_PREVIEW_EXPIRED: ["Bản xem trước đã hết hạn. Vui lòng tải bản mới.", "This preview expired. Please load a new preview."],
  CLEANUP_INVALID_SELECTION: ["Có mục không còn đủ điều kiện. Hãy tải lại bản xem trước.", "Some selected items are no longer eligible. Refresh the preview."],
  CLEANUP_SELECTION_CHANGED: ["Bản này đã được xác nhận với lựa chọn khác. Hãy xem tiến trình xoá trước khi tạo bản mới.", "This preview was already confirmed with another selection. Check deletion progress before creating a new preview."],
  CLEANUP_CLASSIFICATION_NOT_FINISHED: ["Chờ phân loại hoàn tất rồi xem trước.", "Wait for classification to finish before previewing."],
  CLEANUP_LEGACY_RESULT_UNAVAILABLE: ["Tác vụ cũ thiếu kết quả phân loại để xem trước an toàn.", "This older operation has insufficient classification results for a safe preview."],
  CLEANUP_BUSY_RETRY: ["Dữ liệu đang được xử lý. Thử lại đúng yêu cầu này sau ít giây.", "Data is busy. Retry this same request in a few seconds."],
  CLEANUP_NOT_FOUND: ["Không còn tìm thấy tác vụ, tài khoản hoặc bản xem trước này.", "This operation, account or preview is no longer available."],
};
function message(error: unknown, vi: boolean, confirming: boolean) {
  const detail=error as {message?:string;data?:{error?:string};body?:{error?:string};error?:string}|null;
  const text = [detail?.message,detail?.data?.error,detail?.body?.error,detail?.error].filter(value=>typeof value==="string").join(" ");
  const found = Object.keys(errorMessages).find(code => text.includes(code));
  if (found) return errorMessages[found][vi ? 0 : 1];
  return confirming
    ? vi ? "Chưa nhận được xác nhận. Có thể yêu cầu đã được tiếp nhận; thử lại đúng lựa chọn này không tạo lệnh xoá trùng."
      : "Confirmation was not received. The request may have been accepted; retrying this same selection will not create a duplicate deletion."
    : vi ? "Chưa tải được bản xem trước. Không có chiến dịch nào bị xoá." : "The preview could not be loaded. No campaigns were deleted.";
}
function rowReason(reason: string, language: "vi" | "en") {
  const vi = language === "vi";
  if (reason === "cleanup_now_ready") return vi ? "Hiện đã sẵn sàng — giữ lại." : "Currently ready — retained.";
  if (reason === "cleanup_missing_identity") return vi ? "Thiếu định danh nhóm để chặn an toàn; cần kiểm tra trước." : "Missing group identity for safe blocking; check this campaign first.";
  if (reason === "cleanup_state_changed") return vi ? "Đang chạy hoặc đang được tác vụ khác xử lý — không chọn xoá." : "Running or handled by another operation — unavailable for deletion.";
  return rerunReason(reason, language);
}

export function CampaignSkippedCleanup({ jobId, accounts, initialAccountId = "", language, onAccepted }: {
  jobId: string; accounts: Array<{ id: string; name: string; username?: string | null }>;
  initialAccountId?: string; language: "vi" | "en"; onAccepted: () => void;
}) {
  const vi = language === "vi", operations = useOperations(), client = useQueryClient(), { user } = useAuth();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false), [expired, setExpired] = useState(false);
  const [limit, setLimit] = useState(50);
  const alive = useRef(true), epoch = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; epoch.current++; };
  }, [jobId, operations.scope]);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, new Date(preview.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);
  const reset = (id: string) => {
    epoch.current++; setAccountId(id); setPreview(null); setSelected(new Set());
    setConfirming(false); setError(""); setExpired(false); setLimit(50); setPending(false);
  };
  const load = async () => {
    if (!accountId || pending) return;
    const run = ++epoch.current;
    setPending(true); setError(""); setPreview(null); setSelected(new Set()); setConfirming(false); setExpired(false);
    try {
      const result = await createCampaignCleanupPreview(jobId, { telegramAccountId: accountId });
      if (alive.current && epoch.current === run) { setPreview(result); setLimit(50); }
    } catch (error) {
      if (alive.current && epoch.current === run) setError(message(error, vi, false));
    } finally {
      if (alive.current && epoch.current === run) setPending(false);
    }
  };
  const confirm = async () => {
    if (!preview || !selected.size || selected.size>5000 || pending || expired || !confirming) return;
    const run = ++epoch.current, ids = [...selected].sort(), id = preview.id;
    setPending(true); setError("");
    try {
      const operation = await confirmCampaignCleanup(jobId, { previewId: id, campaignIds: ids, confirm: true });
      if (!alive.current || epoch.current !== run) return;
      client.setQueryData<BackgroundOperation[]>(["telecamp-operations", operations.scope], old =>
        [operation, ...(old ?? []).filter(item => item.id !== operation.id)]);
      void operations.refetch().catch(() => {});
      onAccepted();
    } catch (error) {
      if (alive.current && epoch.current === run) setError(message(error, vi, true));
    } finally {
      if (alive.current && epoch.current === run) setPending(false);
    }
  };
  const selectable = preview?.campaigns.filter(row => row.selectable) ?? [];
  const chosen = preview?.campaigns.filter(row => selected.has(row.id)) ?? [];
  const groupCount = new Set(chosen.flatMap(row => row.groups.map(group => group.telegramId))).size;
  if (!user || user.support) return null;
  return <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3" data-testid="campaign-skipped-cleanup">
    <h3 className="font-bold text-slate-900">{vi ? "Xem trước chiến dịch bị bỏ qua" : "Preview skipped campaigns"}</h3>
    <p className="text-xs leading-relaxed text-slate-600">{vi
      ? "Phân loại không tự xoá. Chọn tài khoản, xem lại lý do rồi tích những chiến dịch muốn xoá."
      : "Classification does not delete anything. Choose an account, review the reasons, then select campaigns to delete."}</p>
    <label className="block text-sm font-semibold">
      {vi ? "Tài khoản Telegram" : "Telegram account"}
      <select aria-label={vi ? "Tài khoản để xem trước xoá" : "Account for deletion preview"} value={accountId}
        onChange={event => reset(event.target.value)} disabled={pending}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">
        <option value="">{vi ? "Chọn tài khoản Telegram" : "Choose a Telegram account"}</option>
        {accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.username ? ` · @${account.username}` : ""}</option>)}
      </select>
    </label>
    <button type="button" onClick={load} disabled={!accountId || pending || confirming}
      className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 font-semibold text-indigo-800 disabled:opacity-50">
      {pending && !confirming ? (vi ? "Đang phân loại lại…" : "Reassessing…") : vi ? "Xem trước / Cập nhật danh sách" : "Preview / Refresh list"}
    </button>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-white p-3 text-xs text-rose-800">{error}</p>}
    {preview && <>
      <p className="text-xs text-slate-600">{preview.accountName} · {vi ? "Đã chọn" : "Selected"} {selected.size}/{selectable.length}
        {" · "}{vi ? "Nhóm sẽ bị chặn" : "Groups to block"}: {groupCount}</p>
      {selected.size>5000&&<p role="alert" className="text-xs text-rose-800">{vi
        ?"Mỗi lượt xác nhận tối đa 5.000 chiến dịch. Bỏ chọn bớt và xử lý phần còn lại ở lượt sau."
        :"Confirm up to 5,000 campaigns per operation. Reduce this selection and process the remaining items afterward."}</p>}
      {expired && <p role="alert" className="text-xs font-semibold text-rose-700">{vi ? "Bản xem trước hết hạn. Hãy cập nhật danh sách." : "Preview expired. Refresh the list."}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending || confirming || expired || !selectable.length}
          onClick={() => setSelected(new Set(selectable.map(row => row.id)))}
          className="rounded-lg border border-slate-200 bg-white p-2 text-sm font-semibold disabled:opacity-50">{vi ? "Chọn tất cả" : "Select all"}</button>
        <button type="button" disabled={pending || confirming || !selected.size} onClick={() => setSelected(new Set())}
          className="rounded-lg border border-slate-200 bg-white p-2 text-sm font-semibold disabled:opacity-50">{vi ? "Bỏ chọn tất cả" : "Clear selection"}</button>
      </div>
      {!preview.campaigns.length && <p className="p-2 text-sm text-slate-600">{vi ? "Không có chiến dịch bị bỏ qua của tài khoản này." : "No skipped campaigns for this account."}</p>}
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {preview.campaigns.slice(0, limit).map(row => <li key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <label className="flex items-start gap-2">
            <input type="checkbox" aria-label={row.name} checked={selected.has(row.id)}
              disabled={!row.selectable || pending || confirming || expired} className="mt-1"
              onChange={event => {
                const checked=event.target.checked;
                setSelected(previous => {
                  const next = new Set(previous); if (checked) next.add(row.id); else next.delete(row.id); return next;
                });
              }} />
            <span className="min-w-0 break-words text-sm font-semibold">{row.name}
              <small className="mt-1 block font-normal text-slate-600">{rowReason(row.reason, language)}</small>
            </span>
          </label>
          {row.groups.length > 0 && <details className="ml-6 mt-2 text-xs text-slate-600">
            <summary className="cursor-pointer">{vi ? "Nhóm sẽ bị chặn nếu chọn xoá" : "Groups blocked if deleted"} ({row.groups.length})</summary>
            <ul className="mt-1 space-y-1">{row.groups.map(group => <li key={group.id}>{group.title}</li>)}</ul>
          </details>}
        </li>)}
      </ul>
      {preview.campaigns.length > limit && <button type="button" onClick={() => setLimit(value => value + 100)}
        className="text-sm font-semibold text-indigo-800">{vi ? "Xem thêm" : "Show more"}</button>}
      {!confirming ? <button type="button" disabled={!selected.size || selected.size>5000 || pending || expired} onClick={() => setConfirming(true)}
        className="w-full rounded-xl bg-rose-600 p-3 font-bold text-white disabled:opacity-50">{vi ? "Xem xác nhận xoá" : "Review deletion"} ({selected.size})</button>
        : <div role="alert" className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm font-bold text-rose-900">{vi ? "Xác nhận xoá" : "Confirm deletion"} {selected.size} {vi ? "chiến dịch" : "campaigns"} · {preview.accountName}</p>
          <p className="text-xs leading-relaxed text-rose-800">{vi
            ? `Mất các lượt gửi và dữ liệu liên quan, không thể hoàn tác. ${groupCount} nhóm sẽ bị chặn trên tài khoản này, kể cả khi nằm trong chiến dịch khác. Không ảnh hưởng tài khoản khác. Tin đã bắt đầu gửi trước khi xác nhận không thể thu hồi.`
            : `Delivery records and related data will be permanently removed. ${groupCount} groups will be blocked on this account, including in other campaigns. Other accounts are unaffected. Sends already started before confirmation cannot be recalled.`}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-lg border border-slate-200 bg-white p-2 font-semibold">{vi ? "Quay lại lựa chọn" : "Back to selection"}</button>
            <button type="button" disabled={pending || expired} onClick={confirm} className="rounded-lg bg-rose-600 p-2 font-bold text-white disabled:opacity-50">
              {pending ? (vi ? "Đang tiếp nhận…" : "Submitting…") : vi ? "Xoá và chặn nhóm" : "Delete and block groups"}</button>
          </div>
        </div>}
    </>}
  </section>;
}
