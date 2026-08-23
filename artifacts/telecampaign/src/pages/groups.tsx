import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  Filter,
  Info,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { type Destination, useListDestinations, useListTelegramAccounts, useSyncTelegramDestinations } from "@workspace/api-client-react";
import { AppLayout, Modal, Panel, Toast } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";

const statusOptions = {
  vi: [
    { value: "all", label: "Tất cả trạng thái" },
    { value: "active", label: "Đang bật" },
    { value: "restricted", label: "Đang tắt" },
  ],
  en: [
    { value: "all", label: "All statuses" },
    { value: "active", label: "Enabled" },
    { value: "restricted", label: "Disabled" },
  ],
} as const;

export default function Groups() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const destinations = useListDestinations();
  const accounts = useListTelegramAccounts();
  const sync = useSyncTelegramDestinations();
  const rows = destinations.data ?? [];
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Destination | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const copy = vi ? {
    title: "Nhóm",
    add: "Thêm nhóm",
    sync: "Đồng bộ",
    syncing: "Đang đồng bộ",
    export: "Xuất nhóm",
    search: "Tìm theo tiêu đề, chatId, username...",
    allAccounts: "Tất cả tài khoản",
    total: "Tổng số nhóm",
    enabled: "Nhóm đang bật",
    disabled: "Nhóm đang tắt",
    connected: "tài khoản đã kết nối",
    managedBy: "Tài khoản quản lý",
    chatId: "Chat ID",
    username: "Username",
    lastSent: "Gửi gần nhất",
    members: "thành viên",
    on: "Bật",
    off: "Tắt",
    details: "Chi tiết nhóm",
    permission: "Quyền đăng bài",
    allowed: "Được phép",
    restricted: "Bị giới hạn",
    noUsername: "Không có username",
    empty: "Không tìm thấy nhóm phù hợp",
    emptyHint: "Thử đổi từ khóa hoặc bộ lọc, hoặc đồng bộ lại dữ liệu Telegram.",
    showing: "Hiển thị",
    of: "trên",
    groups: "nhóm",
    syncDone: "Đã đồng bộ danh sách nhóm",
    syncError: "Không thể đồng bộ nhóm. Hãy kiểm tra tài khoản Telegram.",
    exportDone: "Đã xuất danh sách nhóm CSV",
    close: "Đóng",
    noPermissionReason: "Quyền đăng được kiểm tra từ Telegram trong lần đồng bộ gần nhất.",
    kindChannel: "Kênh",
    kindGroup: "Nhóm",
    eyebrow: "Quản lý không gian",
    subtitle: "Quản lý các nhóm và kênh được phép đăng bài.",
    toolsTitle: "Công cụ",
    toolsSubtitle: "Thao tác nhanh trên dữ liệu nhóm hiện tại",
    noAccountToast: "Hãy kết nối tài khoản Telegram trước khi đồng bộ.",
    loading: "Đang tải danh sách nhóm...",
  } : {
    title: "Groups",
    add: "Add group",
    sync: "Sync",
    syncing: "Syncing",
    export: "Export groups",
    search: "Search by title, chatId, username...",
    allAccounts: "All accounts",
    total: "Total groups",
    enabled: "Enabled groups",
    disabled: "Disabled groups",
    connected: "connected accounts",
    managedBy: "Managed by",
    chatId: "Chat ID",
    username: "Username",
    lastSent: "Last sent",
    members: "members",
    on: "On",
    off: "Off",
    details: "Group details",
    permission: "Posting permission",
    allowed: "Allowed",
    restricted: "Restricted",
    noUsername: "No username",
    empty: "No groups match this view",
    emptyHint: "Try another search or filter, or sync Telegram data again.",
    showing: "Showing",
    of: "of",
    groups: "groups",
    syncDone: "Group list synced",
    syncError: "Could not sync groups. Check your Telegram account.",
    exportDone: "Group list exported as CSV",
    close: "Close",
    noPermissionReason: "Posting permission was checked by Telegram during the latest sync.",
    kindChannel: "Channel",
    kindGroup: "Group",
    eyebrow: "Workspace management",
    subtitle: "Manage groups and channels approved for publishing.",
    toolsTitle: "Tools",
    toolsSubtitle: "Quick actions for the current group data",
    noAccountToast: "Connect a Telegram account before syncing.",
    loading: "Loading groups...",
  };

  const accountName = (accountId: string) => accounts.data?.find((account) => account.id === accountId)?.name ?? accountId;
  const connectedAccounts = (accounts.data ?? []).filter((account) => account.status === "connected").length;
  const enabledCount = rows.filter((item) => item.canPost).length;
  const disabledCount = rows.length - enabledCount;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((item) => {
      const accountMatches = accountFilter === "all" || item.accountId === accountFilter;
      const statusMatches = statusFilter === "all" || (statusFilter === "active" ? item.canPost : !item.canPost);
      const searchMatches = !needle || [
        item.title,
        item.username ?? "",
        item.telegramId,
        item.accountId,
        accountName(item.accountId),
      ].some((value) => value.toLowerCase().includes(needle));
      return accountMatches && statusMatches && searchMatches;
    });
  }, [accountFilter, rows, query, statusFilter, accounts.data]);

  const syncAll = () => {
    const connected = (accounts.data ?? []).filter((account) => account.status === "connected");
    if (!connected.length) {
      setToast(copy.noAccountToast);
      return;
    }
    void Promise.all(connected.map((account) => sync.mutateAsync({ accountId: account.id })))
      .then(() => {
        void destinations.refetch();
        setToast(copy.syncDone);
      })
      .catch(() => setToast(copy.syncError));
  };

  const exportGroups = () => {
    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const header = ["title", "status", "account_id", "chat_id", "username", "members"];
    const content = [
      header.join(","),
      ...visible.map((item) => [
        item.title,
        item.canPost ? "enabled" : "disabled",
        item.accountId,
        item.telegramId,
        item.username ? `@${item.username}` : "",
        item.memberCount?.toString() ?? "",
      ].map(escapeCsv).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "telecampaign-groups.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setToast(copy.exportDone);
  };

  const accountOptions = accounts.data ?? [];
  const statCards = [
    { label: copy.total, value: rows.length, icon: Users, tone: "blue" },
    { label: copy.enabled, value: enabledCount, icon: Send, tone: "green" },
    { label: copy.disabled, value: disabledCount, icon: SlidersHorizontal, tone: "orange" },
  ] as const;

  return (
    <AppLayout
      activePage="groups"
      title={copy.title}
      hideUpgrade
      headerAction={
        <button onClick={syncAll} disabled={sync.isPending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1a2b88] px-4 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-[#152473] disabled:cursor-not-allowed disabled:opacity-60" data-testid="groups-add">
          <span className="text-[18px] leading-none">+</span>{copy.add}
        </button>
      }
    >
      <div className="mx-auto max-w-[1060px]">
        <div className="mb-5 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#64748b]">{copy.eyebrow}</p>
            <h2 className="text-[25px] font-extrabold tracking-tight text-[#0f172a]">{copy.title}</h2>
            <p className="mt-1.5 text-[14px] font-medium text-[#64748b]">{copy.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-bold text-[#64748b]">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" />
            {connectedAccounts} {copy.connected}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2.5 sm:mb-6 sm:gap-4">
          {statCards.map(({ label, value, icon: Icon, tone }) => (
            <Panel key={label} className="p-3.5 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase leading-tight tracking-[0.08em] text-[#64748b] sm:text-[11px]">{label}</span>
                <span className={`hidden h-9 w-9 place-items-center rounded-xl sm:grid ${tone === "green" ? "bg-[#ecfdf5] text-[#059669]" : tone === "orange" ? "bg-[#fff7ed] text-[#ea580c]" : "bg-[#eff6ff] text-[#2563eb]"}`}><Icon className="h-4 w-4" /></span>
              </div>
              <strong className="mt-2 block text-[25px] font-extrabold tracking-tight text-[#0f172a] sm:mt-4 sm:text-[30px]">{value}</strong>
            </Panel>
          ))}
        </div>

        <Panel className="overflow-hidden">
          <div className="border-b border-[#eef2f6] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-extrabold text-[#0f172a]">{copy.toolsTitle}</h3>
                <p className="mt-1 text-[12px] font-medium text-[#94a3b8]">{copy.toolsSubtitle}</p>
              </div>
              <Info className="h-4 w-4 text-[#94a3b8]" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={syncAll} disabled={sync.isPending} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-3.5 text-[13px] font-bold text-[#1e293b] transition hover:border-[#94a3b8] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60" data-testid="groups-sync">
                <RefreshCw className={`h-4 w-4 text-[#334155] ${sync.isPending ? "animate-spin" : ""}`} />{sync.isPending ? copy.syncing : copy.sync}
              </button>
              <button onClick={exportGroups} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-3.5 text-[13px] font-bold text-[#1e293b] transition hover:border-[#94a3b8] hover:bg-[#f8fafc]" data-testid="groups-export">
                <ArrowDownToLine className="h-4 w-4 text-[#334155]" />{copy.export}
              </button>
            </div>
          </div>

          <div className="border-b border-[#eef2f6] bg-[#fbfcfe] p-4 sm:p-5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#94a3b8]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="h-12 w-full rounded-2xl border border-[#dbe2ea] bg-white pl-11 pr-4 text-[14px] font-semibold text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#1a2b88] focus:ring-4 focus:ring-[#1a2b88]/10" data-testid="groups-search" />
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <label className="relative block">
                <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[#dbe2ea] bg-white pl-10 pr-9 text-[13px] font-bold text-[#334155] outline-none focus:border-[#1a2b88]">
                  <option value="all">{copy.allAccounts}</option>
                  {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
              </label>
              <label className="relative block">
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[#dbe2ea] bg-white px-4 pr-9 text-[13px] font-bold text-[#334155] outline-none focus:border-[#1a2b88]">
                  {statusOptions[language].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
              </label>
            </div>
          </div>

          <div className="space-y-3 p-3.5 sm:p-5">
            {destinations.isLoading ? (
              <div className="grid min-h-48 place-items-center text-[13px] font-bold text-[#64748b]"><RefreshCw className="mb-3 h-6 w-6 animate-spin text-[#94a3b8]" />{copy.loading}</div>
            ) : visible.length ? visible.map((item) => (
              <button key={item.id} onClick={() => setSelected(item)} className="group w-full rounded-2xl border border-[#e5eaf0] bg-white p-4 text-left shadow-[0_2px_8px_rgba(15,23,42,0.03)] transition hover:border-[#b8c4db] hover:shadow-[0_8px_20px_rgba(15,23,42,0.07)] sm:p-5" data-testid={`group-card-${item.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.kind === "channel" ? "bg-[#eef2ff] text-[#4f46e5]" : "bg-[#eff6ff] text-[#2563eb]"}`}><MessageCircle className="h-[18px] w-[18px]" /></span>
                    <div className="min-w-0">
                      <h4 className="truncate text-[15px] font-extrabold text-[#0f172a] group-hover:text-[#1a2b88]">{item.title}</h4>
                      <p className="mt-1 truncate text-[12px] font-medium text-[#64748b]">{item.memberCount?.toLocaleString()} {copy.members}</p>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${item.canPost ? "bg-[#eaf8f1] text-[#059669]" : "bg-[#fff1f2] text-[#e11d48]"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{item.canPost ? copy.on : copy.off}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#f1f4f7] pt-4 sm:grid-cols-4">
                  <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#94a3b8]">{copy.managedBy}</p><p className="mt-1 truncate text-[12px] font-bold text-[#334155]" title={item.accountId}>{accountName(item.accountId)}</p></div>
                  <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#94a3b8]">{copy.chatId}</p><p className="mt-1 truncate font-mono text-[12px] font-bold text-[#334155]">{item.telegramId}</p></div>
                  <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#94a3b8]">{copy.username}</p><p className="mt-1 truncate text-[12px] font-bold text-[#334155]">{item.username ? `@${item.username}` : copy.noUsername}</p></div>
                  <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#94a3b8]">{copy.lastSent}</p><p className="mt-1 text-[12px] font-bold text-[#334155]">—</p></div>
                </div>
              </button>
            )) : (
              <div className="grid min-h-48 place-items-center px-5 text-center">
                <div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f1f5f9] text-[#94a3b8]"><Search className="h-5 w-5" /></span><h3 className="mt-4 text-[15px] font-extrabold text-[#334155]">{copy.empty}</h3><p className="mt-1.5 text-[13px] font-medium text-[#94a3b8]">{copy.emptyHint}</p></div>
              </div>
            )}
          </div>
          <div className="border-t border-[#eef2f6] px-4 py-3.5 text-[11px] font-bold text-[#94a3b8] sm:px-5">{copy.showing} {visible.length} {copy.of} {rows.length} {copy.groups}</div>
        </Panel>
      </div>

      {selected && <Modal title={selected.title} description={`${selected.kind === "channel" ? copy.kindChannel : copy.kindGroup} · ${selected.username ? `@${selected.username}` : selected.telegramId}`} onClose={() => setSelected(null)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#e5eaf0] bg-[#f8fafc] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#94a3b8]">{copy.members}</p><p className="mt-2 text-[21px] font-extrabold text-[#0f172a]">{selected.memberCount?.toLocaleString() ?? "—"}</p></div>
            <div className="rounded-2xl border border-[#e5eaf0] bg-[#f8fafc] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#94a3b8]">{copy.permission}</p><p className={`mt-2 text-[14px] font-extrabold ${selected.canPost ? "text-[#059669]" : "text-[#e11d48]"}`}>{selected.canPost ? copy.allowed : copy.restricted}</p></div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" /><p className="text-[13px] font-medium leading-relaxed text-[#475569]">{selected.permissionReason ?? copy.noPermissionReason}</p></div>
          <div className="flex justify-end"><button onClick={() => setSelected(null)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f1f5f9] px-4 text-[13px] font-extrabold text-[#475569] hover:bg-[#e2e8f0]"><X className="h-4 w-4" />{copy.close}</button></div>
        </div>
      </Modal>}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}