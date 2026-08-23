export type CampaignScheduleStart = {
  scheduledAt: Date | null;
  roundStartAt: Date;
};

/**
 * A past date/time cannot be a valid start anchor for a campaign created now.
 * Keep future schedules intact; an already-past schedule becomes an immediate
 * campaign, with every round delay anchored at configuration time.
 */
export function resolveCampaignScheduleStart(
  requestedScheduledAt: Date | null | undefined,
  setAt: Date,
): CampaignScheduleStart {
  if (!requestedScheduledAt) {
    return { scheduledAt: null, roundStartAt: setAt };
  }

  if (requestedScheduledAt.getTime() > setAt.getTime()) {
    return { scheduledAt: requestedScheduledAt, roundStartAt: requestedScheduledAt };
  }

  return { scheduledAt: null, roundStartAt: setAt };
}

export function legacyScheduleOffsetMs(scheduledAt: Date | null, createdAt: Date) {
  if (!scheduledAt) return 0;
  return Math.max(0, createdAt.getTime() - scheduledAt.getTime());
}