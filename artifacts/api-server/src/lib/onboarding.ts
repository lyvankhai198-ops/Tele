type AccountSignal = {
  status: string;
  lastSyncAt: Date | null;
};

type DestinationSignal = {
  canPost: boolean;
  permissionCheckedAt: Date | null;
};

type CampaignSignal = {
  status: string;
};

export function buildOnboardingSummary(input: {
  accounts: AccountSignal[];
  destinations: DestinationSignal[];
  messageTemplateCount: number;
  campaigns: CampaignSignal[];
}) {
  const connectedAccounts = input.accounts.filter((account) => account.status === "connected");
  const hasAccount = input.accounts.length > 0;
  const hasVerifiedAccount = connectedAccounts.length > 0;
  const hasSyncedAccount = connectedAccounts.some((account) => account.lastSyncAt !== null);
  const hasDestinations = input.destinations.length > 0;
  const hasPostingPermission = hasDestinations
    && input.destinations.every((destination) => Boolean(destination.permissionCheckedAt));
  const hasRestrictedDestination = input.destinations.some((destination) =>
    destination.permissionCheckedAt !== null && !destination.canPost,
  );
  const successfulCampaigns = input.campaigns.filter((campaign) => campaign.status === "completed").length;
  const hasCampaignAttempt = input.campaigns.length > 0;

  return {
    visible: successfulCampaigns === 0,
    completed: successfulCampaigns > 0,
    quickSendEligible: successfulCampaigns < 3,
    successfulCampaigns,
    steps: [
      { id: "account" as const, status: hasAccount ? "completed" as const : "not_started" as const, href: "/dashboard/telegram-accounts" },
      {
        id: "verification" as const,
        status: hasVerifiedAccount
          ? "completed" as const
          : input.accounts.some((account) => account.status === "authorizing")
            ? "in_progress" as const
            : hasAccount ? "attention" as const : "not_started" as const,
        href: "/dashboard/telegram-accounts",
      },
      {
        id: "sync" as const,
        status: hasSyncedAccount && hasDestinations
          ? "completed" as const
          : hasSyncedAccount ? "attention" as const : hasVerifiedAccount ? "in_progress" as const : "not_started" as const,
        href: "/dashboard/groups",
      },
      {
        id: "permissions" as const,
        status: hasRestrictedDestination
          ? "attention" as const
          : hasPostingPermission ? "completed" as const : hasDestinations ? "in_progress" as const : "not_started" as const,
        href: "/dashboard/groups",
      },
      {
        id: "content" as const,
        status: input.messageTemplateCount > 0 ? "completed" as const : "not_started" as const,
        href: "/dashboard/templates",
      },
      {
        id: "first_campaign" as const,
        status: successfulCampaigns > 0
          ? "completed" as const
          : hasCampaignAttempt
            ? input.campaigns.some((campaign) => ["queued", "running", "paused"].includes(campaign.status))
              ? "in_progress" as const
              : "attention" as const
            : "not_started" as const,
        href: "/dashboard/campaigns",
      },
    ],
  };
}