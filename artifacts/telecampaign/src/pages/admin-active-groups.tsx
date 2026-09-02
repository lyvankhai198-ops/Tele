import { useEffect, useMemo, useRef, useState } from "react";
import {
  getGetAdminActiveGroupDirectoryQueryKey,
  getGetGroupLibraryQueryKey,
  getListCampaignsQueryKey,
  getListDestinationsQueryKey,
  getListTelegramAccountsQueryKey,
  useGetAdminActiveGroupDirectory,
  useGetGroupLibrary,
  useGetGroupLibraryAccess,
  useListCampaigns,
  useListDestinations,
  useListTelegramAccounts,
  useImportAdminGroupLibraryEntry,
  useUpdateAdminGroupLibraryEntry,
  useSyncTelegramDestinations,
  useSyncAdminGroupLibrary,
  type AdminActiveGroup,
  type Campaign,
  type Destination,
  type TelegramAccount,
} from "@workspace/api-client-react";
import {
  ExternalLink,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { CampaignFormModal, type CampaignFormPrefill } from "@/components/campaign-form-modal";
import { AppLayout, EmptyState, Panel, SectionHeader } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";

const text = {
  title: "Thư Viện Nhóm",
  subtitle: "Chỉ lưu nhóm mới từ campaign đang chạy của tất cả user.",
  search: "Tìm theo tên nhóm hoặc username...",
  savedGroups: "Nhóm đã lưu",
  noGroups: "Thư Viện Nhóm chưa có nhóm nào.",
  noGroupsDetail: "Đồng bộ thư viện để lấy nhóm từ các campaign đang chạy.",
  loading: "Đang tải danh sách nhóm...",
  loadError: "Không thể tải Thư Viện Nhóm.",
  retry: "Thử lại",
  sync: "Đồng bộ thư viện",
  syncing: "Đang đồng bộ...",
  syncFailed: "Không thể đồng bộ thư viện. Vui lòng thử lại.",
  syncAccountsFailed: "Đã cập nhật thư viện nhưng một hoặc nhiều tài khoản Telegram chưa đồng bộ được.",
  syncCompleted: (accountCount: number, addedCount: number) =>
    `Đã đồng bộ ${accountCount} tài khoản Telegram${addedCount > 0 ? ` và phát hiện ${addedCount} nhóm mới đang chờ import` : ""}.`,
  noConnectedAccounts: "Chưa có tài khoản Telegram đã kết nối để đồng bộ.",
  syncAdded: (count: number) => `Đã phát hiện ${count} nhóm mới. Hãy import từng nhóm vào thư viện.`,
  syncNoNewGroup: "Không phát hiện nhóm mới từ campaign đang chạy.",
  newGroup: "Mới",
  importGroup: "Import vào thư viện",
  importingGroup: "Đang import...",
  importSuccess: (title: string) => `Đã import “${title}” vào thư viện user.`,
  importFailed: "Không thể import nhóm vào thư viện. Vui lòng thử lại.",
  openGroup: "Mở nhóm",
  trialVisible: "Hiển thị trong trial",
  trialTitle: "Tên hiển thị trial",
  trialTitlePlaceholder: "Nhập tên hiển thị cho user chưa nâng cấp",
  saveTrial: "Lưu cấu hình trial",
  savingTrial: "Đang lưu...",
  trialSaved: "Đã lưu cấu hình trial.",
  trialSaveFailed: "Không thể lưu cấu hình trial.",
  trialLimit: (count: number) => `Đã chọn ${count}/2 nhóm trial`,
  privateGroup: "Nhóm riêng tư · Chưa có link tham gia",
  group: "Nhóm",
  forum: "Forum",
  members: "thành viên",
  roundDelay: "Delay vòng",
  seconds: "giây",
  accounts: "Tài khoản Telegram",
  accountLoading: "Đang tải trạng thái tài khoản...",
  joined: "Đã tham gia",
  joinedNeedsReview: "Đã tham gia · chưa xác minh quyền gửi",
  notJoined: "Chưa tham gia / chưa đồng bộ",
  noAccounts: "Chưa có tài khoản Telegram nào.",
  quickCreate: "Tạo nhanh",
  needJoinedAccount: "Cần tài khoản đã tham gia và có quyền gửi",
  preferredDelay: "Ưu tiên",
  noDelayHistory: "Chưa có dữ liệu",
  delayHistory: (errorRate: number, sampleCount: number) =>
    `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(errorRate * 100)}% lỗi · ${sampleCount.toLocaleString("vi-VN")} lượt`,
  delayOutcomeTitle: (sentCount: number, errorCount: number) =>
    `${sentCount.toLocaleString("vi-VN")} thành công · ${errorCount.toLocaleString("vi-VN")} lỗi`,
  configuredCampaigns: "Campaign đang dùng nhóm này",
  noConfiguredCampaigns: "Chưa có campaign nào của admin dùng nhóm này.",
  attachedAccount: "Tài khoản",
  noAttachedAccount: "Chưa gắn tài khoản",
  editCampaign: "Chỉnh sửa",
  createdCampaign: "Đã tạo campaign từ nhóm.",
  updatedCampaign: "Đã cập nhật campaign.",
} as const;

const workspaceText = {
  vi: {
    title: "Thư Viện Nhóm ( MMO )",
    subtitle: "",
    eyebrow: "Không gian làm việc",
    lockedTitle: "Cần nâng cấp để mở link nhóm",
    lockedDetail: (plan: string) => `Gói hiện tại chưa đủ điều kiện. Nâng cấp lên ${plan.toUpperCase()} hoặc cao hơn để mở link Telegram.`,
    noGroups: "Chưa có nhóm nào trong Thư Viện Nhóm ( MMO ).",
    noGroupsDetail: "Vui lòng quay lại sau khi thư viện được cập nhật.",
    noSearchResults: "Không tìm thấy nhóm phù hợp.",
    loading: "Đang tải Thư Viện Nhóm ( MMO )...",
    loadError: "Không thể tải Thư Viện Nhóm ( MMO ).",
    retry: "Thử lại",
    search: "Tìm theo tên nhóm hoặc username...",
    savedGroups: "Nhóm trong Thư Viện Nhóm ( MMO )",
    lockedButton: "Nâng cấp để mở",
    openGroup: "Tham gia nhóm",
    hiddenGroupName: "Tên nhóm được ẩn",
    group: "Nhóm",
    forum: "Forum",
    members: "thành viên",
    roundDelay: "Delay vòng",
    seconds: "giây",
    quickCreate: "Tạo nhanh",
    sync: "Đồng bộ tài khoản",
    syncing: "Đang đồng bộ...",
    syncFailed: "Không thể đồng bộ tài khoản Telegram. Vui lòng thử lại.",
    syncAccountsFailed: "Một hoặc nhiều tài khoản Telegram chưa đồng bộ được.",
    syncCompleted: (accountCount: number) => `Đã đồng bộ ${accountCount} tài khoản Telegram.`,
    noConnectedAccounts: "Chưa có tài khoản Telegram đã kết nối để đồng bộ.",
    accounts: "Tài khoản Telegram",
    accountLoading: "Đang tải trạng thái tài khoản...",
    joined: "Đã tham gia",
    joinedNeedsReview: "Đã tham gia · chưa xác minh quyền gửi",
    notJoined: "Chưa tham gia / chưa đồng bộ",
    noAccounts: "Chưa có tài khoản Telegram nào.",
    configuredCampaigns: "Campaign đang dùng nhóm này",
    noConfiguredCampaigns: "Bạn chưa có campaign nào dùng nhóm này.",
    attachedAccount: "Tài khoản",
    noAttachedAccount: "Chưa gắn tài khoản",
    needJoinedAccount: "Cần tài khoản đã tham gia và có quyền gửi",
    preferredDelay: "Ưu tiên",
    noDelayHistory: "Chưa có dữ liệu",
    delayHistory: (errorRate: number, sampleCount: number) =>
      `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(errorRate * 100)}% lỗi · ${sampleCount.toLocaleString("vi-VN")} lượt`,
    delayOutcomeTitle: (sentCount: number, errorCount: number) =>
      `${sentCount.toLocaleString("vi-VN")} thành công · ${errorCount.toLocaleString("vi-VN")} lỗi`,
    createdCampaign: "Đã tạo campaign từ nhóm.",
    updatedCampaign: "Đã cập nhật campaign.",
  },
  en: {
    title: "Group Library (MMO)",
    subtitle: "",
    eyebrow: "Workspace",
    lockedTitle: "Upgrade to open group links",
    lockedDetail: (plan: string) => `Your current plan cannot open group links. Upgrade to ${plan.toUpperCase()} or higher to open Telegram links.`,
    noGroups: "No groups are available in Group Library (MMO) yet.",
    noGroupsDetail: "Please check back after the library is updated.",
    noSearchResults: "No matching groups found.",
    loading: "Loading Group Library (MMO)...",
    loadError: "Could not load Group Library (MMO).",
    retry: "Retry",
    search: "Search by group name or username...",
    savedGroups: "Groups in Group Library (MMO)",
    lockedButton: "Upgrade to open",
    openGroup: "Join group",
    hiddenGroupName: "Group name hidden",
    group: "Group",
    forum: "Forum",
    members: "members",
    roundDelay: "Round delay",
    seconds: "sec",
    quickCreate: "Quick create",
    sync: "Sync accounts",
    syncing: "Syncing...",
    syncFailed: "Could not sync Telegram accounts. Please try again.",
    syncAccountsFailed: "One or more Telegram accounts could not be synchronized.",
    syncCompleted: (accountCount: number) => `${accountCount} Telegram account${accountCount === 1 ? "" : "s"} synchronized.`,
    noConnectedAccounts: "No connected Telegram account is available to synchronize.",
    accounts: "Telegram accounts",
    accountLoading: "Loading account status...",
    joined: "Joined",
    joinedNeedsReview: "Joined · posting permission unverified",
    notJoined: "Not joined / not synchronized",
    noAccounts: "No Telegram accounts yet.",
    configuredCampaigns: "Campaigns using this group",
    noConfiguredCampaigns: "You have no campaigns using this group.",
    attachedAccount: "Account",
    noAttachedAccount: "No account attached",
    needJoinedAccount: "A joined account with posting permission is required",
    preferredDelay: "Preferred",
    noDelayHistory: "No history yet",
    delayHistory: (errorRate: number, sampleCount: number) =>
      `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(errorRate * 100)}% errors · ${sampleCount.toLocaleString("en-US")} deliveries`,
    delayOutcomeTitle: (sentCount: number, errorCount: number) =>
      `${sentCount.toLocaleString("en-US")} successful · ${errorCount.toLocaleString("en-US")} errors`,
    createdCampaign: "Campaign created from this group.",
    updatedCampaign: "Campaign updated.",
  },
} as const;

const HIDDEN_GROUP_TITLE = "••••••••••";

function groupMatches(group: AdminActiveGroup, needle: string): boolean {
  if (!needle) return true;
  const groupFields = [group.title, group.username, group.kind];
  const delayFields = group.roundDelays.flatMap((delay) => [
    delay.minSeconds.toString(),
    delay.maxSeconds.toString(),
  ]);
  return [...groupFields, ...delayFields].some((value) => value?.toLowerCase().includes(needle));
}

type GroupCardProps = {
  group: AdminActiveGroup;
  accounts: TelegramAccount[];
  destinations: Destination[];
  campaigns: Campaign[];
  accountDataLoading: boolean;
  onCreate: (group: AdminActiveGroup, delay?: AdminActiveGroup["roundDelays"][number], preferredAccountId?: string) => void;
  onEdit: (campaign: Campaign) => void;
  onImport: (group: AdminActiveGroup) => void;
  onSaveTrial: (group: AdminActiveGroup, trialVisible: boolean, trialTitle: string) => void;
  trialSaving: boolean;
  importDisabled: boolean;
  importing: boolean;
  mode: "admin" | "workspace";
  canOpenLinks: boolean;
  openGroupLabel: string;
  groupLabel: string;
  forumLabel: string;
  membersLabel: string;
  lockedButtonLabel: string;
  hiddenGroupNameLabel: string;
  numberLocale: string;
  roundDelayLabel: string;
  secondsLabel: string;
  quickCreateLabel: string;
  accountsLabel: string;
  accountLoadingLabel: string;
  joinedLabel: string;
  joinedNeedsReviewLabel: string;
  notJoinedLabel: string;
  noAccountsLabel: string;
  configuredCampaignsLabel: string;
  noConfiguredCampaignsLabel: string;
  attachedAccountLabel: string;
  noAttachedAccountLabel: string;
  needJoinedAccountLabel: string;
  preferredDelayLabel: string;
  noDelayHistoryLabel: string;
  delayHistoryLabel: (errorRate: number, sampleCount: number) => string;
  delayOutcomeTitleLabel: (sentCount: number, errorCount: number) => string;
};

function GroupCard({
  group,
  accounts,
  destinations,
  campaigns,
  accountDataLoading,
  onCreate,
  onEdit,
  onImport,
  onSaveTrial,
  trialSaving,
  importDisabled,
  importing,
  mode,
  canOpenLinks,
  openGroupLabel,
  groupLabel,
  forumLabel,
  membersLabel,
  lockedButtonLabel,
  hiddenGroupNameLabel,
  numberLocale,
  roundDelayLabel,
  secondsLabel,
  quickCreateLabel,
  accountsLabel,
  accountLoadingLabel,
  joinedLabel,
  joinedNeedsReviewLabel,
  notJoinedLabel,
  noAccountsLabel,
  configuredCampaignsLabel,
  noConfiguredCampaignsLabel,
  attachedAccountLabel,
  noAttachedAccountLabel,
  needJoinedAccountLabel,
  preferredDelayLabel,
  noDelayHistoryLabel,
  delayHistoryLabel,
  delayOutcomeTitleLabel,
}: GroupCardProps) {
  const isAdmin = mode === "admin";
  const [trialVisibleDraft, setTrialVisibleDraft] = useState(group.trialVisible);
  const [trialTitleDraft, setTrialTitleDraft] = useState(group.trialTitle ?? "");
  const isGroupNameHidden = !isAdmin && group.title === HIDDEN_GROUP_TITLE;
  const showEntitlementDetails = isAdmin || canOpenLinks;
  const memberships = accounts.map((account) => {
    const groupMembership = group.accountMemberships?.find((membership) => membership.accountId === account.id);
    return {
      account,
      destination: destinations.find((destination) =>
        groupMembership
          ? destination.id === groupMembership.destinationId
          : destination.accountId === account.id
            && destination.telegramId === group.id
            && destination.topicId === null,
      ),
    };
  });
  const groupDestinationIds = new Set(memberships.flatMap(({ destination }) => destination ? [destination.id] : []));
  const groupCampaigns = campaigns.filter((campaign) =>
    campaign.destinationIds.some((destinationId) => groupDestinationIds.has(destinationId)),
  );
  const preferredAccountId = memberships.find(({ account, destination }) =>
    account.status === "connected" && destination?.canPost,
  )?.account.id;
  const canQuickCreate = canOpenLinks && Boolean(preferredAccountId);

  useEffect(() => {
    setTrialVisibleDraft(group.trialVisible);
    setTrialTitleDraft(group.trialTitle ?? "");
  }, [group.trialTitle, group.trialVisible]);

  return (
    <article
      className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm transition hover:border-[#bfdbfe] hover:shadow-md sm:p-5"
      data-testid={`card-admin-active-group-${group.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-extrabold text-[#0f172a]" aria-label={isGroupNameHidden ? hiddenGroupNameLabel : group.title}>
              {isGroupNameHidden ? (
                <>
                  <span aria-hidden="true" className="inline-block select-none blur-[3px] opacity-75">{group.title}</span>
                  <span className="sr-only">{hiddenGroupNameLabel}</span>
                </>
              ) : group.title}
            </h3>
            <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#1d4ed8]">
              {group.kind === "forum" ? forumLabel : groupLabel}
            </span>
            {isAdmin && !group.isPublished && (
              <span
                className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#c2410c]"
                data-testid={`badge-new-admin-active-group-${group.id}`}
              >
                {text.newGroup}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#64748b]">
            {group.username && <span>@{group.username.replace(/^@/, "")}</span>}
            {group.memberCount !== null && <span>{group.memberCount.toLocaleString(numberLocale)} {membersLabel}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {isAdmin && !group.isPublished && (
            <button
              type="button"
              onClick={() => onImport(group)}
              disabled={importDisabled}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#86efac] bg-[#f0fdf4] px-2.5 py-1.5 text-[10px] font-extrabold text-[#047857] transition hover:bg-[#dcfce7] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`button-import-admin-active-group-${group.id}`}
            >
              {importing && <LoaderCircle className="h-3 w-3 animate-spin" />}
              {importing ? text.importingGroup : text.importGroup}
            </button>
          )}
          {group.telegramLink && (isAdmin || canOpenLinks || group.trialVisible) ? (
            <a
              href={group.telegramLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1.5 text-[10px] font-extrabold text-[#1d4ed8] transition hover:bg-[#dbeafe]"
              data-testid={`link-admin-active-group-${group.id}`}
            >
              {openGroupLabel}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : isAdmin ? (
            <span className="max-w-[145px] text-right text-[10px] font-semibold leading-tight text-[#94a3b8]">
              {text.privateGroup}
            </span>
          ) : !canOpenLinks ? (
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1.5 text-[10px] font-extrabold text-[#94a3b8]"
              data-testid={`locked-link-group-${group.id}`}
            >
              {lockedButtonLabel}
              <ExternalLink className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-4 border-t border-[#f1f5f9] pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <label className="flex min-h-10 items-center gap-2 text-[11px] font-extrabold text-[#334155]">
              <input
                type="checkbox"
                checked={trialVisibleDraft}
                onChange={(event) => setTrialVisibleDraft(event.target.checked)}
                className="h-4 w-4 rounded border-[#cbd5e1] accent-[#1a2b88]"
                data-testid={`checkbox-trial-group-${group.id}`}
              />
              {text.trialVisible}
            </label>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{text.trialTitle}</span>
              <input
                value={trialTitleDraft}
                onChange={(event) => setTrialTitleDraft(event.target.value)}
                maxLength={120}
                placeholder={text.trialTitlePlaceholder}
                className="h-10 w-full rounded-lg border border-[#dbe2ea] px-3 text-[11px] font-semibold outline-none transition focus:border-[#1a2b88]"
                data-testid={`input-trial-title-${group.id}`}
              />
            </label>
            <button
              type="button"
              onClick={() => onSaveTrial(group, trialVisibleDraft, trialTitleDraft)}
              disabled={trialSaving}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#1a2b88] px-3 text-[10px] font-extrabold text-white transition hover:bg-[#152473] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`button-save-trial-group-${group.id}`}
            >
              {trialSaving && <LoaderCircle className="h-3 w-3 animate-spin" />}
              {trialSaving ? text.savingTrial : text.saveTrial}
            </button>
          </div>
          <p className="mt-2 text-[10px] font-semibold text-[#64748b]">
            Chỉ tối đa 2 nhóm được hiện cho user chưa đủ quyền mở thư viện. Để trống tên sẽ dùng tên nhóm gốc.
          </p>
        </div>
      )}

      {showEntitlementDetails && (
        <div className="mt-3 border-t border-[#f1f5f9] pt-3">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{accountsLabel}</p>
        {accountDataLoading ? (
          <p className="text-[11px] font-semibold text-[#64748b]">{accountLoadingLabel}</p>
        ) : memberships.length ? (
          <div className="flex flex-wrap gap-1.5">
            {memberships.map(({ account, destination }) => (
              <span
                key={account.id}
                className={`rounded-lg px-2 py-1 text-[10px] font-extrabold ${
                  destination?.canPost
                    ? "bg-[#ecfdf5] text-[#047857]"
                    : destination
                      ? "bg-[#fff7ed] text-[#c2410c]"
                      : "bg-[#f1f5f9] text-[#64748b]"
                }`}
                data-testid={`group-account-status-${group.id}-${account.id}`}
              >
                <span className={destination && !isAdmin && !canOpenLinks ? "inline-block blur-[3px] opacity-75" : undefined}>
                  {account.name}
                </span>
                : {destination?.canPost ? joinedLabel : destination ? joinedNeedsReviewLabel : notJoinedLabel}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] font-semibold text-[#64748b]">{noAccountsLabel}</p>
          )}
        </div>
      )}

      {group.roundDelays.length > 0 && (
        <div className="mt-3 border-t border-[#f1f5f9] pt-3">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{roundDelayLabel}</p>
          <div className="flex flex-wrap gap-2">
            {group.roundDelays.map((delay) => (
              <div
                key={`${delay.minSeconds}-${delay.maxSeconds}`}
                className={`min-w-[170px] rounded-xl border px-2.5 py-2 ${
                  delay.isPreferred ? "border-[#86efac] bg-[#f0fdf4]" : "border-[#dbeafe] bg-[#eff6ff]"
                }`}
                data-testid={delay.isPreferred ? `preferred-delay-${group.id}` : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-extrabold ${delay.isPreferred ? "text-[#047857]" : "text-[#1d4ed8]"}`}>
                    {delay.minSeconds}–{delay.maxSeconds} {secondsLabel}
                  </span>
                  {delay.isPreferred && (
                    <span className="rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-[#047857]">
                      {preferredDelayLabel}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span
                    className="text-[9px] font-bold text-[#64748b]"
                    title={delayOutcomeTitleLabel(delay.sentCount, delay.errorCount)}
                  >
                    {delay.errorRate === null
                      ? noDelayHistoryLabel
                      : delayHistoryLabel(delay.errorRate, delay.sampleCount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCreate(group, delay, preferredAccountId)}
                    disabled={!canQuickCreate}
                    title={canQuickCreate ? quickCreateLabel : needJoinedAccountLabel}
                    className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[9px] font-extrabold text-[#1d4ed8] shadow-sm hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:text-[#94a3b8]"
                    data-testid={`button-quick-create-${group.id}-${delay.minSeconds}-${delay.maxSeconds}`}
                  >
                    {quickCreateLabel}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!isAdmin && canOpenLinks && !accountDataLoading && !canQuickCreate && (
            <p className="mt-2 text-[10px] font-semibold leading-relaxed text-[#64748b]" data-testid={`quick-create-requirement-${group.id}`}>
              {needJoinedAccountLabel}
            </p>
          )}
        </div>
      )}

      {showEntitlementDetails && (
        <div className="mt-3 border-t border-[#f1f5f9] pt-3">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{configuredCampaignsLabel}</p>
        {groupCampaigns.length ? (
          <div className="space-y-1.5">
            {groupCampaigns.map((campaign) => {
              const editable = campaign.status === "draft" || campaign.status === "paused";
              const attachedAccount = campaign.telegramAccountId
                ? accounts.find((account) => account.id === campaign.telegramAccountId)
                : undefined;
              return (
                <div key={campaign.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f8fafc] px-2.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-extrabold text-[#334155]">{campaign.name}</span>
                    <span className="block text-[10px] font-semibold text-[#64748b]">
                      {campaign.status} · {campaign.roundDelayMinSeconds}–{campaign.roundDelayMaxSeconds} {secondsLabel}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="max-w-[150px] truncate rounded-md border border-[#cbd5e1] bg-white px-2 py-1 text-[10px] font-extrabold text-[#475569]"
                      title={attachedAccount?.name ?? (campaign.telegramAccountId ? accountLoadingLabel : noAttachedAccountLabel)}
                      data-testid={`campaign-account-${group.id}-${campaign.id}`}
                    >
                      {attachedAccountLabel}: <span className={attachedAccount && !isAdmin && !canOpenLinks ? "inline-block blur-[3px] opacity-75" : undefined}>
                        {attachedAccount?.name ?? (campaign.telegramAccountId ? accountLoadingLabel : noAttachedAccountLabel)}
                      </span>
                    </span>
                    {isAdmin && editable && (
                      <button
                        type="button"
                        onClick={() => onEdit(campaign)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] bg-white px-2 py-1 text-[10px] font-extrabold text-[#1a2b88] hover:bg-[#eef2fa]"
                        data-testid={`button-edit-campaign-from-group-${group.id}-${campaign.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                        {text.editCampaign}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] font-semibold text-[#64748b]">{noConfiguredCampaignsLabel}</p>
          )}
        </div>
      )}
    </article>
  );
}

export default function AdminActiveGroupsPage({ mode = "admin" }: { mode?: "admin" | "workspace" }) {
  const isAdmin = mode === "admin";
  const { language } = useLanguage();
  const localizedWorkspaceText = workspaceText[language];
  const [search, setSearch] = useState("");
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [importingGroupId, setImportingGroupId] = useState<string | null>(null);
  const [updatingTrialGroupId, setUpdatingTrialGroupId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState<{
    editingCampaign: Campaign | null;
    prefill?: CampaignFormPrefill;
  } | null>(null);
  const query = useGetAdminActiveGroupDirectory({
    query: {
      queryKey: getGetAdminActiveGroupDirectoryQueryKey(),
      enabled: isAdmin,
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
    },
  });
  const groupLibraryAccess = useGetGroupLibraryAccess();
  const workspaceQuery = useGetGroupLibrary({ query: { queryKey: getGetGroupLibraryQueryKey(), enabled: !isAdmin && groupLibraryAccess.data?.canView === true } });
  const canOpenLinks = groupLibraryAccess.data?.canOpenLinks === true;
  const userDataEnabled = isAdmin || groupLibraryAccess.data?.canView === true;
  const accounts = useListTelegramAccounts({ query: { queryKey: getListTelegramAccountsQueryKey(), enabled: userDataEnabled } });
  const destinations = useListDestinations({ query: { queryKey: getListDestinationsQueryKey(), enabled: userDataEnabled } });
  const campaigns = useListCampaigns({ query: { queryKey: getListCampaignsQueryKey(), enabled: userDataEnabled } });
  const syncLibrary = useSyncAdminGroupLibrary({
    mutation: {
      onError: () => {
        setSyncFeedback(text.syncFailed);
        setFeedbackIsError(true);
      },
    },
  });
  const syncTelegram = useSyncTelegramDestinations();
  const importGroup = useImportAdminGroupLibraryEntry();
  const updateTrialGroup = useUpdateAdminGroupLibraryEntry();
  const autoSyncStarted = useRef(false);
  const groups = (isAdmin ? query.data : workspaceQuery.data)?.groups ?? [];
  const directoryQuery = isAdmin ? query : workspaceQuery;
  const pageText = isAdmin ? text : localizedWorkspaceText;
  const needle = search.trim().toLowerCase();
  const filteredGroups = useMemo(
    () => (isAdmin || canOpenLinks) ? groups.filter((group) => groupMatches(group, needle)) : groups,
    [canOpenLinks, groups, isAdmin, needle],
  );
  const connectedAccounts = useMemo(
    () => (accounts.data ?? []).filter((account) => account.status === "connected"),
    [accounts.data],
  );

  async function handleSync() {
    setSyncFeedback(null);
    setFeedbackIsError(false);
    try {
      const accountSyncResults = await Promise.allSettled(
        connectedAccounts.map((account) => syncTelegram.mutateAsync({ accountId: account.id })),
      );
      const accountSyncFailed = accountSyncResults.some((result) => result.status === "rejected");
      await destinations.refetch();
      if (isAdmin) {
        const libraryResult = await syncLibrary.mutateAsync();
        await query.refetch();
        setSyncFeedback(accountSyncFailed
          ? text.syncAccountsFailed
          : connectedAccounts.length > 0
            ? text.syncCompleted(connectedAccounts.length, libraryResult.addedCount)
            : (libraryResult.addedCount > 0 ? text.syncAdded(libraryResult.addedCount) : text.syncNoNewGroup));
      } else {
        await workspaceQuery.refetch();
        setSyncFeedback(accountSyncFailed
          ? localizedWorkspaceText.syncAccountsFailed
          : connectedAccounts.length > 0
            ? localizedWorkspaceText.syncCompleted(connectedAccounts.length)
            : localizedWorkspaceText.noConnectedAccounts);
      }
      setFeedbackIsError(accountSyncFailed);
    } catch {
      setSyncFeedback(isAdmin ? text.syncFailed : localizedWorkspaceText.syncFailed);
      setFeedbackIsError(true);
    }
  }

  async function handleImport(group: AdminActiveGroup) {
    setImportingGroupId(group.id);
    setSyncFeedback(null);
    setFeedbackIsError(false);
    try {
      await importGroup.mutateAsync({ telegramId: group.id });
      await query.refetch();
      setSyncFeedback(text.importSuccess(group.title));
    } catch {
      setSyncFeedback(text.importFailed);
      setFeedbackIsError(true);
    } finally {
      setImportingGroupId(null);
    }
  }

  async function handleSaveTrial(group: AdminActiveGroup, trialVisible: boolean, trialTitle: string) {
    setUpdatingTrialGroupId(group.id);
    setSyncFeedback(null);
    setFeedbackIsError(false);
    try {
      await updateTrialGroup.mutateAsync({
        telegramId: group.id,
        data: { trialVisible, trialTitle: trialTitle.trim() || null },
      });
      await query.refetch();
      setSyncFeedback(text.trialSaved);
    } catch {
      setSyncFeedback(text.trialSaveFailed);
      setFeedbackIsError(true);
    } finally {
      setUpdatingTrialGroupId(null);
    }
  }

  useEffect(() => {
    if (isAdmin || !groupLibraryAccess.data?.canView || accounts.isLoading || autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    void handleSync();
  }, [accounts.isLoading, groupLibraryAccess.data?.canView, isAdmin]);

  function openCreateCampaign(
    group: AdminActiveGroup,
    delay?: AdminActiveGroup["roundDelays"][number],
    preferredAccountId?: string,
  ) {
    setCampaignForm({
      editingCampaign: null,
      prefill: {
        destinationTelegramId: group.id,
        destinationTitle: group.title,
        roundDelayMinSeconds: delay?.minSeconds,
        roundDelayMaxSeconds: delay?.maxSeconds,
        preferredAccountId,
      },
    });
  }

  async function handleCampaignSaved() {
    await Promise.all([
      destinations.refetch(),
      campaigns.refetch(),
    ]);
    setCampaignForm(null);
    setFeedbackIsError(false);
    setSyncFeedback(campaignForm?.editingCampaign
      ? (isAdmin ? text.updatedCampaign : localizedWorkspaceText.updatedCampaign)
      : (isAdmin ? text.createdCampaign : localizedWorkspaceText.createdCampaign));
  }

  return (
    <AppLayout activePage={isAdmin ? "admin-active-groups" : "group-library"} title={pageText.title} subtitle={pageText.subtitle} hideUpgrade={isAdmin}>
      <div className="space-y-6">
        <SectionHeader
          eyebrow={isAdmin ? "Admin Center" : localizedWorkspaceText.eyebrow}
          title={pageText.title}
          detail={pageText.subtitle}
           action={(isAdmin || groupLibraryAccess.data?.canView === true) ? (
            <button
              type="button"
               onClick={() => void handleSync()}
               disabled={directoryQuery.isFetching || syncLibrary.isPending || syncTelegram.isPending || accounts.isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-3.5 py-2.5 text-[11px] font-extrabold text-[#1a2b88] transition hover:border-[#1a2b88] hover:bg-[#eef2fa] disabled:cursor-not-allowed disabled:opacity-60"
               data-testid={isAdmin ? "button-refresh-admin-active-groups" : "button-refresh-group-library"}
            >
               {syncLibrary.isPending || syncTelegram.isPending
                 ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                 : <RefreshCw className="h-3.5 w-3.5" />}
               {syncLibrary.isPending || syncTelegram.isPending
                 ? (isAdmin ? text.syncing : localizedWorkspaceText.syncing)
                 : (isAdmin ? text.sync : localizedWorkspaceText.sync)}
            </button>
            ) : undefined}
        />
         {syncFeedback && (
          <p className={`-mt-4 text-[11px] font-bold ${feedbackIsError ? "text-[#be123c]" : "text-[#047857]"}`} role="status">
            {syncFeedback}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3">
          <Panel className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b]">{pageText.savedGroups}</p>
              <p className="mt-0.5 text-[22px] font-extrabold leading-none text-[#0f172a]">{groups.length}</p>
            </div>
          </Panel>
         {isAdmin && (
           <Panel className="flex items-center gap-3 border-[#dbeafe] bg-[#f8fbff] p-4">
             <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#dbeafe] text-[#1d4ed8]">
               <Users className="h-5 w-5" />
             </span>
             <div>
               <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748b]">Trial preview</p>
               <p className="mt-0.5 text-[15px] font-extrabold leading-none text-[#0f172a]">
                 {text.trialLimit(groups.filter((group) => group.trialVisible).length)}
               </p>
             </div>
           </Panel>
         )}
        </div>

        <Panel className="p-4 sm:p-5">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!isAdmin && !canOpenLinks}
              placeholder={pageText.search}
              className="h-10 w-full rounded-xl border border-[#dbe2ea] pl-9 pr-3 text-[12px] font-semibold outline-none transition focus:border-[#1a2b88] disabled:cursor-not-allowed disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
              data-testid="input-search-admin-active-groups"
            />
          </label>
        </Panel>

        {!isAdmin && !groupLibraryAccess.data?.canOpenLinks && (
          <Panel className="border-[#fde68a] bg-[#fffbeb] p-5">
            <p className="font-extrabold text-[#92400e]">{localizedWorkspaceText.lockedTitle}</p>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-[#a16207]">{localizedWorkspaceText.lockedDetail(groupLibraryAccess.data?.minimumJoinPlan ?? "pro")}</p>
          </Panel>
        )}
        {directoryQuery.isLoading && (
          <Panel className="p-10 text-center text-[13px] font-semibold text-[#64748b]">{pageText.loading}</Panel>
        )}
        {directoryQuery.error && !directoryQuery.isLoading && (
          <Panel className="p-8 text-center">
            <p className="text-[13px] font-semibold text-[#be123c]">{pageText.loadError}</p>
            <button
              type="button"
              onClick={() => void directoryQuery.refetch()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1a2b88] px-3 py-2 text-[11px] font-extrabold text-white hover:bg-[#152473]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {pageText.retry}
            </button>
          </Panel>
        )}
        {!directoryQuery.isLoading && !directoryQuery.error && !filteredGroups.length && (
          <EmptyState icon={Users} title={needle ? (isAdmin ? "Không tìm thấy nhóm phù hợp." : localizedWorkspaceText.noSearchResults) : pageText.noGroups} detail={needle ? "" : pageText.noGroupsDetail} />
        )}
        {!directoryQuery.isLoading && !directoryQuery.error && filteredGroups.length > 0 && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                accounts={accounts.data ?? []}
                destinations={destinations.data ?? []}
                campaigns={campaigns.data ?? []}
                accountDataLoading={accounts.isLoading || destinations.isLoading || campaigns.isLoading}
                onCreate={openCreateCampaign}
                onEdit={(campaign) => setCampaignForm({ editingCampaign: campaign })}
                onImport={(selectedGroup) => void handleImport(selectedGroup)}
                 onSaveTrial={(selectedGroup, trialVisible, trialTitle) => void handleSaveTrial(selectedGroup, trialVisible, trialTitle)}
                 trialSaving={updateTrialGroup.isPending && updatingTrialGroupId === group.id}
                importDisabled={importGroup.isPending}
                importing={importGroup.isPending && importingGroupId === group.id}
                mode={mode}
                 canOpenLinks={canOpenLinks}
                openGroupLabel={isAdmin ? text.openGroup : localizedWorkspaceText.openGroup}
                groupLabel={isAdmin ? text.group : localizedWorkspaceText.group}
                forumLabel={isAdmin ? text.forum : localizedWorkspaceText.forum}
                membersLabel={isAdmin ? text.members : localizedWorkspaceText.members}
                lockedButtonLabel={localizedWorkspaceText.lockedButton}
                hiddenGroupNameLabel={localizedWorkspaceText.hiddenGroupName}
                numberLocale={language === "en" ? "en-US" : "vi-VN"}
                roundDelayLabel={isAdmin ? text.roundDelay : localizedWorkspaceText.roundDelay}
                secondsLabel={isAdmin ? text.seconds : localizedWorkspaceText.seconds}
                quickCreateLabel={isAdmin ? text.quickCreate : localizedWorkspaceText.quickCreate}
                 accountsLabel={isAdmin ? text.accounts : localizedWorkspaceText.accounts}
                 accountLoadingLabel={isAdmin ? text.accountLoading : localizedWorkspaceText.accountLoading}
                 joinedLabel={isAdmin ? text.joined : localizedWorkspaceText.joined}
                 joinedNeedsReviewLabel={isAdmin ? text.joinedNeedsReview : localizedWorkspaceText.joinedNeedsReview}
                 notJoinedLabel={isAdmin ? text.notJoined : localizedWorkspaceText.notJoined}
                 noAccountsLabel={isAdmin ? text.noAccounts : localizedWorkspaceText.noAccounts}
                 configuredCampaignsLabel={isAdmin ? text.configuredCampaigns : localizedWorkspaceText.configuredCampaigns}
                 noConfiguredCampaignsLabel={isAdmin ? text.noConfiguredCampaigns : localizedWorkspaceText.noConfiguredCampaigns}
                 attachedAccountLabel={isAdmin ? text.attachedAccount : localizedWorkspaceText.attachedAccount}
                 noAttachedAccountLabel={isAdmin ? text.noAttachedAccount : localizedWorkspaceText.noAttachedAccount}
                needJoinedAccountLabel={isAdmin ? text.needJoinedAccount : localizedWorkspaceText.needJoinedAccount}
                preferredDelayLabel={isAdmin ? text.preferredDelay : localizedWorkspaceText.preferredDelay}
                noDelayHistoryLabel={isAdmin ? text.noDelayHistory : localizedWorkspaceText.noDelayHistory}
                delayHistoryLabel={isAdmin ? text.delayHistory : localizedWorkspaceText.delayHistory}
                delayOutcomeTitleLabel={isAdmin ? text.delayOutcomeTitle : localizedWorkspaceText.delayOutcomeTitle}
              />
            ))}
          </div>
        )}
        {campaignForm && (
          <CampaignFormModal
            editingCampaign={campaignForm.editingCampaign}
            prefill={campaignForm.prefill}
            onClose={() => setCampaignForm(null)}
            onSaved={handleCampaignSaved}
          />
        )}
      </div>
    </AppLayout>
  );
}