import { useEffect, useState, type FormEvent } from "react";
import { Panel } from "@/components/layout/AppLayout";
import { adminToolRequest } from "@/lib/admin-tools-client";

export function AdminMfaPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputClass = "w-full rounded-xl border border-slate-300 bg-white p-3 text-sm";
  useEffect(() => {
    void adminToolRequest<{ enabled: boolean; remainingRecoveryCodes: number }>("/auth/mfa")
      .then(result => { setEnabled(result.enabled); setRemaining(result.remainingRecoveryCodes); })
      .catch(() => setMessage("Không tải được trạng thái 2FA."));
  }, []);
  async function submit(event: FormEvent, action: "begin" | "confirm" | "disable") {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await adminToolRequest<{ secret?: string; uri?: string; recoveryCodes?: string[]; signedOut?: boolean }>(
        `/auth/mfa/${action}`, { password, code });
      if (action === "begin") { setSetup({ secret: result.secret!, uri: result.uri! }); setCode(""); }
      if (action === "confirm") {
        setRecovery(result.recoveryCodes ?? []); setRemaining(result.recoveryCodes?.length ?? 0);
        setSetup(null); setEnabled(true); setPassword(""); setCode("");
        setMessage("Đã bật 2FA. Các phiên khác đã được đăng xuất. Hãy lưu mã khôi phục ở nơi riêng.");
      }
      if (result.signedOut) window.location.assign("/login");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể cập nhật 2FA."); }
    finally { setBusy(false); }
  }
  return <Panel className="space-y-4 p-5 sm:p-7">
    <h2 className="text-lg font-extrabold">Xác thực hai bước cho admin</h2>
    <p className="text-sm text-slate-600">
      {enabled === null ? "Đang kiểm tra…" : enabled ? `Đã bật · Còn ${remaining} mã khôi phục.` : "Chưa bật. Chỉ được bật sau khi bạn xác nhận mã từ ứng dụng Authenticator."}
      {" "}Đây là 2FA của website, không thay đổi 2FA Telegram.
    </p>
    {message && <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}
    {recovery.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="mb-3 text-sm font-bold">Mỗi mã dùng một lần. Mã chỉ hiển thị trong phiên thiết lập này; không gửi cho người khác.</p>
      <div className="grid gap-2 break-all font-mono text-sm sm:grid-cols-2">{recovery.map(value => <code key={value}>{value}</code>)}</div>
      <button type="button" className="mt-4 rounded-lg border bg-white px-3 py-2" onClick={() => {
        if (window.confirm("Bạn đã lưu mã khôi phục ở nơi an toàn?")) setRecovery([]);
      }}>Tôi đã lưu mã</button>
    </div>}
    {enabled !== null && <form className="space-y-3" onSubmit={event => void submit(event, enabled ? "disable" : setup ? "confirm" : "begin")}>
      <label className="block text-sm font-bold">Mật khẩu hiện tại
        <input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
      </label>
      {setup && <div className="space-y-2 rounded-xl bg-blue-50 p-4 text-sm">
        <p>Thêm tài khoản TeleCamp vào ứng dụng Authenticator bằng khóa thiết lập dưới đây, hoặc mở liên kết trên thiết bị có ứng dụng. Không chụp/gửi khóa cho người khác.</p>
        <input aria-label="Khóa thiết lập 2FA" readOnly value={setup.secret} className={`${inputClass} font-mono`} />
        <a className="inline-block font-bold text-blue-800 underline" href={setup.uri}>Mở ứng dụng Authenticator</a>
        <button type="button" className="ml-4 underline" onClick={() => { setSetup(null); setCode(""); }}>Hủy thiết lập</button>
      </div>}
      {(setup || enabled) && <label className="block text-sm font-bold">{enabled ? "Mã 2FA hoặc mã khôi phục để tắt" : "Mã 6 số trong Authenticator"}
        <input required autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} maxLength={80} className={inputClass} />
      </label>}
      <button disabled={busy || enabled === null} type="submit" className="rounded-xl bg-[#1a2b88] px-4 py-3 font-bold text-white disabled:opacity-50">
        {busy ? "Đang xác nhận…" : enabled ? "Tắt 2FA và đăng xuất" : setup ? "Xác nhận bật 2FA" : "Bắt đầu thiết lập 2FA"}
      </button>
    </form>}
  </Panel>;
}
