import { useMemo, useState } from "react";
import {
  getGetAdminActiveGroupDirectoryQueryKey,
  useGetAdminActiveGroupDirectory,
  type AdminActiveGroup,
} from "@workspace/api-client-react";
import {
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { AppLayout, EmptyState, Panel, SectionHeader } from "@/components/layout/AppLayout";

const text = {
  title: "Kho nhóm đang chạy",
  subtitle: "Các nhóm đang được sử dụng bởi campaign đang chờ hoặc đang chạy.",
  search: "Tìm theo tên nhóm, username, campaign hoặc người dùng...",
  activeGroups: "Nhóm đang hoạt động",
  relatedCampaigns: "Campaign liên quan",
  noGroups: "Chưa có nhóm nào đang được sử dụng.",
  noGroupsDetail: "Nhóm chỉ xuất hiện khi có campaign đang chờ hoặc đang chạy.",
  loading: "Đang tải danh sách nhóm...",
  loadError: "Không thể tải danh sách nhóm đang chạy.",
  retry: "Thử lại",
  openGroup: "Mở nhóm",
  privateGroup: "Nhóm riêng tư · Chưa có link tham gia",
  group: "Nhóm",
  forum: "Forum",
  members: "thành viên",
  campaignOwner: "Người dùng",
  telegramAccount: "Tài khoản gửi",
  roundDelay: "Delay vòng",
  seconds: "giây",
  activeCampaigns: "campaign active",
} as const;

function groupMatches(group: AdminActiveGroup, needle: string): boolean {
  if (!needle) return true;
  const groupFields = [group.title, group.username, group.kind];
  const campaignFields = group.campaigns.flatMap((campaign) => [
    campaign.name,
    campaign.ownerUsername,
    campaign.telegramAccountName,
  ]);
  return [...groupFields, ...campaignFields].some((value) => value?.toLowerCase().includes(needle));
}

function GroupCard({ group }: { group: AdminActiveGroup }) {
  return (
    <article
      className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm transition hover:border-[#bfdbfe] hover:shadow-md sm:p-5"
      data-testid={`card-admin-active-group-${group.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-extrabold text-[#0f172a]">{group.title}</h3>
            <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#1d4ed8]">
              {group.kind === "forum" ? text.forum : text.group}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#64748b]">
            {group.username && <span>@{group.username.replace(/^@/, "")}</span>}
            {group.memberCount !== null && <span>{group.memberCount.toLocaleString("vi-VN")} {text.members}</span>}
          </div>
        </div>
        {group.telegramLink ? (
          <a
            href={group.telegramLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1.5 text-[10px] font-extrabold text-[#1d4ed8] transition hover:bg-[#dbeafe]"
            data-testid={`link-admin-active-group-${group.id}`}
          >
            {text.openGroup}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="max-w-[145px] shrink-0 text-right text-[10px] font-semibold leading-tight text-[#94a3b8]">
            {text.privateGroup}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {group.campaigns.map((campaign) => (
          <div key={campaign.id} className="rounded-xl border border-[#eef2f6] bg-[#f8fafc] px-3 py-2.5">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-extrabold text-[#0f172a]">{campaign.name}</p>
                <p className="mt-0.5 truncate text-[10px] font-semibold text-[#64748b]">
                  {text.campaignOwner}: {campaign.ownerUsername} · {text.telegramAccount}: {campaign.telegramAccountName}
                </p>
              </div>
              <span className="shrink-0 text-[10px] font-extrabold text-[#1d4ed8]">
                {text.roundDelay}: {campaign.roundDelayMinSeconds}–{campaign.roundDelayMaxSeconds} {text.seconds}
              </span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function AdminActiveGroupsPage() {
  const [search, setSearch] = useState("");
  const query = useGetAdminActiveGroupDirectory({
    query: {
      queryKey: getGetAdminActiveGroupDirectoryQueryKey(),
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
    },
  });
  const groups = query.data?.groups ?? [];
  const needle = search.trim().toLowerCase();
  const filteredGroups = useMemo(
    () => groups.filter((group) => groupMatches(group, needle)),
    [groups, needle],
  );
  const campaignCount = groups.reduce((total, group) => total + group.campaigns.length, 0);

  return (
    <AppLayout activePage="admin-active-groups" title={text.title} subtitle={text.subtitle} hideUpgrade>
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Admin Center"
          title={text.title}
          detail={text.subtitle}
          action={(
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-3.5 py-2.5 text-[11px] font-extrabold text-[#1a2b88] transition hover:border-[#1a2b88] hover:bg-[#eef2fa] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="button-refresh-admin-active-groups"
            >
              {query.isFetching ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Làm mới
            </button>
          )}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Panel className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b]">{text.activeGroups}</p>
              <p className="mt-0.5 text-[22px] font-extrabold leading-none text-[#0f172a]">{groups.length}</p>
            </div>
          </Panel>
          <Panel className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ecfdf5] text-[#059669]">
              <RefreshCw className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b]">{text.relatedCampaigns}</p>
              <p className="mt-0.5 text-[22px] font-extrabold leading-none text-[#0f172a]">{campaignCount}</p>
            </div>
          </Panel>
        </div>

        <Panel className="p-4 sm:p-5">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={text.search}
              className="h-10 w-full rounded-xl border border-[#dbe2ea] pl-9 pr-3 text-[12px] font-semibold outline-none transition focus:border-[#1a2b88]"
              data-testid="input-search-admin-active-groups"
            />
          </label>
        </Panel>

        {query.isLoading && (
          <Panel className="p-10 text-center text-[13px] font-semibold text-[#64748b]">{text.loading}</Panel>
        )}
        {query.error && !query.isLoading && (
          <Panel className="p-8 text-center">
            <p className="text-[13px] font-semibold text-[#be123c]">{text.loadError}</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1a2b88] px-3 py-2 text-[11px] font-extrabold text-white hover:bg-[#152473]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {text.retry}
            </button>
          </Panel>
        )}
        {!query.isLoading && !query.error && !filteredGroups.length && (
          <EmptyState icon={Users} title={needle ? "Không tìm thấy nhóm phù hợp." : text.noGroups} detail={needle ? "" : text.noGroupsDetail} />
        )}
        {!query.isLoading && !query.error && filteredGroups.length > 0 && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredGroups.map((group) => <GroupCard key={group.id} group={group} />)}
          </div>
        )}
      </div>
    </AppLayout>
  );
}