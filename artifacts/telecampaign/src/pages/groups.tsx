import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Info, X } from "lucide-react";
import { type Destination, getListDestinationsQueryKey, getListTelegramAccountsQueryKey, useListDestinations, useListTelegramAccounts, useSyncTelegramDestinations } from "@workspace/api-client-react";
import { AppLayout, Modal, Toast } from "@/components/layout/AppLayout";
import { GroupsCompactView } from "@/components/groups/GroupsCompactView";
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
  const queryClient = useQueryClient();
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
  const [syncing, setSyncing] = useState(false);
  const syncLocked = useRef(false);

  const copy = vi ? {
    title: "Nhóm",
    add: "Thêm nhóm",
    sync: "Đồng bộ",
    syncing: "Đang đồng bộ",
    export: "Xuất nhóm",
    search: "Tìm theo tiêu đề, chatId, username...",
    allAccounts: "Tất cả tài khoản",
    total: "Tổng số điểm gửi",
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
    kindForum: "Nhóm chủ đề",
    kindTopic: "Chủ đề",
    generalTopic: "Chung",
    parentGroup: "Nhóm cha",
    topicId: "Topic ID",
    eyebrow: "Quản lý không gian",
    subtitle: "Quản lý các nhóm, kênh và chủ đề được phép đăng bài.",
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
    total: "Total destinations",
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
    kindForum: "Forum group",
    kindTopic: "Topic",
    generalTopic: "General",
    parentGroup: "Parent group",
    topicId: "Topic ID",
    eyebrow: "Workspace management",
    subtitle: "Manage groups, channels, and topics approved for publishing.",
    toolsTitle: "Tools",
    toolsSubtitle: "Quick actions for the current group data",
    noAccountToast: "Connect a Telegram account before syncing.",
    loading: "Loading groups...",
  };

  const accountName = (accountId: string) => accounts.data?.find((account) => account.id === accountId)?.name ?? accountId;
  const destinationLabel = (destination: Destination) => {
    if (destination.kind === "topic") return `${destination.parentTitle ?? "Telegram"} › ${destination.title}`;
    if (destination.kind === "forum") return `${destination.title} › ${copy.generalTopic}`;
    return destination.title;
  };
  const destinationKind = (destination: Destination) => {
    if (destination.kind === "topic") return copy.kindTopic;
    if (destination.kind === "forum") return copy.kindForum;
    return destination.kind === "channel" ? copy.kindChannel : copy.kindGroup;
  };
  const scopedRows = rows.filter(item => accountFilter === "all" || item.accountId === accountFilter);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((item) => {
      const accountMatches = accountFilter === "all" || item.accountId === accountFilter;
      const statusMatches = statusFilter === "all" || (statusFilter === "active" ? item.canPost : !item.canPost);
      const searchMatches = !needle || [
        item.title,
        item.parentTitle ?? "",
        item.topicId?.toString() ?? "",
        item.username ?? "",
        item.telegramId,
        item.accountId,
        accountName(item.accountId),
      ].some((value) => value.toLowerCase().includes(needle));
      return accountMatches && statusMatches && searchMatches;
    });
  }, [accountFilter, rows, query, statusFilter, accounts.data]);

  const syncAll = () => {
    if (syncLocked.current) return;
    // Snapshot the chosen scope once; never fall back to syncing other accounts.
    const connected = (accounts.data ?? []).filter((account) => account.status === "connected"
      && (accountFilter === "all" || account.id === accountFilter));
    if (!connected.length) {
      setToast(copy.noAccountToast);
      return;
    }
    syncLocked.current = true;
    setSyncing(true);
    void Promise.allSettled(connected.map((account) => sync.mutateAsync({ accountId: account.id })))
      .then(async results => {
        await Promise.all([
          queryClient.invalidateQueries({queryKey: getListDestinationsQueryKey()}),
          queryClient.invalidateQueries({queryKey: getListTelegramAccountsQueryKey()}),
        ]);
        const current = queryClient.getQueryData<Destination[]>(getListDestinationsQueryKey());
        setSelected(previous => previous && current && !current.some(row => row.id === previous.id) ? null : previous);
        const failed = results.filter(result => result.status === "rejected").length;
        setToast(!failed ? copy.syncDone : failed === results.length ? copy.syncError
          : vi ? "Đã cập nhật các tài khoản đồng bộ thành công. Một số tài khoản chưa đồng bộ được, vui lòng thử lại."
            : "Successfully synced accounts have been updated. Some accounts could not sync; please retry.");
      })
      .catch(() => setToast(copy.syncError))
      .finally(() => {
        syncLocked.current = false;
        setSyncing(false);
      });
  };

  const exportGroups = () => {
    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const header = ["title", "parent_group", "topic_id", "status", "account_id", "chat_id", "username", "members"];
    const content = [
      header.join(","),
      ...visible.map((item) => [
        destinationLabel(item),
        item.parentTitle ?? "",
        item.topicId?.toString() ?? "",
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

  return (
    <AppLayout
      activePage="groups"
      title={copy.title}
      hideUpgrade
    >
      <GroupsCompactView
        accounts={accounts.data ?? []} accountsLoading={accounts.isLoading}
        accountFilter={accountFilter} onAccountFilter={setAccountFilter}
        statusFilter={statusFilter} onStatusFilter={setStatusFilter}
        statusOptions={statusOptions[language === "vi" ? "vi" : "en"]}
        query={query} onQuery={setQuery} scopedRows={scopedRows} visible={visible}
        loading={destinations.isLoading} loadError={destinations.isError}
        onRetry={() => { void destinations.refetch(); void accounts.refetch(); }}
        syncing={syncing} onSync={syncAll} onExport={exportGroups}
        onSelect={setSelected} labels={copy} accountName={accountName}
        destinationLabel={destinationLabel} destinationKind={destinationKind}
      />

      {selected && <Modal title={destinationLabel(selected)} description={`${destinationKind(selected)} · ${selected.username ? `@${selected.username}` : selected.telegramId}`} onClose={() => setSelected(null)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#e5eaf0] bg-[#f8fafc] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#94a3b8]">{copy.members}</p><p className="mt-2 text-[21px] font-extrabold text-[#0f172a]">{selected.memberCount?.toLocaleString() ?? "—"}</p></div>
            <div className="rounded-2xl border border-[#e5eaf0] bg-[#f8fafc] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#94a3b8]">{copy.permission}</p><p className={`mt-2 text-[14px] font-extrabold ${selected.canPost ? "text-[#059669]" : "text-[#e11d48]"}`}>{selected.canPost ? copy.allowed : copy.restricted}</p></div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" /><p className="text-[13px] font-medium leading-relaxed text-[#475569]">{selected.permissionReason ?? copy.noPermissionReason}</p></div>
          <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-[#e5eaf0] p-4 text-[12px]">
            <div className="min-w-0"><dt className="text-[#64748b]">{copy.managedBy}</dt><dd className="mt-1 break-words font-bold">{accountName(selected.accountId)}</dd></div>
            <div className="min-w-0"><dt className="text-[#64748b]">{copy.chatId}</dt><dd dir="ltr" className="mt-1 break-all font-mono">{selected.telegramId}</dd></div>
            <div className="min-w-0"><dt className="text-[#64748b]">{copy.username}</dt><dd className="mt-1 break-all font-bold">{selected.username ? `@${selected.username}` : copy.noUsername}</dd></div>
            {selected.kind === "topic" && <div><dt className="text-[#64748b]">{copy.topicId}</dt><dd className="mt-1 font-mono">{selected.topicId ?? "—"}</dd></div>}
            {(selected.parentTitle || selected.kind === "forum") && <div className="col-span-2"><dt className="text-[#64748b]">{copy.parentGroup}</dt><dd className="mt-1 break-words font-bold">{selected.parentTitle ?? selected.title}</dd></div>}
          </dl>
          <div className="flex justify-end"><button onClick={() => setSelected(null)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f1f5f9] px-4 text-[13px] font-extrabold text-[#475569] hover:bg-[#e2e8f0]"><X className="h-4 w-4" />{copy.close}</button></div>
        </div>
      </Modal>}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppLayout>
  );
}