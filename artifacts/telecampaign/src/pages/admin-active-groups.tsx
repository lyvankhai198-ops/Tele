import { useEffect, useMemo, useRef, useState } from "react";
import {
  getGetAdminActiveGroupDirectoryQueryKey,
  getGetAdminGroupJoinStatusQueryKey,
  getGetGroupLibraryQueryKey,
  getListCampaignsQueryKey,
  getListDestinationsQueryKey,
  getListTelegramAccountsQueryKey,
  useGetAdminActiveGroupDirectory,
  useGetAdminGroupJoinStatus,
  useGetGroupLibrary,
  useGetGroupLibraryAccess,
  useListCampaigns,
  useListDestinations,
  useListTelegramAccounts,
  useImportAdminGroupLibraryEntry,
  useRevokeAdminGroupLibraryEntry,
  useUpdateAdminGroupLibraryEntry,
  useUpdateAdminGroupJoinAutomation,
  useUpdateAdminCampaignStatus,
  useScanAdminJoinedGroupsWithoutCampaign,
  useSyncTelegramDestinations,
  useSyncAdminGroupLibrary,
  useBulkJoinAdminGroupLibrary,
  type AdminActiveGroup,
  type AdminGroupLibraryBulkJoinResult,
  type AdminGroupJoinStatus,
  type Campaign,
  type Destination,
  type TelegramAccount,
} from "@workspace/api-client-react";
import {
  ExternalLink,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Send,
  Undo2,
  Users,
} from "lucide-react";
import { CampaignFormModal, type CampaignFormPrefill } from "@/components/campaign-form-modal";
import { AppLayout, EmptyState, Modal, Panel, SectionHeader } from "@/components/layout/AppLayout";
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
  revokeGroup: "Thu hồi khỏi thư viện user",
  revokingGroup: "Đang thu hồi...",
  revokeConfirm: (title: string) => `Thu hồi nhóm “${title}” khỏi thư viện user?`,
  revokeSuccess: (title: string) => `Đã thu hồi “${title}” khỏi thư viện user.`,
  revokeFailed: "Không thể thu hồi nhóm. Vui lòng thử lại.",
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
  bulkJoin: "Tham gia hàng loạt",
  bulkJoinTitle: "Tham gia hàng loạt nhóm",
  bulkJoinDescription: "Chọn đúng một tài khoản Telegram. Hệ thống sẽ lần lượt tham gia tất cả nhóm đang có trong Thư Viện Nhóm.",
  bulkJoinAccount: "Tài khoản Telegram thực hiện",
  bulkJoinSelect: "Chọn tài khoản",
  bulkJoinStart: "Bắt đầu tham gia",
  bulkJoining: "Đang tham gia...",
  bulkJoinClose: "Đóng",
  bulkJoinResults: "Kết quả từng nhóm",
  bulkJoinSummary: (joined: number, alreadyJoined: number, skipped: number, failed: number) =>
    `Đã tham gia ${joined}, đã có sẵn ${alreadyJoined}, bỏ qua ${skipped}, lỗi ${failed}.`,
  bulkJoinSuccess: "Đã hoàn tất thao tác tham gia hàng loạt. Kiểm tra kết quả chi tiết trong hộp thoại.",
  bulkJoinNoAccount: "Chưa có tài khoản Telegram đã kết nối.",
  bulkJoinJoined: "Đã tham gia",
  bulkJoinAlreadyJoined: "Đã tham gia trước đó",
  bulkJoinSkipped: "Đã bỏ qua",
  bulkJoinFailed: "Thất bại",
  autoJoinTitle: "Tự động tham gia nhóm",
  autoJoinEnabled: "Đang bật",
  autoJoinDisabled: "Đang tắt",
  autoJoinEnable: "Bật tự động",
  autoJoinDisable: "Tắt tự động",
  autoJoinDescription: "Các tài khoản Telegram admin đã login sẽ tự động tham gia nhóm mới trong thư viện và tự chờ lại khi Telegram giới hạn.",
  autoJoinSummary: (pending: number, waiting: number, joined: number, failed: number) =>
    `${pending} chờ xử lý · ${waiting} đang chờ Telegram · ${joined} đã tham gia · ${failed} lỗi`,
  autoJoinAccountSummary: (name: string, pending: number, joined: number) =>
    `${name}: ${pending} chờ · ${joined} đã tham gia`,
  autoJoinToggleFailed: "Không thể cập nhật chế độ tự động tham gia.",
  scanExistingGroups: "Quét & dọn campaign lỗi",
  scanningExistingGroups: "Đang quét và dọn campaign lỗi...",
  scanExistingGroupsSuccess: (
    scanned: number,
    created: number,
    recreated: number,
    deleted: number,
    noPermission: number,
    duplicate: number,
    skipped: number,
  ) =>
    `Đã quét ${scanned} nhóm: tạo ${created} campaign mới, tạo lại ${recreated}, xoá ${deleted} campaign lỗi (không quyền đăng ${noPermission}, trùng campaign đang chạy ${duplicate})${skipped > 0 ? `, bỏ qua ${skipped}` : ""}.`,
  scanExistingGroupsFailed: "Không thể quét và dọn campaign lỗi. Vui lòng thử lại.",
  postJoinTitle: "Campaign sau khi tham gia",
  postJoinDescription: "Sau khi tài khoản admin tham gia nhóm, hệ thống sẽ tạo campaign theo cấu hình này.",
  postJoinEnabled: "Tạo campaign sau khi tham gia",
  postJoinContent: "Nội dung tin nhắn",
  postJoinContentPlaceholder: "Nhập nội dung sẽ gửi vào nhóm...",
  postJoinRepeat: "Số vòng",
  postJoinDelay: "Delay giữa các vòng",
  postJoinMode: "Cách xử lý",
  postJoinDraft: "Tạo nháp, chờ duyệt",
  postJoinSend: "Tạo và gửi ngay",
  postJoinSave: "Lưu cấu hình campaign",
  postJoinSaved: "Đã lưu cấu hình campaign sau khi tham gia.",
  postJoinSaveFailed: "Không thể lưu cấu hình campaign sau khi tham gia.",
  postJoinDraftHint: "Chế độ nháp không tự gửi. Bạn có thể bấm “Gửi ngay” ở campaign khi đã kiểm tra.",
  sendNow: "Gửi ngay",
  sendingNow: "Đang gửi...",
  sendNowSuccess: "Đã chuyển campaign sang trạng thái gửi ngay.",
  sendNowFailed: "Không thể gửi campaign ngay lúc này.",
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
    newGroup: "Mới",
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
    newGroup: "New",
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
  onSendNow: (campaign: Campaign) => void;
  sendingCampaignId: string | null;
  onImport: (group: AdminActiveGroup) => void;
  onRevoke: (group: AdminActiveGroup) => void;
  onSaveTrial: (group: AdminActiveGroup, trialVisible: boolean, trialTitle: string) => void;
  trialSaving: boolean;
  importDisabled: boolean;
  importing: boolean;
  revoking: boolean;
  mode: "admin" | "workspace";
  canOpenLinks: boolean;
  openGroupLabel: string;
  groupLabel: string;
  forumLabel: string;
  membersLabel: string;
  lockedButtonLabel: string;
  hiddenGroupNameLabel: string;
  newGroupLabel: string;
  revokeGroupLabel: string;
  revokingGroupLabel: string;
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
  onSendNow,
  sendingCampaignId,
  onImport,
  onRevoke,
  onSaveTrial,
  trialSaving,
  importDisabled,
  importing,
  revoking,
  mode,
  canOpenLinks,
  openGroupLabel,
  groupLabel,
  forumLabel,
  membersLabel,
  lockedButtonLabel,
  hiddenGroupNameLabel,
  newGroupLabel,
  revokeGroupLabel,
  revokingGroupLabel,
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
            {!isAdmin && group.isNew && (
              <span
                className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#047857]"
                data-testid={`badge-new-user-group-${group.id}`}
              >
                {newGroupLabel}
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
          {isAdmin && group.isPublished && (
            <button
              type="button"
              onClick={() => onRevoke(group)}
              disabled={revoking}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#fecaca] bg-[#fff1f2] px-2.5 py-1.5 text-[10px] font-extrabold text-[#be123c] transition hover:bg-[#ffe4e6] disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`button-revoke-admin-active-group-${group.id}`}
            >
              {revoking ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
              {revoking ? revokingGroupLabel : revokeGroupLabel}
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
                    {isAdmin && campaign.status === "draft" && (
                      <button
                        type="button"
                        onClick={() => onSendNow(campaign)}
                        disabled={sendingCampaignId === campaign.id}
                        className="inline-flex items-center gap-1 rounded-md bg-[#059669] px-2 py-1 text-[10px] font-extrabold text-white hover:bg-[#047857] disabled:cursor-not-allowed disabled:opacity-60"
                        data-testid={`button-send-campaign-now-${group.id}-${campaign.id}`}
                      >
                        {sendingCampaignId === campaign.id
                          ? <LoaderCircle className="h-3 w-3 animate-spin" />
                          : <Send className="h-3 w-3" />}
                        {sendingCampaignId === campaign.id ? text.sendingNow : text.sendNow}
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
  const [revokingGroupId, setRevokingGroupId] = useState<string | null>(null);
  const [updatingTrialGroupId, setUpdatingTrialGroupId] = useState<string | null>(null);
  const [bulkJoinModalOpen, setBulkJoinModalOpen] = useState(false);
  const [bulkJoinAccountId, setBulkJoinAccountId] = useState("");
  const [bulkJoinResult, setBulkJoinResult] = useState<AdminGroupLibraryBulkJoinResult | null>(null);
  const [postJoinDraft, setPostJoinDraft] = useState<AdminGroupJoinStatus["postJoinCampaign"]>({
    enabled: false,
    content: "",
    repeatCount: 300,
    roundDelayMinSeconds: 1,
    roundDelayMaxSeconds: 3,
    mode: "draft",
  });
  const [postJoinDirty, setPostJoinDirty] = useState(false);
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);
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
  const groupJoinStatusQuery = useGetAdminGroupJoinStatus({
    query: {
      queryKey: getGetAdminGroupJoinStatusQueryKey(),
      enabled: isAdmin,
      refetchInterval: 10000,
      refetchOnWindowFocus: true,
    },
  });
  const groupLibraryAccess = useGetGroupLibraryAccess();
  const workspaceSearch = search.trim();
  const workspaceQuery = useGetGroupLibrary(
    isAdmin ? undefined : { q: workspaceSearch || undefined },
    {
      query: {
        queryKey: getGetGroupLibraryQueryKey(isAdmin ? undefined : { q: workspaceSearch || undefined }),
        enabled: !isAdmin && groupLibraryAccess.data?.canView === true,
      },
    },
  );
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
  const revokeGroup = useRevokeAdminGroupLibraryEntry();
  const updateTrialGroup = useUpdateAdminGroupLibraryEntry();
  const updateJoinAutomation = useUpdateAdminGroupJoinAutomation();
  const updateCampaignStatus = useUpdateAdminCampaignStatus();
  const scanExistingGroups = useScanAdminJoinedGroupsWithoutCampaign();
  const bulkJoinGroups = useBulkJoinAdminGroupLibrary();
  const autoSyncStarted = useRef(false);
  const groups = (isAdmin ? query.data : workspaceQuery.data)?.groups ?? [];
  const directoryQuery = isAdmin ? query : workspaceQuery;
  const pageText = isAdmin ? text : localizedWorkspaceText;
  const needle = search.trim().toLowerCase();
  const filteredGroups = useMemo(
    () => isAdmin ? groups.filter((group) => groupMatches(group, needle)) : groups,
    [groups, isAdmin, needle],
  );
  const connectedAccounts = useMemo(
    () => (accounts.data ?? []).filter((account) => account.status === "connected"),
    [accounts.data],
  );

  useEffect(() => {
    if (groupJoinStatusQuery.data?.postJoinCampaign && !postJoinDirty) {
      setPostJoinDraft(groupJoinStatusQuery.data.postJoinCampaign);
    }
  }, [groupJoinStatusQuery.data?.postJoinCampaign, postJoinDirty]);

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

  async function handleRevoke(group: AdminActiveGroup) {
    if (!window.confirm(text.revokeConfirm(group.title))) return;
    setRevokingGroupId(group.id);
    setSyncFeedback(null);
    setFeedbackIsError(false);
    try {
      await revokeGroup.mutateAsync({ telegramId: group.id });
      await query.refetch();
      setSyncFeedback(text.revokeSuccess(group.title));
    } catch {
      setSyncFeedback(text.revokeFailed);
      setFeedbackIsError(true);
    } finally {
      setRevokingGroupId(null);
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

  async function handleBulkJoin() {
    if (!bulkJoinAccountId) return;
    setBulkJoinResult(null);
    setSyncFeedback(null);
    setFeedbackIsError(false);
    try {
      const result = await bulkJoinGroups.mutateAsync({
        data: { telegramAccountId: bulkJoinAccountId },
      });
      setBulkJoinResult(result);
      await Promise.all([
        destinations.refetch(),
        query.refetch(),
      ]);
      setSyncFeedback(text.bulkJoinSuccess);
    } catch {
      setSyncFeedback(text.syncFailed);
      setFeedbackIsError(true);
    }
  }

  async function handleToggleJoinAutomation() {
    const enabled = !(groupJoinStatusQuery.data?.enabled ?? true);
    try {
      await updateJoinAutomation.mutateAsync({ data: { enabled } });
      await groupJoinStatusQuery.refetch();
      setSyncFeedback(enabled ? text.autoJoinEnabled : text.autoJoinDisabled);
      setFeedbackIsError(false);
    } catch {
      setSyncFeedback(text.autoJoinToggleFailed);
      setFeedbackIsError(true);
    }
  }

  async function handleSavePostJoinCampaign() {
    const currentEnabled = groupJoinStatusQuery.data?.enabled ?? true;
    if (!postJoinDraft.content.trim()) {
      setSyncFeedback(text.postJoinSaveFailed);
      setFeedbackIsError(true);
      return;
    }
    try {
      const result = await updateJoinAutomation.mutateAsync({
        data: {
          enabled: currentEnabled,
          postJoinCampaign: {
            ...postJoinDraft,
            content: postJoinDraft.content.trim(),
          },
        },
      });
      setPostJoinDraft(result.postJoinCampaign);
      setPostJoinDirty(false);
      await groupJoinStatusQuery.refetch();
      setSyncFeedback(text.postJoinSaved);
      setFeedbackIsError(false);
    } catch {
      setSyncFeedback(text.postJoinSaveFailed);
      setFeedbackIsError(true);
    }
  }

  async function handleSendCampaignNow(campaign: Campaign) {
    setSendingCampaignId(campaign.id);
    try {
      await updateCampaignStatus.mutateAsync({ campaignId: campaign.id, data: { status: "queued" } });
      await campaigns.refetch();
      setSyncFeedback(text.sendNowSuccess);
      setFeedbackIsError(false);
    } catch {
      setSyncFeedback(text.sendNowFailed);
      setFeedbackIsError(true);
    } finally {
      setSendingCampaignId(null);
    }
  }

  async function handleScanExistingGroups() {
    try {
      const result = await scanExistingGroups.mutateAsync();
      await Promise.all([
        groupJoinStatusQuery.refetch(),
        campaigns.refetch(),
        destinations.refetch(),
      ]);
      setSyncFeedback(text.scanExistingGroupsSuccess(
        result.scannedCount,
        result.createdCount,
        result.recreatedCount,
        result.deletedCount,
        result.noPermissionCount,
        result.duplicateCount,
        result.skippedCount,
      ));
      setFeedbackIsError(false);
    } catch {
      setSyncFeedback(text.scanExistingGroupsFailed);
      setFeedbackIsError(true);
    }
  }

  function openBulkJoinModal() {
    setBulkJoinResult(null);
    setBulkJoinAccountId((current) => current || connectedAccounts[0]?.id || "");
    setBulkJoinModalOpen(true);
  }

  function closeBulkJoinModal() {
    if (bulkJoinGroups.isPending) return;
    setBulkJoinModalOpen(false);
    setBulkJoinResult(null);
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
              <div className="flex flex-wrap justify-end gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openBulkJoinModal}
                    disabled={bulkJoinGroups.isPending || accounts.isLoading || !connectedAccounts.length || !groups.length}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a2b88] px-3.5 py-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#152473] disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="button-bulk-join-admin-active-groups"
                  >
                    {bulkJoinGroups.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                    {bulkJoinGroups.isPending ? text.bulkJoining : text.bulkJoin}
                  </button>
                )}
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
              </div>
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
         {isAdmin && (
           <Panel className="border-[#dbeafe] bg-[#f8fbff] p-4 sm:p-5">
             <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
               <div className="flex min-w-0 gap-3">
                 <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#dbeafe] text-[#1d4ed8]">
                   <Users className="h-5 w-5" />
                 </span>
                 <div className="min-w-0">
                   <div className="flex flex-wrap items-center gap-2">
                     <p className="text-[13px] font-extrabold text-[#0f172a]">{text.autoJoinTitle}</p>
                     <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                       groupJoinStatusQuery.data?.enabled
                         ? "bg-[#dcfce7] text-[#166534]"
                         : "bg-[#f1f5f9] text-[#64748b]"
                     }`}>
                       {groupJoinStatusQuery.data?.enabled ? text.autoJoinEnabled : text.autoJoinDisabled}
                     </span>
                   </div>
                   <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#64748b]">{text.autoJoinDescription}</p>
                   {groupJoinStatusQuery.data && (
                     <p className="mt-2 text-[11px] font-bold text-[#1e40af]">
                       {text.autoJoinSummary(
                         groupJoinStatusQuery.data.pendingCount,
                         groupJoinStatusQuery.data.waitingCount,
                         groupJoinStatusQuery.data.joinedCount,
                         groupJoinStatusQuery.data.failedCount,
                       )}
                     </p>
                   )}
                 </div>
               </div>
               <div className="flex shrink-0 flex-wrap justify-end gap-2">
                 <button
                   type="button"
                   onClick={() => void handleScanExistingGroups()}
                   disabled={scanExistingGroups.isPending || groupJoinStatusQuery.isLoading}
                   className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#1a2b88] bg-white px-3.5 py-2.5 text-[11px] font-extrabold text-[#1a2b88] transition hover:bg-[#eef2fa] disabled:cursor-not-allowed disabled:opacity-60"
                   data-testid="button-scan-admin-joined-groups"
                 >
                   {scanExistingGroups.isPending
                     ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                     : <Search className="h-3.5 w-3.5" />}
                   {scanExistingGroups.isPending ? text.scanningExistingGroups : text.scanExistingGroups}
                 </button>
                 <button
                   type="button"
                   onClick={() => void handleToggleJoinAutomation()}
                   disabled={updateJoinAutomation.isPending || groupJoinStatusQuery.isLoading}
                   className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-[11px] font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                     groupJoinStatusQuery.data?.enabled
                       ? "bg-[#64748b] hover:bg-[#475569]"
                       : "bg-[#1a2b88] hover:bg-[#152473]"
                   }`}
                   data-testid="button-toggle-admin-group-auto-join"
                 >
                   {updateJoinAutomation.isPending
                     ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                     : groupJoinStatusQuery.data?.enabled
                       ? <Pause className="h-3.5 w-3.5" />
                       : <Play className="h-3.5 w-3.5" />}
                   {groupJoinStatusQuery.data?.enabled ? text.autoJoinDisable : text.autoJoinEnable}
                 </button>
               </div>
             </div>
              <div className="mt-4 rounded-xl border border-[#dbeafe] bg-white p-3.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[12px] font-extrabold text-[#0f172a]">{text.postJoinTitle}</p>
                    <p className="mt-1 text-[10px] font-medium leading-relaxed text-[#64748b]">{text.postJoinDescription}</p>
                  </div>
                  <label className="inline-flex shrink-0 items-center gap-2 text-[11px] font-extrabold text-[#334155]">
                    <input
                      type="checkbox"
                      checked={postJoinDraft.enabled}
                      onChange={(event) => {
                        setPostJoinDraft((current) => ({ ...current, enabled: event.target.checked }));
                        setPostJoinDirty(true);
                      }}
                      className="h-4 w-4 rounded border-[#cbd5e1] accent-[#1a2b88]"
                      data-testid="checkbox-admin-post-join-campaign"
                    />
                    {text.postJoinEnabled}
                  </label>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_180px]">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{text.postJoinContent}</span>
                    <textarea
                      value={postJoinDraft.content}
                      onChange={(event) => {
                        setPostJoinDraft((current) => ({ ...current, content: event.target.value }));
                        setPostJoinDirty(true);
                      }}
                      maxLength={4096}
                      rows={3}
                      placeholder={text.postJoinContentPlaceholder}
                      className="w-full resize-y rounded-lg border border-[#dbe2ea] px-3 py-2 text-[11px] font-semibold leading-relaxed outline-none transition focus:border-[#1a2b88]"
                      data-testid="textarea-admin-post-join-content"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{text.postJoinRepeat}</span>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={postJoinDraft.repeatCount}
                      onChange={(event) => {
                        setPostJoinDraft((current) => ({ ...current, repeatCount: Number(event.target.value) || 1 }));
                        setPostJoinDirty(true);
                      }}
                      className="h-10 w-full rounded-lg border border-[#dbe2ea] px-3 text-[11px] font-bold outline-none focus:border-[#1a2b88]"
                      data-testid="input-admin-post-join-repeat"
                    />
                    <span className="mt-1 block text-[10px] font-medium text-[#64748b]">300 vòng = 300 lượt qua nhóm đích.</span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{text.postJoinMode}</span>
                    <select
                      value={postJoinDraft.mode}
                      onChange={(event) => {
                        setPostJoinDraft((current) => ({ ...current, mode: event.target.value as typeof current.mode }));
                        setPostJoinDirty(true);
                      }}
                      className="h-10 w-full rounded-lg border border-[#dbe2ea] bg-white px-3 text-[11px] font-bold outline-none focus:border-[#1a2b88]"
                      data-testid="select-admin-post-join-mode"
                    >
                      <option value="draft">{text.postJoinDraft}</option>
                      <option value="send">{text.postJoinSend}</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[180px_180px_1fr]">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{text.postJoinDelay} · min</span>
                    <input
                      type="number"
                      min={0}
                      max={259200}
                      value={postJoinDraft.roundDelayMinSeconds}
                      onChange={(event) => {
                        setPostJoinDraft((current) => ({ ...current, roundDelayMinSeconds: Number(event.target.value) || 0 }));
                        setPostJoinDirty(true);
                      }}
                      className="h-10 w-full rounded-lg border border-[#dbe2ea] px-3 text-[11px] font-bold outline-none focus:border-[#1a2b88]"
                      data-testid="input-admin-post-join-delay-min"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{text.postJoinDelay} · max</span>
                    <input
                      type="number"
                      min={0}
                      max={259200}
                      value={postJoinDraft.roundDelayMaxSeconds}
                      onChange={(event) => {
                        setPostJoinDraft((current) => ({ ...current, roundDelayMaxSeconds: Number(event.target.value) || 0 }));
                        setPostJoinDirty(true);
                      }}
                      className="h-10 w-full rounded-lg border border-[#dbe2ea] px-3 text-[11px] font-bold outline-none focus:border-[#1a2b88]"
                      data-testid="input-admin-post-join-delay-max"
                    />
                  </label>
                  <div className="flex flex-col justify-end gap-2">
                    {postJoinDraft.mode === "draft" && (
                      <p className="text-[10px] font-semibold leading-relaxed text-[#64748b]">{text.postJoinDraftHint}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleSavePostJoinCampaign()}
                      disabled={updateJoinAutomation.isPending || !postJoinDirty}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#1a2b88] px-3 text-[10px] font-extrabold text-white transition hover:bg-[#152473] disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="button-save-admin-post-join-campaign"
                    >
                      {updateJoinAutomation.isPending && <LoaderCircle className="h-3 w-3 animate-spin" />}
                      {text.postJoinSave}
                    </button>
                  </div>
                </div>
              </div>
             {groupJoinStatusQuery.data?.accounts.length ? (
               <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                 {groupJoinStatusQuery.data.accounts.map((account) => (
                   <div key={account.accountId} className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5">
                     <p className="truncate text-[11px] font-extrabold text-[#334155]">
                       {account.accountName}{account.accountUsername ? ` · @${account.accountUsername.replace(/^@/, "")}` : ""}
                     </p>
                     <p className="mt-1 text-[10px] font-semibold text-[#64748b]">
                       {text.autoJoinAccountSummary(account.accountName, account.pendingCount, account.joinedCount)}
                     </p>
                     <p className={`mt-1 text-[10px] font-bold ${
                       account.workerStatus === "waiting" ? "text-[#b45309]"
                         : account.workerStatus === "running" ? "text-[#047857]"
                           : account.accountStatus !== "connected" ? "text-[#be123c]" : "text-[#64748b]"
                     }`}>
                       {account.workerStatus === "waiting"
                         ? "Đang chờ Telegram"
                         : account.workerStatus === "running"
                           ? "Đang xử lý"
                           : account.accountStatus !== "connected"
                             ? "Cần login lại"
                             : "Đang rảnh"}
                     </p>
                   </div>
                 ))}
               </div>
             ) : null}
           </Panel>
         )}

        <Panel className="p-4 sm:p-5">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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
                onSendNow={(campaign) => void handleSendCampaignNow(campaign)}
                sendingCampaignId={sendingCampaignId}
                onImport={(selectedGroup) => void handleImport(selectedGroup)}
                onRevoke={(selectedGroup) => void handleRevoke(selectedGroup)}
                 onSaveTrial={(selectedGroup, trialVisible, trialTitle) => void handleSaveTrial(selectedGroup, trialVisible, trialTitle)}
                 trialSaving={updateTrialGroup.isPending && updatingTrialGroupId === group.id}
                importDisabled={importGroup.isPending}
                importing={importGroup.isPending && importingGroupId === group.id}
                revoking={revokeGroup.isPending && revokingGroupId === group.id}
                mode={mode}
                 canOpenLinks={canOpenLinks}
                openGroupLabel={isAdmin ? text.openGroup : localizedWorkspaceText.openGroup}
                groupLabel={isAdmin ? text.group : localizedWorkspaceText.group}
                forumLabel={isAdmin ? text.forum : localizedWorkspaceText.forum}
                membersLabel={isAdmin ? text.members : localizedWorkspaceText.members}
                lockedButtonLabel={localizedWorkspaceText.lockedButton}
                hiddenGroupNameLabel={localizedWorkspaceText.hiddenGroupName}
                 newGroupLabel={isAdmin ? text.newGroup : localizedWorkspaceText.newGroup}
                 revokeGroupLabel={text.revokeGroup}
                 revokingGroupLabel={text.revokingGroup}
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
        {isAdmin && bulkJoinModalOpen && (
          <Modal
            title={text.bulkJoinTitle}
            description={text.bulkJoinDescription}
            onClose={closeBulkJoinModal}
            wide
          >
            {!bulkJoinResult ? (
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-extrabold uppercase tracking-wide text-[#64748b]">{text.bulkJoinAccount}</span>
                  <select
                    value={bulkJoinAccountId}
                    onChange={(event) => setBulkJoinAccountId(event.target.value)}
                    disabled={bulkJoinGroups.isPending}
                    className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white px-3 text-[12px] font-semibold outline-none focus:border-[#1a2b88] disabled:cursor-not-allowed disabled:bg-[#f8fafc]"
                    data-testid="select-bulk-join-account"
                  >
                    {!connectedAccounts.length && <option value="">{text.bulkJoinNoAccount}</option>}
                    {connectedAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}{account.username ? ` · @${account.username.replace(/^@/, "")}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-3 text-[11px] font-semibold leading-relaxed text-[#1e40af]">
                  Sẽ xử lý {groups.length.toLocaleString("vi-VN")} nhóm trong thư viện, lần lượt từng nhóm. Nhóm không có username hoặc link mời sẽ được báo là bỏ qua.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeBulkJoinModal}
                    disabled={bulkJoinGroups.isPending}
                    className="rounded-xl border border-[#cbd5e1] bg-white px-4 py-2.5 text-[11px] font-extrabold text-[#475569] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {text.bulkJoinClose}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBulkJoin()}
                    disabled={bulkJoinGroups.isPending || !bulkJoinAccountId || !connectedAccounts.length}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1a2b88] px-4 py-2.5 text-[11px] font-extrabold text-white hover:bg-[#152473] disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="button-start-bulk-join"
                  >
                    {bulkJoinGroups.isPending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                    {bulkJoinGroups.isPending ? text.bulkJoining : text.bulkJoinStart}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#d1fae5] bg-[#ecfdf5] p-3 text-[11px] font-bold text-[#047857]">
                  {text.bulkJoinSummary(
                    bulkJoinResult.joinedCount,
                    bulkJoinResult.alreadyJoinedCount,
                    bulkJoinResult.skippedCount,
                    bulkJoinResult.failedCount,
                  )}
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[#64748b]">{text.bulkJoinResults}</p>
                  <div className="max-h-[45dvh] space-y-1.5 overflow-y-auto">
                    {bulkJoinResult.results.map((result) => {
                      const statusLabel = result.status === "joined"
                        ? text.bulkJoinJoined
                        : result.status === "already_joined"
                          ? text.bulkJoinAlreadyJoined
                          : result.status === "skipped"
                            ? text.bulkJoinSkipped
                            : text.bulkJoinFailed;
                      const statusClass = result.status === "failed"
                        ? "bg-[#fff1f2] text-[#be123c]"
                        : result.status === "skipped"
                          ? "bg-[#fff7ed] text-[#c2410c]"
                          : "bg-[#ecfdf5] text-[#047857]";
                      return (
                        <div key={result.telegramId} className="rounded-lg border border-[#eef2f6] bg-[#f8fafc] px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0 truncate text-[11px] font-extrabold text-[#334155]">{result.title}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${statusClass}`}>{statusLabel}</span>
                          </div>
                          {result.reason && <p className="mt-1 text-[10px] font-semibold leading-relaxed text-[#64748b]">{result.reason}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeBulkJoinModal}
                    className="rounded-xl bg-[#1a2b88] px-4 py-2.5 text-[11px] font-extrabold text-white hover:bg-[#152473]"
                  >
                    {text.bulkJoinClose}
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}
      </div>
    </AppLayout>
  );
}