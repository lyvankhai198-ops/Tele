export type QuickSendDestination = {
  id: string;
  accountId: string;
  title: string;
  parentTitle: string | null;
  username: string | null;
};

export type QuickSendLibraryMembership = {
  accountId: string;
  destinationId: string;
  canPost: boolean;
};

export type QuickSendLibraryGroup = {
  accountMemberships?: QuickSendLibraryMembership[];
};

export const GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT = 2;

export function filterDestinationsForAccount<T extends QuickSendDestination>(
  destinations: T[],
  accountId: string,
  search: string,
): T[] {
  const needle = search.trim().toLowerCase();
  return destinations.filter((destination) =>
    destination.accountId === accountId
    && (!needle
      || destination.title.toLowerCase().includes(needle)
      || (destination.parentTitle ?? "").toLowerCase().includes(needle)
      || (destination.username ?? "").toLowerCase().includes(needle)),
  );
}

export function splitGroupLibrary<T>(
  groups: T[],
  canOpenLinks: boolean,
): { visibleGroups: T[]; hiddenCount: number } {
  if (canOpenLinks) return { visibleGroups: groups, hiddenCount: 0 };
  return {
    visibleGroups: groups.slice(0, GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT),
    hiddenCount: Math.max(0, groups.length - GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT),
  };
}

export function getLibraryGroupStatus(
  group: QuickSendLibraryGroup,
  accountId: string,
  destinationIdsWithPostPermission: Set<string>,
): "joined" | "review" | "not_joined" {
  const membership = group.accountMemberships?.find((item) => item.accountId === accountId);
  if (membership?.canPost || (membership && destinationIdsWithPostPermission.has(membership.destinationId))) {
    return "joined";
  }
  if (membership) return "review";
  return "not_joined";
}