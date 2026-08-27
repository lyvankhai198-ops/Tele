export type CampaignScheduleStart = {
  scheduledAt: Date | null;
  roundStartAt: Date;
};

export type PendingScheduleTarget = {
  id: string;
  status: string;
  lastError: string | null;
  nextAttemptAt: Date | null;
};

export type PendingScheduleRebase = {
  shiftMs: number;
  nextRunAt: Date | null;
  updates: Array<{
    id: string;
    previousNextAttemptAt: Date;
    nextAttemptAt: Date;
  }>;
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

/**
 * A paused campaign can outlive its original schedule. Move every safe pending
 * delivery by the same offset so the first remaining round resumes now while
 * retaining the configured spacing between all subsequent rounds.
 */
export function rebasePastPendingSchedule(
  targets: readonly PendingScheduleTarget[],
  resumedAt: Date,
): PendingScheduleRebase {
  const eligibleTargets = targets.filter((target) =>
    target.status === "pending"
    && target.lastError === null
    && target.nextAttemptAt,
  ) as Array<PendingScheduleTarget & { nextAttemptAt: Date }>;
  const earliest = eligibleTargets.reduce<Date | null>((current, target) => (
    !current || target.nextAttemptAt < current ? target.nextAttemptAt : current
  ), null);

  if (!earliest || earliest >= resumedAt) {
    return { shiftMs: 0, nextRunAt: null, updates: [] };
  }

  const shiftMs = resumedAt.getTime() - earliest.getTime();
  return {
    shiftMs,
    nextRunAt: resumedAt,
    updates: eligibleTargets.map((target) => ({
      id: target.id,
      previousNextAttemptAt: target.nextAttemptAt,
      nextAttemptAt: new Date(target.nextAttemptAt.getTime() + shiftMs),
    })),
  };
}