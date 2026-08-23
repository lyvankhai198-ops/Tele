import { useMemo, useState, type FormEvent } from "react";
import { Link2, LoaderCircle, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import type { Proxy } from "@workspace/api-client-react";
import {
  attachProxyAccount,
  deleteProxy,
  detachProxyAccount,
  useCreateProxy,
  useListProxies,
  useListTelegramAccounts,
} from "@workspace/api-client-react";
import { AppLayout, EmptyState, Modal, Panel, PrimaryButton, Toast } from "@/components/layout/AppLayout";
import { localizedErrorMessage, useLanguage } from "@/lib/i18n";

type ProxyForm = { type: "http" | "socks5"; name: string; host: string; port: string; username: string; password: string; accountId: string };
const blankForm = (): ProxyForm => ({ type: "http", name: "", host: "", port: "1080", username: "", password: "", accountId: "" });

export default function ProxyPage() {
  const { language } = useLanguage();
  const vi = language === "vi";

  const copy = vi ? {
    title: "Proxy",
    add: "Thêm proxy",
    recommendation: (
      <>
        <b>Khuyến nghị:</b> dùng proxy HTTP/SOCKS5 cùng quốc gia với số điện thoại Telegram để giảm rủi ro bị Telegram cảnh báo phiên đăng nhập mới.
      </>
    ),
    colName: "Tên",
    colHostPort: "Host:Port",
    colAuth: "Auth",
    colUsing: "Đang dùng",
    colStatus: "Trạng thái",
    authNo: "Không",
    statusActive: "Hoạt động",
    statusPaused: "Tạm dừng",
    ariaDelete: (name: string) => `Xóa ${name}`,
    attachTitle: (name: string) => (
      <>Gắn tài khoản với <span className="text-[#1d3bb8]">{name}</span></>
    ),
    noAttached: "Chưa gắn tài khoản nào.",
    ariaDetach: (name: string) => `Bỏ gắn ${name}`,
    selectAccount: "Chọn tài khoản",
    changeProxy: " · đổi proxy",
    attachBtn: "Gắn",
    emptyTitle: "Chưa có proxy",
    emptyDetail: "Thêm proxy HTTP hoặc SOCKS5, sau đó gắn với tài khoản Telegram mà bạn quản lý.",
    summary: (count: number, attached: number) => `Tổng: ${count} proxy, đang gắn ${attached} tài khoản.`,
    modalTitle: "Thêm proxy",
    fieldType: "Loại proxy",
    typeHttp: "HTTP (phổ biến)",
    typeSocks5: "SOCKS5",
    fieldName: "Tên gợi nhớ",
    fieldHost: "Host / IP",
    fieldPort: "Port",
    fieldUsername: "Username",
    fieldPassword: "Password",
    fieldAccount: "Gắn tài khoản Telegram (tùy chọn)",
    noAccountOption: "Chưa gắn tài khoản",
    create: "Tạo",
    toastAdded: "Đã thêm proxy.",
    toastAttached: "Đã gắn proxy với tài khoản Telegram.",
    toastDetached: "Đã bỏ gắn proxy khỏi tài khoản.",
    toastDeleted: "Đã xóa proxy.",
    confirmDelete: (name: string) => `Xóa proxy "${name}"? Các tài khoản đang gắn sẽ được bỏ proxy.`,
    validationError: "Hãy điền tên, Host / IP và port hợp lệ (1–65535).",
    errorFallback: "Không thể hoàn tất thao tác. Vui lòng thử lại.",
  } : {
    title: "Proxy",
    add: "Add proxy",
    recommendation: (
      <>
        <b>Recommendation:</b> use an HTTP/SOCKS5 proxy in the same country as your Telegram phone number to reduce the risk of Telegram flagging a new login session.
      </>
    ),
    colName: "Name",
    colHostPort: "Host:Port",
    colAuth: "Auth",
    colUsing: "In use",
    colStatus: "Status",
    authNo: "None",
    statusActive: "Active",
    statusPaused: "Paused",
    ariaDelete: (name: string) => `Delete ${name}`,
    attachTitle: (name: string) => (
      <>Attach account to <span className="text-[#1d3bb8]">{name}</span></>
    ),
    noAttached: "No accounts attached.",
    ariaDetach: (name: string) => `Detach ${name}`,
    selectAccount: "Select account",
    changeProxy: " · change proxy",
    attachBtn: "Attach",
    emptyTitle: "No proxies yet",
    emptyDetail: "Add an HTTP or SOCKS5 proxy, then attach it to a Telegram account you manage.",
    summary: (count: number, attached: number) => `Total: ${count} ${count === 1 ? "proxy" : "proxies"}, ${attached} account${attached === 1 ? "" : "s"} attached.`,
    modalTitle: "Add proxy",
    fieldType: "Proxy type",
    typeHttp: "HTTP (common)",
    typeSocks5: "SOCKS5",
    fieldName: "Display name",
    fieldHost: "Host / IP",
    fieldPort: "Port",
    fieldUsername: "Username",
    fieldPassword: "Password",
    fieldAccount: "Attach Telegram account (optional)",
    noAccountOption: "No account attached",
    create: "Create",
    toastAdded: "Proxy added.",
    toastAttached: "Proxy attached to Telegram account.",
    toastDetached: "Proxy detached from account.",
    toastDeleted: "Proxy deleted.",
    confirmDelete: (name: string) => `Delete proxy "${name}"? Any attached accounts will be unlinked.`,
    validationError: "Please enter a name, a Host / IP, and a valid port (1–65535).",
    errorFallback: "Could not complete the operation. Please try again.",
  };

  const errorText = (error: unknown) => localizedErrorMessage(error, language, copy.errorFallback);

  const proxies = useListProxies();
  const accounts = useListTelegramAccounts();
  const create = useCreateProxy();
  const [form, setForm] = useState<ProxyForm>(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [attachFor, setAttachFor] = useState<Record<string, string>>({});
  const connectedAccounts = useMemo(() => (accounts.data ?? []).filter((account) => account.status === "connected"), [accounts.data]);

  function openNew() {
    setForm(blankForm());
    setFormError(null);
    setShowForm(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const port = Number(form.port);
    if (!form.name.trim() || !form.host.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      setFormError(copy.validationError);
      return;
    }
    try {
      await create.mutateAsync({ data: {
        name: form.name.trim(),
        type: form.type,
        host: form.host.trim(),
        port,
        username: form.username || undefined,
        password: form.password || undefined,
        accountId: form.accountId || null,
      } });
      await Promise.all([proxies.refetch(), accounts.refetch()]);
      setShowForm(false);
      setToast(copy.toastAdded);
    } catch (error) {
      setFormError(errorText(error));
    }
  }

  async function attach(proxy: Proxy) {
    const accountId = attachFor[proxy.id];
    if (!accountId) return;
    try {
      await attachProxyAccount(proxy.id, accountId);
      await Promise.all([proxies.refetch(), accounts.refetch()]);
      setAttachFor((items) => ({ ...items, [proxy.id]: "" }));
      setToast(copy.toastAttached);
    } catch (error) {
      setToast(errorText(error));
    }
  }

  async function detach(proxy: Proxy, accountId: string) {
    try {
      await detachProxyAccount(proxy.id, accountId);
      await Promise.all([proxies.refetch(), accounts.refetch()]);
      setToast(copy.toastDetached);
    } catch (error) {
      setToast(errorText(error));
    }
  }

  async function remove(proxy: Proxy) {
    if (!window.confirm(copy.confirmDelete(proxy.name))) return;
    try {
      await deleteProxy(proxy.id);
      await Promise.all([proxies.refetch(), accounts.refetch()]);
      setToast(copy.toastDeleted);
    } catch (error) {
      setToast(errorText(error));
    }
  }

  const totalAttached = (proxies.data ?? []).reduce((total, proxy) => total + proxy.accountCount, 0);

  return (
    <AppLayout
      activePage="proxy"
      title={copy.title}
      hideUpgrade
      headerAction={
        <button onClick={openNew} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1d3bb8] px-4 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#19329c]" data-testid="proxy-add">
          <Plus className="h-4 w-4" />{copy.add}
        </button>
      }
    >
      <div className="mx-auto max-w-[980px]">
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-3.5 text-[13px] font-medium leading-relaxed text-[#92400e]">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#d97706]" />
          <p>{copy.recommendation}</p>
        </div>

        <Panel className="overflow-hidden">
          {proxies.isLoading ? (
            <div className="grid min-h-56 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-[#64748b]" /></div>
          ) : (proxies.data ?? []).length ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full text-left">
                  <thead className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[13px] font-bold text-[#64748b]">
                    <tr>
                      <th className="px-4 py-4 sm:px-5">{copy.colName}</th>
                      <th className="px-4 py-4">{copy.colHostPort}</th>
                      <th className="px-4 py-4">{copy.colAuth}</th>
                      <th className="px-4 py-4">{copy.colUsing}</th>
                      <th className="px-4 py-4">{copy.colStatus}</th>
                      <th className="px-4 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f6]">
                    {(proxies.data ?? []).map((proxy) => (
                      <tr key={proxy.id} data-testid={`proxy-row-${proxy.id}`}>
                        <td className="px-4 py-4 sm:px-5 text-[14px] font-extrabold text-[#0f172a]">
                          {proxy.name}
                          <p className="mt-1 text-[11px] font-semibold uppercase text-[#94a3b8]">{proxy.type}</p>
                        </td>
                        <td className="px-4 py-4 font-mono text-[13px] font-semibold text-[#334155]">{proxy.host}:{proxy.port}</td>
                        <td className="px-4 py-4">
                          {proxy.hasAuth
                            ? <span className="rounded-full border border-[#e2e8f0] px-2.5 py-1 text-[11px] font-extrabold text-[#334155]">user</span>
                            : <span className="text-[12px] font-semibold text-[#94a3b8]">{copy.authNo}</span>}
                        </td>
                        <td className="px-4 py-4"><span className="text-[14px] font-extrabold text-[#334155]">{proxy.accountCount}</span></td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ${proxy.status === "active" ? "bg-[#d1fae5] text-[#059669]" : "bg-[#f1f5f9] text-[#64748b]"}`}>
                            {proxy.status === "active" ? copy.statusActive : copy.statusPaused}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button onClick={() => void remove(proxy)} className="rounded-xl p-2 text-[#ef4444] hover:bg-[#fff1f2]" aria-label={copy.ariaDelete(proxy.name)}>
                            <Trash2 className="h-[18px] w-[18px]" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-[#eef2f6] border-t border-[#eef2f6]">
                {(proxies.data ?? []).map((proxy) => (
                  <div key={`${proxy.id}-accounts`} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-extrabold text-[#334155]">{copy.attachTitle(proxy.name)}</p>
                        {proxy.accounts.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {proxy.accounts.map((account) => (
                              <span key={account.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-bold text-[#1e40af]">
                                {account.name}{account.phone ? ` · ${account.phone}` : ""}
                                <button onClick={() => void detach(proxy, account.id)} aria-label={copy.ariaDetach(account.name)} className="ml-0.5 text-[#1d4ed8] hover:text-[#dc2626]">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-[12px] font-medium text-[#94a3b8]">{copy.noAttached}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={attachFor[proxy.id] ?? ""}
                          onChange={(event) => setAttachFor((items) => ({ ...items, [proxy.id]: event.target.value }))}
                          className="h-10 min-w-0 max-w-[220px] rounded-xl border border-[#dbe2ea] bg-white px-3 text-[13px] font-semibold outline-none focus:border-[#1d3bb8]"
                          data-testid={`proxy-account-${proxy.id}`}
                        >
                          <option value="">{copy.selectAccount}</option>
                          {connectedAccounts.filter((account) => account.proxyId !== proxy.id).map((account) => (
                            <option value={account.id} key={account.id}>{account.name}{account.proxyId ? copy.changeProxy : ""}</option>
                          ))}
                        </select>
                        <button onClick={() => void attach(proxy)} disabled={!attachFor[proxy.id]} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#eef2ff] px-3 text-[12px] font-extrabold text-[#1d3bb8] disabled:opacity-50">
                          <Link2 className="h-4 w-4" />{copy.attachBtn}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={Link2}
              title={copy.emptyTitle}
              detail={copy.emptyDetail}
              action={<PrimaryButton onClick={openNew}><Plus className="h-4 w-4" />{copy.add}</PrimaryButton>}
            />
          )}
        </Panel>

        <p className="mt-4 text-[13px] font-medium text-[#64748b]">{copy.summary((proxies.data ?? []).length, totalAttached)}</p>
      </div>

      {showForm && (
        <Modal title={copy.modalTitle} onClose={() => setShowForm(false)}>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{copy.fieldType}</span>
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ProxyForm["type"] })} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1d3bb8]" data-testid="proxy-type">
                <option value="http">{copy.typeHttp}</option>
                <option value="socks5">{copy.typeSocks5}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{copy.fieldName}</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="VN-HCM-01" className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1d3bb8]" data-testid="proxy-name" />
            </label>
            <div className="grid grid-cols-[1fr_130px] gap-3">
              <label className="block">
                <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{copy.fieldHost}</span>
                <input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} placeholder="proxy.example.com" className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1d3bb8]" data-testid="proxy-host" />
              </label>
              <label className="block">
                <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{copy.fieldPort}</span>
                <input type="number" min="1" max="65535" value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1d3bb8]" />
              </label>
            </div>
            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{copy.fieldUsername}</span>
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1d3bb8]" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{copy.fieldPassword}</span>
              <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] px-3.5 text-[14px] font-semibold outline-none focus:border-[#1d3bb8]" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[14px] font-bold text-[#0f172a]">{copy.fieldAccount}</span>
              <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3.5 text-[14px] font-semibold outline-none focus:border-[#1d3bb8]" data-testid="proxy-create-account">
                <option value="">{copy.noAccountOption}</option>
                {connectedAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            {formError && <p className="rounded-xl bg-[#fff1f2] px-3.5 py-3 text-[13px] font-semibold text-[#be123c]">{formError}</p>}
            <PrimaryButton type="submit" disabled={create.isPending} onClick={() => undefined}>
              {create.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}{copy.create}
            </PrimaryButton>
          </form>
        </Modal>
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}
