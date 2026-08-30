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

export type PendingScheduleRebaseFromStart = {
  nextRunAt: Date | null;
  updates: Array<{
    id: string;
    previousNextAttemptAt: Date | null;
    nextAttemptAt: Date;
  }>;
};

export type QuotaPausedScheduleTarget = PendingScheduleTarget & {
  updatedAt: Date;
};

export type QuotaPausedScheduleRebase = {
  nextRunAt: Date;
  updates: Array<{
    id: string;
    previousNextAttemptAt: Date | null;
    previousLastError: string | null;
    nextAttemptAt: Date;
    clearQuotaPauseMarker: boolean;
  }>;
};

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedDateTimeParts(value: Date, timezone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function zonedPartsToDate(parts: DateTimeParts, timezone: string): Date {
  const requestedLocalMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let instantMs = requestedLocalMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedDateTimeParts(new Date(instantMs), timezone);
    const actualLocalMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const difference = requestedLocalMs - actualLocalMs;
    if (difference === 0) break;
    instantMs += difference;
  }
  return new Date(instantMs);
}

/**
 * The daily quota reset makes a new allowance available, but it must not make
 * every paused campaign due at midnight. Anchor each campaign to the local
 * wall-clock time selected when it was configured.
 */
export function nextCampaignDailyStart(
  scheduleAnchorAt: Date,
  now: Date,
  timezone: string,
): Date {
  const anchor = zonedDateTimeParts(scheduleAnchorAt, timezone);
  const today = zonedDateTimeParts(now, timezone);
  const candidate = zonedPartsToDate({
    year: today.year,
    month: today.month,
    day: today.day,
    hour: anchor.hour,
    minute: anchor.minute,
    second: anchor.second,
  }, timezone);
  if (candidate > now) return candidate;

  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return zonedPartsToDate({
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth() + 1,
    day: tomorrow.getUTCDate(),
    hour: anchor.hour,
    minute: anchor.minute,
    second: anchor.second,
  }, timezone);
}

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

/**
 * Move the safe, ordinary pending delivery plan so its earliest target starts
 * at the administrator-selected instant. Relative gaps between pending
 * targets are retained; error markers and in-flight/confirmed targets are not
 * eligible for this operation.
 */
export function rebasePendingScheduleFromStart(
  targets: readonly PendingScheduleTarget[],
  startAt: Date,
): PendingScheduleRebaseFromStart {
  const eligibleTargets = targets.filter((target) =>
    target.status === "pending" && target.lastError === null,
  );
  if (!eligibleTargets.length) return { nextRunAt: null, updates: [] };

  const earliest = eligibleTargets.reduce<Date | null>((current, target) => (
    target.nextAttemptAt && (!current || target.nextAttemptAt < current)
      ? target.nextAttemptAt
      : current
  ), null) ?? startAt;
  const shiftMs = startAt.getTime() - earliest.getTime();

  return {
    nextRunAt: startAt,
    updates: eligibleTargets.map((target) => ({
      id: target.id,
      previousNextAttemptAt: target.nextAttemptAt,
      nextAttemptAt: target.nextAttemptAt
        ? new Date(target.nextAttemptAt.getTime() + shiftMs)
        : startAt,
    })),
  };
}

/**
 * Rebuild a quota-paused delivery plan from the campaign's next daily anchor.
 * Existing absolute target times preserve the exact configured (including
 * randomized) round gaps, while the quota marker becomes the first pending
 * delivery at the new anchor.
 */
export function rebaseQuotaPausedSchedule(
  targets: readonly QuotaPausedScheduleTarget[],
  nextRunAt: Date,
  quotaPauseReasons: readonly string[],
): QuotaPausedScheduleRebase | null {
  const quotaMarkers = targets.filter((target) =>
    target.status === "pending"
    && target.lastError !== null
    && quotaPauseReasons.includes(target.lastError),
  );
  if (!quotaMarkers.length) return null;

  const scheduledTargets = targets.filter((target) =>
    target.status === "pending"
    && target.nextAttemptAt
    && (target.lastError === null || quotaPauseReasons.includes(target.lastError)),
  ) as Array<QuotaPausedScheduleTarget & { nextAttemptAt: Date }>;
  const earliestScheduledAt = scheduledTargets.reduce<Date | null>((earliest, target) => (
    !earliest || target.nextAttemptAt < earliest ? target.nextAttemptAt : earliest
  ), null);
  const markerPausedAt = quotaMarkers.reduce<Date>((earliest, target) => (
    target.updatedAt < earliest ? target.updatedAt : earliest
  ), quotaMarkers[0].updatedAt);
  const sourceStartAt = earliestScheduledAt ?? markerPausedAt;
  const shiftMs = nextRunAt.getTime() - sourceStartAt.getTime();

  return {
    nextRunAt,
    updates: targets.flatMap((target) => {
      const isQuotaMarker = target.lastError !== null && quotaPauseReasons.includes(target.lastError);
      if (target.status !== "pending" || (!isQuotaMarker && (target.lastError !== null || !target.nextAttemptAt))) {
        return [];
      }
      return [{
        id: target.id,
        previousNextAttemptAt: target.nextAttemptAt,
        previousLastError: target.lastError,
        nextAttemptAt: isQuotaMarker
          ? nextRunAt
          : new Date(Math.max(nextRunAt.getTime(), target.nextAttemptAt!.getTime() + shiftMs)),
        clearQuotaPauseMarker: isQuotaMarker,
      }];
    }),
  };
}